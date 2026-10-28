"use client";

import { SEEDED_TICKETS, SEEDED_TICKETS_KEY } from "./purchases";
import { SEEDED_MEALS, SEEDED_WEIGHTS, SEEDED_RECOVERY, SEEDED_WORKOUT_PATCHES, SEEDED_WORKOUT_REMOVALS, SEEDED_WORKOUTS, withHistory, withSeededMeals, withSeededRecovery, withSeededWorkoutPatches, withSeededWorkoutRemovals, withSeededWorkouts } from "./history";
import { captureSnapshot } from "./backup";
import { DEFAULT_OBJECTIVES, DEFAULT_REMINDERS } from "./coachPlan";
import { emptyDailyLog, todayLocalISO } from "./metrics";
import { countHardSets } from "./training";
import type { CoachV2State, DailyLog, MealLog, WeeklyCheckin } from "./types";

const V2_KEY = "coach.v2.state";

const LEGACY_KEYS = {
  progress: "coach.progress",
  intake: "coach.intake",
  sessions: "coach.sessions",
  checkins: "coach.checkins",
} as const;

type LegacyProgress = {
  date?: string;
  poids_kg?: number;
  tour_taille_cm?: number;
  tour_bras_cm?: number;
  tour_cuisse_cm?: number;
  tour_poitrine_cm?: number;
  litres_eau?: number;
  pas?: number;
  sommeil_h?: number;
  note?: string;
};

type LegacyIntake = {
  id?: string;
  date?: string;
  nom?: string;
  kcal?: number;
  prot?: number;
  hors_plan?: boolean;
};

type LegacySession = {
  id?: string;
  date?: string;
  sessionId?: string;
  duree_min?: number;
  exercises?: { sets?: { done?: boolean }[] }[];
  ressenti?: number;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function isState(value: unknown): value is CoachV2State {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as CoachV2State).version === 2 &&
      Array.isArray((value as CoachV2State).dailyLogs) &&
      Array.isArray((value as CoachV2State).checkins),
  );
}

function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOrCreateLog(map: Map<string, DailyLog>, date: string): DailyLog {
  const existing = map.get(date);
  if (existing) return existing;
  const created = emptyDailyLog(date);
  map.set(date, created);
  return created;
}

