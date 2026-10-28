/**
 * Fusion de deux états de l'app (deux appareils, ou un instantané + l'état
 * courant) sans rien perdre.
 *
 * Remplacer un état par l'autre efface tout ce qui n'a été saisi que d'un côté :
 * une séance notée sur le téléphone, des repas notés sur l'ordinateur… La
 * fusion garde l'union des deux. Contrepartie assumée : un élément supprimé
 * d'un seul côté peut réapparaître. Mieux vaut un doublon à effacer qu'une
 * séance perdue.
 */

import type { CoachV2State, DailyLog, ExerciseLog, WorkoutLog } from "./types";

function setCount(workout: WorkoutLog) {
  return workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

/** Exercice par exercice, on garde la version qui a le plus de séries notées. */
function mergeExercises(a: ExerciseLog[], b: ExerciseLog[]): ExerciseLog[] {
  const merged = [...a];
  for (const exercise of b) {
    const index = merged.findIndex((item) => item.id === exercise.id);
    if (index < 0) merged.push(exercise);
    else if (exercise.sets.length > merged[index].sets.length) merged[index] = exercise;
  }
  return merged;
}

function mergeWorkouts(a: WorkoutLog[], b: WorkoutLog[]): WorkoutLog[] {
  const merged = [...a];
  for (const workout of b) {
    const index = merged.findIndex((item) => item.id === workout.id);
    if (index < 0) {
      merged.push(workout);
      continue;
    }
    const current = merged[index];
    const richer = setCount(workout) > setCount(current) ? workout : current;
    merged[index] = {
      ...richer,
      exercises: mergeExercises(richer.exercises, richer === workout ? current.exercises : workout.exercises),
      completed: current.completed || workout.completed,
      note: current.note || workout.note,
      feel: current.feel ?? workout.feel,
      minutes: Math.max(current.minutes, workout.minutes),
    };
  }
  return merged;
}

function unionById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const ids = new Set(a.map((item) => item.id));
  return [...a, ...b.filter((item) => !ids.has(item.id))];
}

function mergeLog(a: DailyLog, b: DailyLog): DailyLog {
  const skipped = [...new Set([...(a.skippedMeals ?? []), ...(b.skippedMeals ?? [])])];
  return {
    ...a,
    meals: unionById(a.meals, b.meals),
    workouts: mergeWorkouts(a.workouts, b.workouts),
    ...(skipped.length ? { skippedMeals: skipped } : {}),
    ...(a.restDay || b.restDay ? { restDay: true } : {}),
    body: { ...b.body, ...stripUndefined(a.body) },
    recovery: { ...b.recovery, ...stripUndefined(a.recovery) },
    notes: a.notes.length >= b.notes.length ? a.notes : b.notes,
    createdAt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null)) as Partial<T>;
}

/**
 * Union de deux états. `primary` l'emporte sur les champs simples (réglages,
 * valeurs d'un même jour saisies des deux côtés) ; rien de `secondary` n'est
 * perdu pour autant.
 */
export function mergeStates(primary: CoachV2State, secondary: CoachV2State): CoachV2State {
  const byDate = new Map<string, DailyLog>();
  for (const log of secondary.dailyLogs) byDate.set(log.date, log);
  for (const log of primary.dailyLogs) {
    const other = byDate.get(log.date);
    byDate.set(log.date, other ? mergeLog(log, other) : log);
  }
  const dailyLogs = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  const seeds = [...new Set([...(primary.appliedSeeds ?? []), ...(secondary.appliedSeeds ?? [])])];
  return {
    ...primary,
    dailyLogs,
    checkins: unionById(primary.checkins, secondary.checkins),
    ...(seeds.length ? { appliedSeeds: seeds } : {}),
  };
}

/** Fusionne deux états sérialisés ; renvoie `null` si l'un des deux est illisible. */
export function mergeSerializedStates(primary: string | null, secondary: string | null): string | null {
  if (!primary) return secondary;
  if (!secondary) return primary;
  try {
    const a = JSON.parse(primary) as CoachV2State;
    const b = JSON.parse(secondary) as CoachV2State;
    if (!Array.isArray(a?.dailyLogs) || !Array.isArray(b?.dailyLogs)) return null;
    return JSON.stringify(mergeStates(a, b));
  } catch {
    return null;
  }
}
