import { describe, expect, it } from "vitest";
import {
  CURRENT_FORMAT,
  MAX_LEVEL,
  XP,
  allTeams,
  finishSeason,
  ownerLevel,
  ownerStanding,
  playSeason,
  seasonXp,
  startDynasty,
  totalXp,
  withOwners,
  xpForLevel,
  type Dynasty,
  type GameSummary,
} from "../src/index.ts";

const game = (id: string, home: string, away: string, winner: string | null, extra: Partial<GameSummary> = {}): GameSummary => ({
  id,
  week: 1,
  home,
  away,
  kind: "division",
  homeScore: 0,
  awayScore: 0,
  overtime: false,
  winner,
  seed: id,
  ...extra,
});

describe("owner levels", () => {
  it("take more XP the higher you go, up to the top level", () => {
    expect(ownerLevel(0)).toEqual({ level: 1, into: 0, next: xpForLevel(1), xp: 0 });
    expect(ownerLevel(xpForLevel(1) - 1).level).toBe(1);
    expect(ownerLevel(xpForLevel(1))).toMatchObject({ level: 2, into: 0 });
    expect(xpForLevel(20)).toBeGreaterThan(xpForLevel(2));
    expect(ownerLevel(10_000_000)).toMatchObject({ level: MAX_LEVEL, into: 0, next: 0 });
  });
});

describe("a season's XP", () => {
  it("counts wins, ties, games played and calls won (half again when you called them)", () => {
    const lines = seasonXp("AA", {
      results: [
        game("1", "AA", "BB", "AA", { calls: { AA: [30, 20], BB: [20, 30] } }),
        game("2", "CC", "AA", "CC", { calls: { CC: [25, 25], AA: [25, 25] }, coached: { team: "AA", calls: [] } }),
        game("3", "AA", "DD", null),
        game("4", "EE", "FF", "EE"),
      ],
    });
    const by = Object.fromEntries(lines.map((l) => [l.source, l]));
    expect(by.win).toEqual({ source: "win", count: 1, xp: XP.win });
    expect(by.loss).toEqual({ source: "loss", count: 1, xp: XP.loss });
    expect(by.tie).toEqual({ source: "tie", count: 1, xp: XP.tie });
    expect(by.calls).toEqual({ source: "calls", count: 55, xp: Math.round(30 * XP.callWon + 25 * XP.callWon * XP.calledYourself) });
    // No playoffs yet: no winning-season bonus until the regular season is done.
    expect(by.winning_season).toBeUndefined();
  });

  it("banks a played season for every owner: titles, awards and development", { timeout: 120_000 }, () => {
    let d: Dynasty = startDynasty("progression-test");
    d = { ...d, league: { ...d.league, format: CURRENT_FORMAT } };
    const teams = allTeams(d.league).map((t) => t.abbr);
    d = withOwners(d, teams);
    const played = playSeason(d);
    const champ = played.playoffs.champion;
    // Mid-season, the standing is the season so far.
    const live = ownerStanding(d.owners![champ], champ, { results: played.season.results.filter((g) => g.week <= 5) });
    expect(live.seasonXp).toBeGreaterThan(0);
    expect(live.xp).toBe(live.seasonXp);

    const after = finishSeason(d, played).dynasty;
    const season = after.owners![champ]!.seasons[0]!;
    const sources = season.lines.map((l) => l.source);
    expect(sources).toEqual(expect.arrayContaining(["win", "calls", "division_title", "playoff_berth", "playoff_win", "championship", "development"]));
    expect(season.lines.find((l) => l.source === "playoff_win")!.count).toBe(4);
    expect(after.owners![champ]!.xp).toBe(totalXp(season.lines));
    // Awards go to the owners whose players won them.
    const award = after.history.at(-1)!.awards[0]!;
    expect(after.owners![award.team]!.seasons[0]!.lines.some((l) => l.source === "award")).toBe(true);
    // Every owner banked something, and a team with no owner gets none.
    expect(teams.every((t) => after.owners![t]!.xp > 0)).toBe(true);
    // Owners change nothing else about the season.
    const plain = finishSeason({ ...d, owners: undefined }, played).dynasty;
    expect(plain.owners).toBeUndefined();
    expect(plain.league).toEqual(after.league);
  });
});
