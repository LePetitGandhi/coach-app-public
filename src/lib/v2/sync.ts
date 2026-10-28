/**
 * Synchronisation entre appareils via le Worker Cloudflare (D1).
 *
 * Le localStorage reste la source de vérité locale : l'app marche hors-ligne
 * (en salle, sans réseau) et se synchronise dès que le réseau revient.
 *
 * Règle de conflit : si le serveur est plus récent et que cet appareil n'a rien
 * modifié depuis la dernière synchro, on applique la version serveur telle
 * quelle. Si cet appareil a des saisies pas encore envoyées, on FUSIONNE
 * l'historique (jours, repas, séances) au lieu d'écraser, puis on renvoie le
 * résultat : aucune saisie d'un appareil ne peut effacer celles de l'autre.
 */

import { mergeSerializedStates } from "./merge";

export const SYNC_KEYS = [
  "coach.v2.state",
  "coach.v2.mealplan",
  "coach.v2.equipment",
  "coach.v2.favorites",
  "coach.v2.onboarding",
  "coach.v2.purchases",
  "coach.v2.purchases.seeds",
  "coach.v2.pantry",
] as const;

const CONFIG_KEY = "coach.v2.sync";
const POLL_MS = 4000;
const PUSH_DEBOUNCE_MS = 2500;

export type SyncConfig = {
  token: string;
  /** Horodatage serveur de la dernière synchro réussie. */
  lastSyncedAt: number;
  /** Empreinte des données locales à la dernière synchro. */
  lastHash: string;
  /** Dernière modification locale détectée. */
  localChangedAt: number;
};

export type SyncStatus =
  | { kind: "off" }
  | { kind: "idle"; at: number }
  | { kind: "syncing" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

type Snapshot = Record<string, string | null>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function loadSyncConfig(): SyncConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    if (!parsed.token) return null;
    return { token: parsed.token, lastSyncedAt: parsed.lastSyncedAt ?? 0, lastHash: parsed.lastHash ?? "", localChangedAt: parsed.localChangedAt ?? 0 };
  } catch {
    return null;
  }
}

function saveSyncConfig(config: SyncConfig | null) {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    // ignoré
  }
}

// ---------------------------------------------------------------------------
// Instantané local
// ---------------------------------------------------------------------------

function readSnapshot(): Snapshot {
  const snapshot: Snapshot = {};
  for (const key of SYNC_KEYS) snapshot[key] = localStorage.getItem(key);
  return snapshot;
}

