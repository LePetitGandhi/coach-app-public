/**
 * Suivi de la surcharge progressive.
 *
 * La règle du plan est « +1 rep avant +2,5 kg » : elle suppose qu'on sache ce
 * qui a été soulevé la fois précédente. Tout ce module sert à répondre à cette
 * question, exercice par exercice.
 */

import type { DailyLog, ExerciseLog, SetLog, WorkoutLog } from "./types";

/** Charge effective d'une série (poids du corps ≈ 0 kg additionnel). */
export function setLoad(set: SetLog): number {
  return set.weightKg ?? 0;
}

/** Tonnage d'une série : reps × charge. */
export function setVolume(set: SetLog): number {
  return set.reps * setLoad(set);
}

export function exerciseVolume(exercise: ExerciseLog): number {
  if (exercise.skipped) return 0;
  return Math.round(exercise.sets.reduce((sum, set) => sum + setVolume(set), 0));
}

export function workoutVolume(workout: WorkoutLog): number {
  return workout.exercises.reduce((sum, exercise) => sum + exerciseVolume(exercise), 0);
}

/**
 * Séries dures : celles menées assez près de l'échec pour compter dans le
 * volume d'entraînement (RIR ≤ 3, ou non renseigné — on fait confiance).
 */
export function countHardSets(workout: WorkoutLog): number {
  if (!workout.exercises.length) return workout.hardSets;
  return workout.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => (set.rir ?? 0) <= 3 && set.reps > 0).length,
    0,
  );
}

/**
 * 1RM estimé — formule d'Epley. Fiable jusqu'à ~10 reps, à prendre comme un
 * indicateur de tendance au-delà.
 */
export function epley1RM(set: SetLog): number | null {
  const load = setLoad(set);
  if (load <= 0 || set.reps <= 0) return null;
  if (set.reps === 1) return load;
  return Math.round(load * (1 + set.reps / 30) * 10) / 10;
}

/** Meilleure série d'un exercice, au 1RM estimé puis au tonnage. */
export function bestSet(exercise: ExerciseLog): SetLog | null {
  let best: SetLog | null = null;
  let bestScore = -1;
  for (const set of exercise.sets) {
    const score = epley1RM(set) ?? setVolume(set) / 100;
    if (score > bestScore) {
      bestScore = score;
      best = set;
    }
  }
  return best;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest} s`;
  return rest ? `${minutes} min ${String(rest).padStart(2, "0")}` : `${minutes} min`;
}

export function formatSet(set: SetLog): string {
  if (set.seconds) return formatDuration(set.seconds);
  const load = set.weightKg;
  const base = load ? `${set.reps} × ${load} kg` : `${set.reps} reps (PdC)`;
  return set.rir != null ? `${base} · RIR ${set.rir}` : base;
}

/** Clé de rapprochement d'un exercice entre séances. */
function exerciseKey(exercise: ExerciseLog): string {
  return (exercise.exerciseId ?? exercise.name).toLowerCase().trim();
}

export type ExerciseHistoryEntry = {
  date: string;
  exercise: ExerciseLog;
  volume: number;
  best: SetLog | null;
  oneRM: number | null;
};

/** Historique d'un exercice, du plus récent au plus ancien. */
export function exerciseHistory(logs: DailyLog[], key: string): ExerciseHistoryEntry[] {
  const needle = key.toLowerCase().trim();
  const entries: ExerciseHistoryEntry[] = [];
  for (const log of logs) {
    for (const workout of log.workouts) {
      for (const exercise of workout.exercises) {
        if (exerciseKey(exercise) !== needle || exercise.skipped || !exercise.sets.length) continue;
        const best = bestSet(exercise);
        entries.push({
          date: log.date,
          exercise,
          volume: exerciseVolume(exercise),
          best,
          oneRM: best ? epley1RM(best) : null,
        });
      }
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** Dernière performance sur un exercice, hors date exclue (la séance en cours). */
export function lastPerformance(
  logs: DailyLog[],
  key: string,
  excludeDate?: string,
): ExerciseHistoryEntry | null {
  const history = exerciseHistory(logs, key).filter((entry) => entry.date !== excludeDate);
  return history[0] ?? null;
}

export type ProgressionAdvice = {
  /** Message court à afficher pendant la séance. */
  message: string;
  status: "first" | "up" | "flat" | "down";
  /** Charge suggérée pour la prochaine série de travail, si calculable. */
  suggestedKg?: number;
  suggestedReps?: number;
};

/**
 * Applique la règle de progression du plan : on ajoute des répétitions jusqu'au
 * haut de la fourchette (12), puis on monte la charge de 2,5 kg et on repart en
 * bas de fourchette (8).
 */
export function progressionAdvice(
  logs: DailyLog[],
  key: string,
  excludeDate?: string,
  repRange: [number, number] = [8, 12],
): ProgressionAdvice {
  const previous = lastPerformance(logs, key, excludeDate);
  if (!previous || !previous.best) {
    return {
      message: "Première fois : trouve une charge que tu contrôles sur 10 reps propres, et note-la.",
      status: "first",
    };
  }

  const best = previous.best;
  const [low, high] = repRange;

  // Reprise après une longue pause : on ne repart pas au record d'il y a des mois.
  if (excludeDate && best.weightKg != null) {
    const gapDays = Math.round(
      (Date.parse(`${excludeDate}T12:00:00`) - Date.parse(`${previous.date}T12:00:00`)) / 86_400_000,
    );
    if (gapDays > 28) {
      const restart = Math.max(2.5, Math.round((best.weightKg * 0.85) / 2.5) * 2.5);
      const weeks = Math.round(gapDays / 7);
      return {
        message: `Reprise après ${weeks} semaines (record : ${formatSet(best)}). Repars à ${restart} kg × ${low}, sans aller à l'échec, puis remonte séance après séance.`,
        status: "down",
        suggestedKg: restart,
        suggestedReps: low,
      };
    }
  }

  if (best.weightKg == null) {
    return {
      message: `La dernière fois : ${formatSet(best)} le ${previous.date.slice(5)}. Vise une répétition de plus.`,
      status: "flat",
      suggestedReps: best.reps + 1,
    };
  }

  // Ressenti noté la fois précédente.
  const feel = previous.exercise.feel;
  if (feel === "douleur") {
    const safer = Math.max(2.5, Math.round((best.weightKg * 0.9) / 2.5) * 2.5);
    return {
      message: `Douleur notée le ${previous.date.slice(5)} : repars à ${safer} kg, amplitude contrôlée. Si ça revient, remplace l'exercice.`,
      status: "down",
      suggestedKg: safer,
      suggestedReps: low,
    };
  }
  if (feel === "dur") {
    return {
      message: `C'était dur le ${previous.date.slice(5)} (${formatSet(best)}) : refais-le proprement avant d'ajouter quoi que ce soit.`,
      status: "flat",
      suggestedKg: best.weightKg,
      suggestedReps: best.reps,
    };
  }
  if (feel === "facile") {
    if (best.reps >= low) {
      const next = Math.round((best.weightKg + 5) * 2) / 2;
      return {
        message: `Noté « facile » à ${best.weightKg} kg : saute d'un cran, ${next} kg × ${low}.`,
        status: "up",
        suggestedKg: next,
        suggestedReps: low,
      };
    }
  }

  if (best.reps >= high) {
    const next = Math.round((best.weightKg + 2.5) * 2) / 2;
    return {
      message: `${best.reps} reps atteintes à ${best.weightKg} kg : passe à ${next} kg et repars à ${low} reps.`,
      status: "up",
      suggestedKg: next,
      suggestedReps: low,
    };
  }

  return {
    message: `Dernière fois : ${formatSet(best)} le ${previous.date.slice(5)}. Objectif du jour : ${best.reps + 1} reps à ${best.weightKg} kg.`,
    status: "flat",
    suggestedKg: best.weightKg,
    suggestedReps: best.reps + 1,
  };
}

