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
  type Team,
  type OwnerProgress,
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
    expect(sources).toEqual(expect.arrayContaining(["win", "calls", "playoff_berth", "playoff_win", "championship", "development"]));
    // A division title only if it won its title game (a champion can come in at-large).
    expect(sources.includes("division_title")).toBe(played.playoffs.titleGames!.some((t) => t.summary.winner === champ));
    expect(season.lines.find((l) => l.source === "playoff_win")!.count).toBe(4);
    expect(after.owners![champ]!.xp).toBe(totalXp(season.lines));
    // Awards go to the owners whose players won them.
    const award = after.history.at(-1)!.awards[0]!;
    expect(after.owners![award.team]!.seasons[0]!.lines.some((l) => l.source === "award")).toBe(true);
    // Every owner banked something, and a team with no owner gets none.
    expect(teams.every((t) => after.owners![t]!.xp > 0)).toBe(true);
    // Owners change nothing else about the season.
    const { owners: _owners, ...unowned } = d;
    const plain = finishSeason(unowned, played).dynasty;
    expect(plain.owners).toBeUndefined();
    // The season played the same (afterwards owners' coaches wait for their owner's ability picks,
    // where AI coaches pick their own, so the offseason can differ from there on).
    const sum = (h: Dynasty["history"][number]) => ({ champion: h.champion, runnerUp: h.runnerUp, top25: h.top25, awards: h.awards, divisionWinners: h.divisionWinners });
    expect(sum(plain.history.at(-1)!)).toEqual(sum(after.history.at(-1)!));
  });
});

import { Rng, buyUpgrade, developLeague, developmentFactor, filmStudy, generateTeams, playerOverall, pointsSpent, scoutingQuality, simulateGame, syncUpgrades, upgradePoints, upgradeProblem, xpForLevel as lvl } from "../src/index.ts";

/** XP to reach a level. */
const toLevel = (level: number) => Array.from({ length: level - 1 }, (_, i) => lvl(i + 1)).reduce((a, b) => a + b, 0);

describe("owner upgrades", () => {
  const base = startDynasty("upgrade-test", 2);

  it("cost a point per tier number, from a point per level", () => {
    const d = { ...base, owners: { OH: { xp: toLevel(7), seasons: [] } as OwnerProgress } };
    expect(upgradePoints(d.owners.OH)).toBe(6);
    let x = buyUpgrade(d, "OH", "facilities"); // 1 point
    x = buyUpgrade(x, "OH", "facilities"); // 2 points
    x = buyUpgrade(x, "OH", "analytics"); // 1 point
    expect(pointsSpent(x.owners!.OH!.upgrades)).toBe(4);
    expect(upgradePoints(x.owners!.OH!)).toBe(2);
    // Facilities tier 3 costs 3: not enough. This season's XP so far counts toward levels.
    expect(upgradeProblem(x.owners!.OH!, "facilities")).toContain("takes 3 points (you have 2)");
    expect(upgradeProblem(x.owners!.OH!, "facilities", lvl(7))).toBeNull();
    // Analytics tops out at three tiers.
    const maxed: OwnerProgress = { xp: toLevel(20), seasons: [], upgrades: { analytics: 3 } };
    expect(upgradeProblem(maxed, "analytics")).toContain("maxed out");
    // The tiers ride on the team.
    expect(x.league.teams.OH!.upgrades).toEqual({ facilities: 2, analytics: 1 });
    expect(() => buyUpgrade(base, "OH", "clinic")).toThrow("No owner");
  });

  it("facilities grow players faster; recruiting widens scouting", () => {
    const team = base.league.teams.OH!;
    const built = { ...team, upgrades: { facilities: 5, recruiting: 5 } };
    expect(developmentFactor(built).growth / developmentFactor(team).growth).toBeCloseTo(1.2);
    expect(scoutingQuality(built) / scoutingQuality(team)).toBeCloseTo(1.4);
    const gain = (t: typeof team) => {
      const after = developLeague({ ...base.league, teams: { ...base.league.teams, OH: t } }).teams.OH!;
      const was = new Map(t.roster.map((p) => [p.id, playerOverall(p)]));
      return after.roster.reduce((s, p) => s + Math.max(0, playerOverall(p) - was.get(p.id)!), 0);
    };
    expect(gain(built)).toBeGreaterThan(gain(team));
  });

  it("stay with the team through the offseason, and off any team no owner runs", { timeout: 120_000 }, () => {
    let d = { ...withOwners(base, ["OH"]) };
    d = { ...d, owners: { OH: { ...d.owners!.OH!, xp: toLevel(4) } } };
    d = buyUpgrade(d, "OH", "recruiting");
    const next = finishSeason(d, playSeason(d)).dynasty;
    expect(next.league.teams.OH!.upgrades).toEqual({ recruiting: 1 });
    expect(next.owners!.OH!.upgrades).toEqual({ recruiting: 1 });
    // The owner moves on: the team keeps nothing.
    const { OH: oh, ...rest } = next.owners!;
    const moved = syncUpgrades({ ...next, owners: { ...rest, TX: oh! } });
    expect(moved.league.teams.OH!.upgrades).toBeUndefined();
    expect(moved.league.teams.TX!.upgrades).toEqual({ recruiting: 1 });
  });
});

describe("film study", () => {
  const [A, B] = generateTeams(new Rng("film-test"), 2) as [Team, Team];
  const g = simulateGame(A, B, "film");
  const sit = { quarter: 3, clock: 600, down: 1 as const, distance: 10, yardline: 35 };
  const look = { personnel: "11" as const, set: "shotgun" as const };

  it("shows more with each tier", () => {
    expect(filmStudy(0, A, B, "offense", sit, look, g.plays)).toBeNull();
    const t1 = filmStudy(1, A, B, "offense", sit, look, g.plays)!;
    expect(t1.situation).toBe("Early downs");
    expect(t1.playbook.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
    expect(t1.film).toBeUndefined();
    const t2 = filmStudy(2, A, B, "offense", sit, look, g.plays)!;
    expect(t2.film!.snaps).toBeGreaterThan(5);
    expect(t2.self).toBeUndefined();
    const t3 = filmStudy(3, A, B, "offense", sit, look, g.plays)!;
    expect(t3.self!.snaps).toBe(t2.film!.snaps);
    // Their film is defenses (you're on offense); your self-scout is plays.
    expect(t2.film!.calls.every((c) => ["base", "run_blitz", "pass_blitz", "man_press", "cover_2", "cover_3", "cover_4"].includes(c.concept))).toBe(true);
    expect(t3.self!.calls[0]!.label).toMatch(/run|game|Intermediate|shot|action|Screen|Draw/i);
  });
});
