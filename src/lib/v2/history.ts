/**
 * Historique importé : séances réalisées à la salle de l'ESSEC au printemps
 * 2026 (notes de mai). Sert de point de départ à la règle de progression — la
 * première séance affiche « reprise, repars à ~85 % » au lieu de « première
 * fois ». Identifiants fixes : l'import est identique sur tous les appareils.
 */

import type { DailyLog, ExerciseLog, MealLog, MealSlotId, SetLog } from "./types";

export const HISTORY_DATE = "2026-05-31";

const sets = (...pairs: [number, number][]): SetLog[] => pairs.map(([weightKg, reps]) => ({ weightKg, reps }));

export const MAY_2026_LOG: DailyLog = {
  date: HISTORY_DATE,
  meals: [],
  workouts: [
    {
      id: "history-2026-05",
      focus: "Historique salle ESSEC (mai 2026)",
      minutes: 0,
      hardSets: 0,
      progression: true,
      completed: true,
      exercises: [
        { id: "history-chest", name: "Chest press", sets: sets([35, 10], [45, 8], [45, 7], [40, 5], [35, 8]) },
        { id: "history-lat", name: "Lat pulldown", sets: sets([30, 12], [35, 9], [30, 12]) },
        { id: "history-shoulder", name: "Shoulder press machine", sets: sets([10, 12], [10, 9], [10, 8], [10, 7]) },
        { id: "history-curl", name: "Curl pupitre machine", sets: sets([15, 10], [17.5, 9], [20, 3]) },
        { id: "history-goblet", name: "Goblet squat", sets: sets([10, 10], [10, 10], [10, 10], [10, 10]) },
      ],
    },
  ],
  body: {},
  recovery: { energy: 3, mood: "neutre" },
  planRespect: 3,
  notes: "Import des notes de mai 2026. Cardio : 4,42 km en 20 min 03 (≈ 4'32/km) après muscu.",
  createdAt: "2026-05-31T12:00:00.000Z",
  updatedAt: "2026-05-31T12:00:00.000Z",
};

/** Ajoute l'historique importé s'il n'est pas déjà présent. */
export function withHistory<T extends { dailyLogs: DailyLog[] }>(state: T): T {
  if (state.dailyLogs.some((log) => log.date === HISTORY_DATE)) return state;
  const dailyLogs = [...state.dailyLogs, MAY_2026_LOG].sort((a, b) => b.date.localeCompare(a.date));
  return { ...state, dailyLogs };
}

/**
 * Repas saisis pour Aïmen à partir de ses photos (estimations), appliqués une
 * seule fois : s'il les supprime ensuite, ils ne reviennent pas.
 */
export const SEEDED_MEALS: {
  seedId: string;
  date: string;
  meal: MealLog;
  sameAs?: { sourceId?: string; nameIncludes?: string };
}[] = [];

function alreadyLogged(meals: MealLog[], seed: { meal: MealLog; sameAs?: { sourceId?: string; nameIncludes?: string } }) {
  return meals.some(
    (meal) =>
      meal.id === seed.meal.id ||
      (seed.sameAs?.sourceId != null && meal.sourceId === seed.sameAs.sourceId) ||
      (seed.sameAs?.nameIncludes != null && meal.name.toLowerCase().includes(seed.sameAs.nameIncludes)),
  );
}

/** Pesées données dans le chat, appliquées une fois si le jour n'a pas déjà un poids. */
export const SEEDED_WEIGHTS: { seedId: string; date: string; weightKg: number; note: string }[] = [];