export type PersonalRecord = {
  key: string;
  name: string;
  date: string;
  best: SetLog;
  oneRM: number | null;
};

/** Meilleure performance par exercice, tous historiques confondus. */
export function personalRecords(logs: DailyLog[]): PersonalRecord[] {
  const byKey = new Map<string, PersonalRecord>();
  for (const log of logs) {
    for (const workout of log.workouts) {
      for (const exercise of workout.exercises) {
        const best = bestSet(exercise);
        if (!best) continue;
        const key = exerciseKey(exercise);
        const oneRM = epley1RM(best);
        const current = byKey.get(key);
        const currentScore = current?.oneRM ?? -1;
        const score = oneRM ?? -1;
        if (!current || score > currentScore) {
          byKey.set(key, { key, name: exercise.name, date: log.date, best, oneRM });
        }
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (b.oneRM ?? 0) - (a.oneRM ?? 0));
}

/** Tonnage total par semaine, pour voir si le volume monte ou s'écroule. */
export function weeklyVolume(logs: DailyLog[], weekStart: string, weekEnd: string): number {
  return logs
    .filter((log) => log.date >= weekStart && log.date < weekEnd)
    .reduce((sum, log) => sum + log.workouts.reduce((s, workout) => s + workoutVolume(workout), 0), 0);
}

/** Un exercice a-t-il progressé par rapport à la fois précédente ? */
export function hasProgressed(logs: DailyLog[], workout: WorkoutLog, date: string): boolean {
  if (!workout.exercises.length) return workout.progression;
  return workout.exercises.some((exercise) => {
    const key = exerciseKey(exercise);
    const previous = lastPerformance(logs, key, date);
    if (!previous) return false;
    const now = bestSet(exercise);
    if (!now || !previous.best) return false;
    const nowRM = epley1RM(now);
    const beforeRM = previous.oneRM;
    if (nowRM != null && beforeRM != null) return nowRM > beforeRM;
    return now.reps > previous.best.reps;
  });
}

export function emptyExerciseLog(name: string, exerciseId?: string, id?: string): ExerciseLog {
  return {
    id: id ?? `ex-${Math.random().toString(36).slice(2, 10)}`,
    exerciseId,
    name,
    sets: [],
  };
}

/** Séance pré-remplie à partir d'une séance type du plan. */
export function workoutFromTemplate(
  title: string,
  exercises: { name: string; sets: number; reps: [number, number] }[],
  makeId: (prefix: string) => string,
): WorkoutLog {
  return {
    id: makeId("workout"),
    focus: title,
    minutes: 0,
    hardSets: 0,
    progression: false,
    completed: false,
    exercises: exercises.map((exercise) => ({
      ...emptyExerciseLog(exercise.name, undefined, makeId("ex")),
      target:
        exercise.reps[0] === exercise.reps[1]
          ? `${exercise.sets} séries`
          : `${exercise.sets} × ${exercise.reps[0]}-${exercise.reps[1]}`,
      repRange: exercise.reps,
    })),
  };
}
