import { describe, expect, it } from "vitest";
import {
  divisionStandings,
  generateLeague,
  seedConference,
  simulateGame,
  simulatePlayoffs,
  simulateSeason,
  winPct,
  type League,
  type PlayoffResult,
  type SeasonResult,
} from "../src/index.ts";

const RUNS: Array<{ league: League; season: SeasonResult; playoffs: PlayoffResult }> = ["po-1", "po-2", "po-3"].map((seed) => {
  const league = generateLeague(seed);
  const season = simulateSeason(league);
  return { league, season, playoffs: simulatePlayoffs(league, season) };
});

describe("seeding", () => {
  it("seeds 5 division winners then 2 wild cards per conference", () => {
    for (const { league, season, playoffs } of RUNS) {
      const winners = new Set(divisionStandings(league, season.results).map((d) => d.teams[0]!.team));
      for (const c of league.conferences) {
        const seeds = playoffs.seeds[c.abbr]!;
        expect(seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(seeds.slice(0, 5).every((s) => s.divisionWinner && winners.has(s.team))).toBe(true);
        expect(seeds.slice(5).every((s) => !s.divisionWinner && !winners.has(s.team))).toBe(true);
        // Division winners are ordered by record.
        for (let i = 1; i < 5; i++) expect(winPct(seeds[i - 1]!.record)).toBeGreaterThanOrEqual(winPct(seeds[i]!.record));
        // No team left out has a better record than the last wild card.
        const inField = new Set(seeds.map((s) => s.team));
        const lastWildCard = winPct(seeds[6]!.record);
        for (const d of c.divisions) {
          for (const t of d.teams) {
            if (inField.has(t)) continue;
            const r = divisionStandings(league, season.results).flatMap((x) => x.teams).find((x) => x.team === t)!.record;
            expect(winPct(r)).toBeLessThanOrEqual(lastWildCard);
          }
        }
      }
    }
  });

  it("wild cards never jump a division rival that finished ahead of them", () => {
    for (const { league, season } of RUNS) {
      const standings = divisionStandings(league, season.results);
      for (const c of league.conferences) {
        const seeds = seedConference(league, season.results, c.abbr);
        for (const wc of seeds.slice(5)) {
          const div = standings.find((d) => d.teams.some((t) => t.team === wc.team))!;
          const above = div.teams.slice(1, div.teams.findIndex((t) => t.team === wc.team)).map((t) => t.team);
          for (const rival of above) expect(seeds.some((s) => s.team === rival)).toBe(true);
        }
      }
    }
  });
});

describe("bracket", () => {
  it("plays 13 games: 6 wild card, 4 divisional, 2 conference, 1 championship", () => {
    for (const { playoffs } of RUNS) {
      const count = (r: string) => playoffs.games.filter((g) => g.round === r).length;
      expect([count("wild_card"), count("divisional"), count("conference"), count("championship")]).toEqual([6, 4, 2, 1]);
    }
  });

  it("the 1 seed rests in the wild card round; higher seeds host; the final is neutral", () => {
    for (const { playoffs } of RUNS) {
      for (const g of playoffs.games) {
        if (g.round === "wild_card") expect([g.homeSeed, g.awaySeed]).not.toContain(1);
        if (g.round === "championship") expect(g.neutralSite).toBe(true);
        else expect(g.homeSeed).toBeLessThan(g.awaySeed);
      }
      // Divisional round: the 1 seed hosts the lowest seed left.
      for (const conf of Object.keys(playoffs.seeds)) {
        const div = playoffs.games.filter((g) => g.round === "divisional" && g.conference === conf);
        const top = div.find((g) => g.homeSeed === 1)!;
        const others = div.find((g) => g !== top)!;
        expect(top.awaySeed).toBeGreaterThan(Math.max(others.homeSeed, others.awaySeed));
      }
    }
  });

  it("no ties, winners advance, and the champion won the final", () => {
    for (const { playoffs } of RUNS) {
      const losers = new Set<string>();
      for (const round of ["wild_card", "divisional", "conference", "championship"]) {
        for (const g of playoffs.games.filter((x) => x.round === round)) {
          const s = g.summary;
          expect(s.winner).not.toBeNull();
          expect(losers.has(s.home) || losers.has(s.away)).toBe(false);
          losers.add(s.winner === s.home ? s.away : s.home);
        }
      }
      const final = playoffs.games.find((g) => g.round === "championship")!.summary;
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
