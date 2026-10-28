export type CoachTone = "strict" | "adaptatif" | "alerte";

export type MealQuality = "plan" | "improvise" | "off";

export type Mood = "solide" | "neutre" | "bas";

export type MealLog = {
  id: string;
  name: string;
  proteinG: number;
  calories: number;
  quality: MealQuality;
  /** Aliment ou recette d'origine, si le repas vient de la base. */
  sourceId?: string;
  /** Quantité en grammes, quand le repas est saisi par portion. */
  grams?: number;
  /** Multiplicateur appliqué à une recette (1 = portion du plan). */
  portion?: number;
};

/** Une série effectuée. `weightKg` absent = poids du corps. */
export type SetLog = {
  reps: number;
  /** Exercice tenu en durée (planche, gainage) : durée en secondes. */
  seconds?: number;
  weightKg?: number;
  /** Répétitions en réserve : 0 = échec, 3 = trois reps encore possibles. */
  rir?: number;
};

export type ExerciseLog = {
  id: string;
  /** Identifiant dans la bibliothèque, si l'exercice en vient. */
  exerciseId?: string;
  name: string;
  sets: SetLog[];
  /** Objectif affiché pendant la séance, ex. « 4 × 6-8 ». */
  target?: string;
  /** Fourchette de reps visée — pilote la règle +1 rep / +2,5 kg. */
  repRange?: [number, number];
  /** Exercice sauté pendant la séance (gardé pour le récap). */
  skipped?: boolean;
  /** Exercice prévu qu'on a remplacé par celui-ci. */
  replacedFrom?: string;
  /** Ressenti noté à la fin de l'exercice — ajuste la consigne suivante. */
  feel?: Feel;
  note?: string;
};

export type Feel = "facile" | "ok" | "dur" | "douleur";

export type WorkoutLog = {
  id: string;
  focus: string;
  minutes: number;
  /** Séries dures. Recalculé depuis `exercises` dès qu'il y en a. */
  hardSets: number;
  progression: boolean;
  completed: boolean;
  exercises: ExerciseLog[];
  /** Ressenti global et note libre de fin de séance. */
  feel?: Feel;
  note?: string;
};

export type BodyMetrics = {
  weightKg?: number;
  /** Tour de taille, au nombril, à jeun le matin. */
  waistCm?: number;
  /** Tour de cou, sous la pomme d'Adam — nécessaire à l'estimation Navy. */
  neckCm?: number;
  chestCm?: number;
  /** Tour de bras contracté. */
  armCm?: number;
  thighCm?: number;
  shoulderCm?: number;
  /** % de masse grasse mesuré (balance à impédance, pince, DEXA). Prioritaire sur l'estimation. */
  bodyFatPct?: number;
};

export type BodyComposition = {
  date: string;
  weightKg: number;
  bodyFatPct: number;
  /** "mesure" si saisi directement, "navy" si estimé au mètre ruban. */
  source: "mesure" | "navy";
  fatKg: number;
  leanKg: number;
};

export type RecoveryLog = {
  sleepHours?: number;
  energy: 1 | 2 | 3 | 4 | 5;
  mood: Mood;
  steps?: number;
  waterL?: number;
};

/** Créneaux de repas, dans l'ordre de la journée. */
export type MealSlotId = "petit_dej" | "dejeuner" | "collation" | "diner";

export type DailyLog = {
  date: string;
  meals: MealLog[];
  /** Repas volontairement sautés (ex. pas de petit-déj) : distingue « rien mangé » de « oublié de noter ». */
  skippedMeals?: MealSlotId[];
  /** Repos choisi ce jour-là : la séance du jour est décalée (elle redevient un rattrapage le lendemain). */
  restDay?: boolean;
  workouts: WorkoutLog[];
  body: BodyMetrics;
  recovery: RecoveryLog;
  planRespect: 1 | 2 | 3 | 4 | 5;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type WeeklyCheckin = {
  id: string;
  weekStart: string;
  createdAt: string;
  score: number;
  weightTrendKg: number | null;
  waistTrendCm: number | null;
  wins: string;
  friction: string;
  nextWeekFocus: string;
  coachFeedback: string;
};

export type Reminder = {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
};

export type WeeklyObjective = {
  id: string;
  label: string;
  target: number;
  unit: string;
  kind: "proteinDays" | "workouts" | "sleepDays" | "trackingDays" | "stepsDays";
};

export type CoachTargets = {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  workoutsPerWeek: number;
  steps: number;
  sleepHours: number;
  waterL: number;
};

export type CoachV2State = {
  version: 2;
  dailyLogs: DailyLog[];
  checkins: WeeklyCheckin[];
  reminders: Reminder[];
  objectives: WeeklyObjective[];
  /** Saisies faites pour l'utilisateur (depuis le chat), appliquées une seule fois. */
  appliedSeeds?: string[];
};

export type DisciplineBreakdown = {
  protein: number;
  training: number;
  recovery: number;
  tracking: number;
  plan: number;
};

export type DailyScore = {
  date: string;
  score: number;
  label: string;
  tone: CoachTone;
  breakdown: DisciplineBreakdown;
  primaryGap: string;
  /** Points retirés pour un écart calorique supérieur à 20 % de la cible. */
  caloriePenalty: number;
};

export type WeeklySummary = {
  weekStart: string;
  score: number;
  streak: number;
  workoutsDone: number;
  proteinDays: number;
  trackingDays: number;
  sleepDays: number;
  stepsDays: number;
  avgSleep: number | null;
  avgProtein: number;
  avgCalories: number;
  weightTrendKg: number | null;
  waistTrendCm: number | null;
  coachLine: string;
};
