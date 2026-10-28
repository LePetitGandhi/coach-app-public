/**
 * Rappels par notification.
 *
 * Limite assumée : sans serveur de push, une notification ne peut être déclenchée
 * que par du code qui tourne. Les rappels partent donc uniquement quand l'app est
 * ouverte (onglet actif ou en arrière-plan, tant qu'il n'est pas déchargé).
 *
 * C'est suffisant pour l'usage visé — l'app installée sur l'écran d'accueil reste
 * vivante plusieurs heures — mais ce n'est pas une alarme. Le mot est dit
 * explicitement dans l'interface pour ne pas promettre ce qui n'existe pas.
 */

import type { Reminder } from "./types";

export type NotificationSupport = "unsupported" | "denied" | "granted" | "default";

export function notificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const permission = Notification.permission;
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result === "granted" ? "granted" : result === "denied" ? "denied" : "default";
  } catch {
    return "denied";
  }
}

/** Millisecondes jusqu'au prochain passage à `HH:MM`, aujourd'hui ou demain. */
export function msUntil(time: string, now = new Date()): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.POSITIVE_INFINITY;
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

/** Rappels du jour encore à venir, triés par heure. */
export function upcomingToday(reminders: Reminder[], now = new Date()): Reminder[] {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return reminders
    .filter((reminder) => reminder.enabled)
    .filter((reminder) => {
      const [hours, minutes] = reminder.time.split(":").map(Number);
      return Number.isFinite(hours) && hours * 60 + minutes > minutesNow;
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

function fire(reminder: Reminder) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification("Coach Aïmen", {
      body: reminder.label,
      tag: reminder.id,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    });
  } catch {
    /* certains navigateurs refusent hors service worker : on ignore */
  }
}

/**
 * Arme les rappels actifs. Rend une fonction d'annulation.
 * Les timers dépassant 24 h ne sont pas posés : l'app est re-armée à chaque
 * retour au premier plan.
 */
export function scheduleReminders(reminders: Reminder[], now = new Date()): () => void {
  if (typeof window === "undefined") return () => {};
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    const delay = msUntil(reminder.time, now);
    if (!Number.isFinite(delay) || delay > 86_400_000) continue;
    timers.push(setTimeout(() => fire(reminder), delay));
  }

  return () => timers.forEach(clearTimeout);
}
