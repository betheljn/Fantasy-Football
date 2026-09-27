import { describe, expect, it } from "vitest";
import {
  POSITIONS,
  ROSTER_MAX,
  ROSTER_TEMPLATE,
  Rng,
  generateTeams,
  playerOverall,
  starters,
  validateTeam,
} from "../src/index.ts";

describe("Rng", () => {
  it("is deterministic per seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
  });

  it("accepts string seeds and stays in range", () => {
    const r = new Rng("season-2031");
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("normal() has roughly the requested mean and sd", () => {
    const r = new Rng(7);
    const xs = Array.from({ length: 20000 }, () => r.normal(60, 9));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(60, 0);
    expect(sd).toBeCloseTo(9, 0);
  });
});

describe("generateTeams", () => {
  it("same seed produces identical teams; different seed does not", () => {
    const a = generateTeams(new Rng(2031), 2);
    const b = generateTeams(new Rng(2031), 2);
    const c = generateTeams(new Rng(2032), 2);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it("produces valid, full rosters with distinct identities", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const [home, away] = generateTeams(new Rng(seed), 2);
      for (const team of [home!, away!]) {
        expect(validateTeam(team)).toEqual([]);
        expect(team.roster).toHaveLength(ROSTER_MAX);
        for (const pos of POSITIONS) {
          expect(team.roster.filter((p) => p.position === pos)).toHaveLength(ROSTER_TEMPLATE[pos]);
        }
      }
      expect(home!.abbr).not.toBe(away!.abbr);
      expect(home!.nickname).not.toBe(away!.nickname);
    }
  });

  it("ratings are position-shaped: OL are stronger and slower than CBs", () => {
    const [team] = generateTeams(new Rng(5), 1);
    const avg = (pos: "OL" | "CB", key: "speed" | "strength") => {
      const ps = team!.roster.filter((p) => p.position === pos);
      return ps.reduce((s, p) => s + p.ratings[key], 0) / ps.length;
    };
    expect(avg("OL", "strength")).toBeGreaterThan(avg("CB", "strength") + 10);
    expect(avg("CB", "speed")).toBeGreaterThan(avg("OL", "speed") + 20);
  });

  it("overalls land in a sensible spread and starters beat backups", () => {
    const [team] = generateTeams(new Rng(11), 1);
    const ovrs = team!.roster.map(playerOverall);
    expect(Math.min(...ovrs)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...ovrs)).toBeLessThanOrEqual(99);
    const starterIds = new Set(POSITIONS.flatMap((pos) => starters(team!, pos).map((p) => p.id)));
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const starterAvg = mean(team!.roster.filter((p) => starterIds.has(p.id)).map(playerOverall));
    const backupAvg = mean(team!.roster.filter((p) => !starterIds.has(p.id)).map(playerOverall));
    expect(starterAvg).toBeGreaterThan(backupAvg + 5);
  });
});
