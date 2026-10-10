import { describe, expect, it } from "vitest";
import { advanceSeason, gameLines, playSeason, postseasonNews, startDynasty, titleMatchups, PLAYOFF_ROUNDS } from "../src/index.ts";

const BASE = startDynasty("postseason-test", 3);
const DYNASTY = { ...BASE, league: { ...BASE.league, format: 2 } };
const PLAYED = playSeason(DYNASTY);
const P = PLAYED.playoffs;
const SEASON = DYNASTY.league.season;

describe("rankings through the postseason (format 2)", () => {
  it("are redone after each playoff round; the season's final Top 25 comes after the championship", () => {
    for (const round of PLAYOFF_ROUNDS) expect(P.roundRankings?.[round]).toHaveLength(50);
    // The champion's four playoff wins count.
    const champ = (r: typeof P.ranking) => r.find((e) => e.team === P.champion)!;
    expect(champ(P.roundRankings!.championship!).record.wins).toBe(champ(P.ranking).record.wins + 4);
    // The final poll: champion No. 1, runner-up No. 2.
    expect(P.roundRankings!.championship!.slice(0, 2).map((e) => e.team)).toEqual([P.champion, P.runnerUp]);
    expect(P.roundRankings!.championship!.map((e) => e.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const next = advanceSeason(DYNASTY);
    expect(next.history[0]!.top25.map((e) => e.team)).toEqual(P.roundRankings!.championship!.slice(0, 25).map((e) => e.team));
  }, 120_000);
});

describe("championship week on the board", () => {
  it("title matchups are known before they're played, and match the games played", () => {
    const m = titleMatchups(DYNASTY.league, PLAYED.season);
    expect(m.map((g) => g.id)).toEqual(P.titleGames!.map((g) => g.summary.id));
    const lines = gameLines(DYNASTY.league, m[0]!, 12);
    expect(lines.props.some((p) => p.kind === "total")).toBe(true);
  });
});

describe("postseason news", () => {
  it("championship week: every title, the field, the last in and first out", () => {
    const s = postseasonNews(DYNASTY.league, SEASON, P, "titles");
    expect(s.filter((x) => x.kind === "title")).toHaveLength(10);
    expect(s.some((x) => x.headline.includes("No. 1 seed"))).toBe(true);
    expect(s.some((x) => x.headline.includes("left out"))).toBe(true);
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
    for (const x of s) expect(`${x.headline} ${x.body}`).not.toMatch(/undefined|NaN/);
    expect(s[0]!.week).toBe(17);
  });

  it("each round: a story per game, upsets by seed, the champion", () => {
    for (const round of PLAYOFF_ROUNDS) {
      const s = postseasonNews(DYNASTY.league, SEASON, P, round);
      expect(s.length).toBe(P.games.filter((g) => g.round === round).length);
      for (const x of s) expect(`${x.headline} ${x.body}`).not.toMatch(/undefined|NaN/);
    }
    const final = postseasonNews(DYNASTY.league, SEASON, P, "championship");
    expect(final[0]).toMatchObject({ kind: "playoff", importance: 95 });
    expect(final[0]!.teams[0]).toBe(P.champion);
  });

  it("your own postseason, in your local feed", () => {
    const you = P.seeds[3]!.team;
    const s = postseasonNews(DYNASTY.league, SEASON, P, "round_of_16", you);
    expect(s.filter((x) => x.local)).toHaveLength(1);
    const out = P.ranking.find((e) => !P.seeds.some((x) => x.team === e.team))!.team;
    const titles = postseasonNews(DYNASTY.league, SEASON, P, "titles", out).filter((x) => x.local);
    expect(titles.length).toBeLessThanOrEqual(1);
  });
});
