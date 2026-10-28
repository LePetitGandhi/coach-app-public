import { V2_TARGETS } from "./coachPlan";
import type {
  CoachTargets,
  DailyLog,
  DailyScore,
  DisciplineBreakdown,
  WeeklyCheckin,
  WeeklyObjective,
  WeeklySummary,
} from "./types";

export function todayLocalISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfWeekISO(date = new Date()): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const mondayOffset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return todayLocalISO(copy);
}

export function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return todayLocalISO(date);
}

export function emptyDailyLog(date = todayLocalISO()): DailyLog {
  return {
    date,
    meals: [],
    workouts: [],
    body: {},
    recovery: { energy: 3, mood: "neutre" },
    planRespect: 3,
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function mealTotals(log: DailyLog) {
  return log.meals.reduce(
    (total, meal) => ({
      proteinG: total.proteinG + meal.proteinG,
      calories: total.calories + meal.calories,
      offPlanMeals: total.offPlanMeals + (meal.quality === "off" ? 1 : 0),
    }),
    { proteinG: 0, calories: 0, offPlanMeals: 0 },
  );
}

export function workoutDone(log: DailyLog): boolean {
  return log.workouts.some((workout) => workout.completed);
}

/**
 * Une journée « touchée » est une journée où quelque chose a réellement été
 * saisi. Sans ce garde-fou, les valeurs par défaut du formulaire (respect du
 * plan à 3, énergie neutre) rapportaient 8 points à une journée où l'app
 * n'avait même pas été ouverte : le score ne partait pas de zéro.
 */
export function hasAnyEntry(log: DailyLog): boolean {
  const { sleepHours, steps, waterL } = log.recovery;
  return Boolean(
    log.meals.length ||
      log.workouts.length ||
      typeof sleepHours === "number" ||
      typeof steps === "number" ||
      typeof waterL === "number" ||
      typeof log.body.weightKg === "number" ||
      typeof log.body.waistCm === "number" ||
      log.notes.trim(),
  );
}

export function hardSets(log: DailyLog): number {
  return log.workouts.reduce((sum, workout) => sum + workout.hardSets, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Malus calorique.
 *
 * Les calories décident du sens de la recomposition, mais une cible atteinte au
 * gramme près n'existe pas dans la vraie vie. On ne sanctionne donc rien dans
 * une fourchette de ±20 % (1800 à 2700 kcal pour une cible à 2250), puis on
 * retire progressivement jusqu'à 10 points au-delà. Une journée sans repas
 * tracké n'est pas pénalisée ici : c'est déjà le rôle du poste « tracking ».
 */
export function caloriePenalty(calories: number, target: number): number {
  if (calories <= 0) return 0;
  const drift = Math.abs(calories - target) / target;
  if (drift <= 0.2) return 0;
  return clamp(Math.round((drift - 0.2) * 50), 0, 10);
}

export function scoreDailyLog(log: DailyLog, targets: CoachTargets = V2_TARGETS): DailyScore {
  const totals = mealTotals(log);
  const touched = hasAnyEntry(log);
  const protein = clamp(Math.round((totals.proteinG / targets.proteinG) * 30), 0, 30);

  const trainingBase = workoutDone(log) ? 18 : hardSets(log) >= 4 ? 12 : 0;
  const stepsBonus = log.recovery.steps ? clamp(Math.round((log.recovery.steps / targets.steps) * 7), 0, 7) : 0;
  const training = clamp(trainingBase + stepsBonus, 0, 25);

  const sleepPoints = log.recovery.sleepHours
    ? clamp(Math.round((log.recovery.sleepHours / targets.sleepHours) * 12), 0, 12)
    : 0;
  // L'énergie est un curseur avec une valeur par défaut : elle ne rapporte que
  // si la journée a été réellement remplie, sinon elle offre des points gratuits.
  const energyPoints = touched ? (log.recovery.energy >= 4 ? 4 : log.recovery.energy === 3 ? 2 : 0) : 0;
  const waterPoints = log.recovery.waterL ? clamp(Math.round((log.recovery.waterL / targets.waterL) * 4), 0, 4) : 0;
  const recovery = clamp(sleepPoints + energyPoints + waterPoints, 0, 20);

  // Le tracking récompense un suivi qui sert à décider, pas le simple fait
  // d'avoir touché le formulaire. Trois repas valent mieux qu'un, une séance
  // détaillée vaut mieux qu'une case cochée.
  //
  // La note écrite reste valorisée mais n'est plus indispensable : les repas et
  // la séance suffisent à atteindre le maximum, sinon un 100/100 exigeait de
  // rédiger quinze caractères après une journée déjà parfaite.
  const mealsLogged = Math.min(log.meals.length, 3);
  const foodPoints = mealsLogged * 3; // 0 à 9
  const detailedSets = log.workouts.reduce(
    (sum, workout) => sum + workout.exercises.reduce((s, exercise) => s + exercise.sets.length, 0),
    0,
  );
  const workoutPoints = detailedSets >= 4 ? 4 : detailedSets > 0 ? 2 : 0;
  const recoveryFields = [log.recovery.sleepHours, log.recovery.steps, log.recovery.waterL].filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  ).length;
  const recoveryPoints = Math.min(recoveryFields, 3); // 0 à 3
  const notePoints = log.notes.trim().length >= 15 ? 2 : 0;
  const tracking = clamp(foodPoints + workoutPoints + recoveryPoints + notePoints, 0, 15);

  // `planRespect` vaut 3 par défaut : sans saisie, ce poste rapportait 6 points
  // à une journée vide.
  const plan = touched ? clamp(log.planRespect * 2 - totals.offPlanMeals * 2, 0, 10) : 0;
  const caloriePenaltyPoints = caloriePenalty(totals.calories, targets.calories);

  const breakdown: DisciplineBreakdown = { protein, training, recovery, tracking, plan };
  const score = clamp(protein + training + recovery + tracking + plan - caloriePenaltyPoints, 0, 100);
  const gaps = [
    { label: "protéines", value: 30 - protein },
    { label: "entraînement/pas", value: 25 - training },
    { label: "récupération", value: 20 - recovery },
    { label: "tracking", value: 15 - tracking },
    { label: "respect du plan", value: 10 - plan },
    { label: "calories", value: caloriePenaltyPoints },
  ].sort((a, b) => b.value - a.value);

  return {
    date: log.date,
    score,
    caloriePenalty: caloriePenaltyPoints,
    label: score >= 85 ? "Exécution de transformation" : score >= 70 ? "Journée solide" : score >= 50 ? "À verrouiller" : "Rattrapage immédiat",
    tone: score >= 70 ? "strict" : score >= 45 ? "adaptatif" : "alerte",
    breakdown,
    primaryGap: gaps[0]?.label ?? "maintien",
  };
}

export function logsForWeek(logs: DailyLog[], weekStart = startOfWeekISO()): DailyLog[] {
  const weekEnd = addDaysISO(weekStart, 7);
  return logs.filter((log) => log.date >= weekStart && log.date < weekEnd).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Série de journées consécutives au-dessus du seuil.
 *
 * La journée en cours est forcément incomplète au réveil : la compter comme les
 * autres remettait le compteur à zéro chaque matin, précisément au moment où il
 * sert à quelque chose. On part donc d'hier, et aujourd'hui n'est ajouté qu'en
 * bonus, une fois le seuil déjà franchi.
 */
export function currentStreak(logs: DailyLog[], minScore = 70, today = todayLocalISO()): number {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const todayLog = byDate.get(today);
  const todayCounts = todayLog ? scoreDailyLog(todayLog).score >= minScore : false;

  let streak = todayCounts ? 1 : 0;
  let cursor = addDaysISO(today, -1);
  while (true) {
    const log = byDate.get(cursor);
    if (!log) return streak;
    if (scoreDailyLog(log).score < minScore) return streak;
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
}

function trend(values: { date: string; value?: number }[]): number | null {
  const valid = values
    .filter((item): item is { date: string; value: number } => typeof item.value === "number" && Number.isFinite(item.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (valid.length < 2) return null;
  return rounded(valid[valid.length - 1].value - valid[0].value);
}

export function buildWeeklySummary(
  logs: DailyLog[],
  targets: CoachTargets = V2_TARGETS,
  weekStart = startOfWeekISO(),
): WeeklySummary {
  const weekLogs = logsForWeek(logs, weekStart);
  const scores = weekLogs.map((log) => scoreDailyLog(log, targets));
  const totalScore = scores.length ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length) : 0;
  const proteinDays = weekLogs.filter((log) => mealTotals(log).proteinG >= targets.proteinG * 0.9).length;
  const trackingDays = weekLogs.filter((log) => log.meals.length > 0 || log.workouts.length > 0 || log.recovery.sleepHours).length;
  const sleepRows = weekLogs.filter((log) => typeof log.recovery.sleepHours === "number");
  const avgSleep = sleepRows.length
    ? rounded(sleepRows.reduce((sum, log) => sum + (log.recovery.sleepHours ?? 0), 0) / sleepRows.length)
    : null;
  const avgProtein = weekLogs.length
    ? Math.round(weekLogs.reduce((sum, log) => sum + mealTotals(log).proteinG, 0) / weekLogs.length)
    : 0;
  const avgCalories = weekLogs.length
    ? Math.round(weekLogs.reduce((sum, log) => sum + mealTotals(log).calories, 0) / weekLogs.length)
    : 0;

  const summary = {
    weekStart,
    score: totalScore,
    streak: currentStreak(logs),
    workoutsDone: weekLogs.filter(workoutDone).length,
    proteinDays,
    trackingDays,
    sleepDays: weekLogs.filter((log) => (log.recovery.sleepHours ?? 0) >= targets.sleepHours).length,
    stepsDays: weekLogs.filter((log) => (log.recovery.steps ?? 0) >= targets.steps).length,
    avgSleep,
    avgProtein,
    avgCalories,
    weightTrendKg: trend(weekLogs.map((log) => ({ date: log.date, value: log.body.weightKg }))),
    waistTrendCm: trend(weekLogs.map((log) => ({ date: log.date, value: log.body.waistCm }))),
    coachLine: "",
  };

  return {
    ...summary,
    coachLine: buildCoachLine(summary, targets),
  };
}

function buildCoachLine(summary: Omit<WeeklySummary, "coachLine">, targets: CoachTargets): string {
  if (summary.trackingDays < 4) return "Tu ne peux pas piloter ce que tu ne notes pas. Cette semaine, tracking minimal tous les jours.";
  if (summary.workoutsDone < targets.workoutsPerWeek - 1) return "La priorité est simple : remettre les séances dans l'agenda avant de chercher l'optimisation.";
  if (summary.proteinDays < 5) return "Le muscle ne négocie pas avec des intentions. Sécurise 35 g de protéines sur 4 prises.";
  if ((summary.avgSleep ?? 0) < 7) return "Tu veux pousser plus fort, mais la récupération limite le retour sur effort. Coucher protégé cette semaine.";
  if ((summary.waistTrendCm ?? 0) > 1) return "Tour de taille en hausse : garde les charges, resserre les écarts et stabilise les calories.";
  return "Bonne direction. Maintenant, garde le rythme et cherche une micro-progression mesurable sur chaque séance.";
}

/**
 * Avancement d'un objectif hebdomadaire.
 *
 * Les objectifs sont déclarés dans `coachPlan.ts` et stockés dans l'état ; cette
 * fonction est le pont qui manquait entre les deux et l'affichage.
 */
export function objectiveProgress(objective: WeeklyObjective, summary: WeeklySummary): number {
  switch (objective.kind) {
    case "proteinDays":
      return summary.proteinDays;
    case "workouts":
      return summary.workoutsDone;
    case "sleepDays":
      return summary.sleepDays;
    case "trackingDays":
      return summary.trackingDays;
    case "stepsDays":
      return summary.stepsDays;
    default:
      return 0;
  }
}

export function buildCheckin(
  logs: DailyLog[],
  wins: string,
  friction: string,
  nextWeekFocus: string,
  weekStart = startOfWeekISO(),
): WeeklyCheckin {
  const summary = buildWeeklySummary(logs, V2_TARGETS, weekStart);
  return {
    id: `checkin-${weekStart}-${Date.now()}`,
    weekStart,
    createdAt: new Date().toISOString(),
    score: summary.score,
    weightTrendKg: summary.weightTrendKg,
    waistTrendCm: summary.waistTrendCm,
    wins,
    friction,
    nextWeekFocus,
    coachFeedback: summary.coachLine,
  };
}
