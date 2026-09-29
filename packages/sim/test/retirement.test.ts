import { describe, expect, it } from "vitest";
import {
  MAX_AGE,
  OVERALL_WEIGHTS,
  PEAK_AGES,
  allTeams,
  createPlayer,
  generateLeague,
  processRetirements,
  retirementChance,
  type Position,
} from "../src/index.ts";

function player(position: Position, age: number, rating: number) {
  const keys = Object.keys(OVERALL_WEIGHTS[position]);
  return createPlayer({ id: "p", firstName: "A", lastName: "B", position, age, ratings: Object.fromEntries(keys.map((k) => [k, rating])) });
}

describe("retirementChance", () => {
  it("rises with age past the position's peak", () => {
    const end = PEAK_AGES.WR[1];
    const chances = [end - 4, end, end + 2, end + 4, end + 6].map((a) => retirementChance(player("WR", a, 60)));
    for (let i = 1; i < chances.length; i++) expect(chances[i]!).toBeGreaterThan(chances[i - 1]!);
    expect(chances[0]!).toBeLessThan(0.03);
    expect(chances[1]!).toBeGreaterThan(0.05);
    expect(chances[1]!).toBeLessThan(0.12);
  });

  it("good players keep playing longer than fringe ones", () => {
    const age = PEAK_AGES.CB[1] + 3;
    expect(retirementChance(player("CB", age, 82))).toBeLessThan(retirementChance(player("CB", age, 50)) / 3);
  });

  it("everyone retires at the age limit; kickers last longest", () => {
    for (const pos of Object.keys(MAX_AGE) as Position[]) expect(retirementChance(player(pos, MAX_AGE[pos], 90))).toBe(1);
    expect(MAX_AGE.K).toBeGreaterThan(MAX_AGE.RB);
    expect(retirementChance(player("K", 36, 70))).toBeLessThan(retirementChance(player("RB", 33, 70)));
  });
});

describe("processRetirements", () => {
  const league = generateLeague("retire-test");
  const { league: after, retirees } = processRetirements(league);

  it("removes exactly the retirees and leaves the original league alone", () => {
    const gone = new Set(retirees.map((r) => r.player.id));
    let before = 0;
    let kept = 0;
    for (const t of allTeams(league)) {
      before += t.roster.length;
      const now = after.teams[t.abbr]!;
      kept += now.roster.length;
      for (const p of now.roster) expect(gone.has(p.id)).toBe(false);
      for (const r of retirees.filter((x) => x.team === t.abbr)) expect(t.roster.some((p) => p.id === r.player.id)).toBe(true);
    }
    expect(kept + retirees.length).toBe(before);
    expect(generateLeague("retire-test")).toEqual(league);
  });

  it("depth charts only list players still on the roster", () => {
    for (const t of allTeams(after)) {
      const ids = new Set(t.roster.map((p) => p.id));
      for (const list of Object.values(t.depthChart)) for (const id of list) expect(ids.has(id)).toBe(true);
    }
  });

  it("retires a realistic number of mostly older players", () => {
    expect(retirees.length / 50).toBeGreaterThan(1.5);
    expect(retirees.length / 50).toBeLessThan(8);
    const avgAge = retirees.reduce((s, r) => s + r.player.age, 0) / retirees.length;
    expect(avgAge).toBeGreaterThan(30);
  });

  it("is deterministic", () => {
    expect(processRetirements(league)).toEqual({ league: after, retirees });
  });
});
