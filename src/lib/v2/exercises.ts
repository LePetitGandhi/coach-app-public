/**
 * Bibliothèque d'exercices.
 *
 * Source : https://github.com/hasaneyldrm/exercises-dataset (MIT).
 * Médias (GIF + vignettes) © Gym visual — https://gymvisual.com/ — servis à la
 * demande depuis le CDN jsDelivr, jamais copiés dans le dépôt.
 *
 * Le JSON vit dans `public/data/` : il est chargé à la demande côté client et
 * n'entre donc jamais dans le bundle JavaScript.
 */

export const EXERCISES_CDN = "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main";
export const EXERCISES_ATTRIBUTION = "© Gym visual — gymvisual.com";

/** Enregistrement brut, clés courtes pour garder le fichier léger. */
export type RawExercise = {
  id: string;
  /** Nom français */
  n: string;
  /** Nom original anglais */
  en: string;
  /** Catégorie / partie du corps */
  c: string;
  /** Matériel */
  q: string;
  /** Muscle cible */
  t: string;
  /** Muscles secondaires (français) */
  s: string[];
  /** Étapes d'exécution en français */
  p: string[];
  /** Identifiant média */
  m: string;
  /** 1 si réalisable à la maison avec le matériel de base */
  h: 0 | 1;
};

export type Exercise = {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  categoryLabel: string;
  equipment: string;
  equipmentLabel: string;
  target: string;
  targetLabel: string;
  secondary: string[];
  steps: string[];
  home: boolean;
  thumbUrl: string;
  gifUrl: string;
};

export type ExerciseMeta = {
  source: string;
  cdn: string;
  count: number;
  home: number;
  categories: Record<string, string>;
  equipment: Record<string, string>;
  targets: Record<string, string>;
};

export type ExerciseLibrary = {
  meta: ExerciseMeta;
  exercises: Exercise[];
};

export function thumbUrl(id: string, mediaId: string) {
  return `${EXERCISES_CDN}/images/${id}-${mediaId}.jpg`;
}

export function gifUrl(id: string, mediaId: string) {
  return `${EXERCISES_CDN}/videos/${id}-${mediaId}.gif`;
}

function hydrate(raw: RawExercise, meta: ExerciseMeta): Exercise {
  return {
    id: raw.id,
    name: raw.n,
    nameEn: raw.en,
    category: raw.c,
    categoryLabel: meta.categories[raw.c] ?? raw.c,
    equipment: raw.q,
    equipmentLabel: meta.equipment[raw.q] ?? raw.q,
    target: raw.t,
    targetLabel: meta.targets[raw.t] ?? raw.t,
    secondary: raw.s,
    steps: raw.p,
    home: raw.h === 1,
    thumbUrl: thumbUrl(raw.id, raw.m),
    gifUrl: gifUrl(raw.id, raw.m),
  };
}

let cache: Promise<ExerciseLibrary> | null = null;

