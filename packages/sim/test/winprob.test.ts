import { describe, expect, it } from "vitest";
import { generateLeague, pregameEdge, simulateGame, winChances } from "../src/index.ts";

const league = generateLeague("winprob-test");
const teams = Object.values(league.teams).sort((a, b) => a.abbr.localeCompare(b.abbr));

describe("win chances", () => {
  it("favor the stronger team before kickoff, and the home team a little", () => {
    const [a, b] = [teams[0]!, teams[1]!];
    const edgeHome = pregameEdge(a, b);
    expect(pregameEdge(a, b) - pregameEdge(a, b, true)).toBeCloseTo(2);
    expect(pregameEdge(b, a, true)).toBeCloseTo(-pregameEdge(a, b, true));
    const g = simulateGame(a, b, "wp-1");
    expect(winChances(g, edgeHome).pregame > 0.5).toBe(edgeHome > 0);
  });

  it("move with the game and end settled on the winner", () => {
    for (let i = 0; i < 10; i++) {
      const [home, away] = [teams[i]!, teams[i + 10]!];
      const g = simulateGame(home, away, `wp-${i}`);
      const { after } = winChances(g, pregameEdge(home, away));
      expect(after).toHaveLength(g.plays.length);
      for (const w of after) expect(w).toBeGreaterThanOrEqual(0), expect(w).toBeLessThanOrEqual(1);
      expect(after.at(-1)).toBe(g.winner === g.home ? 1 : g.winner === g.away ? 0 : 0.5);
      // Late in the game, a two-score lead is a big favorite.
      const late = g.plays.findIndex((p, k) => p.quarter === 4 && p.clockAfter < 120 && k < g.plays.length - 1);
      if (late >= 0) {
        const p = g.plays[late]!;
        const lead = p.score[g.home]! - p.score[g.away]!;
        if (lead >= 14) expect(after[late]!).toBeGreaterThan(0.95);
        if (lead <= -14) expect(after[late]!).toBeLessThan(0.05);
      }
    }
  });

  it("timeouts and penalties don't move it", () => {
    const [home, away] = [teams[3]!, teams[30]!];
    const g = simulateGame(home, away, "wp-quiet");
    const { after } = winChances(g, pregameEdge(home, away));
    g.plays.forEach((p, i) => {
      if (i > 0 && i < g.plays.length - 1 && (p.event.kind === "timeout" || p.event.kind === "penalty")) expect(after[i]).toBe(after[i - 1]);
    });
  });
});
