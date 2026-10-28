/**
 * Séance à faire aujourd'hui, en tenant compte des séances ratées.
 *
 * La semaine va du lundi au dimanche. Une séance prévue un jour passé et pas
 * faite n'est pas perdue : elle devient un rattrapage, proposé avant la séance
 * du jour pour garder l'ordre haut / bas du corps.
 */

import { PROGRAM_START, TRAINING_SPLIT } from "./coachPlan";
import { todayLocalISO } from "./metrics";
import type { DailyLog } from "./types";

const ORDER = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

type Session = (typeof TRAINING_SPLIT)[number];

export type SessionToDo = {
  session: Session;
  kind: "prévue" | "rattrapage";
  /** Séances de la semaine encore en retard (y compris celle proposée). */
  late: Session[];
};

/** Lundi de la semaine de `date`, au format AAAA-MM-JJ. */
export function weekStartISO(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return todayLocalISO(monday);
}

function sessionDone(logs: DailyLog[], title: string, from: string, to: string) {
  return logs.some(
    (log) =>
      log.date >= from &&
      log.date <= to &&
      log.workouts.some(
        (workout) =>
          workout.focus === title &&
          (workout.completed || workout.exercises.some((exercise) => !exercise.skipped && exercise.sets.length > 0)),
      ),
  );
}

function dateOfWeekday(from: string, index: number) {
  const date = new Date(`${from}T12:00:00`);
  date.setDate(date.getDate() + index);
  return todayLocalISO(date);
}

export function sessionToDo(
  logs: DailyLog[],
  now = new Date(),
  programStart: string = PROGRAM_START,
): SessionToDo | null {
  const today = todayLocalISO(now);
  // Repos choisi aujourd'hui : rien à faire, la séance revient demain en rattrapage.
  if (logs.some((log) => log.date === today && log.restDay)) return null;
  const from = weekStartISO(now);
  const todayIndex = (now.getDay() + 6) % 7;

  const due = TRAINING_SPLIT.filter((session) => {
    const index = ORDER.indexOf(session.day);
    return index <= todayIndex && dateOfWeekday(from, index) >= programStart;
  });
  const pending = due.filter((session) => !sessionDone(logs, session.title, from, today));
  if (!pending.length) return null;

  const late = pending.filter((session) => ORDER.indexOf(session.day) < todayIndex);
  const first = pending[0];
  return {
    session: first,
    kind: ORDER.indexOf(first.day) < todayIndex ? "rattrapage" : "prévue",
    late,
  };
}
