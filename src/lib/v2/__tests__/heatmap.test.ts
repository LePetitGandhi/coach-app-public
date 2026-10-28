import { describe, expect, it } from "vitest";
import { buildHeatmap, levelFor, trackedDays } from "../heatmap";
import { emptyDailyLog } from "../metrics";

const now = new Date(2026, 8, 30, 10); // mercredi 30 septembre

describe("grille de régularité", () => {
  it("a 7 jours par semaine, lundi en haut, aujourd'hui dans la dernière colonne", () => {
    const grid = buildHeatmap([], 16, now);
    expect(grid).toHaveLength(16);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    const last = grid[15];
    expect(last[0].date).toBe("2026-09-28");
    expect(last[2].date).toBe("2026-09-30");
    expect(last[3].future).toBe(true);
  });

  it("laisse vide un jour sans rien de noté", () => {
    const grid = buildHeatmap([emptyDailyLog("2026-09-29")], 16, now);
    expect(grid[15][1].score).toBeNull();
    expect(grid[15][1].level).toBe(0);
  });

  it("colore un jour suivi selon son score", () => {
    const log = { ...emptyDailyLog("2026-09-28"), meals: [{ id: "m", name: "x", proteinG: 140, calories: 2550, quality: "plan" as const }] };
    const grid = buildHeatmap([log], 16, now);
    expect(grid[15][0].score).not.toBeNull();
    expect(grid[15][0].level).toBeGreaterThan(0);
    expect(trackedDays(grid, 28, now)).toBe(1);
  });

  it("répartit les scores en 4 niveaux", () => {
    expect([levelFor(null), levelFor(10), levelFor(45), levelFor(70), levelFor(90)]).toEqual([0, 1, 2, 3, 4]);
  });
});
