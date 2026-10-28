"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, Download, HardDriveDownload, Trash2, Upload } from "lucide-react";
import {
  daysSinceExport,
  exportDue,
  listSnapshots,
  markExported,
  parseImport,
  restoreSnapshot,
  type Snapshot,
} from "@/lib/v2/backup";
import { mergeStates } from "@/lib/v2/merge";
import { todayLocalISO } from "@/lib/v2/metrics";
import {
  notificationSupport,
  requestNotificationPermission,
  scheduleReminders,
  upcomingToday,
  type NotificationSupport,
} from "@/lib/v2/reminders";
import { exportCoachV2State, resetCoachV2State, saveCoachV2State } from "@/lib/v2/storage";
import type { CoachV2State } from "@/lib/v2/types";

export function RemindersPanel({ state }: { state: CoachV2State }) {
  const [support, setSupport] = useState<NotificationSupport>("unsupported");

  useEffect(() => {
    // `Notification.permission` n'existe pas au rendu serveur : lecture après montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(notificationSupport());
  }, []);

  useEffect(() => {
    if (support !== "granted") return;
    let cancel = scheduleReminders(state.reminders);
    function rearm() {
      if (document.visibilityState === "visible") {
        cancel();
        cancel = scheduleReminders(state.reminders);
      }
    }
    document.addEventListener("visibilitychange", rearm);
    return () => {
      cancel();
      document.removeEventListener("visibilitychange", rearm);
    };
  }, [support, state.reminders]);

  const next = upcomingToday(state.reminders);

  return (
    <section className="panel panel--compact">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Notifications</span>
          <h2>Rappels</h2>
        </div>
        <Bell className="panel-icon" aria-hidden="true" />
      </div>

      {support === "unsupported" ? (
        <p className="muted">Ce navigateur ne gère pas les notifications.</p>
      ) : support === "denied" ? (
        <p className="muted">
          Les notifications sont bloquées. Réactive-les dans les réglages du site, côté navigateur.
        </p>
      ) : support === "default" ? (
        <>
          <button
            type="button"
            className="primary-button"
            onClick={async () => setSupport(await requestNotificationPermission())}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            Activer les rappels
          </button>
          <p className="muted">
            Quatre rappels par jour : poids du matin, protéines avant 14 h, créneau séance, check du soir.
          </p>
        </>
      ) : (
        <p className="muted">
          Rappels actifs. {next.length ? `Prochain : ${next[0].label} à ${next[0].time}.` : "Plus rien aujourd'hui."}
        </p>
      )}

      <p className="muted">
        <strong>Limite à connaître :</strong> sans serveur de push, une notification ne part que si
        l&apos;app est ouverte quelque part — onglet actif ou en arrière-plan. Ce n&apos;est pas une
        alarme. Pour un vrai réveil, garde celui de ton téléphone.
      </p>
    </section>
  );
}

export function DataPanel({
  state,
  onRestore,
}: {
  state: CoachV2State;
  onRestore: (state: CoachV2State) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [sinceExport, setSinceExport] = useState<number | null>(null);
  const [due, setDue] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Les instantanés vivent dans localStorage, inaccessible au rendu serveur.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSnapshots(listSnapshots());
    setSinceExport(daysSinceExport());
    setDue(exportDue());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state]);

  function exportState() {
    const blob = new Blob([exportCoachV2State(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `coach-${todayLocalISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    markExported();
    setSinceExport(0);
    setDue(false);
  }

  async function importFile(file: File) {
    const text = await file.text();
    const parsed = parseImport(text);
    if (!parsed) {
      setMessage("Fichier illisible : ce n'est pas un export de l'app.");
      return;
    }
    saveCoachV2State(parsed);
    onRestore(parsed);
    setMessage(`Import réussi : ${parsed.dailyLogs.length} journées restaurées.`);
  }

  return (
    <section className="panel panel--compact">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Données</span>
          <h2>Sauvegarde</h2>
        </div>
        <HardDriveDownload className="panel-icon" aria-hidden="true" />
      </div>

      <p className="muted">
        Un instantané est enregistré automatiquement chaque jour ({snapshots.length} conservé
        {snapshots.length > 1 ? "s" : ""}, 14 au maximum). Mais ils vivent dans ce navigateur : si tu
        vides son profil, ils partent avec. L&apos;export fichier est la seule vraie sauvegarde.
      </p>

      {due ? (
        <p className="callout callout--warn">
          <AlertTriangle aria-hidden="true" />
          <span>
            {sinceExport === null
              ? "Aucun export n'a encore été fait."
              : `Dernier export il y a ${sinceExport} jours.`}{" "}
            Exporte maintenant, ça prend deux secondes.
          </span>
        </p>
      ) : (
        <p className="muted">Dernier export il y a {sinceExport} jour{(sinceExport ?? 0) > 1 ? "s" : ""}.</p>
      )}

      <div className="button-row">
        <button className="primary-button" type="button" onClick={exportState}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter
        </button>
        <button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Importer un fichier
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {message ? <p className="muted">{message}</p> : null}

      {snapshots.length > 0 ? (
        <>
          <h3 className="section-title">Récupérer un instantané</h3>
          <div className="trend-grid">
            {snapshots.map((snapshot) => (
              <div key={snapshot.day} className="trend-row">
                <span>{snapshot.day}</span>
                <strong>
                  {snapshot.counts.days} j · {snapshot.counts.workouts} séances
                </strong>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    const restored = restoreSnapshot(snapshot.day);
                    if (!restored) return;
                    // Fusion et non remplacement : on récupère ce que l'instantané
                    // contenait sans effacer ce qui a été noté depuis (ou ailleurs).
                    const merged = mergeStates(state, restored);
                    saveCoachV2State(merged);
                    onRestore(merged);
                    setMessage(`Données du ${snapshot.day} récupérées et fusionnées avec l'état actuel.`);
                  }}
                >
                  Récupérer
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h3 className="section-title">Repartir de zéro</h3>
      <div className="button-row">
        {confirming ? (
          <>
            <button
              className="danger-button"
              type="button"
              onClick={() => {
                resetCoachV2State();
                window.location.reload();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Confirmer l&apos;effacement
            </button>
            <button className="secondary-button" type="button" onClick={() => setConfirming(false)}>
              Annuler
            </button>
          </>
        ) : (
          <button className="secondary-button" type="button" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Tout effacer
          </button>
        )}
      </div>
      {confirming ? (
        <p className="muted">
          Journaux, mesures et bilans seront effacés. Les instantanés de sauvegarde le seront aussi.
          Exporte d&apos;abord si tu veux pouvoir revenir en arrière.
        </p>
      ) : null}
    </section>
  );
}