/** Charge (une seule fois) la bibliothèque depuis `public/data/`. */
export function loadExerciseLibrary(): Promise<ExerciseLibrary> {
  if (!cache) {
    cache = Promise.all([
      fetch("/data/exercises.meta.json").then((r) => r.json() as Promise<ExerciseMeta>),
      fetch("/data/exercises.json").then((r) => r.json() as Promise<RawExercise[]>),
    ])
      .then(([meta, raw]) => ({ meta, exercises: raw.map((item) => hydrate(item, meta)) }))
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}

/** Normalise pour la recherche : minuscules, sans accents ni ponctuation. */
export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ExerciseFilters = {
  query: string;
  category: string | null;
  equipment: string | null;
  target: string | null;
  homeOnly: boolean;
};

export const EMPTY_FILTERS: ExerciseFilters = {
  query: "",
  category: null,
  equipment: null,
  target: null,
  homeOnly: false,
};

export function filterExercises(exercises: Exercise[], filters: ExerciseFilters): Exercise[] {
  const terms = normalize(filters.query).split(" ").filter(Boolean);
  return exercises.filter((exercise) => {
    if (filters.homeOnly && !exercise.home) return false;
    if (filters.category && exercise.category !== filters.category) return false;
    if (filters.equipment && exercise.equipment !== filters.equipment) return false;
    if (filters.target && exercise.target !== filters.target) return false;
    if (!terms.length) return true;
    const haystack = normalize(
      `${exercise.name} ${exercise.nameEn} ${exercise.targetLabel} ${exercise.equipmentLabel} ${exercise.categoryLabel}`,
    );
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Groupes de muscles utilisés par le split d'entraînement, pour proposer des
 * exercices pertinents séance par séance.
 */
export const SPLIT_FOCUS: Record<string, string[]> = {
  "Haut du corps · force": ["pectorals", "lats", "delts", "triceps", "biceps", "upper back"],
  "Bas du corps · force": ["quads", "hamstrings", "glutes", "abs", "calves"],
  "Haut du corps · volume": ["pectorals", "lats", "delts", "upper back", "traps", "abs"],
  "Bas du corps · bras": ["quads", "hamstrings", "glutes", "abs", "biceps", "triceps"],
};

// ---------------------------------------------------------------------------
// Matériel disponible
// ---------------------------------------------------------------------------

/**
 * Profil de matériel.
 *
 * La base compte 1299 exercices, dont l'immense majorité suppose une salle
 * complète. Déclarer une fois ce dont on dispose réellement retire le bruit
 * définitivement, au lieu de le refiltrer à chaque visite.
 */
export type EquipmentProfile = string[];

export const EQUIPMENT_PROFILE_KEY = "coach.v2.equipment";

/** Toujours disponible : le poids du corps ne se déclare pas. */
export const ALWAYS_AVAILABLE = ["body weight"];

/** Regroupement des identifiants matériel en choix lisibles. */
export const EQUIPMENT_GROUPS: { id: string; label: string; hint: string; ids: string[] }[] = [
  { id: "dumbbell", label: "Haltères", hint: "Paire réglable ou fixe", ids: ["dumbbell"] },
  { id: "barbell", label: "Barre", hint: "Barre droite, EZ, olympique", ids: ["barbell", "ez barbell", "olympic barbell", "trap bar"] },
  { id: "band", label: "Élastiques", hint: "Bandes de résistance", ids: ["band", "resistance band"] },
  { id: "kettlebell", label: "Kettlebell", hint: "Une ou plusieurs", ids: ["kettlebell"] },
  { id: "cable", label: "Poulie", hint: "Station à câbles", ids: ["cable"] },
  { id: "machine", label: "Machines", hint: "Guidée, assistée, Smith", ids: ["leverage machine", "assisted", "smith machine"] },
  { id: "ball", label: "Ballons", hint: "Swiss ball, medicine ball", ids: ["stability ball", "medicine ball"] },
  { id: "misc", label: "Petit matériel", hint: "Roue abdo, corde, rouleau, lest", ids: ["wheel roller", "roller", "rope", "weighted"] },
];

/** Identifiants matériel autorisés par un profil, poids du corps inclus. */
export function allowedEquipment(profile: EquipmentProfile): Set<string> {
  const allowed = new Set(ALWAYS_AVAILABLE);
  for (const group of EQUIPMENT_GROUPS) {
    if (profile.includes(group.id)) group.ids.forEach((id) => allowed.add(id));
  }
  return allowed;
}

/** Restreint une liste au matériel déclaré. Un profil vide ne filtre rien. */
export function filterByEquipment(exercises: Exercise[], profile: EquipmentProfile): Exercise[] {
  if (!profile.length) return exercises;
  const allowed = allowedEquipment(profile);
  return exercises.filter((exercise) => allowed.has(exercise.equipment));
}

// ---------------------------------------------------------------------------
// Séance du jour
// ---------------------------------------------------------------------------

/**
 * Exercices composés, à privilégier en début de séance : ce sont eux qui
 * portent la progression. Repérés par mot-clé sur le nom anglais, la base ne
 * distinguant pas les mouvements poly-articulaires.
 */
const COMPOUND_HINTS = [
  "press", "squat", "deadlift", "row", "pull-up", "pull up", "chin", "dip",
  "lunge", "thrust", "clean", "snatch", "push-up", "push up", "pulldown",
];

function isCompound(exercise: Exercise): boolean {
  const name = normalize(exercise.nameEn);
  return COMPOUND_HINTS.some((hint) => name.includes(normalize(hint)));
}

/**
 * Score de pertinence d'un exercice pour une séance.
 *
 * On privilégie les mouvements composés et le matériel réellement chargeable :
 * un débutant progresse sur un développé haltères, pas sur une variante isolée
 * au ballon.
 */
function relevance(exercise: Exercise): number {
  let score = 0;
  if (isCompound(exercise)) score += 10;
  if (["barbell", "dumbbell", "olympic barbell", "ez barbell"].includes(exercise.equipment)) score += 4;
  else if (["cable", "leverage machine", "kettlebell"].includes(exercise.equipment)) score += 3;
  else if (exercise.equipment === "body weight") score += 2;
  if (exercise.secondary.length >= 2) score += 2;
  return score;
}

/**
 * Sélection d'exercices pour une séance : un par muscle visé, les composés
 * d'abord, dans la limite du matériel déclaré.
 */
export function suggestForFocus(
  exercises: Exercise[],
  focus: string,
  homeOnly = false,
  limit = 6,
  profile: EquipmentProfile = [],
) {
  const targets = SPLIT_FOCUS[focus];
  if (!targets) return [];
  const pool = filterByEquipment(exercises, profile)
    .filter((exercise) => targets.includes(exercise.target) && (!homeOnly || exercise.home))
    .sort((a, b) => relevance(b) - relevance(a));

  const picked: Exercise[] = [];
  // Premier passage : un exercice par muscle, pour couvrir toute la séance.
  for (const target of targets) {
    if (picked.length >= limit) break;
    const match = pool.find((exercise) => exercise.target === target && !picked.includes(exercise));
    if (match) picked.push(match);
  }
  // Second passage : on complète avec les meilleurs restants.
  for (const exercise of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(exercise)) picked.push(exercise);
  }
  return picked;
}

/** Séance prévue un jour donné, d'après le split. `null` = jour de repos. */
export function sessionForDay(
  split: { day: string; title: string; focus: string; rules: string[] }[],
  day: string,
) {
  return split.find((session) => session.day === day) ?? null;
}

/** Prochaine séance à venir, quand le jour courant est un repos. */
export function nextSession(
  split: { day: string; title: string; focus: string; rules: string[] }[],
  day: string,
  days: readonly string[],
) {
  const start = days.indexOf(day);
  if (start === -1) return split[0] ?? null;
  for (let step = 1; step <= days.length; step += 1) {
    const candidate = days[(start + step) % days.length];
    const session = sessionForDay(split, candidate);
    if (session) return session;
  }
  return null;
}
