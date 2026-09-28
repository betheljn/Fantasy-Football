import { describe, expect, it } from "vitest";
import {
  BRACKET,
  PLAYOFF_ROUNDS,
  PLAYOFF_TEAMS,
  computeRankings,
  divisionStandings,
  generateLeague,
  selectPlayoffField,
  simulateGame,
  simulatePlayoffs,
  simulateSeason,
  type League,
  type PlayoffResult,
  type SeasonResult,
} from "../src/index.ts";

const RUNS: Array<{ league: League; season: SeasonResult; playoffs: PlayoffResult }> = ["po-1", "po-2", "po-3"].map((seed) => {
  const league = generateLeague(seed);
  const season = simulateSeason(league);
  return { league, season, playoffs: simulatePlayoffs(league, season) };
});

describe("playoff field", () => {
  it("has 16 teams: all 10 division winners plus the 6 best-ranked others", () => {
    for (const { league, season, playoffs } of RUNS) {
      const winners = new Set(divisionStandings(league, season.results).map((d) => d.teams[0]!.team));
      expect(playoffs.seeds).toHaveLength(PLAYOFF_TEAMS);
      expect(playoffs.seeds.filter((s) => s.bid === "division_winner").map((s) => s.team).sort()).toEqual([...winners].sort());
      const atLarge = playoffs.seeds.filter((s) => s.bid === "at_large");
      expect(atLarge).toHaveLength(6);
      // No non-winner outside the field is ranked above any at-large team.
      const worstAtLarge = Math.max(...atLarge.map((s) => s.rank));
      const inField = new Set(playoffs.seeds.map((s) => s.team));
      for (const e of playoffs.ranking) {
        if (!inField.has(e.team) && !winners.has(e.team)) expect(e.rank).toBeGreaterThan(worstAtLarge);
      }
    }
  });

  it("seeds 1-16 in ranking order", () => {
    for (const { playoffs } of RUNS) {
      expect(playoffs.seeds.map((s) => s.seed)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
      for (let i = 1; i < 16; i++) expect(playoffs.seeds[i]!.rank).toBeGreaterThan(playoffs.seeds[i - 1]!.rank);
    }
  });

  it("selectPlayoffField matches the field the playoffs used", () => {
    const { league, season, playoffs } = RUNS[0]!;
    expect(selectPlayoffField(league, season.results)).toEqual(playoffs.seeds);
    expect(computeRankings(league, season.results)).toEqual(playoffs.ranking);
  });
});

describe("bracket", () => {
  it("plays 15 games: 8, 4, 2, 1", () => {
    for (const { playoffs } of RUNS) {
      expect(PLAYOFF_ROUNDS.map((r) => playoffs.games.filter((g) => g.round === r).length)).toEqual([8, 4, 2, 1]);
    }
  });

  it("uses the fixed bracket, higher seed hosts, and the final is neutral", () => {
    for (const { playoffs } of RUNS) {
      const first = playoffs.games.filter((g) => g.round === "round_of_16").map((g) => [g.homeSeed, g.awaySeed]);
      expect(first).toEqual(BRACKET.map(([a, b]) => [a, b]));
      for (const g of playoffs.games) {
        expect(g.homeSeed).toBeLessThan(g.awaySeed);
        expect(g.neutralSite).toBe(g.round === "championship");
      }
    }
  });

  it("winners of adjacent games meet next; no ties; the champion won the final", () => {
    for (const { playoffs } of RUNS) {
      for (let r = 1; r < PLAYOFF_ROUNDS.length; r++) {
        const prev = playoffs.games.filter((g) => g.round === PLAYOFF_ROUNDS[r - 1]);
        const cur = playoffs.games.filter((g) => g.round === PLAYOFF_ROUNDS[r]);
        cur.forEach((g, i) => {
          const feeders = [prev[2 * i]!.summary.winner, prev[2 * i + 1]!.summary.winner];
          expect([g.summary.home, g.summary.away].sort()).toEqual([...feeders].sort());
        });
      }
      for (const g of playoffs.games) expect(g.summary.winner).not.toBeNull();
      const final = playoffs.games.at(-1)!.summary;
      expect(playoffs.champion).toBe(final.winner);
      expect(playoffs.runnerUp).toBe(final.winner === final.home ? final.away : final.home);
    }
  });

  it("is deterministic", () => {
    const { league, season, playoffs } = RUNS[0]!;
    expect(simulatePlayoffs(league, season)).toEqual(playoffs);
  });
});

describe("playoff overtime", () => {
  it("never ends in a tie, and can go to multiple periods", () => {
    const league = RUNS[0]!.league;
    let multi = 0;
    for (let i = 0; i < 1500; i++) {
      const g = simulateGame(league.teams["TX"]!, league.teams["OK"]!, `ot-${i}`, { playoff: true });
      expect(g.winner).not.toBeNull();
      if (g.periodScores["TX"]!.length > 5) multi++;
    }
    expect(multi).toBeGreaterThan(0);
  }, 30_000);
});
