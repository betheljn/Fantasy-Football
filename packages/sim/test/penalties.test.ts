import { describe, expect, it } from "vitest";
import {
  Rng,
  assessLiveBallPenalty,
  buildBoxScore,
  describePlay,
  enforce,
  generateTeams,
  isNullified,
  lookupFor,
  pointsForEvent,
  rollPreSnapPenalty,
  simulateGame,
  simulatePass,
  simulateRun,
  type PlayContext,
  type ScrimmagePlayEvent,
  type Situation,
  type Team,
} from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("penalty-test"), 2) as [Team, Team];
const sit = (over: Partial<Situation> = {}): Situation => ({ quarter: 1, clock: 600, down: 1, distance: 10, yardline: 25, ...over });

describe("enforce", () => {
  it("walks off yards and keeps the line to gain", () => {
    // 1st & 10 at own 25, false start: 1st & 15 at the 20.
    expect(enforce(sit(), "offense", 5).result).toEqual({ yardline: 20, down: 1, distance: 15, firstDown: false });
    // 3rd & 2 at the 40, offside: 5 yards reaches the line to gain.
    expect(enforce(sit({ down: 3, distance: 2, yardline: 40 }), "defense", 5).result.firstDown).toBe(true);
    // Automatic first down even when short of the line to gain.
    expect(enforce(sit({ down: 3, distance: 15 }), "defense", 5, { automaticFirstDown: true }).result).toEqual({
      yardline: 30,
      down: 1,
      distance: 10,
      firstDown: true,
    });
  });

  it("applies half the distance to the goal", () => {
    // Holding at own 6: half the distance, to the 3.
    expect(enforce(sit({ yardline: 6 }), "offense", 10)).toEqual({ result: { yardline: 3, down: 1, distance: 13, firstDown: false }, yards: 3 });
    // Offside on 3rd & goal from the 4: half the distance, to the 2.
    const r = enforce(sit({ yardline: 96, down: 3, distance: 4 }), "defense", 5).result;
    expect(r.yardline).toBe(98);
    expect(r.distance).toBe(2);
  });
});

function sample(n: number, seed: number, over: Partial<Situation> = {}): ScrimmagePlayEvent[] {
  const rng = new Rng(seed);
  const ctx: PlayContext = { offense: HOME, defense: AWAY, situation: sit(over) };
  return Array.from({ length: n }, (_, i) => assessLiveBallPenalty(rng, ctx, (i % 2 ? simulatePass : simulateRun)(rng, ctx)));
}

describe("live-ball penalties", () => {
  const events = [...sample(20000, 1), ...sample(20000, 2, { down: 3, distance: 6, yardline: 60 }), ...sample(10000, 3, { yardline: 95, distance: 5 })];
  const flagged = events.filter((e) => e.penalty);

  it("happen at a realistic rate", () => {
    expect(flagged.length / events.length).toBeGreaterThan(0.02);
    expect(flagged.length / events.length).toBeLessThan(0.08);
  });

  it("nullified plays score nothing; declined and after-play fouls leave the play intact", () => {
    for (const e of flagged) {
      const p = e.penalty!;
      if (isNullified(e)) {
        expect(pointsForEvent(e)).toEqual({});
        expect(p.result).not.toBeNull();
      }
      if (!p.accepted) {
        expect(p.result).toBeNull();
        expect(p.yards).toBe(0);
      }
      if (p.playStands) {
        expect(p.accepted).toBe(true);
        expect(e.touchdown || e.turnover || e.fumble).toBeFalsy();
      }
      if (p.result) {
        expect(p.result.yardline).toBeGreaterThanOrEqual(1);
        expect(p.result.yardline).toBeLessThanOrEqual(99);
      }
    }
  });

  it("the fouled team makes the sensible choice", () => {
    for (const e of flagged) {
      const p = e.penalty!;
      const byDefense = p.team === AWAY.abbr;
      // Defense never takes a penalty that erases its own takeaway.
      if (!byDefense && e.turnover) expect(p.accepted).toBe(false);
      // Offense never gives back a touchdown for a defensive foul.
      if (byDefense && e.touchdown) expect(p.accepted).toBe(false);
      // A defensive foul on an interception gives the offense the ball back.
      if (byDefense && e.turnover && !p.playStands) expect(p.accepted).toBe(true);
      // DPI in the end zone goes to the 1.
      if (p.type === "defensive_pass_interference" && p.accepted && e.kind === "pass" && e.start.yardline + e.airYards >= 100) {
        expect(p.result!.yardline).toBe(99);
      }
    }
  });
});

describe("pre-snap penalties", () => {
  it("road teams false start more than home teams", () => {
    const rate = (homeField: number) => {
      const rng = new Rng(9);
      const ctx: PlayContext = { offense: HOME, defense: AWAY, situation: sit(), homeField };
      let n = 0;
      for (let i = 0; i < 40000; i++) if (rollPreSnapPenalty(rng, ctx)?.penalty.type === "false_start") n++;
      return n;
    };
    expect(rate(-1)).toBeGreaterThan(rate(1) * 1.3);
  });
});

describe("penalties in games", () => {
  const games = Array.from({ length: 150 }, (_, i) => {
    const [h, a] = generateTeams(new Rng(`pen-game-${i}`), 2) as [Team, Team];
    return { g: simulateGame(h, a, i), h, a };
  });

  it("average about five accepted penalties per team", () => {
    let total = 0;
    for (const { g } of games) {
      const box = buildBoxScore(g);
      total += box.teams[g.home]!.penalties + box.teams[g.away]!.penalties;
    }
    const perTeam = total / (games.length * 2);
    expect(perTeam).toBeGreaterThan(3.5);
    expect(perTeam).toBeLessThan(7.5);
  });

  it("show up in the feed", () => {
    const { g, h, a } = games[0]!;
    const who = lookupFor(h, a);
    const lines = g.plays.map((p) => describePlay(p.event, who));
    expect(lines.some((l) => l.includes("PENALTY on"))).toBe(true);
    for (const l of lines) expect(l).not.toContain("?");
  });
});
