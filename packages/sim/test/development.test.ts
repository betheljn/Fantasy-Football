import { describe, expect, it } from "vitest";
import {
  OVERALL_WEIGHTS,
  Rng,
  allTeams,
  createPlayer,
  developLeague,
  developPlayer,
  generateLeague,
  playerOverall,
  rollPotential,
  validateTeam,
  type Player,
  type Position,
} from "../src/index.ts";

const LEAGUE = generateLeague("dev-test");
const NEXT = developLeague(LEAGUE);

function prospect(position: Position, age: number, rating: number, potential: number): Player {
  const keys = Object.keys(OVERALL_WEIGHTS[position]);
  return createPlayer({ id: "p", firstName: "A", lastName: "B", position, age, ratings: Object.fromEntries(keys.map((k) => [k, rating])), potential });
}

/** Average overall after `years` offseasons, over many simulated careers. */
function arc(p: Player, years: number, n = 300): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const rng = new Rng(`arc:${p.position}:${p.age}:${i}`);
    let q = p;
    for (let y = 0; y < years; y++) q = developPlayer(rng, q);
    total += playerOverall(q);
  }
  return total / n;
}

describe("developPlayer", () => {
  it("ages a player one year and keeps ratings in range", () => {
    for (const t of allTeams(LEAGUE).slice(0, 5)) {
      for (const p of t.roster) {
        const q = developPlayer(new Rng(p.id), p);
        expect(q.age).toBe(p.age + 1);
        expect(q.id).toBe(p.id);
        expect(q.potential).toBe(p.potential);
        for (const v of Object.values(q.ratings)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(99);
        }
      }
    }
  });

  it("is deterministic per seed", () => {
    const p = prospect("WR", 23, 60, 80);
    expect(developPlayer(new Rng(1), p)).toEqual(developPlayer(new Rng(1), p));
  });

  it("young players with room to grow improve; veterans past their peak decline", () => {
    expect(arc(prospect("WR", 22, 60, 80), 3)).toBeGreaterThan(70);
    expect(arc(prospect("WR", 22, 60, 60), 3)).toBeLessThan(66);
    expect(arc(prospect("RB", 30, 75, 75), 3)).toBeLessThan(65);
  });

  it("peaks depend on position: running backs fade long before quarterbacks and kickers", () => {
    const rb = arc(prospect("RB", 31, 75, 75), 3);
    const qb = arc(prospect("QB", 31, 75, 75), 3);
    const k = arc(prospect("K", 31, 75, 75), 3);
    expect(qb).toBeGreaterThan(rb + 5);
    expect(k).toBeGreaterThan(qb);
  });

  it("growth mostly stops at potential", () => {
    const peaked = arc(prospect("CB", 22, 60, 70), 6);
    expect(peaked).toBeLessThan(74);
  });
});

describe("developLeague", () => {
  it("returns a new league a year older, leaving the original untouched", () => {
    const t0 = LEAGUE.teams["TX"]!;
    const t1 = NEXT.teams["TX"]!;
    expect(t1.roster.map((p) => p.id)).toEqual(t0.roster.map((p) => p.id));
    for (let i = 0; i < t0.roster.length; i++) expect(t1.roster[i]!.age).toBe(t0.roster[i]!.age + 1);
    expect(generateLeague("dev-test")).toEqual(LEAGUE);
  });

  it("rebuilds valid depth charts", () => {
    for (const t of allTeams(NEXT)) expect(validateTeam(t)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(developLeague(LEAGUE)).toEqual(NEXT);
  });
});

describe("rollPotential", () => {
  it("never sets potential below current overall, and gives the young more room", () => {
    const rng = new Rng(3);
    let young = 0;
    let old = 0;
    for (let i = 0; i < 500; i++) {
      const y = rollPotential(rng, prospect("LB", 21, 55, 0));
      const o = rollPotential(rng, prospect("LB", 30, 55, 0));
      expect(y.potential).toBeGreaterThanOrEqual(playerOverall(y));
      expect(o.potential).toBeGreaterThanOrEqual(playerOverall(o));
      young += y.potential - playerOverall(y);
      old += o.potential - playerOverall(o);
    }
    expect(young).toBeGreaterThan(old * 3);
  });
});
