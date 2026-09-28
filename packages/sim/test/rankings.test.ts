import { describe, expect, it } from "vitest";
import {
  MARGIN_CAP,
  computeRankings,
  generateLeague,
  simulateSeason,
  strengthRatings,
  teamRatings,
  weeklyRankings,
  winPct,
  type GameSummary,
} from "../src/index.ts";

const LEAGUE = generateLeague("rank-test");
const SEASON = simulateSeason(LEAGUE);
const WEEKLY = weeklyRankings(LEAGUE, SEASON.results, SEASON.schedule.weeks);

describe("rankings", () => {
  it("rank all 50 teams 1-50 every week, with movement from the week before", () => {
    expect(WEEKLY).toHaveLength(SEASON.schedule.weeks + 1);
    for (const [w, ranking] of WEEKLY.entries()) {
      expect(ranking.map((e) => e.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      if (w > 0) for (const e of ranking) expect(e.previousRank).toBe(WEEKLY[w - 1]!.find((x) => x.team === e.team)!.rank);
    }
  });

  it("preseason follows roster strength", () => {
    const pre = WEEKLY[0]!;
    const ovr = (t: string) => teamRatings(LEAGUE.teams[t]!).overall;
    for (let i = 1; i < pre.length; i++) expect(ovr(pre[i - 1]!.team)).toBeGreaterThanOrEqual(ovr(pre[i]!.team));
  });

  it("the final ranking is driven mostly by record", () => {
    const fin = WEEKLY.at(-1)!;
    const wins = (i: number) => fin[i]!.record.wins + 0.5 * fin[i]!.record.ties;
    // Nobody ranked in the top 10 has fewer wins than anyone ranked 41-50.
    expect(Math.min(...[...Array(10).keys()].map(wins))).toBeGreaterThan(Math.max(...[...Array(10).keys()].map((i) => wins(40 + i))));
    // Scores fall monotonically.
    for (let i = 1; i < fin.length; i++) expect(fin[i - 1]!.score).toBeGreaterThanOrEqual(fin[i]!.score);
    expect(winPct(fin[0]!.record)).toBeGreaterThan(0.6);
  });

  it("strength ratings cap blowouts and reward beating good teams", () => {
    const g = (home: string, away: string, hs: number, as: number): GameSummary => ({
      id: `${away}@${home}`, week: 1, home, away, kind: "division", homeScore: hs, awayScore: as, overtime: false,
      winner: hs > as ? home : hs < as ? away : null, seed: "x",
    });
    // A 70-0 win counts no more than a 23-2 (21 + home edge) one.
    const blowout = strengthRatings(["A", "B"], [g("A", "B", 70, 0)]);
    const capped = strengthRatings(["A", "B"], [g("A", "B", 23, 0)]);
    expect(blowout.get("A")).toBeCloseTo(capped.get("A")!, 5);
    expect(blowout.get("A")! - blowout.get("B")!).toBeCloseTo(MARGIN_CAP, 5);
    // C and D both beat someone by 7; C's victim is stronger, so C rates higher.
    const r = strengthRatings(["C", "D", "E", "F", "G"], [
      g("E", "G", 30, 0), // E is good
      g("C", "E", 17, 10),
      g("D", "F", 17, 10),
    ]);
    expect(r.get("C")!).toBeGreaterThan(r.get("D")!);
  });

  it("is deterministic", () => {
    expect(computeRankings(LEAGUE, SEASON.results)).toEqual(WEEKLY.at(-1)!.map(({ previousRank: _, ...e }) => e));
  });
});
