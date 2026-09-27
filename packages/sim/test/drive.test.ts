import { describe, expect, it } from "vitest";
import {
  Rng,
  canKneelOut,
  describePlay,
  fieldGoalProbability,
  generateTeams,
  getPlayer,
  simulateDrive,
  simulatePunt,
  starters,
  type DriveInput,
  type DriveResult,
  type Team,
} from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("drive-test"), 2) as [Team, Team];

function input(over: Partial<DriveInput> = {}): DriveInput {
  return {
    offense: HOME,
    defense: AWAY,
    quarter: 1,
    clock: 900,
    yardline: 25,
    score: { [HOME.abbr]: 0, [AWAY.abbr]: 0 },
    timeouts: { [HOME.abbr]: 3, [AWAY.abbr]: 3 },
    ...over,
  };
}

function drives(n: number, over: Partial<DriveInput> = {}, seed = 1): DriveResult[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => simulateDrive(rng, input(over)));
}

describe("simulateDrive", () => {
  it("is deterministic for a given seed", () => {
    expect(drives(30, {}, 4)).toEqual(drives(30, {}, 4));
  });

  it("drive outcomes are internally consistent", () => {
    const starts: Array<Partial<DriveInput>> = [
      {},
      { yardline: 3 },
      { yardline: 90 },
      { quarter: 2, clock: 90 },
      { quarter: 4, clock: 100, score: { [HOME.abbr]: 10, [AWAY.abbr]: 14 } },
      { quarter: 4, clock: 200, score: { [HOME.abbr]: 21, [AWAY.abbr]: 14 } },
      { quarter: 1, clock: 40 },
    ];
    for (const [i, s] of starts.entries()) {
      for (const d of drives(1500, s, i)) {
        const off = d.points[HOME.abbr]!;
        const def = d.points[AWAY.abbr]!;
        switch (d.result) {
          case "touchdown":
            expect([6, 7, 8]).toContain(off);
            expect(d.next).toEqual({ kind: "kickoff", kickingTeam: HOME.abbr });
            break;
          case "field_goal":
            expect(off).toBe(3);
            break;
          case "safety":
            expect(def).toBe(2);
            expect(d.next).toEqual({ kind: "free_kick", kickingTeam: HOME.abbr });
            break;
          case "defensive_touchdown":
          case "punt_return_touchdown":
            expect([6, 7, 8]).toContain(def);
            break;
          case "end_of_half":
          case "end_of_game":
            expect(d.end.clock).toBe(0);
            expect(d.next).toEqual({ kind: "none" });
            break;
          default:
            expect(off + def).toBe(0);
            expect(d.next.kind).toBe("scrimmage");
        }
        if (d.next.kind === "scrimmage") {
          expect(d.next.team).toBe(AWAY.abbr);
          expect(d.next.yardline).toBeGreaterThan(0);
          expect(d.next.yardline).toBeLessThan(100);
        }
        for (const t of Object.values(d.timeouts)) expect(t).toBeGreaterThanOrEqual(0);

        // Game clock never runs backwards within a quarter.
        let q = d.start.quarter;
        let last = d.start.clock;
        for (const p of d.plays) {
          if (p.quarter !== q) {
            q = p.quarter;
            last = 900;
          }
          expect(p.clockAfter).toBeLessThanOrEqual(last);
          last = p.clockAfter;
        }
        expect(d.end.quarter).toBeGreaterThanOrEqual(d.start.quarter);
      }
    }
  });

  it("a drive in Q1 can roll over into Q2", () => {
    expect(drives(300, { quarter: 1, clock: 40 }).some((d) => d.end.quarter === 2)).toBe(true);
  });

  it("leading late with the defense out of timeouts, the offense kneels it out", () => {
    const d = simulateDrive(
      new Rng(1),
      input({ quarter: 4, clock: 100, score: { [HOME.abbr]: 24, [AWAY.abbr]: 17 }, timeouts: { [HOME.abbr]: 3, [AWAY.abbr]: 0 } }),
    );
    expect(d.plays.every((p) => p.event.kind === "kneel")).toBe(true);
    expect(d.result).toBe("end_of_game");
  });

  it("trailing late, the offense hurries: timeouts, spikes, and it never punts", () => {
    const late = drives(800, {
      quarter: 4,
      clock: 110,
      score: { [HOME.abbr]: 10, [AWAY.abbr]: 14 },
      timeouts: { [HOME.abbr]: 2, [AWAY.abbr]: 3 },
    });
    const kinds = late.flatMap((d) => d.plays.map((p) => p.event.kind));
    expect(kinds).toContain("timeout");
    expect(kinds).toContain("spike");
    expect(kinds).not.toContain("punt");
    expect(kinds).not.toContain("kneel");
    // Some of these should succeed.
    expect(late.some((d) => d.result === "touchdown")).toBe(true);
  });

  it("drive results are in a realistic range", () => {
    const ds = [...drives(3000, {}, 1), ...drives(3000, { offense: AWAY, defense: HOME }, 2)];
    const share = (r: string) => ds.filter((d) => d.result === r).length / ds.length;
    expect(share("touchdown")).toBeGreaterThan(0.12);
    expect(share("touchdown")).toBeLessThan(0.35);
    expect(share("punt")).toBeGreaterThan(0.3);
    expect(share("punt")).toBeLessThan(0.6);
    const plays = ds.reduce((s, d) => s + d.scrimmagePlays, 0) / ds.length;
    expect(plays).toBeGreaterThan(4.5);
    expect(plays).toBeLessThan(8);
  });

  it("every drive event has feed text", () => {
    const who = (id: string) => (id.startsWith(HOME.abbr) ? getPlayer(HOME, id) : getPlayer(AWAY, id));
    for (const d of drives(300, { quarter: 4, clock: 150, score: { [HOME.abbr]: 7, [AWAY.abbr]: 10 } })) {
      for (const p of d.plays) expect(describePlay(p.event, who)).not.toContain("?");
    }
  });
});

