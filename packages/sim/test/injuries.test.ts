import { describe, expect, it } from "vitest";
import {
  GAME_MIN,
  SEASON_ENDING,
  advanceInjuries,
  allTeams,
  beginOffseason,
  gameDayTeam,
  healAll,
  injuryNews,
  injuryReport,
  returnWeek,
  playSeason,
  playWeek,
  seasonSchedule,
  simulateGame,
  startDynasty,
  withOut,
  type League,
} from "../src/index.ts";

const DYNASTY = startDynasty("injury-test", 2);
const SCHEDULE = seasonSchedule(DYNASTY);

/** Play the first `n` weeks. */
function weeks(n: number) {
  let league = DYNASTY.league;
  const games = [];
  for (let w = 1; w <= n; w++) {
    const r = playWeek(league, SCHEDULE, w);
    games.push(...r.games);
    league = r.league;
  }
  return { league, games };
}
const FOUR = weeks(4);

describe("injuries in games", () => {
  it("happen at a steady rate, on the play they happen, and are the same every time", () => {
    const injuries = FOUR.games.flatMap((g) => g.result.injuries);
    const perGame = injuries.length / FOUR.games.length;
    expect(perGame).toBeGreaterThan(1);
    expect(perGame).toBeLessThan(5);
    const onPlays = FOUR.games.flatMap((g) => g.result.plays.flatMap((p) => p.injuries ?? []));
    expect(onPlays).toEqual(injuries);
    expect(weeks(4).games.map((g) => g.result.injuries)).toEqual(FOUR.games.map((g) => g.result.injuries));
  });

  it("take a player off the field for the rest of the game", () => {
    for (const g of FOUR.games) {
      for (const [i, p] of g.result.plays.entries()) {
        for (const hurt of p.injuries ?? []) {
          const later = g.result.plays.slice(i + 1).map((x) => JSON.stringify(x.event));
          expect(later.some((e) => e.includes(`"${hurt.player}"`))).toBe(false);
        }
      }
    }
  });
});

describe("between games", () => {
  it("the injured sit out on game day, and the game replays exactly from who sat", () => {
    const hurt = allTeams(FOUR.league).flatMap((t) => t.roster.filter((p) => p.injury && p.injury.weeks > 0));
    expect(hurt.length).toBeGreaterThan(10);
    const next = playWeek(FOUR.league, SCHEDULE, 5);
    for (const g of next.games) {
      const out = new Set(Object.values(g.summary.out ?? {}).flat());
      for (const p of g.result.plays) {
        const text = JSON.stringify(p.event);
        for (const id of out) expect(text.includes(`"${id}"`)).toBe(false);
      }
      const home = withOut(FOUR.league.teams[g.summary.home]!, new Set(g.summary.out?.[g.summary.home] ?? []));
      const away = withOut(FOUR.league.teams[g.summary.away]!, new Set(g.summary.out?.[g.summary.away] ?? []));
      expect(simulateGame(home, away, g.summary.seed).score).toEqual(g.result.score);
    }
  });

  it("players heal a week at a time; season-ending injuries wait for the offseason", () => {
    const team = allTeams(DYNASTY.league)[0]!;
    const [a, b] = team.roster;
    const hurt = advanceInjuries(DYNASTY.league, [
      { player: a!.id, team: team.abbr, type: "ankle", weeks: 2 },
      { player: b!.id, team: team.abbr, type: "torn ACL", weeks: SEASON_ENDING },
    ]);
    const find = (l: League, id: string) => l.teams[team.abbr]!.roster.find((p) => p.id === id)!;
    expect(find(hurt, a!.id).injury).toEqual({ type: "ankle", weeks: 2 });
    const one = advanceInjuries(hurt, []);
    expect(find(one, a!.id).injury!.weeks).toBe(1);
    const two = advanceInjuries(one, []);
    expect(find(two, a!.id).injury).toBeUndefined();
    expect(find(two, b!.id).injury!.weeks).toBe(SEASON_ENDING);
    expect(find(healAll(two), b!.id).injury).toBeUndefined();
  });

  it("a team always fields enough players at every position", () => {
    const team = allTeams(DYNASTY.league)[0]!;
    // Everyone at QB hurt: the least hurt still play.
    const qbs = team.roster.filter((p) => p.position === "QB");
    const league = advanceInjuries(DYNASTY.league, qbs.map((p, i) => ({ player: p.id, team: team.abbr, type: "hand", weeks: 2 + i })));
    const day = gameDayTeam(league.teams[team.abbr]!);
    expect(day.team.roster.filter((p) => p.position === "QB").length).toBe(GAME_MIN.QB);
    expect(day.out.length).toBe(qbs.length - GAME_MIN.QB);
  });

  it("everyone starts the next season healthy", () => {
    const played = playSeason(DYNASTY);
    expect(allTeams(played.league).some((t) => t.roster.some((p) => p.injury))).toBe(true);
    const off = beginOffseason({ ...DYNASTY, league: played.league }, played);
    expect(allTeams(off.developed).some((t) => t.roster.some((p) => p.injury))).toBe(false);
  }, 30_000);
});

describe("the injury report", () => {
  it("lists everyone hurt with when they're back, starters first", () => {
    const report = injuryReport(FOUR.league, 4);
    expect(report.length).toBe(allTeams(FOUR.league).reduce((n, t) => n + t.roster.filter((p) => p.injury).length, 0));
    const firstBench = report.findIndex((e) => !e.starter);
    if (firstBench >= 0) expect(report.slice(firstBench).every((e) => !e.starter)).toBe(true);
    for (const e of report) expect(e.returnWeek).toBe(e.injury.weeks >= SEASON_ENDING ? null : 5 + e.injury.weeks);
    const team = report[0]!.team;
    expect(injuryReport(FOUR.league, 4, team).every((e) => e.team === team)).toBe(true);
    expect(returnWeek({ weeks: 2 }, 4)).toBe(7);
  });

  it("news covers starters and good players out a week or more", () => {
    const before = weeks(3).league;
    const hurt = FOUR.games.filter((g) => g.summary.week === 4).flatMap((g) => g.result.injuries);
    const news = injuryNews(before, hurt, 4);
    for (const n of news) {
      expect(n.weeks).toBeGreaterThanOrEqual(1);
      expect(n.starter || n.overall >= 70).toBe(true);
    }
    expect(news.length).toBeLessThanOrEqual(hurt.length);
  });
});
