/**
 * Démarrage : les quelques actions à faire une fois avant que la routine
 * tourne toute seule. Affichées en haut de l'onglet Jour tant qu'elles ne sont
 * pas cochées, puis elles disparaissent.
 */

export const ONBOARDING_KEY = "coach.v2.onboarding";

export type OnboardingStep = {
  id: string;
  label: string;
  detail: string;
  /** Onglet où se fait l'action, s'il y en a un. */
  tab?: "nutrition" | "settings";
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "menu",
    label: "Générer le menu de la semaine",
    detail: "Onglet Repas → magasin, budget, « Générer mon menu ».",
    tab: "nutrition",
  },
  {
    id: "courses",
    label: "Faire la course 1",
    detail: "La liste est triée par rayon : coche au fur et à mesure dans le magasin.",
    tab: "nutrition",
  },
  {
    id: "iphone",
    label: "Installer l'app sur l'iPhone",
    detail: "Safari → coach.aimenznaidi.party → Partager → « Sur l'écran d'accueil ».",
  },
  {
    id: "sync",
    label: "Connecter la synchro sur l'iPhone",
    detail: "Plus → Réglages → Synchronisation → colle ton code.",
    tab: "settings",
  },
];

export type OnboardingState = { done: string[]; hidden: boolean };

export function loadOnboarding(): OnboardingState {
  if (typeof window === "undefined") return { done: [], hidden: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? "null") as Partial<OnboardingState> | null;
    return { done: Array.isArray(parsed?.done) ? parsed.done : [], hidden: Boolean(parsed?.hidden) };
  } catch {
    return { done: [], hidden: false };
  }
}

export function saveOnboarding(state: OnboardingState) {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
  } catch {
    // ignoré
  }
}
