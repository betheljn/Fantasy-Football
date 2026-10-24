import { describe, expect, it } from "vitest";
import { friendGamesOf, friendPreviews, friendSeries, friendSeriesLine, friendStories, generateLeague, teamName, type FriendGame, type GameSummary } from "../src/index.ts";

const league = generateLeague("friends-test");
const name = (abbr: string) => teamName(league.teams[abbr]!);
const game = (week: number, home: string, away: string, hs: number, as: number, duel = false): FriendGame => ({ season: 2031, week, home, away, homeScore: hs, awayScore: as, duel });

describe("friends against friends", () => {
  it("keeps only games between two friends, and marks the duels", () => {
    const s = (home: string, away: string, rival?: string) => ({ id: `${home}${away}`, home, away, homeScore: 10, awayScore: 7, winner: home, ...(rival ? { coached: { team: home, calls: [], rival } } : {}) }) as unknown as GameSummary;
    const kept = friendGamesOf([s("OH", "TX", "TX"), s("OH", "CA"), s("MI", "TX")], new Set(["OH", "TX", "MI"]), 2031, 4);
    expect(kept.map((g) => [g.home, g.away, g.duel])).toEqual([
      ["OH", "TX", true],
      ["MI", "TX", false],
    ]);
  });

  it("keeps the series: wins, ties, streaks, and who leads", () => {
    const history = [game(1, "OH", "TX", 21, 14), game(5, "TX", "OH", 10, 24), game(9, "OH", "TX", 17, 17), game(12, "TX", "OH", 31, 3)];
    const s = friendSeries(history, "OH", "TX");
    expect(s).toMatchObject({ wins: { OH: 2, TX: 1 }, ties: 1, games: 4, streak: { team: "TX", n: 1 } });
    expect(friendSeriesLine(s, name)).toBe(`${name("OH")} lead the series 2-1-1`);
    expect(friendSeriesLine(friendSeries([], "OH", "TX"), name)).toBe("First meeting");
    expect(friendSeriesLine(friendSeries(history.slice(0, 1).concat(history[3]!), "OH", "TX"), name)).toBe("The series is even at 1-1");
  });

  it("tells each friends' game as a story about the series", () => {
    const tell = (before: FriendGame[], g: FriendGame) => friendStories(league, [g], before)[0]!;
    const first = tell([], game(1, "OH", "TX", 24, 17, true));
    expect(first).toMatchObject({ kind: "friends", headline: `${name("OH")} beat ${name("TX")} 24-17 in a duel`, body: `${name("OH")} take the first meeting. Both coaches called every snap.` });
    expect(first.importance).toBeGreaterThan(55);
    const h = [game(1, "OH", "TX", 24, 17)];
    expect(tell(h, game(5, "TX", "OH", 20, 10)).body).toBe("The series is even again at 1-1.");
    expect(tell([...h, game(5, "OH", "TX", 20, 10)], game(9, "OH", "TX", 20, 13)).body).toBe(`${name("OH")} stretch the series lead to 3-0, 3 straight.`);
    expect(tell([...h, game(5, "OH", "TX", 20, 10)], game(9, "TX", "OH", 20, 13)).body).toBe(`${name("TX")} pull within 1-2.`);
    expect(tell([game(1, "OH", "TX", 10, 10)], game(5, "TX", "OH", 14, 7)).body).toBe(`${name("TX")} take a 1-0 series lead.`);
    expect(tell(h, game(5, "OH", "TX", 13, 13)).headline).toBe(`${name("TX")} and ${name("OH")} tie 13-13`);
  });

  it("previews next week's friends' games for the radio show", () => {
    expect(friendPreviews(league, [{ home: "TX", away: "OH" }], [game(1, "OH", "TX", 24, 17)])).toEqual([`${name("OH")} at ${name("TX")}. ${name("OH")} lead the series 1-0.`]);
    expect(friendPreviews(league, [{ home: "CA", away: "NY" }], [])).toEqual([`${name("NY")} at ${name("CA")}. First time these two meet.`]);
  });
});
