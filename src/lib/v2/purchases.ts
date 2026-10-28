/**
 * Tickets de caisse : ce qui a vraiment été dépensé, pour suivre le budget
 * courses (300 €/mois) sur du réel plutôt que sur les estimations du menu.
 */

import { PROGRAM_START, V2_PROFILE } from "./coachPlan";

export const PURCHASES_KEY = "coach.v2.purchases";

export type PurchaseLine = { label: string; price: number };

export type Purchase = {
  id: string;
  /** AAAA-MM-JJ */
  date: string;
  shop: string;
  total: number;
  lines?: PurchaseLine[];
};

/** Tickets envoyés en photo dans le chat, ajoutés une fois sur chaque appareil. */
export const SEEDED_TICKETS: Purchase[] = [];

/**
 * Tickets déjà importés. Synchronisé avec les achats : si la synchro remplace
 * la liste par une version du serveur plus ancienne, ce marqueur repart avec
 * elle et le ticket est réimporté au chargement suivant.
 */
export const SEEDED_TICKETS_KEY = "coach.v2.purchases.seeds";

/** Ajoute les tickets importés absents, sans faire revenir un ticket supprimé. */
export function withSeededTickets(
  list: Purchase[],
  alreadySeeded: string[],
  tickets: Purchase[] = SEEDED_TICKETS,
): { list: Purchase[]; seeded: string[] } {
  const seeded = new Set(alreadySeeded);
  let next = list;
  for (const ticket of tickets) {
    if (seeded.has(ticket.id)) continue;
    if (!next.some((item) => item.id === ticket.id)) next = [...next, ticket];
    seeded.add(ticket.id);
  }
  return { list: next, seeded: [...seeded] };
}

export function loadPurchases(): Purchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PURCHASES_KEY);
    const parsed = raw == null ? [] : (JSON.parse(raw) as unknown);
    const base = Array.isArray(parsed) ? (parsed as Purchase[]) : [];
    const before = JSON.parse(localStorage.getItem(SEEDED_TICKETS_KEY) ?? "[]") as string[];
    const { list, seeded } = withSeededTickets(base, Array.isArray(before) ? before : []);
    if (list !== base) savePurchases(list);
    if (seeded.length !== before.length) localStorage.setItem(SEEDED_TICKETS_KEY, JSON.stringify(seeded));
    return list;
  } catch {
    return [];
  }
}

export function savePurchases(list: Purchase[]) {
  try {
    localStorage.setItem(PURCHASES_KEY, JSON.stringify(list));
  } catch {
    // ignoré
  }
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

/** Durée d'une période de budget : le budget repart à zéro toutes les 4 semaines. */
export const BUDGET_PERIOD_DAYS = 28;

const DAY_MS = 86_400_000;

function dayNumber(date: string) {
  return Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY_MS);
}

function isoFromDay(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Bornes (incluses) de la période de 4 semaines qui contient `date`, comptée depuis le début du programme. */
export function budgetPeriod(date: string, anchor: string = PROGRAM_START) {
  const start = dayNumber(anchor);
  const index = Math.floor((dayNumber(date) - start) / BUDGET_PERIOD_DAYS);
  const first = start + index * BUDGET_PERIOD_DAYS;
  return { start: isoFromDay(first), end: isoFromDay(first + BUDGET_PERIOD_DAYS - 1), next: isoFromDay(first + BUDGET_PERIOD_DAYS) };
}

/** Dépenses de la période de 4 semaines en cours, face au budget. */
export function periodSummary(list: Purchase[], date: string, anchor: string = PROGRAM_START) {
  const period = budgetPeriod(date, anchor);
  const spent =
    Math.round(
      list.filter((p) => p.date >= period.start && p.date <= period.end).reduce((sum, p) => sum + p.total, 0) * 100,
    ) / 100;
  const budget = V2_PROFILE.budgetMonthlyEur;
  return { ...period, spent, budget, left: Math.round((budget - spent) * 100) / 100 };
}

/** @deprecated Le budget suit désormais des périodes de 4 semaines : voir `periodSummary`. */
export function monthSummary(list: Purchase[], date: string) {
  const key = monthKey(date);
  const spent = Math.round(list.filter((p) => monthKey(p.date) === key).reduce((sum, p) => sum + p.total, 0) * 100) / 100;
  const budget = V2_PROFILE.budgetMonthlyEur;
  return { spent, budget, left: Math.round((budget - spent) * 100) / 100 };
}