function blankLog(date: string): DailyLog {
  const stamp = `${date}T12:00:00.000Z`;
  return {
    date,
    meals: [],
    workouts: [],
    body: {},
    recovery: { energy: 3, mood: "neutre" },
    planRespect: 3,
    notes: "",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function withSeededMeals<T extends { dailyLogs: DailyLog[]; appliedSeeds?: string[] }>(state: T, meals = SEEDED_MEALS, weights = SEEDED_WEIGHTS): T {
  const applied = new Set(state.appliedSeeds ?? []);
  const pending = meals.filter((seed) => !applied.has(seed.seedId));
  if (!pending.length && weights.every((seed) => applied.has(seed.seedId))) return state;

  let dailyLogs = [...state.dailyLogs];
  for (const seed of pending) {
    const existing = dailyLogs.find((log) => log.date === seed.date);
    if (existing) {
      if (!alreadyLogged(existing.meals, seed)) {
        dailyLogs = dailyLogs.map((log) => (log === existing ? { ...log, meals: [...log.meals, seed.meal] } : log));
      }
    } else {
      dailyLogs = [...dailyLogs, { ...blankLog(seed.date), meals: [seed.meal] }];
    }
    applied.add(seed.seedId);
  }
  for (const seed of weights.filter((item) => !applied.has(item.seedId))) {
    const existing = dailyLogs.find((log) => log.date === seed.date);
    if (existing) {
      if (existing.body.weightKg == null) {
        dailyLogs = dailyLogs.map((log) =>
          log === existing
            ? {
                ...log,
                body: { ...log.body, weightKg: seed.weightKg },
                notes: log.notes.trim() ? `${log.notes.trim()}\n${seed.note}` : seed.note,
              }
            : log,
        );
      }
    } else {
      dailyLogs = [...dailyLogs, { ...blankLog(seed.date), body: { weightKg: seed.weightKg }, notes: seed.note }];
    }
    applied.add(seed.seedId);
  }

  dailyLogs.sort((a, b) => b.date.localeCompare(a.date));
  return { ...state, dailyLogs, appliedSeeds: [...applied] };
}

// ---------------------------------------------------------------------------
// Séries données dans le chat
// ---------------------------------------------------------------------------

type SeededExercise = Omit<ExerciseLog, "id"> & { id: string };

/**
 * Fin de la séance du 28/09 (haut du corps · force), dictée dans le chat :
 * chest press et lat pulldown avaient été saisis sur place, le reste non.
 * On complète la séance existante sans jamais écraser une série déjà notée.
 */
export const SEEDED_WORKOUTS: {
  seedId: string;
  date: string;
  /** Exercice qui doit déjà avoir des séries : prouve qu'on tient la vraie séance. */
  anchor: string;
  /** Exercice prévu, remplacé pendant la séance. */
  replaced?: string;
  exercises: SeededExercise[];
}[] = [];

export function withSeededWorkouts<T extends { dailyLogs: DailyLog[]; appliedSeeds?: string[] }>(state: T, seeds = SEEDED_WORKOUTS): T {
  const applied = new Set(state.appliedSeeds ?? []);
  let dailyLogs = state.dailyLogs;
  let changed = false;

  for (const seed of seeds) {
    if (applied.has(seed.seedId)) continue;
    const log = dailyLogs.find((item) => item.date === seed.date);
    const workoutIndex =
      log?.workouts.findIndex((workout) =>
        workout.exercises.some((exercise) => exercise.name === seed.anchor && exercise.sets.length > 0),
      ) ?? -1;
    // Séance pas encore arrivée sur cet appareil : on réessaiera au prochain
    // chargement plutôt que de créer une séance fantôme qui écraserait la vraie.
    if (!log || workoutIndex < 0) continue;

    const workout = log.workouts[workoutIndex];
    let exercises = workout.exercises.map((exercise) =>
      seed.replaced && exercise.name === seed.replaced && exercise.sets.length === 0
        ? { ...exercise, skipped: true }
        : exercise,
    );
    for (const seeded of seed.exercises) {
      const index = exercises.findIndex((exercise) => exercise.name === seeded.name);
      if (index < 0) {
        exercises = [...exercises, seeded];
      } else if (exercises[index].sets.length === 0) {
        const current = exercises[index];
        exercises = exercises.map((exercise, i) =>
          i === index ? { ...seeded, ...current, sets: seeded.sets, feel: current.feel ?? seeded.feel, note: current.note || seeded.note, skipped: false } : exercise,
        );
      }
      // Déjà des séries notées : on n'y touche pas.
    }

    const workouts = log.workouts.map((item, i) => (i === workoutIndex ? { ...item, exercises, completed: true } : item));
    dailyLogs = dailyLogs.map((item) => (item === log ? { ...item, workouts, updatedAt: new Date().toISOString() } : item));
    applied.add(seed.seedId);
    changed = true;
  }

  return changed ? { ...state, dailyLogs, appliedSeeds: [...applied] } : state;
}

/**
 * Eau, pas et sommeil donnés dans le chat, appliqués une fois sans écraser une
 * saisie. Le sommeil est rangé au jour du réveil, comme dans l'app.
 */
export const SEEDED_RECOVERY: {
  seedId: string;
  date: string;
  waterL?: number;
  steps?: number;
  sleepHours?: number;
  /** Sieste ajoutée au sommeil déjà noté du jour. */
  napHours?: number;
  /** Jour de repos choisi : la séance du jour est décalée. */
  restDay?: boolean;
  skippedMeals?: MealSlotId[];
}[] = [];

function mergeSkipped(current: MealSlotId[] | undefined, added: MealSlotId[] | undefined) {
  if (!added?.length) return current;
  return [...new Set([...(current ?? []), ...added])];
}

export function withSeededRecovery<T extends { dailyLogs: DailyLog[]; appliedSeeds?: string[] }>(state: T, seeds = SEEDED_RECOVERY): T {
  const applied = new Set(state.appliedSeeds ?? []);
  const pending = seeds.filter((seed) => !applied.has(seed.seedId));
  if (!pending.length) return state;

  let dailyLogs = [...state.dailyLogs];
  for (const seed of pending) {
    const existing = dailyLogs.find((log) => log.date === seed.date);
    if (existing) {
      const recovery = {
        ...existing.recovery,
        waterL: existing.recovery.waterL ?? seed.waterL,
        steps: existing.recovery.steps ?? seed.steps,
        sleepHours: seed.napHours
          ? (existing.recovery.sleepHours ?? 0) + seed.napHours
          : (existing.recovery.sleepHours ?? seed.sleepHours),
      };
      const skippedMeals = mergeSkipped(existing.skippedMeals, seed.skippedMeals);
      dailyLogs = dailyLogs.map((log) =>
        log === existing
          ? { ...log, recovery, ...(skippedMeals ? { skippedMeals } : {}), ...(seed.restDay ? { restDay: true } : {}) }
          : log,
      );
    } else {
      const blank = blankLog(seed.date);
      dailyLogs = [
        ...dailyLogs,
        {
          ...blank,
          recovery: {
            ...blank.recovery,
            waterL: seed.waterL,
            steps: seed.steps,
            sleepHours: seed.sleepHours ?? seed.napHours,
          },
          ...(seed.skippedMeals ? { skippedMeals: seed.skippedMeals } : {}),
          ...(seed.restDay ? { restDay: true } : {}),
        },
      ];
    }
    applied.add(seed.seedId);
  }
  dailyLogs.sort((a, b) => b.date.localeCompare(a.date));
  return { ...state, dailyLogs, appliedSeeds: [...applied] };
}

// ---------------------------------------------------------------------------
// Corrections de séances déjà saisies sur le téléphone
// ---------------------------------------------------------------------------

/**
 * Correctifs dictés dans le chat pour une séance notée dans l'app. Appliqués
 * une fois, seulement quand la séance du jour est bien présente sur l'appareil.
 */
export const SEEDED_WORKOUT_PATCHES: {
  seedId: string;
  date: string;
  /** Charge à corriger : exercice, index de série, ancienne et nouvelle valeur. */
  weightFixes: { exercise: string; setIndex: number; from: number; to: number }[];
  /** Note ajoutée à l'exercice qui a remplacé `replacedFrom`. */
  replacementNote?: { replacedFrom: string; note: string };
  workoutNote?: string;
  /** Exercice fait à la place d'un autre, noté sous l'ancien nom : on le renomme. */
  renames?: { from: string; to: string; note?: string }[];
  /** Séries dictées dans le chat pour un exercice resté vide. */
  fillSets?: { exercise: string; sets: SetLog[]; note?: string }[];
  /** La séance a été faite en entier mais pas « terminée » dans l'app. */
  complete?: boolean;
}[] = [];

export function withSeededWorkoutPatches<T extends { dailyLogs: DailyLog[]; appliedSeeds?: string[] }>(state: T, seeds = SEEDED_WORKOUT_PATCHES): T {
  const applied = new Set(state.appliedSeeds ?? []);
  let dailyLogs = state.dailyLogs;
  let changed = false;

  for (const patch of seeds) {
    if (applied.has(patch.seedId)) continue;
    const log = dailyLogs.find((item) => item.date === patch.date);
    const index = log?.workouts.findIndex((workout) => workout.exercises.some((exercise) => exercise.sets.length > 0)) ?? -1;
    // Séance pas encore synchronisée sur cet appareil : on retentera plus tard.
    if (!log || index < 0) continue;

    const workout = log.workouts[index];
    const exercises = workout.exercises.map((exercise) => {
      let next = exercise;
      for (const rename of patch.renames ?? []) {
        if (exercise.name !== rename.from) continue;
        next = {
          ...next,
          name: rename.to,
          exerciseId: undefined,
          replacedFrom: rename.from,
          note: rename.note && !(next.note ?? "").includes(rename.note) ? [next.note?.trim(), rename.note].filter(Boolean).join(" ") : next.note,
        };
      }
      for (const fill of patch.fillSets ?? []) {
        if (exercise.name !== fill.exercise || exercise.sets.length > 0) continue;
        next = { ...next, sets: fill.sets, skipped: false, note: fill.note ?? next.note };
      }
      for (const fix of patch.weightFixes) {
        if (exercise.name !== fix.exercise) continue;
        const set = next.sets[fix.setIndex];
        if (set && set.weightKg === fix.from) {
          next = { ...next, sets: next.sets.map((item, i) => (i === fix.setIndex ? { ...item, weightKg: fix.to } : item)) };
        }
      }
      const replacement = patch.replacementNote;
      if (replacement && exercise.replacedFrom === replacement.replacedFrom && !(exercise.note ?? "").includes(replacement.note)) {
        next = { ...next, note: exercise.note?.trim() ? `${exercise.note.trim()} ${replacement.note}` : replacement.note };
      }
      return next;
    });
    const note =
      patch.workoutNote && !(workout.note ?? "").includes(patch.workoutNote)
        ? workout.note?.trim()
          ? `${workout.note.trim()}\n${patch.workoutNote}`
          : patch.workoutNote
        : workout.note;
    const workouts = log.workouts.map((item, i) =>
      i === index ? { ...item, exercises, note, ...(patch.complete ? { completed: true } : {}) } : item,
    );
    dailyLogs = dailyLogs.map((item) => (item === log ? { ...item, workouts } : item));
    applied.add(patch.seedId);
    changed = true;
  }

  return changed ? { ...state, dailyLogs, appliedSeeds: [...applied] } : state;
}

/**
 * Séances enregistrées par erreur, signalées dans le chat : retirées une fois.
 * Si la journée n'est pas encore arrivée sur cet appareil, on réessaie plus tard.
 */
export const SEEDED_WORKOUT_REMOVALS: { seedId: string; date: string }[] = [];

export function withSeededWorkoutRemovals<T extends { dailyLogs: DailyLog[]; appliedSeeds?: string[] }>(state: T, seeds = SEEDED_WORKOUT_REMOVALS): T {
  const applied = new Set(state.appliedSeeds ?? []);
  let dailyLogs = state.dailyLogs;
  let changed = false;
  for (const removal of seeds) {
    if (applied.has(removal.seedId)) continue;
    const log = dailyLogs.find((item) => item.date === removal.date);
    if (!log || !log.workouts.length) continue;
    dailyLogs = dailyLogs.map((item) =>
      item === log ? { ...item, workouts: [], updatedAt: new Date().toISOString() } : item,
    );
    applied.add(removal.seedId);
    changed = true;
  }
  return changed ? { ...state, dailyLogs, appliedSeeds: [...applied] } : state;
}
