/**
 * Composition corporelle.
 *
 * Restauré depuis la V1 (`_archive/legacy-2026-05-17/lib/body.ts`) et rebranché
 * sur le modèle de données V2 (`DailyLog.body`).
 *
 * La masse maigre est la métrique qui compte en recomposition : le poids seul
 * ment, puisqu'il mélange muscle, graisse et eau.
 */

import type { BodyComposition, BodyMetrics, DailyLog } from "./types";

/**
 * Estimation du % de masse grasse — formule US Navy (homme, mesures en cm).
 *
 * BF% = 86,010 × log10(taille_cm − cou_cm) − 70,041 × log10(hauteur_cm) + 36,76
 *
 * Précision ±3 à 4 points face au DEXA. Peu fiable en absolu, très fiable en
 * tendance : c'est la variation qui est exploitable, pas le chiffre brut.
 */
export function navyBodyFatMen(waistCm: number, neckCm: number, heightCm: number): number | null {
  const diff = waistCm - neckCm;
  if (!(diff > 0) || !(heightCm > 0)) return null;
  const bf = 86.01 * Math.log10(diff) - 70.041 * Math.log10(heightCm) + 36.76;
  if (!Number.isFinite(bf)) return null;
  return Math.round(Math.min(60, Math.max(2, bf)) * 10) / 10;
}

/** Répartit un poids entre masse grasse et masse maigre. */
export function splitMass(weightKg: number, bodyFatPct: number) {
  const fatKg = Math.round(((weightKg * bodyFatPct) / 100) * 10) / 10;
  const leanKg = Math.round((weightKg - fatKg) * 10) / 10;
  return { fatKg, leanKg };
}

export type BfCategory = { label: string; tone: "good" | "warn" | "danger" };

/** Repères de composition pour un homme adulte (ACE / ACSM). */
export function bfCategoryMen(bodyFatPct: number): BfCategory {
  if (bodyFatPct < 6) return { label: "Très bas — non tenable", tone: "danger" };
  if (bodyFatPct < 14) return { label: "Athlétique", tone: "good" };
  if (bodyFatPct < 18) return { label: "Fitness", tone: "good" };
  if (bodyFatPct < 25) return { label: "Moyenne", tone: "warn" };
  return { label: "Élevé", tone: "danger" };
}

/**
 * Calcule la composition d'un jour donné.
 * Un % mesuré (balance à impédance, pince) l'emporte sur l'estimation Navy.
 */
export function composeBody(
  date: string,
  body: BodyMetrics,
  heightCm: number,
): BodyComposition | null {
  const weightKg = body.weightKg;
  if (!weightKg) return null;

  let bodyFatPct: number | null = null;
  let source: BodyComposition["source"] = "mesure";

  if (body.bodyFatPct != null && body.bodyFatPct > 0) {
    bodyFatPct = body.bodyFatPct;
  } else if (body.waistCm != null && body.neckCm != null) {
    bodyFatPct = navyBodyFatMen(body.waistCm, body.neckCm, heightCm);
    source = "navy";
  }

  if (bodyFatPct == null) return null;
  const { fatKg, leanKg } = splitMass(weightKg, bodyFatPct);
  return { date, weightKg, bodyFatPct, source, fatKg, leanKg };
}

/** Série chronologique de compositions, du plus ancien au plus récent. */
export function bodySeries(logs: DailyLog[], heightCm: number): BodyComposition[] {
  return logs
    .map((log) => composeBody(log.date, log.body, heightCm))
    .filter((item): item is BodyComposition => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Dernière valeur renseignée pour un champ de mensuration. */
export function latestMeasure(logs: DailyLog[], field: keyof BodyMetrics): number | undefined {
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  for (const log of sorted) {
    const value = log.body[field];
    if (value != null) return value;
  }
  return undefined;
}

function daysBetween(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/**
 * Variation d'une métrique entre la dernière mesure et celle la plus proche
 * d'il y a `daysAgo` jours. `null` si l'historique est trop court.
 */
export function deltaSince<T extends { date: string }>(
  series: T[],
  field: Exclude<keyof T, "date" | "source">,
  daysAgo: number,
  tolerance = 21,
): number | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const targetTime = new Date(latest.date).getTime() - daysAgo * 86_400_000;
  const targetDate = new Date(targetTime).toISOString().slice(0, 10);

  let best: T | null = null;
  let bestDistance = Infinity;
  for (const entry of series.slice(0, -1)) {
    const distance = daysBetween(entry.date, targetDate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  if (!best || bestDistance > tolerance) return null;

  const from = Number(best[field]);
  const to = Number(latest[field]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) * 10) / 10;
}

/**
 * Lecture coach de la recomposition : ce qui compte n'est pas le poids, mais
 * le sens de variation de la masse maigre par rapport à la masse grasse.
 */
export function recompositionVerdict(series: BodyComposition[]): string {
  if (series.length < 2) {
    return "Deux mesures espacées d'au moins deux semaines et la tendance devient lisible.";
  }
  const lean = deltaSince(series, "leanKg", 30) ?? deltaSince(series, "leanKg", 60);
  const fat = deltaSince(series, "fatKg", 30) ?? deltaSince(series, "fatKg", 60);
  if (lean == null || fat == null) {
    return "Historique trop court sur 30 jours. Continue à mesurer une fois par semaine, même jour, même conditions.";
  }

  if (lean > 0.3 && fat < -0.3) return "Recomposition réussie : muscle en hausse, gras en baisse. Ne change rien.";
  if (lean > 0.3 && fat >= -0.3 && fat <= 0.5) return "Prise de muscle propre. Le gras est stable, le cap est bon.";
  if (lean > 0.3 && fat > 0.5) return "Tu construis, mais le surplus est trop large. Resserre les calories de 150 à 200 kcal.";
  if (Math.abs(lean) <= 0.3 && fat < -0.3) return "Sèche propre : tu perds du gras sans perdre de muscle. C'est exactement ce qu'il faut.";
  if (lean < -0.3 && fat < -0.3) return "Tu perds du muscle avec le gras. Remonte les protéines et garde l'intensité en salle.";
  if (lean < -0.3) return "Perte de masse maigre. Vérifie protéines, sommeil et charge d'entraînement avant tout le reste.";
  return "Composition stable. Sur une recomposition, un mois de plateau n'est pas un échec — mais deux, si.";
}
