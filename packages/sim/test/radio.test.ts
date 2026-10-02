import { describe, expect, it } from "vitest";
import {
  addToRecords,
  allTeams,
  boardGames,
  buildBoxScore,
  createSeasonStats,
  emptyRecords,
  gradeHostPicks,
  linesSteps,
  playWeek,
  radioCast,
  radioShow,
  seasonSchedule,
  startDynasty,
} from "../src/index.ts";

const DYNASTY = startDynasty("radio-test", 2);
const SCHEDULE = seasonSchedule(DYNASTY);
const ME = allTeams(DYNASTY.league)[2]!.abbr;
const steps = linesSteps(DYNASTY.league, boardGames(DYNASTY.league, SCHEDULE, 1, ME), 15, ME);
let r = steps.next();
while (!r.done) r = steps.next();
const BOARD = r.value;
const SHOW = radioShow({ leagueSeed: DYNASTY.league.seed, season: SCHEDULE.season, week: 1, board: BOARD, stats: createSeasonStats(), stories: [], lastWeek: [], records: emptyRecords(), own: ME });

describe("the radio show", () => {
  it("has three different hosts, the same for the whole dynasty", () => {
    const cast = radioCast(DYNASTY.league.seed);
    expect(new Set(cast.hosts.map((h) => h.name)).size).toBe(3);
    expect(radioCast(DYNASTY.league.seed)).toEqual(cast);
  });

  it("writes a full script with no blanks, the same every time", () => {
    expect(SHOW.lines.length).toBeGreaterThan(3);
    for (const l of SHOW.lines) expect(l.text).not.toMatch(/undefined|\{|NaN/);
    expect(radioShow({ leagueSeed: DYNASTY.league.seed, season: SCHEDULE.season, week: 1, board: BOARD, stats: createSeasonStats(), stories: [], lastWeek: [], records: emptyRecords(), own: ME })).toEqual(SHOW);
  });

  it("each host picks from the board, one per game, never your game", () => {
    for (const role of ["numbers", "hottake", "veteran"] as const) {
      const mine = SHOW.picks.filter((p) => p.host === role);
      expect(new Set(mine.map((p) => p.prop.game)).size).toBe(mine.length);
    }
    expect(SHOW.picks.length).toBeGreaterThanOrEqual(5);
    const own = BOARD.find((g) => g.game.home === ME || g.game.away === ME);
    if (own) expect(SHOW.picks.some((p) => p.prop.game === own.game.id)).toBe(false);
  });

  it("grades the picks and keeps records", () => {
    const week = playWeek(DYNASTY.league, SCHEDULE, 1);
    const games = new Map(week.games.map((g) => [g.summary.id, { summary: g.summary, box: buildBoxScore(g.result) }]));
    const graded = gradeHostPicks(SHOW.picks, games);
    expect(graded).toHaveLength(SHOW.picks.length);
    const rec = addToRecords(emptyRecords(), graded);
    expect(rec.numbers.won + rec.numbers.lost + rec.hottake.won + rec.hottake.lost + rec.veteran.won + rec.veteran.lost).toBe(graded.length);
  });
});
