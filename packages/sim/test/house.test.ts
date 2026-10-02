import { describe, expect, it } from "vitest";
import { bookmaker, houseGreeting, houseOnResult, houseOnSlate, houseRecord, type Prop, type SettledSlate, type Slate } from "../src/index.ts";

const BM = bookmaker("house-test");
const prop = (over: Partial<Prop>): Prop => ({ id: "g:p", game: "g", kind: "player", line: 60.5, team: "OH", player: "p", name: "Jalen Moss", position: "WR", stat: "recYds", overShare: 0.5, ...over });
const slate = (n: number): Slate => ({ id: `s${n}`, season: 2031, week: 3, stake: 100, picks: Array.from({ length: n }, (_, i) => ({ prop: prop({ id: `g${i}:p` }), side: "over" as const })) });

describe("the house", () => {
  it("is the same character for a league, every time", () => {
    expect(bookmaker("house-test")).toEqual(BM);
    expect(BM.name.split(" ")).toHaveLength(2);
    expect(BM.nickname.length).toBeGreaterThan(0);
  });

  it("opens the board, reacts to slates, and fills every blank", () => {
    const hello = houseGreeting(BM, "house-test", 2031, 3, []);
    expect(hello).not.toMatch(/\{/);
    expect(houseGreeting(BM, "house-test", 2031, 3, [])).toBe(hello);
    for (const n of [2, 6]) expect(houseOnSlate(BM, slate(n))).not.toMatch(/\{/);
  });

  it("gloats about a near miss, by name", () => {
    const s = slate(2);
    const settled: SettledSlate = { ...s, won: false, payout: 0, picks: [{ ...s.picks[0]!, value: 80, hit: true }, { ...s.picks[1]!, value: 57, hit: false }] };
    const line = houseOnResult(BM, settled);
    expect(line).toMatch(/Jalen Moss's receiving yards/);
    expect(line).not.toMatch(/\{/);
  });

  it("keeps your record against it", () => {
    const won: SettledSlate = { ...slate(2), won: true, payout: 300, picks: [] };
    const lost: SettledSlate = { ...slate(3), won: false, payout: 0, picks: [] };
    expect(houseRecord([won, lost])).toEqual({ won: 1, lost: 1, net: 100 });
  });
});
