/**
 * Tendance du poids : moyenne des pesées sur 7 jours, comparée aux 7 jours
 * d'avant. Le chiffre du jour bouge de ±1 kg avec l'eau et le sel ; la
 * moyenne, elle, dit la vérité.
 */

import { todayLocalISO } from "./metrics";
import type { DailyLog } from "./types";

function shift(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return todayLocalISO(next);
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

export type WeightTrend = {
  weighIns: { date: string; weightKg: number }[];
  avg7: number | null;
  prevAvg7: number | null;
  /** kg par semaine, positif = prise. */
  delta: number | null;
  verdict: string;
};

export function weightTrend(logs: DailyLog[], now = new Date()): WeightTrend {
  const today = todayLocalISO(now);
  const weighIns = logs
    .filter((log) => typeof log.body.weightKg === "number" && log.date <= today)
    .map((log) => ({ date: log.date, weightKg: log.body.weightKg as number }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const from7 = shift(now, -6);
  const from14 = shift(now, -13);
  const avg7 = average(weighIns.filter((w) => w.date >= from7).map((w) => w.weightKg));
  const prevAvg7 = average(weighIns.filter((w) => w.date >= from14 && w.date < from7).map((w) => w.weightKg));
  const delta = avg7 != null && prevAvg7 != null ? Math.round((avg7 - prevAvg7) * 10) / 10 : null;

  let verdict = "Pèse-toi 3 à 4 matins par semaine, à jeun : la tendance apparaît au bout de 2 semaines.";
  if (delta != null) {
    if (delta > 0.4) verdict = "Ça monte vite : une partie est du gras. Baisse un peu les calories (−200 kcal).";
    else if (delta < -0.3) verdict = "Tu perds du poids : pour construire du muscle, mange un peu plus (+200 kcal).";
    else verdict = "Dans la cible de la recomposition : stable à légère hausse. Continue.";
  }
  return { weighIns: weighIns.slice(0, 10), avg7, prevAvg7, delta, verdict };
}
