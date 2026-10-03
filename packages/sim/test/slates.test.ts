import { describe, expect, it } from "vitest";
import {
  SLATE_RULES,
  allTeams,
  boardGames,
  ownGameLines,
  buildBoxScore,
  featuredGames,
  gameLines,
  playGame,
  seasonSchedule,
  settleSlate,
  slatePayout,
  slateProblems,
  startDynasty,
  tailRecord,
  topUp,
  type Slate,
  type SlatePick,
} from "../src/index.ts";

const DYNASTY = startDynasty("slates-test", 2);
const SCHEDULE = seasonSchedule(DYNASTY);
const GAMES = featuredGames(DYNASTY.league, SCHEDULE, 1, new Set([allTeams(DYNASTY.league)[0]!.abbr])).slice(0, 3);
const LINES = GAMES.map((g) => gameLines(DYNASTY.league, g, 20));
const PLAYED = new Map(GAMES.map((g) => {
  const r = playGame(DYNASTY.league, g);
  return [g.id, { summary: r.summary, box: buildBoxScore(r.result) }] as const;
}));
const pick = (game: number, n: number, side: "over" | "under" = "over"): SlatePick => ({ prop: LINES[game]!.props[n]!, side });

describe("building a slate", () => {
  it("takes 2-6 different picks, at most 2 per game, and a stake you can cover", () => {
    expect(slateProblems([pick(0, 0)], 50, 1000)).not.toEqual([]);
    expect(slateProblems([pick(0, 0), pick(1, 0)], 50, 1000)).toEqual([]);
    expect(slateProblems([pick(0, 0), pick(0, 0, "under")], 50, 1000).join(" ")).toMatch(/only once/);
    expect(slateProblems([pick(0, 0), pick(0, 1), pick(0, 2)], 50, 1000).join(" ")).toMatch(/one game/);
    expect(slateProblems([pick(0, 0), pick(1, 0)], 5, 1000).join(" ")).toMatch(/at least/);
    expect(slateProblems([pick(0, 0), pick(1, 0)], 50, 40).join(" ")).toMatch(/Not enough/);
  });

  it("pays more for more picks", () => {
    for (let n = 2; n < 6; n++) expect(slatePayout(n + 1, 100)).toBeGreaterThan(slatePayout(n, 100));
  });
});

describe("settling", () => {
  it("pays only when every pick hits", () => {
    const sides = (p: SlatePick): SlatePick => {
      const g = PLAYED.get(p.prop.game)!;
      const r = settleSlate({ id: "x", season: 0, week: 1, picks: [p], stake: 10 }, new Map([[p.prop.game, g]]));
      return r.picks[0]!.hit ? p : { ...p, side: p.side === "over" ? "under" : "over" };
    };
    // Turn each pick to the side that hit: a winner. Flip one: a loser.
    const winners = [sides(pick(0, 0)), sides(pick(1, 1)), sides(pick(2, 2))];
    const slate: Slate = { id: "s1", season: 2031, week: 1, picks: winners, stake: 40 };
    const won = settleSlate(slate, PLAYED);
    expect(won.won).toBe(true);
    expect(won.payout).toBe(slatePayout(3, 40));
    const lost = settleSlate({ ...slate, picks: [{ ...winners[0]!, side: winners[0]!.side === "over" ? "under" : "over" }, ...winners.slice(1)] }, PLAYED);
    expect(lost.won).toBe(false);
    expect(lost.payout).toBe(0);
    expect(lost.picks.map((p) => p.hit)).toEqual([false, true, true]);
  });

  it("tops a near-empty balance back up each week", () => {
    expect(topUp(3)).toBe(SLATE_RULES.floor);
    expect(topUp(500)).toBe(500);
  });
});

describe("your own games", () => {
  const own = allTeams(DYNASTY.league)[0]!.abbr;
  const mine = SCHEDULE.games.find((g) => g.week === 1 && (g.home === own || g.away === own))!;
  const lines = ownGameLines(gameLines(DYNASTY.league, mine, 20), own);
  const ownGames = new Set([mine.id]);

  it("are on the board with only your own players' props", () => {
    expect(boardGames(DYNASTY.league, SCHEDULE, 1, own)[0]!.id).toBe(mine.id);
    expect(lines.props.length).toBeGreaterThan(0);
    for (const p of lines.props) {
      expect(p.kind).toBe("player");
      expect(p.team).toBe(own);
    }
  });

  it("allow overs on your players, never unders (or anything else from your game)", () => {
    const other = pick(0, 0);
    const over: SlatePick = { prop: lines.props[0]!, side: "over" };
    expect(slateProblems([over, other], 50, 1000, own, ownGames)).toEqual([]);
    expect(slateProblems([{ ...over, side: "under" }, other], 50, 1000, own, ownGames).join(" ")).toMatch(/only overs/);
    const full = gameLines(DYNASTY.league, mine, 20).props.find((p) => p.kind === "total")!;
    expect(slateProblems([{ prop: full, side: "over" }, other], 50, 1000, own, ownGames).join(" ")).toMatch(/off the board/);
  });
});

describe("following and fading the radio hosts", () => {
  it("tallies how your tailed picks did, host by host", () => {
    const hit = { ...pick(0, 0), value: 99, hit: true, via: { host: "hottake", fade: false } };
    const miss = { ...pick(1, 0), value: 0, hit: false, via: { host: "hottake", fade: true } };
    const plain = { ...pick(2, 0), value: 0, hit: false };
    const settled = { id: "t", season: 2031, week: 2, stake: 10, picks: [hit, miss, plain], won: false, payout: 0 };
    expect(tailRecord([settled])).toEqual({ hottake: { follow: [1, 0], fade: [0, 1] } });
  });
});
