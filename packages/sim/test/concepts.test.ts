import { describe, expect, it } from "vitest";
import {
  DEFENSE_CONCEPTS,
  OFFENSE_CONCEPTS,
  OFFENSE_CONCEPT_INFO,
  Rng,
  conceptMatchup,
  generateTeams,
  simulatePass,
  simulateRun,
  type DefenseConcept,
  type OffenseConcept,
  type PlayContext,
  type ScrimmagePlayEvent,
  type Situation,
  type Team,
} from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("concepts-test"), 2) as [Team, Team];
const SIT: Situation = { quarter: 1, clock: 900, down: 1, distance: 10, yardline: 25 };
const ctx = (offense?: OffenseConcept, defense?: DefenseConcept, rules = 4): PlayContext => ({
  offense: HOME,
  defense: AWAY,
  situation: SIT,
  rules,
  ...(offense && defense ? { concepts: { offense, defense } } : {}),
});
const sample = (n: number, sim: typeof simulateRun | typeof simulatePass, c: PlayContext, seed = 7): ScrimmagePlayEvent[] => {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => sim(rng, c));
};
const mean = (es: ScrimmagePlayEvent[]) => es.reduce((s, e) => s + e.yardsGained, 0) / es.length;
const completion = (es: ScrimmagePlayEvent[]) => es.filter((e) => e.kind === "pass" && e.outcome === "complete").length / es.filter((e) => e.kind === "pass" && e.outcome !== "sack").length;

describe("the counter table", () => {
  it("rates every offensive concept against every defensive one, -2 to +2; every concept wins and loses somewhere", () => {
    for (const o of OFFENSE_CONCEPTS) {
      const edges = DEFENSE_CONCEPTS.map((d) => conceptMatchup(o, d).edge);
      for (const e of edges) expect(Math.abs(e)).toBeLessThanOrEqual(2);
      expect(Math.max(...edges)).toBeGreaterThan(0);
      expect(Math.min(...edges)).toBeLessThan(0);
    }
    for (const d of DEFENSE_CONCEPTS.filter((x) => x !== "base")) {
      const edges = OFFENSE_CONCEPTS.map((o) => conceptMatchup(o, d).edge);
      expect(Math.min(...edges)).toBeLessThan(0); // every defense stops something
      expect(Math.max(...edges)).toBeGreaterThan(0); // and is beaten by something
    }
    expect(conceptMatchup("deep_shot", "cover_2").why).toMatch(/safety/i);
  });
});

describe("concepts in the engines (rules 4)", () => {
  it("the right call gains more on the ground than the wrong one", () => {
    expect(mean(sample(1500, simulateRun, ctx("inside_run", "cover_4")))).toBeGreaterThan(mean(sample(1500, simulateRun, ctx("inside_run", "run_blitz"))) + 1);
  });

  it("an inside call runs between the tackles; an outside call to the edge", () => {
    for (const e of sample(200, simulateRun, ctx("inside_run", "base"))) expect(e.direction).toBe("middle");
    for (const e of sample(200, simulateRun, ctx("outside_run", "base"))) expect(e.direction).not.toBe("middle");
  });

  it("passes go to the called depth and complete more against the right coverage", () => {
    const deep = sample(400, simulatePass, ctx("deep_shot", "base"));
    for (const e of deep) if (e.kind === "pass" && e.outcome !== "sack") expect(e.airYards).toBeGreaterThanOrEqual(15);
    expect(completion(sample(2000, simulatePass, ctx("deep_shot", "run_blitz")))).toBeGreaterThan(completion(sample(2000, simulatePass, ctx("deep_shot", "cover_4"))) + 0.05);
  });

  it("a quick release is sacked less than a deep drop", () => {
    const sacks = (c: OffenseConcept) => sample(3000, simulatePass, ctx(c, "base")).filter((e) => e.kind === "pass" && e.outcome === "sack").length;
    expect(sacks("quick")).toBeLessThan(sacks("deep_shot"));
  });

  it("are ignored before rules 4 and without calls: the same plays as ever", () => {
    expect(sample(100, simulateRun, ctx("inside_run", "run_blitz", 3))).toEqual(sample(100, simulateRun, ctx(undefined, undefined, 3)));
    expect(sample(100, simulatePass, ctx("deep_shot", "cover_4", 3))).toEqual(sample(100, simulatePass, ctx(undefined, undefined, 3)));
  });

  it("every concept is a run or a pass with what the engines need", () => {
    for (const o of OFFENSE_CONCEPTS) {
      const info = OFFENSE_CONCEPT_INFO[o];
      expect(info.kind === "run" ? info.direction : info.band).toBeDefined();
    }
  });
});
