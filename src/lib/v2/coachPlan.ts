import type { CoachTargets, Reminder, WeeklyObjective } from "./types";

export const V2_PROFILE = {
  name: "Aïmen",
  age: 22,
  heightCm: 178,
  weightKg: 70,
  goal: "Sèche légère : perdre du gras en gardant le muscle (2250 kcal, 140 g de protéines), 8 semaines.",
  level: "debutant",
  budgetMonthlyEur: 300,
  exclusions: ["porc"],
} as const;

export const V2_TARGETS: CoachTargets = {
  // Sèche légère à partir du 13/10 (8 semaines) : −300 kcal,
  // protéines inchangées pour garder le muscle.
  calories: 2250,
  proteinG: 140,
  fatG: 65,
  carbsG: 275,
  workoutsPerWeek: 4,
  steps: 8000,
  sleepHours: 7.5,
  waterL: 2.2,
};

export const DEFAULT_OBJECTIVES: WeeklyObjective[] = [
  {
    id: "protein-6",
    label: "6 jours à 140 g de protéines",
    target: 6,
    unit: "jours",
    kind: "proteinDays",
  },
  {
    id: "workouts-4",
    label: "4 séances musculation validées",
    target: 4,
    unit: "séances",
    kind: "workouts",
  },
  {
    id: "sleep-5",
    label: "5 nuits à 7 h 30 ou plus",
    target: 5,
    unit: "nuits",
    kind: "sleepDays",
  },
  {
    id: "tracking-7",
    label: "7 jours trackés, même imparfaits",
    target: 7,
    unit: "jours",
    kind: "trackingDays",
  },
];

export const DEFAULT_REMINDERS: Reminder[] = [
  { id: "morning-weight", label: "Poids + intention du jour", time: "08:00", enabled: true },
  { id: "protein-lunch", label: "Protéines sécurisées avant 14 h", time: "13:30", enabled: true },
  { id: "training-window", label: "Créneau séance ou minimum day", time: "18:30", enabled: true },
  { id: "night-check", label: "Check discipline + sommeil", time: "22:30", enabled: true },
];

/** Exercice prévu dans une séance type. `reps` = fourchette cible. */
export type PlannedExercise = { name: string; sets: number; reps: [number, number] };

/** Début du programme à Cergy : aucune séance avant cette date n'est « ratée ». */
export const PROGRAM_START = "2026-09-28";

/** Salle actuelle : ESSEC Sports & Recreation Center (campus de Cergy). */
export const GYM = {
  name: "Salle ESSEC",
  detail: "Sports & Recreation Center, campus de Cergy — accès étudiant, pas d'abonnement",
  /** Matériel relevé sur place (mai 2026). Le plan n'utilise que celui-ci. */
  equipment: [
    "Chest press",
    "Lat pulldown",
    "Rowing poulie basse",
    "Poulies haute et basse",
    "Curl pupitre machine",
    "Shoulder press machine",
    "Presse à cuisses",
    "Leg curl",
    "Haltères + bancs",
    "Tapis de course, vélo, rameur Concept2",
  ],
};

/**
 * Séances type — uniquement avec le matériel de la salle ESSEC. Les noms
 * d'exercices servent de clé d'historique : ne pas les renommer, sinon la
 * règle « +1 rep avant +2,5 kg » perd la trace de la séance précédente.
 */
