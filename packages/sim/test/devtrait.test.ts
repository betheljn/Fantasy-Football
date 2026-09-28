import { describe, expect, it } from "vitest";
import {
  DEV_TRAITS,
  OVERALL_WEIGHTS,
  Rng,
  createPlayer,
  developLeague,
  developPlayer,
  expectedGrowth,
  formatPlayerCard,
  generateDraftClass,
  generateLeague,
  playerOverall,
  rollDevTrait,
  type DevTrait,
} from "../src/index.ts";

const LEAGUE = generateLeague("trait-test");
const PLAYERS = Object.values(LEAGUE.teams).flatMap((t) => t.roster);

describe("rollDevTrait", () => {
  it("is mostly Normal, rarely Elite, and better prospects roll better traits", () => {
    const rng = new Rng(1);
    const count = (promise: number) => {
      const c: Record<DevTrait, number> = { normal: 0, impact: 0, star: 0, elite: 0 };
      for (let i = 0; i < 20000; i++) c[rollDevTrait(rng, promise)]++;
      return c;
    };
    const avg = count(62);
    expect(avg.normal / 20000).toBeGreaterThan(0.6);
    expect(avg.elite / 20000).toBeLessThan(0.04);
    expect(avg.elite).toBeGreaterThan(0);
    const blueChip = count(80);
    expect(blueChip.elite / blueChip.normal).toBeGreaterThan((avg.elite / avg.normal) * 3);
  });
});

describe("traits in generated players", () => {
  it("every player has one; only players 22 and under are still hidden", () => {
    for (const p of PLAYERS) {
      expect(DEV_TRAITS).toContain(p.devTrait);
      expect(p.devTraitRevealed).toBe(p.age >= 23);
    }
  });

  it("draft prospects are all hidden", () => {
    for (const { player } of generateDraftClass(LEAGUE).prospects) expect(player.devTraitRevealed).toBe(false);
  });

  it("a pro season reveals the trait", () => {
    const next = developLeague(LEAGUE);
    for (const t of Object.values(next.teams)) for (const p of t.roster) expect(p.devTraitRevealed).toBe(true);
  });

  it("the player card hides an unknown trait", () => {
    const hidden = PLAYERS.find((p) => !p.devTraitRevealed)!;
    const known = PLAYERS.find((p) => p.devTraitRevealed)!;
    expect(formatPlayerCard(hidden)).toContain("Dev: ?");
    expect(formatPlayerCard(known)).not.toContain("Dev: ?");
  });
});

describe("trait effects on development", () => {
  const keys = Object.keys(OVERALL_WEIGHTS.CB);
  const after = (trait: DevTrait, age: number, rating: number, potential: number, years: number) => {
    let total = 0;
    for (let i = 0; i < 300; i++) {
      let p = createPlayer({ id: "x", firstName: "A", lastName: "B", position: "CB", age, ratings: Object.fromEntries(keys.map((k) => [k, rating])), potential, devTrait: trait });
      const rng = new Rng(`${trait}:${age}:${i}`);
      for (let y = 0; y < years; y++) p = developPlayer(rng, p);
      total += playerOverall(p);
    }
    return total / 300;
  };

  it("better traits grow young players faster", () => {
    const n = after("normal", 21, 55, 80, 2);
    const e = after("elite", 21, 55, 80, 2);
    expect(e).toBeGreaterThan(n + 3);
  });

  it("better traits decline more slowly", () => {
    expect(after("elite", 30, 75, 75, 3)).toBeGreaterThan(after("normal", 30, 75, 75, 3) + 1);
  });

  it("the growth curve orders the traits", () => {
    // A 10-point gap keeps every trait under the yearly growth cap.
    const g = (t: DevTrait) => expectedGrowth("WR", 22, 60, 70, t);
    expect(g("normal")).toBeLessThan(g("impact"));
    expect(g("impact")).toBeLessThan(g("star"));
    expect(g("star")).toBeLessThan(g("elite"));
  });
});
