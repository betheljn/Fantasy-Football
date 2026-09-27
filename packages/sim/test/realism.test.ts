import { describe, expect, it } from "vitest";
import {
  Rng,
  buildDepthChart,
  generateTeams,
  pointsForEvent,
  simulateConversion,
  simulateGame,
  simulateKickoff,
  simulatePunt,
  type Team,
} from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("realism-test"), 2) as [Team, Team];

describe("punt outcomes", () => {
  const rng = new Rng(11);
  const punts = Array.from({ length: 20000 }, (_, i) =>
    simulatePunt(rng, {
      offense: HOME,
      defense: AWAY,
      situation: { quarter: 1, clock: 600, down: 4, distance: 8, yardline: [4, 30, 55][i % 3]! },
    }),
  );

  it("include blocks, muffs and return fumbles at low rates", () => {
    const rate = (f: (p: (typeof punts)[number]) => boolean) => punts.filter(f).length / punts.length;
    expect(rate((p) => p.blocked)).toBeGreaterThan(0.001);
    expect(rate((p) => p.blocked)).toBeLessThan(0.015);
    expect(rate((p) => p.muffed)).toBeGreaterThan(0.001);
    expect(rate((p) => p.muffed)).toBeLessThan(0.03);
    expect(rate((p) => !!p.fumble && !p.muffed)).toBeGreaterThan(0);
  });

  it("are internally consistent", () => {
    for (const p of punts) {
      expect(p.nextYardline).toBeGreaterThan(0);
      expect(p.nextYardline).toBeLessThanOrEqual(100);
      if (p.blocked) expect(p.grossYards).toBe(0);
      if (p.safety) expect(p.blocked).toBe(true);
      if (p.recoveredByKickingTeam) expect(p.fumble?.lost).toBe(true);
      if (p.fumble?.lost) expect(p.recoveredByKickingTeam).toBe(true);
      expect(p.touchdown).toBe(!p.recoveredByKickingTeam && p.nextYardline === 100);
      const pts = pointsForEvent(p);
      if (p.touchdown) expect(pts).toEqual({ [AWAY.abbr]: 6 });
      else if (p.safety) expect(pts).toEqual({ [AWAY.abbr]: 2 });
      else expect(pts).toEqual({});
    }
  });
});

describe("kickoff return fumbles", () => {
  it("hand the ball to the kicking team where it came loose", () => {
    const rng = new Rng(5);
    let lost = 0;
    for (let i = 0; i < 20000; i++) {
      const k = simulateKickoff(rng, { kicking: HOME, receiving: AWAY, quarter: 1, clock: 900 });
      if (k.fumble?.lost) {
        lost++;
        expect(k.recoveredByKickingTeam).toBe(true);
        expect(k.touchdown).toBe(false);
        // Kicking team's perspective: returns end well short of the kicking team's own goal line.
        expect(k.nextYardline).toBeGreaterThan(0);
        expect(k.nextYardline).toBeLessThan(100);
        expect(k.fumble.recoveredBy).not.toBe(k.returner);
      }
    }
    expect(lost).toBeGreaterThan(0);
  });
});

describe("defensive two-point conversion", () => {
  it("a failed try returned the length of the field scores two for the defense", () => {
    // A hopeless QB throws plenty of interceptions, so a return shows up quickly.
    const roster = HOME.roster.map((p) => (p.position === "QB" ? { ...p, ratings: { ...p.ratings, throwAccuracy: 1, awareness: 1 } } : p));
    const bad: Team = { ...HOME, roster, depthChart: buildDepthChart(roster) };
    const rng = new Rng(3);
    let found = false;
    for (let i = 0; i < 20000 && !found; i++) {
      const c = simulateConversion(rng, bad, AWAY, 4, 60, -2); // down 2 after the TD: goes for two
      expect(c.method).toBe("two_point");
      if (c.defensiveReturn) {
        found = true;
        expect(c.success).toBe(false);
        expect(pointsForEvent(c)).toEqual({ [AWAY.abbr]: 2 });
      }
    }
    expect(found).toBe(true);
  });
});

describe("home-field advantage", () => {
  it("home teams outscore the same matchup at a neutral site", () => {
    let home = 0;
    let neutral = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const [a, b] = generateTeams(new Rng(`hfa-test-${i}`), 2) as [Team, Team];
      for (const [h, w] of [[a, b], [b, a]] as const) {
        const g = simulateGame(h, w, i);
        const gn = simulateGame(h, w, i, { neutralSite: true });
        home += g.score[h.abbr]! - g.score[w.abbr]!;
        neutral += gn.score[h.abbr]! - gn.score[w.abbr]!;
      }
    }
    const edge = (home - neutral) / (2 * n);
    expect(edge).toBeGreaterThan(0.5);
    expect(edge).toBeLessThan(4);
  });
});

describe("roster ages", () => {
  it("average mid-20s with a veteran tail", () => {
    const ages = generateTeams(new Rng("ages"), 20).flatMap((t) => t.roster.map((p) => p.age));
    const mean = ages.reduce((s, a) => s + a, 0) / ages.length;
    expect(mean).toBeGreaterThan(24.5);
    expect(mean).toBeLessThan(27.5);
    expect(ages.filter((a) => a >= 30).length / ages.length).toBeGreaterThan(0.1);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(21);
  });
});
