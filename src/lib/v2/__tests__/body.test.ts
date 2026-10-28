import { describe, expect, it } from "vitest";
import {
  bfCategoryMen,
  bodySeries,
  composeBody,
  deltaSince,
  latestMeasure,
  navyBodyFatMen,
  recompositionVerdict,
  splitMass,
} from "../body";
import { emptyDailyLog } from "../metrics";
import type { BodyMetrics, DailyLog } from "../types";

function logWith(date: string, body: BodyMetrics): DailyLog {
  return { ...emptyDailyLog(date), body };
}

describe("navyBodyFatMen", () => {
  it("calcule un taux plausible pour un homme de 176 cm", () => {
    // taille 80 cm, cou 38 cm, hauteur 176 cm → autour de 17 %
    const bf = navyBodyFatMen(80, 38, 176);
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(13);
    expect(bf!).toBeLessThan(21);
  });

  it("baisse quand le tour de taille baisse à cou constant", () => {
    const large = navyBodyFatMen(90, 38, 176)!;
    const fin = navyBodyFatMen(78, 38, 176)!;
    expect(fin).toBeLessThan(large);
  });

  it("refuse les mesures incohérentes", () => {
    expect(navyBodyFatMen(35, 38, 176)).toBeNull();
    expect(navyBodyFatMen(80, 38, 0)).toBeNull();
  });

  it("borne le résultat dans une plage physiologique", () => {
    const extreme = navyBodyFatMen(200, 30, 176)!;
    expect(extreme).toBeLessThanOrEqual(60);
  });
});

describe("splitMass", () => {
  it("répartit poids en masse grasse et masse maigre", () => {
    expect(splitMass(70, 20)).toEqual({ fatKg: 14, leanKg: 56 });
  });

  it("conserve le poids total", () => {
    const { fatKg, leanKg } = splitMass(69, 16.4);
    expect(Math.abs(fatKg + leanKg - 69)).toBeLessThan(0.15);
  });
});

describe("bfCategoryMen", () => {
  it("classe correctement les paliers", () => {
    expect(bfCategoryMen(4).tone).toBe("danger");
    expect(bfCategoryMen(12).label).toBe("Athlétique");
    expect(bfCategoryMen(16).label).toBe("Fitness");
    expect(bfCategoryMen(22).tone).toBe("warn");
    expect(bfCategoryMen(30).tone).toBe("danger");
  });
});

describe("composeBody", () => {
  it("privilégie le pourcentage mesuré sur l'estimation Navy", () => {
    const result = composeBody("2026-08-01", { weightKg: 70, waistCm: 80, neckCm: 38, bodyFatPct: 15 }, 176);
    expect(result?.source).toBe("mesure");
    expect(result?.bodyFatPct).toBe(15);
    expect(result?.leanKg).toBe(59.5);
  });

  it("bascule sur Navy sans pourcentage mesuré", () => {
    const result = composeBody("2026-08-01", { weightKg: 70, waistCm: 80, neckCm: 38 }, 176);
    expect(result?.source).toBe("navy");
  });

  it("rend null sans poids", () => {
    expect(composeBody("2026-08-01", { waistCm: 80, neckCm: 38 }, 176)).toBeNull();
  });

  it("rend null si aucune donnée de masse grasse n'est exploitable", () => {
    expect(composeBody("2026-08-01", { weightKg: 70, waistCm: 80 }, 176)).toBeNull();
  });
});

describe("bodySeries", () => {
  it("ignore les jours incomplets et trie chronologiquement", () => {
    const logs = [
      logWith("2026-08-01", { weightKg: 70, bodyFatPct: 16 }),
      logWith("2026-07-01", { weightKg: 69, bodyFatPct: 18 }),
      logWith("2026-07-15", {}),
    ];
    const series = bodySeries(logs, 176);
    expect(series).toHaveLength(2);
    expect(series[0].date).toBe("2026-07-01");
    expect(series[1].date).toBe("2026-08-01");
  });
});

describe("latestMeasure", () => {
  it("remonte la dernière valeur renseignée, même ancienne", () => {
    const logs = [
      logWith("2026-08-01", { weightKg: 70 }),
      logWith("2026-07-20", { armCm: 35 }),
    ];
    expect(latestMeasure(logs, "armCm")).toBe(35);
    expect(latestMeasure(logs, "thighCm")).toBeUndefined();
  });
});

describe("deltaSince", () => {
  it("mesure la variation sur 30 jours", () => {
    const series = bodySeries(
      [
        logWith("2026-07-02", { weightKg: 69, bodyFatPct: 18 }),
        logWith("2026-08-01", { weightKg: 70, bodyFatPct: 16 }),
      ],
      176,
    );
    const lean = deltaSince(series, "leanKg", 30);
    expect(lean).not.toBeNull();
    expect(lean!).toBeGreaterThan(0);
  });

  it("rend null si l'historique est trop court", () => {
    const series = bodySeries([logWith("2026-08-01", { weightKg: 70, bodyFatPct: 16 })], 176);
    expect(deltaSince(series, "leanKg", 30)).toBeNull();
  });

  it("rend null si la mesure la plus proche est hors tolérance", () => {
    const series = bodySeries(
      [
        logWith("2026-01-01", { weightKg: 69, bodyFatPct: 18 }),
        logWith("2026-08-01", { weightKg: 70, bodyFatPct: 16 }),
      ],
      176,
    );
    expect(deltaSince(series, "leanKg", 30)).toBeNull();
  });
});

describe("recompositionVerdict", () => {
  it("demande plus de données quand il n'y a qu'une mesure", () => {
    const series = bodySeries([logWith("2026-08-01", { weightKg: 70, bodyFatPct: 16 })], 176);
    expect(recompositionVerdict(series)).toContain("Deux mesures");
  });

  it("reconnaît une recomposition réussie", () => {
    const series = bodySeries(
      [
        logWith("2026-07-02", { weightKg: 69, bodyFatPct: 20 }),
        logWith("2026-08-01", { weightKg: 69, bodyFatPct: 16 }),
      ],
      176,
    );
    expect(recompositionVerdict(series)).toContain("Recomposition réussie");
  });

  it("alerte sur une perte de masse maigre", () => {
    const series = bodySeries(
      [
        logWith("2026-07-02", { weightKg: 72, bodyFatPct: 16 }),
        logWith("2026-08-01", { weightKg: 68, bodyFatPct: 16 }),
      ],
      176,
    );
    expect(recompositionVerdict(series)).toMatch(/muscle|masse maigre/i);
  });
});
