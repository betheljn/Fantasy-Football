import { describe, expect, it } from "vitest";
import {
  Rng,
  buildDepthChart,
  describePlay,
  generateTeams,
  getPlayer,
  simulatePass,
  simulateRun,
  type PlayContext,
  type ScrimmagePlayEvent,
  type Ratings,
  type Situation,
  type Team,
} from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("plays-test"), 2) as [Team, Team];
const FIRST_AND_TEN: Situation = { quarter: 1, clock: 900, down: 1, distance: 10, yardline: 25 };

function ctx(situation: Situation = FIRST_AND_TEN, offense = HOME, defense = AWAY): PlayContext {
  return { offense, defense, situation };
}

function sample(n: number, sim: typeof simulateRun | typeof simulatePass, c: PlayContext, seed = 1): ScrimmagePlayEvent[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => sim(rng, c));
}

/** Copy of a team with some ratings overridden for one position. */
function withRatings(team: Team, pos: string, patch: Partial<Ratings>): Team {
  const roster = team.roster.map((p) => (p.position === pos ? { ...p, ratings: { ...p.ratings, ...patch } } : p));
  return { ...team, roster, depthChart: buildDepthChart(roster) };
}

const meanYards = (events: ScrimmagePlayEvent[]) => events.reduce((s, e) => s + e.yardsGained, 0) / events.length;

describe("single plays", () => {
  it("are deterministic for a given seed", () => {
    expect(sample(50, simulateRun, ctx(), 9)).toEqual(sample(50, simulateRun, ctx(), 9));
    expect(sample(50, simulatePass, ctx(), 9)).toEqual(sample(50, simulatePass, ctx(), 9));
  });

  it("do not mutate the situation", () => {
    const sit = { ...FIRST_AND_TEN };
    sample(100, simulatePass, ctx(sit));
    expect(sit).toEqual(FIRST_AND_TEN);
  });

  for (const [name, sim] of [["run", simulateRun], ["pass", simulatePass]] as const) {
    it(`${name} events are internally consistent`, () => {
      for (const yardline of [1, 25, 50, 95, 99]) {
        const sit: Situation = { quarter: 2, clock: 300, down: 3, distance: Math.min(10, 100 - yardline), yardline };
        for (const e of sample(3000, sim, ctx(sit), yardline)) {
          expect(e.endYardline).toBe(sit.yardline + e.yardsGained);
          expect(e.endYardline).toBeGreaterThanOrEqual(0);
          expect(e.endYardline).toBeLessThanOrEqual(100);
          expect(e.touchdown).toBe(e.endYardline === 100);
          expect(e.safety).toBe(e.endYardline === 0);
          expect(e.firstDown).toBe(!e.touchdown && !e.safety && !e.turnover && e.yardsGained >= sit.distance);
          expect(e.duration).toBeGreaterThan(0);
          if (e.turnover) {
            expect(e.turnover.endYardline).toBeGreaterThan(0);
            expect(e.turnover.endYardline).toBeLessThanOrEqual(100);
            expect(e.turnover.touchdown).toBe(e.turnover.endYardline === 100);
            expect(e.stopReason === "turnover" || e.stopReason === "touchdown").toBe(true);
            expect(getPlayer(AWAY, e.turnover.by)).toBeDefined();
          }
          if (e.fumble?.lost) expect(e.turnover?.type).toBe("fumble");
          if (e.tackler) expect(getPlayer(AWAY, e.tackler)).toBeDefined();
          if (e.kind === "run") expect(getPlayer(HOME, e.rusher)).toBeDefined();
          if (e.kind === "pass") {
            expect(getPlayer(HOME, e.passer).position).toBe("QB");
            if (e.outcome === "incomplete") expect(e.stopReason).toBe("incomplete");
            if (e.outcome === "sack") expect(e.yardsGained).toBeLessThanOrEqual(0);
            if (e.outcome === "complete") expect(e.yardsGained).toBe(e.airYards + e.yardsAfterCatch);
          }
        }
      }
    });
  }

  it("goal-line plays can score and cannot overshoot the end zone", () => {
    const sit: Situation = { quarter: 4, clock: 60, down: 1, distance: 2, yardline: 98 };
    const events = [...sample(500, simulateRun, ctx(sit)), ...sample(500, simulatePass, ctx(sit))];
    expect(events.some((e) => e.touchdown)).toBe(true);
    expect(Math.max(...events.map((e) => e.yardsGained))).toBe(2);
  });

  it("better run blocking vs worse run defense produces more rushing yards", () => {
    const strongOL = withRatings(HOME, "OL", { runBlockPower: 90, runBlockFinesse: 90 });
    const weakDL = withRatings(AWAY, "DL", { blockShedding: 40, tackle: 40, playRecognition: 40 });
    const base = meanYards(sample(4000, simulateRun, ctx()));
    const boosted = meanYards(sample(4000, simulateRun, ctx(FIRST_AND_TEN, strongOL, weakDL)));
    expect(boosted).toBeGreaterThan(base + 1);
  });

  it("an elite pass rush against weak protection gets more sacks", () => {
    const sackRate = (o: Team, d: Team) =>
      sample(4000, simulatePass, ctx(FIRST_AND_TEN, o, d)).filter((e) => e.kind === "pass" && e.outcome === "sack").length / 4000;
    const leaky = withRatings(HOME, "OL", { passBlockPower: 40, passBlockFinesse: 40 });
    const rushers = withRatings(AWAY, "DL", { powerMoves: 92, finesseMoves: 92 });
    expect(sackRate(leaky, rushers)).toBeGreaterThan(sackRate(HOME, AWAY) * 1.5);
  });

  it("an accurate QB completes more passes", () => {
    const compRate = (o: Team) => {
      const att = sample(4000, simulatePass, ctx(FIRST_AND_TEN, o)).filter((e) => e.kind === "pass" && e.outcome !== "sack");
      return att.filter((e) => e.kind === "pass" && e.outcome === "complete").length / att.length;
    };
    expect(compRate(withRatings(HOME, "QB", { shortAccuracy: 95, mediumAccuracy: 95, deepAccuracy: 95 }))).toBeGreaterThan(
      compRate(withRatings(HOME, "QB", { shortAccuracy: 45, mediumAccuracy: 45, deepAccuracy: 45 })) + 0.08,
    );
  });

  it("describePlay produces a sentence for every event", () => {
    const who = (id: string) => (id.startsWith(HOME.abbr) ? getPlayer(HOME, id) : getPlayer(AWAY, id));
    for (const e of [...sample(300, simulateRun, ctx()), ...sample(300, simulatePass, ctx())]) {
      const text = describePlay(e, who);
      expect(text).toMatch(/\.$/);
      expect(text).not.toContain("?");
    }
  });
});