function importLegacyLogs(): DailyLog[] {
  if (typeof window === "undefined") return [];
  const byDate = new Map<string, DailyLog>();
  const progress = readJson<LegacyProgress[]>(LEGACY_KEYS.progress, []);
  const intake = readJson<LegacyIntake[]>(LEGACY_KEYS.intake, []);
  const sessions = readJson<LegacySession[]>(LEGACY_KEYS.sessions, []);

  for (const row of progress) {
    if (!row?.date) continue;
    const log = getOrCreateLog(byDate, row.date);
    log.body = {
      ...log.body,
      weightKg: row.poids_kg,
      waistCm: row.tour_taille_cm,
      chestCm: row.tour_poitrine_cm,
      armCm: row.tour_bras_cm,
      thighCm: row.tour_cuisse_cm,
    };
    log.recovery = {
      ...log.recovery,
      sleepHours: row.sommeil_h,
      steps: row.pas,
      waterL: row.litres_eau,
    };
    if (row.note) log.notes = row.note;
  }

  for (const row of intake) {
    if (!row?.date || !row.nom) continue;
    const log = getOrCreateLog(byDate, row.date);
    const meal: MealLog = {
      id: row.id ?? uid("legacy-meal"),
      name: row.nom,
      proteinG: Math.max(0, Math.round(row.prot ?? 0)),
      calories: Math.max(0, Math.round(row.kcal ?? 0)),
      quality: row.hors_plan ? "off" : "plan",
    };
    if (!log.meals.some((item) => item.id === meal.id)) log.meals.push(meal);
  }

  for (const row of sessions) {
    if (!row?.date) continue;
    const log = getOrCreateLog(byDate, row.date);
    const hardSets = row.exercises?.reduce(
      (sum, exercise) => sum + (exercise.sets?.filter((set) => set.done).length ?? 0),
      0,
    );
    log.workouts.push({
      id: row.id ?? uid("legacy-workout"),
      focus: row.sessionId ?? "Séance legacy",
      minutes: Math.max(0, Math.round(row.duree_min ?? 45)),
      hardSets: Math.max(0, hardSets ?? 0),
      progression: false,
      completed: true,
      exercises: [],
    });
    if (row.ressenti && row.ressenti >= 1 && row.ressenti <= 5) {
      log.recovery.energy = row.ressenti as 1 | 2 | 3 | 4 | 5;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function defaultState(): CoachV2State {
  const today = todayLocalISO();
  const legacy = importLegacyLogs();
  const hasToday = legacy.some((log) => log.date === today);
  return {
    version: 2,
    dailyLogs: hasToday ? legacy : [emptyDailyLog(today), ...legacy],
    checkins: [],
    reminders: DEFAULT_REMINDERS,
    objectives: DEFAULT_OBJECTIVES,
  };
}

/**
 * Migration non destructive : les séances enregistrées avant le journal
 * d'exercices n'ont pas de tableau `exercises`. On le crée vide plutôt que de
 * laisser un `undefined` circuler dans tout le code.
 */
function migrate(state: CoachV2State): CoachV2State {
  let changed = false;
  const dailyLogs = state.dailyLogs.map((log) => {
    const workouts = log.workouts.map((workout) => {
      if (Array.isArray(workout.exercises)) return workout;
      changed = true;
      return { ...workout, exercises: [] };
    });
    return changed ? { ...log, workouts } : log;
  });
  return changed ? { ...state, dailyLogs } : state;
}

export function loadCoachV2State(): CoachV2State {
  const saved = readJson<unknown>(V2_KEY, null);
  if (isState(saved)) {
    const migrated = withSeededWorkoutRemovals(withSeededWorkoutPatches(withSeededRecovery(withSeededWorkouts(withSeededMeals(withHistory(migrate(saved)))))));
    if (migrated !== saved) saveCoachV2State(migrated);
    return migrated;
  }
  const initial = withSeededRecovery(withSeededMeals(withHistory(defaultState())));
  saveCoachV2State(initial);
  return initial;
}

export function saveCoachV2State(state: CoachV2State) {
  writeJson(V2_KEY, state);
  // Instantané quotidien, idempotent : le coût est négligeable et ça évite de
  // tout perdre sur un vidage de cache.
  captureSnapshot(state, todayLocalISO());
}

export function getTodayLog(state: CoachV2State, date = todayLocalISO()): DailyLog {
  return state.dailyLogs.find((log) => log.date === date) ?? emptyDailyLog(date);
}

export function upsertDailyLog(state: CoachV2State, log: DailyLog): CoachV2State {
  const updatedLog: DailyLog = {
    ...log,
    // `hardSets` reste la source de vérité pour le score : on le recalcule dès
    // qu'une séance contient des séries détaillées.
    workouts: log.workouts.map((workout) =>
      workout.exercises.length ? { ...workout, hardSets: countHardSets(workout) } : workout,
    ),
    updatedAt: new Date().toISOString(),
  };
  const exists = state.dailyLogs.some((item) => item.date === updatedLog.date);
  const dailyLogs = exists
    ? state.dailyLogs.map((item) => (item.date === updatedLog.date ? updatedLog : item))
    : [updatedLog, ...state.dailyLogs];
  const next = { ...state, dailyLogs: dailyLogs.sort((a, b) => b.date.localeCompare(a.date)) };
  saveCoachV2State(next);
  return next;
}

export function addCheckin(state: CoachV2State, checkin: WeeklyCheckin): CoachV2State {
  const next = { ...state, checkins: [checkin, ...state.checkins] };
  saveCoachV2State(next);
  return next;
}

export function exportCoachV2State(state: CoachV2State): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2);
}

/**
 * Repart de zéro : efface l'état V2 et les clés héritées de la V1, puis rend un
 * état vierge. Exporte avant, l'opération est irréversible.
 */
export function resetCoachV2State(): CoachV2State {
  if (typeof window !== "undefined") {
    localStorage.removeItem(V2_KEY);
    localStorage.removeItem("coach.v2.backups");
    localStorage.removeItem("coach.v2.lastExport");
    localStorage.removeItem("coach.v2.mealplan");
    localStorage.removeItem("coach.v2.onboarding");
    localStorage.setItem("coach.v2.purchases", "[]");
    // Repartir de zéro = ne pas réimporter les tickets envoyés dans le chat.
    localStorage.setItem(SEEDED_TICKETS_KEY, JSON.stringify(SEEDED_TICKETS.map((ticket) => ticket.id)));
    localStorage.setItem("coach.v2.pantry", "{}");
    for (const key of Object.values(LEGACY_KEYS)) localStorage.removeItem(key);
  }
  const fresh: CoachV2State = {
    version: 2,
    // Repartir de zéro = ne pas réinjecter les repas saisis depuis le chat.
    appliedSeeds: [...SEEDED_MEALS, ...SEEDED_WEIGHTS, ...SEEDED_WORKOUTS, ...SEEDED_RECOVERY, ...SEEDED_WORKOUT_PATCHES, ...SEEDED_WORKOUT_REMOVALS].map((seed) => seed.seedId),
    dailyLogs: [emptyDailyLog(todayLocalISO())],
    checkins: [],
    reminders: DEFAULT_REMINDERS,
    objectives: DEFAULT_OBJECTIVES,
  };
  saveCoachV2State(fresh);
  return fresh;
}
