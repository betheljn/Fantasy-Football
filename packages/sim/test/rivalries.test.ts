import { describe, expect, it } from "vitest";
import { advanceSeason, rivalries, rivalryGames, rivalryNews, rivalryStatus, seriesLine, startDynasty, trophyRoom, type RivalryGame } from "../src/index.ts";

const START = startDynasty("rivals-test", 2);
const ONE = advanceSeason(START);
const LIST = rivalries(START.league.seed);

describe("rivalries", () => {
  it("pair neighbors who meet every season, each with its own trophy", () => {
    expect(LIST).toHaveLength(30);
    expect(new Set(LIST.map((r) => r.trophy)).size).toBe(30);
    expect(rivalries(START.league.seed)).toEqual(LIST);
    const games = ONE.rivalryGames!;
    for (const r of LIST) expect(games.filter((g) => g.rivalry === r.id).length).toBeGreaterThanOrEqual(1);
  });

  it("give the trophy to the latest winner; a tie leaves it where it is", () => {
    const r = LIST[0]!;
    const [a, b] = r.teams;
    const g = (week: number, winner: string | null): RivalryGame => ({ rivalry: r.id, season: 2031, week, home: a, away: b, homeScore: winner === a ? 21 : winner === b ? 10 : 14, awayScore: winner === b ? 21 : winner === a ? 10 : 14, winner });
    expect(rivalryStatus(r, []).holder).toBeNull();
    const s = rivalryStatus(r, [g(1, a), g(2, b), g(3, null)]);
    expect(s.holder).toBe(b);
    expect(s.wins).toEqual({ [a]: 1, [b]: 1 });
    expect(s.ties).toBe(1);
    expect(seriesLine(s)).toMatch(/tied 1-1-1/);
  });

  it("make the news when a trophy changes hands", () => {
    const r = LIST[0]!;
    const [a, b] = r.teams;
    const before: RivalryGame[] = [{ rivalry: r.id, season: 2031, week: 1, home: a, away: b, homeScore: 20, awayScore: 3, winner: a }];
    const week: RivalryGame[] = [{ rivalry: r.id, season: 2031, week: 9, home: b, away: a, homeScore: 24, awayScore: 17, winner: b }];
    const [story] = rivalryNews(START.league, LIST, before, week);
    expect(story!.headline).toMatch(/take .* back from/);
    expect(story!.kind).toBe("rivalry");
  });

  it("are found among a season's results", () => {
    const games = rivalryGames(LIST, [{ id: "x", week: 3, home: LIST[0]!.teams[1], away: LIST[0]!.teams[0], kind: "division", homeScore: 7, awayScore: 3, overtime: false, winner: LIST[0]!.teams[1], seed: "s" }], 2031);
    expect(games).toHaveLength(1);
  });
});

describe("the trophy room", () => {
  it("shows a team's title, awards and rivalries", () => {
    const champ = ONE.history[0]!.champion;
    const room = trophyRoom(ONE, champ, ONE.rivalryGames!);
    expect(room.titles).toEqual([START.league.season]);
    expect(room.top25.length).toBeGreaterThan(0);
    for (const r of room.rivalries) expect(r.rivalry.teams).toContain(champ);
  });
});
