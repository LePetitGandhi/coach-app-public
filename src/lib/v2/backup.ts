/**
 * Sauvegardes automatiques.
 *
 * Les données vivent dans le `localStorage` d'un seul navigateur : un vidage de
 * cache et tout disparaît. Ce module garde un anneau d'instantanés quotidiens
 * dans une clé distincte, écrit sans que l'utilisateur ait à y penser.
 *
 * Ce n'est pas une sauvegarde hors-machine : si le profil du navigateur est
 * supprimé, les instantanés partent avec. D'où le rappel d'export hebdomadaire.
 */

import type { CoachV2State } from "./types";

const BACKUP_KEY = "coach.v2.backups";
const MAX_SNAPSHOTS = 14;
/** Au-delà, on considère qu'un export fichier est dû. */
export const EXPORT_REMINDER_DAYS = 7;
const EXPORT_KEY = "coach.v2.lastExport";

export type Snapshot = {
  /** Horodatage ISO complet. */
  at: string;
  /** Jour local, sert de clé d'unicité : un instantané par jour. */
  day: string;
  /** Quelques compteurs pour décrire l'instantané sans le désérialiser. */
  counts: { days: number; workouts: number; meals: number; checkins: number };
  state: CoachV2State;
};

function read(): Snapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Snapshot[]) : [];
  } catch {
    return [];
  }
}

function write(snapshots: Snapshot[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshots));
  } catch {
    // Quota dépassé : on retente avec un anneau réduit de moitié plutôt que
    // d'échouer silencieusement et de ne plus jamais sauvegarder.
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshots.slice(0, Math.ceil(MAX_SNAPSHOTS / 2))));
    } catch {
      /* on abandonne pour ce tour */
    }
  }
}

function describe(state: CoachV2State) {
  return {
    days: state.dailyLogs.length,
    workouts: state.dailyLogs.reduce((sum, log) => sum + log.workouts.length, 0),
    meals: state.dailyLogs.reduce((sum, log) => sum + log.meals.length, 0),
    checkins: state.checkins.length,
  };
}

export function listSnapshots(): Snapshot[] {
  return read().sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Enregistre un instantané si celui du jour n'existe pas encore, ou s'il est
 * plus pauvre que l'état courant. Idempotent et bon marché : appelable à chaque
 * sauvegarde.
 */
export function captureSnapshot(state: CoachV2State, day: string): Snapshot | null {
  if (typeof window === "undefined") return null;
  const snapshots = read();
  const counts = describe(state);
  const existingIndex = snapshots.findIndex((snapshot) => snapshot.day === day);
  const snapshot: Snapshot = { at: new Date().toISOString(), day, counts, state };

  if (existingIndex >= 0) {
    const existing = snapshots[existingIndex];
    const richer =
      counts.days + counts.workouts + counts.meals >=
      existing.counts.days + existing.counts.workouts + existing.counts.meals;
    if (!richer) return existing;
    snapshots[existingIndex] = snapshot;
  } else {
    snapshots.push(snapshot);
  }

  const trimmed = snapshots.sort((a, b) => b.day.localeCompare(a.day)).slice(0, MAX_SNAPSHOTS);
  write(trimmed);
  return snapshot;
}

export function restoreSnapshot(day: string): CoachV2State | null {
  const snapshot = read().find((item) => item.day === day);
  return snapshot ? snapshot.state : null;
}

export function markExported(now = new Date()) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EXPORT_KEY, now.toISOString());
}

export function lastExportAt(): Date | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(EXPORT_KEY);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysSinceExport(now = new Date()): number | null {
  const last = lastExportAt();
  if (!last) return null;
  return Math.floor((now.getTime() - last.getTime()) / 86_400_000);
}

/** Un export fichier est-il dû ? Vrai aussi si aucun export n'a jamais eu lieu. */
export function exportDue(now = new Date()): boolean {
  const days = daysSinceExport(now);
  return days === null || days >= EXPORT_REMINDER_DAYS;
}

/** Valide un JSON d'import avant de l'accepter. */
export function parseImport(raw: string): CoachV2State | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidate =
      parsed && typeof parsed === "object" && "state" in parsed
        ? (parsed as { state: unknown }).state
        : parsed;
    if (
      candidate &&
      typeof candidate === "object" &&
      Array.isArray((candidate as CoachV2State).dailyLogs) &&
      Array.isArray((candidate as CoachV2State).checkins)
    ) {
      return candidate as CoachV2State;
    }
    return null;
  } catch {
    return null;
  }
}