describe("kicking", () => {
  it("field goal odds fall with distance", () => {
    const k = starters(HOME, "K")[0]!;
    const probs = [20, 30, 40, 50, 60].map((d) => fieldGoalProbability(k, d));
    for (let i = 1; i < probs.length; i++) expect(probs[i]!).toBeLessThan(probs[i - 1]!);
    expect(probs[0]!).toBeGreaterThan(0.9);
    expect(probs[4]!).toBeLessThan(0.6);
  });

  it("punts hand the ball over in a sane spot", () => {
    const rng = new Rng(3);
    for (const yardline of [5, 30, 60]) {
      for (let i = 0; i < 500; i++) {
        const p = simulatePunt(rng, { offense: HOME, defense: AWAY, situation: { quarter: 1, clock: 500, down: 4, distance: 8, yardline } });
        expect(p.nextYardline).toBeGreaterThan(0);
        expect(p.nextYardline).toBeLessThanOrEqual(100);
        if (p.touchback) expect(p.nextYardline).toBe(20);
        expect(p.touchdown).toBe(p.nextYardline === 100);
      }
    }
  });
});

describe("canKneelOut", () => {
  const sit = (clock: number, down: 1 | 2 | 3 | 4 = 1) => ({ quarter: 4, clock, down, distance: 10, yardline: 50 });
  it("accounts for the defense's timeouts and the two-minute warning", () => {
    expect(canKneelOut(sit(100), 0)).toBe(true);
    expect(canKneelOut(sit(100), 3)).toBe(false);
    expect(canKneelOut(sit(40), 3)).toBe(false);
    expect(canKneelOut(sit(6), 3)).toBe(true); // three kneels at 2s each
    expect(canKneelOut(sit(150), 0)).toBe(false); // warning stops the clock at 2:00
    expect(canKneelOut(sit(30, 4), 0)).toBe(false); // would give the ball back
  });
});
