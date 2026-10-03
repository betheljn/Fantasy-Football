import { describe, expect, it } from "vitest";
import { RECORD_STATS, advanceSeason, emptyRecordBook, startCollection, startDynasty } from "../src/index.ts";

const START = startDynasty("moments-test", 2);
const ONE = advanceSeason(START);
const TWO = advanceSeason(ONE);

describe("moments", () => {
  it("are collected every season, with every rarity explained", () => {
    const first = ONE.moments!;
    expect(first.length).toBeGreaterThan(20);
    for (const m of first) {
      expect(m.title).not.toMatch(/undefined|NaN/);
      expect(m.season).toBe(START.league.season);
    }
    expect(TWO.moments!.length).toBeGreaterThan(first.length);
    expect(TWO.moments!.slice(0, first.length)).toEqual(first);
  });

  it("make each kind's first ever a one-of-one, only once", () => {
    const firsts = TWO.moments!.filter((m) => m.first);
    expect(new Set(firsts.map((m) => m.kind)).size).toBe(firsts.length);
    for (const m of firsts) expect(m.rarity).toBe("legendary");
  });

  it("crown a champion each season", () => {
    for (const season of [START.league.season, ONE.league.season]) expect(TWO.moments!.some((m) => m.season === season && m.kind.includes("champion"))).toBe(true);
  });

  it("are the same every time", () => {
    expect(advanceSeason(START).moments).toEqual(ONE.moments);
  }, 60_000);
});

describe("the record book", () => {
  it("starts empty with a new dynasty, and records only get better", () => {
    expect(START.recordBook).toBeUndefined();
    expect(startCollection(undefined).book).toEqual(emptyRecordBook());
    for (const scope of ["game", "season"] as const)
      for (const stat of RECORD_STATS) {
        const a = ONE.recordBook![scope][stat];
        const b = TWO.recordBook![scope][stat];
        if (a) expect(b!.value).toBeGreaterThanOrEqual(a.value);
      }
    const broken = TWO.moments!.filter((m) => m.record);
    expect(broken.length).toBeGreaterThan(0);
  });
});
