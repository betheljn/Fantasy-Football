import { SLATE_RULES } from "@dynasty/sim";
import { describe, expect, it } from "vitest";
import { applyMove } from "../src/moves.ts";
import { forMember } from "../src/offseason.ts";
import { boardFor, picksOf } from "../src/picks.ts";
import { advance, openSeason } from "../src/season.ts";
import { newLeagueState } from "../src/state.ts";

// Fewer simulations per board game (the board is worked out on every advance).
process.env.PICKS_SIMS ??= "6";

describe("picks and the radio show online", () => {
  const humans = { OH: "m1", TX: "m2" };
  const opened = openSeason({ ...newLeagueState("picks-online"), humans });

  it("opens week 1's board and show when the season opens, with friends' games off the featured board", () => {
    const p = picksOf(opened);
    expect(p.board).toMatchObject({ season: opened.dynasty.league.season, week: 1 });
    const featured = p.board!.lines.filter((l) => ![l.game.home, l.game.away].some((t) => t in humans));
    expect(featured).toHaveLength(8);
    expect(p.shows).toHaveLength(1);
    for (const pick of p.shows[0]!.picks) expect(featured.some((l) => l.game.id === pick.prop.game)).toBe(true);
    // Each friend sees their own game only for their own players.
    const own = boardFor(opened, "OH").filter((l) => l.game.home === "OH" || l.game.away === "OH");
    for (const prop of own.flatMap((l) => l.props)) expect(prop.team).toBe("OH");
  });

  it("places a slate, keeps it private, settles it when the week is played, and grades the hosts", { timeout: 120_000 }, () => {
    const view = boardFor(opened, "OH").filter((l) => l.game.home !== "OH" && l.game.away !== "OH");
    const picks = [{ prop: view[0]!.props[0]!.id, side: "over" as const }, { prop: view[1]!.props[0]!.id, side: "under" as const }];
    // A pick on the other friend's game is turned away.
    const txGame = picksOf(opened).board!.lines.find((l) => l.game.home === "TX" || l.game.away === "TX")!;
    expect(applyMove(opened, "OH", { kind: "slate", picks: [picks[0]!, { prop: txGame.props[0]!.id, side: "over" }], stake: 50 }).problems).toContain("That pick isn't on your board.");
    const placed = applyMove(opened, "OH", { kind: "slate", picks, stake: 100 });
    expect(placed.problems).toEqual([]);
    const s1 = placed.state!;
    const mine = picksOf(s1).members.OH!;
    expect(mine.balance).toBe(SLATE_RULES.startingBalance - 100);
    expect(mine.open[0]!.picks[0]!.prop).toEqual(view[0]!.props[0]);
    // TX can't see OH's open slate.
    expect(picksOf(forMember(s1, "TX")).members.OH!.open).toEqual([]);
    expect(picksOf(forMember(s1, "OH")).members.OH!.open).toHaveLength(1);
    // The week is played: settled, paid, and the hosts graded; next week's board and show are up.
    const after = advance(s1, new Set(["OH", "TX"])).state;
    const p = picksOf(after);
    const oh = p.members.OH!;
    expect(oh.open).toEqual([]);
    expect(oh.history).toHaveLength(1);
    expect(oh.balance).toBe(SLATE_RULES.startingBalance - 100 + oh.history[0]!.payout);
    expect(p.members.TX!.balance).toBe(SLATE_RULES.startingBalance);
    expect(p.last.length).toBe(p.shows[0]!.picks.length);
    expect(p.records.numbers.won + p.records.numbers.lost + p.records.hottake.won + p.records.hottake.lost + p.records.veteran.won + p.records.veteran.lost).toBe(p.last.length);
    expect(p.board).toMatchObject({ week: 2 });
    expect(p.shows.map((x) => x.week)).toEqual([1, 2]);
    // A slate on last week's board is closed now.
    expect(applyMove(after, "OH", { kind: "slate", picks, stake: 50 }).problems.length).toBeGreaterThan(0);
  });
});
