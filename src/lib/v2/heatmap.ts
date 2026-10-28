/**
 * Grille de régularité (façon « contributions ») : une case par jour, teinte
 * selon le score de discipline. Colonnes = semaines (lundi en haut).
 */

import { hasAnyEntry, scoreDailyLog, todayLocalISO, workoutDone } from "./metrics";
import type { DailyLog } from "./types";

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export type HeatCell = {
  date: string;
  level: HeatLevel;
  score: number | null;
  meals: number;
  workout: boolean;
  future: boolean;
};

export function levelFor(score: number | null): HeatLevel {
  if (score == null) return 0;
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** `weeks` colonnes, la dernière contenant aujourd'hui. */
export function buildHeatmap(logs: DailyLog[], weeks = 16, now = new Date()): HeatCell[][] {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const today = todayLocalISO(now);
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  const monday = addDays(noon, -((noon.getDay() + 6) % 7));
  const start = addDays(monday, -7 * (weeks - 1));

  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = todayLocalISO(addDays(start, week * 7 + day));
      const log = byDate.get(date);
      const tracked = log ? hasAnyEntry(log) : false;
      const score = log && tracked ? scoreDailyLog(log).score : null;
      return {
        date,
        level: levelFor(score),
        score,
        meals: log?.meals.length ?? 0,
        workout: log ? workoutDone(log) : false,
        future: date > today,
      };
    }),
  );
}

/** Jours suivis parmi les `days` derniers jours (aujourd'hui compris). */
export function trackedDays(cells: HeatCell[][], days = 28, now = new Date()) {
  const today = todayLocalISO(now);
  const from = todayLocalISO(addDays(now, -(days - 1)));
  return cells.flat().filter((cell) => cell.date >= from && cell.date <= today && cell.score != null).length;
}