/** Empreinte rapide (FNV-1a 32 bits) : suffit à détecter un changement. */
export function hashSnapshot(snapshot: Snapshot): string {
  const text = JSON.stringify(SYNC_KEYS.map((key) => snapshot[key] ?? null));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}-${(hash >>> 0).toString(16)}`;
}

function applySnapshot(snapshot: Snapshot) {
  for (const key of SYNC_KEYS) {
    const value = snapshot[key];
    if (typeof value === "string") localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  }
}

/** Version serveur, avec l'historique local fusionné dedans. */
export function withLocalMerged(remote: Snapshot, local: Snapshot): Snapshot {
  const key = "coach.v2.state";
  const merged = mergeSerializedStates(remote[key] ?? null, local[key] ?? null);
  return merged ? { ...remote, [key]: merged } : remote;
}

function isEmpty(snapshot: Snapshot) {
  return SYNC_KEYS.every((key) => snapshot[key] == null);
}

// ---------------------------------------------------------------------------
// Réseau
// ---------------------------------------------------------------------------

class SyncHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(token: string, method: "GET" | "PUT", body?: unknown, keepalive = false): Promise<T> {
  const response = await fetch("/api/state", {
    method,
    keepalive,
    cache: "no-store",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let message = `Erreur ${response.status}`;
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // corps illisible
    }
    throw new SyncHttpError(response.status, message);
  }
  return (await response.json()) as T;
}

type Remote = { data: Snapshot | null; updatedAt: number };

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------

type Listener = (status: SyncStatus) => void;

let status: SyncStatus = { kind: "off" };
const listeners = new Set<Listener>();
let started = false;
let running: Promise<void> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(next: SyncStatus) {
  status = next;
  listeners.forEach((listener) => listener(status));
}

export function getSyncStatus() {
  return status;
}

export function onSyncStatus(listener: Listener) {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

function handleError(error: unknown) {
  if (error instanceof SyncHttpError) setStatus({ kind: "error", message: error.message });
  else setStatus({ kind: "offline" });
}

async function push(config: SyncConfig, keepalive = false) {
  const snapshot = readSnapshot();
  const result = await request<{ updatedAt: number }>(config.token, "PUT", { data: snapshot }, keepalive);
  saveSyncConfig({ ...config, lastSyncedAt: result.updatedAt, lastHash: hashSnapshot(snapshot) });
}

/** Synchro complète : récupère le serveur, résout, pousse si besoin. */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const config = loadSyncConfig();
    if (!config) {
      setStatus({ kind: "off" });
      return;
    }
    setStatus({ kind: "syncing" });
    try {
      const local = readSnapshot();
      const localHash = hashSnapshot(local);
      const localDirty = localHash !== config.lastHash;
      const remote = await request<Remote>(config.token, "GET");
      const remoteNewer = Boolean(remote.data) && remote.updatedAt > config.lastSyncedAt;

      if (remoteNewer && remote.data) {
        const firstConnection = config.lastSyncedAt === 0;
        const remoteWins = !localDirty || firstConnection || remote.updatedAt >= config.localChangedAt;
        if (remoteWins) {
          const remoteHash = hashSnapshot(remote.data);
          saveSyncConfig({ ...config, lastSyncedAt: remote.updatedAt, lastHash: remoteHash });
          if (remoteHash !== localHash) {
            // Des saisies locales pas encore envoyées (ou une première connexion) :
            // on fusionne au lieu d'écraser, sinon elles seraient perdues. L'état
            // fusionné diffère de celui du serveur, il repartira au prochain tour.
            const incoming = localDirty || firstConnection ? withLocalMerged(remote.data, local) : remote.data;
            applySnapshot(incoming);
            window.location.reload();
            return;
          }
          setStatus({ kind: "idle", at: remote.updatedAt });
          return;
        }
      }

      if (localDirty || !remote.data) {
        if (!(isEmpty(local) && !remote.data)) await push(loadSyncConfig() ?? config);
      }
      setStatus({ kind: "idle", at: loadSyncConfig()?.lastSyncedAt ?? Date.now() });
    } catch (error) {
      handleError(error);
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void syncNow();
  }, PUSH_DEBOUNCE_MS);
}

/** Surveille les changements locaux et synchronise en arrière-plan. */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  let lastSeen = "";

  const tick = () => {
    const config = loadSyncConfig();
    if (!config) return;
    const hash = hashSnapshot(readSnapshot());
    if (hash === lastSeen) return;
    lastSeen = hash;
    if (hash !== config.lastHash) {
      saveSyncConfig({ ...config, localChangedAt: Date.now() });
      schedulePush();
    }
  };

  window.setInterval(tick, POLL_MS);
  window.addEventListener("online", () => void syncNow());
  document.addEventListener("visibilitychange", () => {
    const config = loadSyncConfig();
    if (!config) return;
    if (document.visibilityState === "visible") {
      void syncNow();
    } else if (hashSnapshot(readSnapshot()) !== config.lastHash) {
      // L'app passe en arrière-plan : on pousse tout de suite, sans attendre.
      push(config, true).catch(() => {});
    }
  });

  if (loadSyncConfig()) void syncNow();
}

export async function connectSync(token: string) {
  const trimmed = token.trim();
  if (!trimmed) throw new Error("Code vide");
  // Vérifie le code avant de l'enregistrer.
  await request<Remote>(trimmed, "GET");
  saveSyncConfig({ token: trimmed, lastSyncedAt: 0, lastHash: "", localChangedAt: 0 });
  await syncNow();
}

export function disconnectSync() {
  saveSyncConfig(null);
  setStatus({ kind: "off" });
}