export const TRAINING_SPLIT = [
  {
    day: "Lundi",
    title: "Haut du corps · force",
    focus: "Pecs, dos, épaules, biceps",
    exercises: [
      { name: "Chest press", sets: 4, reps: [6, 8] },
      { name: "Lat pulldown", sets: 4, reps: [8, 10] },
      { name: "Shoulder press machine", sets: 3, reps: [8, 12] },
      { name: "Rowing poulie basse", sets: 3, reps: [8, 12] },
      { name: "Curl pupitre machine", sets: 2, reps: [8, 12] },
    ] as PlannedExercise[],
    rules: [
      "Chest press : 4 × 6-8",
      "Lat pulldown : 4 × 8-10",
      "Shoulder press machine + rowing poulie basse : 3 × 8-12",
      "Curl pupitre : 2 × 8-12 · RIR 1-3 · +1 rep avant +2,5 kg",
    ],
  },
  {
    day: "Mardi",
    title: "Bas du corps · force",
    focus: "Quadriceps, ischios, fessiers, mollets, gainage",
    exercises: [
      { name: "Presse à cuisses", sets: 4, reps: [8, 10] },
      { name: "Leg curl", sets: 3, reps: [10, 12] },
      { name: "Goblet squat", sets: 3, reps: [10, 12] },
      { name: "Mollets à la presse", sets: 4, reps: [12, 15] },
      { name: "Planche", sets: 3, reps: [1, 1] },
    ] as PlannedExercise[],
    rules: [
      "Presse à cuisses : 4 × 8-10",
      "Leg curl + goblet squat haltère : 3 × 10-12",
      "Mollets à la presse : 4 × 12-15",
      "Planche : 3 × 30-45 s",
    ],
  },
  {
    day: "Jeudi",
    title: "Haut du corps · volume",
    focus: "Volume haut du corps, bras, abdos",
    exercises: [
      { name: "Développé incliné haltères", sets: 3, reps: [10, 12] },
      { name: "Rowing haltère un bras", sets: 3, reps: [10, 12] },
      { name: "Élévations latérales haltères", sets: 3, reps: [12, 15] },
      { name: "Curl pupitre machine", sets: 3, reps: [10, 12] },
      { name: "Extensions triceps poulie haute", sets: 3, reps: [12, 15] },
      { name: "Crunch poulie haute", sets: 3, reps: [12, 15] },
    ] as PlannedExercise[],
    rules: [
      "Développé incliné haltères (banc) + rowing haltère : 3 × 10-12",
      "Élévations latérales : 3 × 12-15",
      "Curl pupitre + extensions triceps poulie : 3 × 10-15",
      "Crunch poulie haute : 3 × 12-15",
    ],
  },
  {
    day: "Samedi",
    title: "Bas du corps · volume",
    focus: "Ischios, fessiers, jambes, bras",
    exercises: [
      { name: "Soulevé de terre roumain haltères", sets: 4, reps: [8, 10] },
      { name: "Fentes haltères", sets: 3, reps: [10, 12] },
      { name: "Hip thrust haltère", sets: 3, reps: [10, 12] },
      { name: "Leg curl", sets: 3, reps: [10, 12] },
      { name: "Curl marteau haltères", sets: 3, reps: [10, 12] },
      { name: "Planche", sets: 3, reps: [1, 1] },
    ] as PlannedExercise[],
    rules: [
      "Soulevé de terre roumain haltères : 4 × 8-10",
      "Fentes + hip thrust haltère (banc) : 3 × 10-12",
      "Leg curl + curl marteau : 3 × 10-12",
      "Planche : 3 × 30-45 s · cardio en option : 15 min rameur ou tapis",
    ],
  },
];

export const NUTRITION_RULES = [
  "Chaque repas principal contient une source protéinée identifiable.",
  "Un écart n'annule pas la journée : le repas suivant redevient cadré.",
  "Glucides autour de l'entraînement, légumes au moins deux fois par jour.",
  "Pas de déficit agressif : l'objectif est construire du muscle tout en contrôlant le tour de taille.",
];

export const MINIMUM_DAY = [
  "20 minutes marche rapide ou mobilité.",
  "100 g de protéines minimum.",
  "Un log dans l'app, même brutalement honnête.",
  "Coucher protégé : écran coupé et alarme sommeil.",
];

export const COACH_PRINCIPLES = [
  "Strict sur les actions, intelligent sur l'adaptation.",
  "Résultat physique avant confort, mais jamais au prix d'une stratégie dangereuse.",
  "La discipline se mesure par les retours rapides après un écart.",
  "La progression se gagne par répétition, surcharge progressive et récupération.",
];

/**
 * Remplaçants avec le matériel de la salle ESSEC, pour une machine prise ou
 * absente. Le remplaçant garde l'objectif séries × reps de l'exercice prévu.
 */
export const ALTERNATIVES: Record<string, string[]> = {
  "Chest press": ["Développé couché haltères", "Pompes"],
  "Lat pulldown": ["Tirage poulie haute un bras", "Pull-over poulie haute"],
  "Shoulder press machine": ["Développé épaules haltères"],
  "Rowing poulie basse": ["Rowing haltère un bras"],
  "Curl pupitre machine": ["Curl haltères", "Curl poulie basse"],
  "Presse à cuisses": ["Goblet squat", "Fentes haltères"],
  "Leg curl": ["Soulevé de terre roumain haltères"],
  "Goblet squat": ["Presse à cuisses", "Fentes haltères"],
  "Mollets à la presse": ["Mollets debout haltères"],
  Planche: ["Crunch poulie haute"],
  "Développé incliné haltères": ["Chest press", "Pompes pieds surélevés"],
  "Rowing haltère un bras": ["Rowing poulie basse"],
  "Élévations latérales haltères": ["Élévations latérales poulie basse"],
  "Extensions triceps poulie haute": ["Extensions triceps haltère au-dessus de la tête"],
  "Crunch poulie haute": ["Planche"],
  "Soulevé de terre roumain haltères": ["Leg curl", "Hip thrust haltère"],
  "Fentes haltères": ["Goblet squat"],
  "Hip thrust haltère": ["Soulevé de terre roumain haltères"],
  "Curl marteau haltères": ["Curl pupitre machine", "Curl haltères"],
};

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;

/** Jour de la semaine en toutes lettres, pour une date (par défaut aujourd'hui). */
export function weekdayName(date: Date = new Date()) {
  return WEEKDAYS[date.getDay()];
}

/** Séance prévue pour un jour donné, ou null si repos. */
export function plannedSession(day: string = weekdayName()) {
  return TRAINING_SPLIT.find((session) => session.day === day) ?? null;
}
