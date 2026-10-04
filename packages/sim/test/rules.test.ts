import { describe, expect, it } from "vitest";
import { RULES_VERSION, Rng, buildOffense, generateLeague, generateSchedule, generateTeams, playGame, simulateGame, type Team } from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("rules-test"), 2) as [Team, Team];

describe("rules versions", () => {
  it("games record their rules, and replay exactly under them", () => {
    const league = generateLeague("rules-league");
    const g = generateSchedule(league).games[0]!;
    const { summary, result } = playGame(league, g);
    expect(summary.rules).toBe(RULES_VERSION);
    expect(result.rules).toBe(RULES_VERSION);
    const again = simulateGame(HOME, AWAY, "x", { rules: 1 });
    expect(simulateGame(HOME, AWAY, "x", { rules: 1 })).toEqual(again);
    expect(again.rules).toBe(1);
  });

  it("rules 2 puts the best lead blocker at fullback; rules 1 the backup tailback", () => {
    const v2 = buildOffense(HOME, "21", "under_center", false, 2);
    const v1 = buildOffense(HOME, "21", "under_center", false, 1);
    const candidates = HOME.roster.filter((p) => (p.position === "RB" || p.position === "TE") && p.id !== v2.rbs[0]!.id && !v2.tes.some((t) => t.id === p.id));
    expect(v2.rbs[1]!.ratings.leadBlock).toBe(Math.max(...candidates.map((p) => p.ratings.leadBlock)));
    expect(v1.rbs[1]!.position).toBe("RB");
  });
});
