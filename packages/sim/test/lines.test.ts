import { describe, expect, it } from "vitest";
import { allTeams, buildBoxScore, featuredGames, gameLines, linesSteps, playGame, propValue, seasonSchedule, startDynasty } from "../src/index.ts";

const DYNASTY = startDynasty("lines-test", 2);
const SCHEDULE = seasonSchedule(DYNASTY);
const ME = allTeams(DYNASTY.league)[0]!.abbr;
const GAMES = featuredGames(DYNASTY.league, SCHEDULE, 1, new Set([ME]));
const LINES = gameLines(DYNASTY.league, GAMES[0]!, 30);

describe("featured games", () => {
  it("are this week's strongest matchups, never yours", () => {
    expect(GAMES).toHaveLength(8);
    for (const g of GAMES) {
      expect(g.week).toBe(1);
      expect([g.home, g.away]).not.toContain(ME);
    }
  });
});

describe("lines", () => {
  it("cover the total, the spread and each side's key players, all ending in .5", () => {
    expect(LINES.props.filter((p) => p.kind === "total")).toHaveLength(1);
    expect(LINES.props.filter((p) => p.kind === "spread")).toHaveLength(1);
    expect(LINES.props.filter((p) => p.kind === "player").length).toBeGreaterThanOrEqual(6);
    for (const p of LINES.props) {
      expect(Math.abs(p.line % 1)).toBe(0.5);
      expect(p.overShare).toBeGreaterThan(0.25);
      expect(p.overShare).toBeLessThan(0.75);
    }
  });

  it("are the same every time, and never use the real game's seed", () => {
    expect(gameLines(DYNASTY.league, GAMES[0]!, 30)).toEqual(LINES);
    // Lines don't change the real game: it plays the same either way.
    const real = playGame(DYNASTY.league, GAMES[0]!);
    expect(playGame(DYNASTY.league, GAMES[0]!).summary).toEqual(real.summary);
  });

  it("settle from the real game", () => {
    const real = playGame(DYNASTY.league, GAMES[0]!);
    const box = buildBoxScore(real.result);
    const total = LINES.props.find((p) => p.kind === "total")!;
    expect(propValue(total, real.summary, box)).toBe(real.summary.homeScore + real.summary.awayScore);
    const spread = LINES.props.find((p) => p.kind === "spread")!;
    expect(propValue(spread, real.summary, box)).toBe(real.summary.homeScore - real.summary.awayScore);
    const qb = LINES.props.find((p) => p.stat === "passYds")!;
    expect(propValue(qb, real.summary, box)).toBe(box.players[qb.player!]?.passYds ?? 0);
  });

  it("can be worked out a game at a time", () => {
    const steps = linesSteps(DYNASTY.league, GAMES.slice(0, 2), 5);
    const seen: number[] = [];
    let r = steps.next();
    while (!r.done) {
      seen.push(r.value);
      r = steps.next();
    }
    expect(seen).toEqual([0.5, 1]);
    expect(r.value).toHaveLength(2);
  });
});
