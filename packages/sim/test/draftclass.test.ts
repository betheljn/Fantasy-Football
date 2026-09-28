import { describe, expect, it } from "vitest";
import {
  DRAFT_CLASS_SIZE,
  MIN_SPECIALISTS,
  POSITIONS,
  classComposition,
  generateDraftClass,
  generateLeague,
  playerOverall,
} from "../src/index.ts";

const LEAGUE = generateLeague("class-test");
const CLASS = generateDraftClass(LEAGUE);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("generateDraftClass", () => {
  it("is for next season and has the expected size and position mix", () => {
    expect(CLASS.season).toBe(LEAGUE.season + 1);
    expect(CLASS.prospects).toHaveLength(DRAFT_CLASS_SIZE);
    const counts = classComposition();
    for (const pos of POSITIONS) {
      expect(CLASS.prospects.filter((p) => p.player.position === pos)).toHaveLength(counts[pos]);
    }
    for (const pos of ["K", "P", "LS"] as const) expect(counts[pos]).toBeGreaterThanOrEqual(MIN_SPECIALISTS);
  });

  it("prospects are young, uniquely identified, and have potential at or above their overall", () => {
    const ids = new Set<string>();
    for (const { player } of CLASS.prospects) {
      expect(player.age).toBeGreaterThanOrEqual(21);
      expect(player.age).toBeLessThanOrEqual(23);
      expect(player.potential).toBeGreaterThanOrEqual(playerOverall(player));
      expect(ids.has(player.id)).toBe(false);
      ids.add(player.id);
    }
    // Ids never collide with another season's class.
    const next = generateDraftClass(LEAGUE, CLASS.season + 1);
    for (const { player } of next.prospects) expect(ids.has(player.id)).toBe(false);
  });

  it("the big board is ranked by projected value, and projections are noisy but unbiased", () => {
    CLASS.prospects.forEach((p, i) => expect(p.boardRank).toBe(i + 1));
    for (let i = 1; i < CLASS.prospects.length; i++) {
      expect(CLASS.prospects[i - 1]!.projection.value).toBeGreaterThanOrEqual(CLASS.prospects[i]!.projection.value);
    }
    const err = CLASS.prospects.map((p) => p.projection.overall - playerOverall(p.player));
    expect(Math.abs(mean(err))).toBeLessThan(1);
    expect(err.some((e) => e !== 0)).toBe(true);
  });

  it("the board is right more often than not: top prospects really are better", () => {
    const top = CLASS.prospects.slice(0, 50).map((p) => p.player.potential);
    const bottom = CLASS.prospects.slice(-100).map((p) => p.player.potential);
    expect(mean(top)).toBeGreaterThan(mean(bottom) + 10);
  });

  it("rookies are raw: the class averages below a league roster", () => {
    const leagueMean = mean(Object.values(LEAGUE.teams).flatMap((t) => t.roster.map(playerOverall)));
    expect(mean(CLASS.prospects.map((p) => playerOverall(p.player)))).toBeLessThan(leagueMean);
  });

  it("is deterministic and differs by season", () => {
    expect(generateDraftClass(LEAGUE)).toEqual(CLASS);
    expect(generateDraftClass(LEAGUE, CLASS.season + 1).prospects[0]!.player.ratings).not.toEqual(CLASS.prospects[0]!.player.ratings);
  });
});
