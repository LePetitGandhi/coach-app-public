import { describe, expect, it } from "vitest";
import { sessionToDo, weekStartISO } from "../schedule";
import { emptyDailyLog } from "../metrics";
import type { DailyLog } from "../types";

function logWith(date: string, focus: string): DailyLog {
  return {
    ...emptyDailyLog(date),
    workouts: [{ id: "w", focus, minutes: 0, hardSets: 0, progression: false, completed: true, exercises: [] }],
  };
}

const monday = new Date(2026, 8, 28, 9);
const wednesday = new Date(2026, 8, 30, 9);
const thursday = new Date(2026, 9, 1, 9);
const sundayBefore = new Date(2026, 8, 27, 18);

describe("séance à faire", () => {
  it("part du lundi", () => {
    expect(weekStartISO(wednesday)).toBe("2026-09-28");
  });

  it("propose la séance du jour", () => {
    expect(sessionToDo([], monday)?.session.day).toBe("Lundi");
    expect(sessionToDo([], monday)?.kind).toBe("prévue");
  });

  it("ne propose rien un jour de repos choisi, et rattrape le lendemain", () => {
    const rest = { ...emptyDailyLog("2026-09-30"), restDay: true };
    expect(sessionToDo([logWith("2026-09-28", "Haut du corps · force"), rest], wednesday)).toBeNull();
    const todo = sessionToDo([logWith("2026-09-28", "Haut du corps · force"), rest], thursday);
    expect(todo?.session.day).toBe("Mardi");
    expect(todo?.kind).toBe("rattrapage");
  });

  it("transforme une séance ratée en rattrapage", () => {
    const todo = sessionToDo([logWith("2026-09-28", "Haut du corps · force")], wednesday);
    expect(todo?.session.day).toBe("Mardi");
    expect(todo?.kind).toBe("rattrapage");
  });

  it("ne propose rien quand tout est fait", () => {
    const logs = [logWith("2026-09-28", "Haut du corps · force"), logWith("2026-09-29", "Bas du corps · force")];
    expect(sessionToDo(logs, wednesday)).toBeNull();
  });

  it("garde l'ordre quand deux séances sont en retard", () => {
    const todo = sessionToDo([], thursday);
    expect(todo?.session.day).toBe("Lundi");
    expect(todo?.late.map((session) => session.day)).toEqual(["Lundi", "Mardi"]);
  });

  it("ne compte rien comme raté avant le début du programme", () => {
    expect(sessionToDo([], sundayBefore)).toBeNull();
  });
});
