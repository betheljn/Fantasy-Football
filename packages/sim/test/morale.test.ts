import { describe, expect, it } from "vitest";
import {
  MORALE,
  addGameToSeason,
  allTeams,
  computeRankings,
  createSeasonStats,
  isCaptain,
  playWeek,
  playerMorale,
  salaryCap,
  seasonEndMorale,
  seasonSchedule,
  starters,
  startDynasty,
  teamCaptains,
  teamForm,
  teamMorale,
  weeklyNews,
  type GameSummary,
  type Story,
} from "../src/index.ts";

const DYNASTY = startDynasty("morale-test", 2);
const LEAGUE = DYNASTY.league;
const SCHEDULE = seasonSchedule(DYNASTY);
const CAP = salaryCap(LEAGUE.seed, LEAGUE.season);

/** A team's fake results: `wins` then `losses`, one a week. */
function record(abbr: string, outcomes: boolean[]): GameSummary[] {
  return outcomes.map((won, i) => ({ id: `g${i}`, week: i + 1, home: abbr, away: "ZZ", kind: "division", homeScore: won ? 20 : 10, awayScore: won ? 10 : 20, overtime: false, winner: won ? abbr : "ZZ", seed: "x" }) as GameSummary);
}

describe("captains", () => {
  it("are starters, one on each side of the ball, the same every time", () => {
    for (const t of allTeams(LEAGUE)) {
      const c = teamCaptains(t);
      const off = ["QB", "RB", "WR", "TE", "OL"] as const;
      const def = ["DL", "LB", "CB", "S"] as const;
      expect(off.flatMap((p) => starters(t, p)).map((p) => p.id)).toContain(c.offense!.id);
      expect(def.flatMap((p) => starters(t, p)).map((p) => p.id)).toContain(c.defense!.id);
      expect(teamCaptains(t)).toEqual(c);
    }
  });
});

describe("morale", () => {
  const team = allTeams(LEAGUE)[0]!;
  const player = starters(team, "WR")[0]!;

  it("swings with winning and losing, and lifts captains", () => {
    const hot = playerMorale(player, team, record(team.abbr, [true, true, true, true, true]), LEAGUE.season, CAP);
    const cold = playerMorale(player, team, record(team.abbr, [false, false, false, false, false]), LEAGUE.season, CAP);
    expect(hot.value).toBeGreaterThan(cold.value);
    expect(hot.reasons).toContain("5 straight wins");
    expect(cold.reasons).toContain("5 straight losses");
    const c = teamCaptains(team);
    const captain = c.offense!;
    expect(playerMorale(captain, team, [], LEAGUE.season, CAP).reasons).toContain("team captain");
    expect(teamForm(record(team.abbr, [true, false, false]), team.abbr)).toEqual({ winPct: 1 / 3, streak: -2, games: 3 });
  });

  it("is on a 0-100 scale for a whole league, team by team", () => {
    for (const t of allTeams(LEAGUE)) {
      const m = teamMorale(t, [], LEAGUE.season, CAP);
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(m.value).toBeLessThanOrEqual(100);
    }
  });

  it("carries into the re-signing talks: captains and a strong finish help", () => {
    const team2 = allTeams(LEAGUE)[1]!;
    const strong = seasonEndMorale([team2], record(team2.abbr, [false, true, true, true, true, true]));
    const c = teamCaptains(team2);
    const someone = team2.roster.find((p) => !isCaptain(c, p.id))!;
    expect(strong.get(c.offense!.id)).toBe(5 * 1.5 + MORALE.captain);
    expect(strong.get(someone.id)).toBe(5 * 1.5);
    const weak = seasonEndMorale([team2], record(team2.abbr, [false, false, false, false, false]));
    expect(weak.get(someone.id)).toBe(-5 * 1.5);
  });
});

describe("locker-room news", () => {
  it("writes about captains on runs and skids", () => {
    let league = LEAGUE;
    const stats = createSeasonStats();
    const results: GameSummary[] = [];
    let ranks = computeRankings(league, []);
    const stories: Story[] = [];
    for (let w = 1; w <= 10; w++) {
      const week = playWeek(league, SCHEDULE, w, (g) => addGameToSeason(stats, g));
      results.push(...week.games.map((g) => g.summary));
      const after = computeRankings(week.league, results, ranks);
      stories.push(...weeklyNews({ league: week.league, schedule: SCHEDULE, season: SCHEDULE.season, week: w, games: week.games, results, before: ranks, after, stats }));
      ranks = after;
      league = week.league;
    }
    const locker = stories.filter((s) => s.kind === "lockerroom");
    expect(locker.length).toBeGreaterThan(0);
    for (const s of locker) {
      expect(s.players).toHaveLength(1);
      expect(`${s.headline} ${s.body}`).not.toMatch(/undefined|NaN/);
    }
  });
});
