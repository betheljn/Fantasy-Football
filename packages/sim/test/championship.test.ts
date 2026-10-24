import { describe, expect, it } from "vitest";
import { advanceSeason, allTeams, divisionStandings, playSeason, startDynasty } from "../src/index.ts";

const BASE = startDynasty("championship-test", 3);
const DYNASTY = { ...BASE, league: { ...BASE.league, format: 2 } };
const PLAYED = playSeason(DYNASTY);
const P = PLAYED.playoffs;

describe("championship week (format 2)", () => {
  it("each division's top two meet, first place hosting, no ties", () => {
    const standings = divisionStandings(DYNASTY.league, PLAYED.season.results);
    expect(P.titleGames).toHaveLength(10);
    for (const d of standings) {
      const g = P.titleGames!.find((x) => x.division === d.division)!;
      expect(g.first).toBe(d.teams[0]!.team);
      expect(g.second).toBe(d.teams[1]!.team);
      expect(g.summary.home).toBe(g.first);
      expect([g.first, g.second]).toContain(g.summary.winner);
      expect(g.summary.week).toBe(17);
    }
  });

  it("title game winners get the automatic bids; six at-large; seeded by the ranking after championship week", () => {
    const champs = new Set(P.titleGames!.map((g) => g.summary.winner!));
    expect(P.seeds).toHaveLength(16);
    expect(P.seeds.filter((s) => s.bid === "division_winner").map((s) => s.team).sort()).toEqual([...champs].sort());
    expect(P.seeds.filter((s) => s.bid === "at_large")).toHaveLength(6);
    // Seeds follow the ranking that includes the title games.
    const order = P.ranking.filter((e) => P.seeds.some((s) => s.team === e.team)).map((e) => e.team);
    expect(P.seeds.map((s) => s.team)).toEqual(order);
    expect(P.regularRanking).toHaveLength(allTeams(DYNASTY.league).length);
    // Title games count in the final ranking's records.
    const winner = P.titleGames![0]!.summary.winner!;
    const before = P.regularRanking!.find((e) => e.team === winner)!.record;
    const after = P.ranking.find((e) => e.team === winner)!.record;
    expect(after.wins).toBe(before.wins + 1);
  });

  it("playoff rounds come the week after championship week", () => {
    expect(P.games.find((g) => g.round === "round_of_16")!.summary.week).toBe(18);
    expect(P.games.find((g) => g.round === "championship")!.summary.week).toBe(21);
  });

  it("history records the title game winners as division champions; format 1 is unchanged", () => {
    const next = advanceSeason(DYNASTY);
    expect([...next.history[0]!.divisionWinners].sort()).toEqual(P.titleGames!.map((g) => g.summary.winner!).sort());
    const old = playSeason(BASE).playoffs;
    expect(old.titleGames).toBeUndefined();
    expect(old.games.find((g) => g.round === "round_of_16")!.summary.week).toBe(23);
  }, 120_000);
});
