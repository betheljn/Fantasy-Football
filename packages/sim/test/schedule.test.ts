import { describe, expect, it } from "vitest";
import {
  BYES_PER_TEAM,
  BYES_PER_WEEK,
  BYE_WINDOWS,
  GAMES_PER_TEAM,
  HOME_GAMES_PER_TEAM,
  REGULAR_SEASON_WEEKS,
  REMATCH_GAP,
  conferenceOf,
  divisionOf,
  gamesForWeek,
  generateLeague,
  generateSchedule,
  teamSchedule,
  type League,
  type Schedule,
} from "../src/index.ts";

const LEAGUE = generateLeague("schedule-test");
const SEASONS: Array<[League, Schedule]> = [2031, 2032, 2033].map((season) => [LEAGUE, generateSchedule(LEAGUE, { season })]);
const OTHER = generateLeague("schedule-test-2");
SEASONS.push([OTHER, generateSchedule(OTHER)]);

describe("generateSchedule", () => {
  it("gives every team 20 games in 22 weeks, 10 at home, never twice in a week", () => {
    for (const [league, s] of SEASONS) {
      expect(s.games).toHaveLength((50 * GAMES_PER_TEAM) / 2);
      for (const t of Object.keys(league.teams)) {
        const games = teamSchedule(s, t);
        expect(games).toHaveLength(GAMES_PER_TEAM);
        expect(games.filter((g) => g.home === t)).toHaveLength(HOME_GAMES_PER_TEAM);
        expect(new Set(games.map((g) => g.week)).size).toBe(GAMES_PER_TEAM);
        for (const g of games) {
          expect(g.week).toBeGreaterThanOrEqual(1);
          expect(g.week).toBeLessThanOrEqual(REGULAR_SEASON_WEEKS);
        }
      }
    }
  });

  it("gives each team two byes, one in each window, with 4-10 teams off each bye week", () => {
    const windowOf = (w: number) => BYE_WINDOWS.findIndex((b) => w >= b.first && w <= b.last);
    for (const [league, s] of SEASONS) {
      const perWeek = new Map<number, number>();
      for (const t of Object.keys(league.teams)) {
        const byes = s.byes[t]!;
        expect(byes).toHaveLength(BYES_PER_TEAM);
        expect(byes.map(windowOf).sort()).toEqual([0, 1]);
        for (const bye of byes) {
          expect(teamSchedule(s, t).some((g) => g.week === bye)).toBe(false);
          perWeek.set(bye, (perWeek.get(bye) ?? 0) + 1);
        }
      }
      for (let w = 1; w <= REGULAR_SEASON_WEEKS; w++) {
        if (windowOf(w) < 0) {
          // Outside the windows, every team plays every week.
          expect(gamesForWeek(s, w)).toHaveLength(25);
        } else {
          expect(perWeek.get(w) ?? 0).toBeGreaterThanOrEqual(BYES_PER_WEEK.min);
          expect(perWeek.get(w) ?? 0).toBeLessThanOrEqual(BYES_PER_WEEK.max);
        }
      }
    }
  });

  it("has the right opponent mix: 8 division, 8 conference, 4 interconference", () => {
    for (const [league, s] of SEASONS) {
      for (const t of Object.keys(league.teams)) {
        const games = teamSchedule(s, t);
        const opp = (g: (typeof games)[number]) => (g.home === t ? g.away : g.home);
        const div = games.filter((g) => g.kind === "division");
        const conf = games.filter((g) => g.kind === "conference");
        const inter = games.filter((g) => g.kind === "interconference");
        expect([div.length, conf.length, inter.length]).toEqual([8, 8, 4]);
        // Division rivals twice each, once at each venue.
        for (const rival of divisionOf(league, t).teams.filter((x) => x !== t)) {
          const vs = div.filter((g) => opp(g) === rival);
          expect(vs).toHaveLength(2);
          expect(new Set(vs.map((g) => g.home))).toEqual(new Set([t, rival]));
          expect(Math.abs(vs[0]!.week - vs[1]!.week)).toBeGreaterThanOrEqual(REMATCH_GAP);
        }
        for (const g of conf) {
          expect(conferenceOf(league, opp(g)).abbr).toBe(conferenceOf(league, t).abbr);
          expect(divisionOf(league, opp(g)).name).not.toBe(divisionOf(league, t).name);
        }
        // Two conference opponents from each other division, no repeats.
        expect(new Set(conf.map(opp)).size).toBe(8);
        for (const g of inter) expect(conferenceOf(league, opp(g)).abbr).not.toBe(conferenceOf(league, t).abbr);
        expect(new Set(inter.map((g) => divisionOf(league, opp(g)).name)).size).toBe(4);
      }
    }
  });

  it("rotates interconference opponents from season to season", () => {
    const opponents = (s: Schedule) =>
      new Set(teamSchedule(s, "TX").filter((g) => g.kind === "interconference").map((g) => (g.home === "TX" ? g.away : g.home)));
    expect(opponents(SEASONS[0]![1])).not.toEqual(opponents(SEASONS[1]![1]));
  });

  it("is deterministic", () => {
    expect(generateSchedule(LEAGUE, { season: 2031 })).toEqual(SEASONS[0]![1]);
  });
});
