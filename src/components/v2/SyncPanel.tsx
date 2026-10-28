"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import {
  connectSync,
  disconnectSync,
  loadSyncConfig,
  onSyncStatus,
  syncNow,
  type SyncStatus,
} from "@/lib/v2/sync";

function describe(status: SyncStatus) {
  switch (status.kind) {
    case "off":
      return "Désactivée : les données restent sur cet appareil.";
    case "syncing":
      return "Synchronisation…";
    case "offline":
      return "Hors-ligne : tes saisies sont gardées ici et partiront au retour du réseau.";
    case "error":
      return `Erreur : ${status.message}`;
    case "idle":
      return `À jour — dernière synchro ${new Date(status.at).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}.`;
  }
}

export function SyncPanel() {
  const [status, setStatus] = useState<SyncStatus>({ kind: "off" });
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onSyncStatus((next) => {
    setStatus(next);
    setConnected(Boolean(loadSyncConfig()));
  }), []);

  const available = typeof window !== "undefined" && window.location.hostname !== "localhost";

  return (
    <section className="panel panel--compact">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Téléphone ↔ Mac</span>
          <h2>Synchronisation</h2>
        </div>
        {connected ? <Cloud className="panel-icon" aria-hidden="true" /> : <CloudOff className="panel-icon" aria-hidden="true" />}
      </div>
      <p className="muted">{describe(status)}</p>

      {!available ? (
        <p className="muted">Disponible sur la version en ligne (coach.aimenznaidi.party), pas en local.</p>
      ) : connected ? (
        <div className="button-row">
          <button type="button" className="secondary-button" disabled={status.kind === "syncing"} onClick={() => void syncNow()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Synchroniser maintenant
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              disconnectSync();
              setConnected(false);
            }}
          >
            Déconnecter cet appareil
          </button>
        </div>
      ) : (
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await connectSync(code);
              setCode("");
              setConnected(true);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Connexion impossible");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field field--wide">
            <span>Code de synchronisation</span>
            <input type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button type="submit" className="primary-button" disabled={busy || !code.trim()}>
            Connecter
          </button>
          <p className="muted field--wide">
            Si le serveur a déjà des données, elles remplacent celles de cet appareil. {message}
          </p>
        </form>
      )}
    </section>
  );
}
