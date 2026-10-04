import { describe, expect, it } from "vitest";
import {
  PACKAGES,
  PERSONNEL,
  Rng,
  assignCoverage,
  buildDefense,
  buildOffense,
  chooseDefense,
  chooseOffense,
  generateTeams,
  offensePlayers,
  pickBlitzers,
  receivers,
  simulateGame,
  simulatePass,
  simulateRun,
  type Coverage,
  type DefensePackage,
  type Formations,
  type PassPlayEvent,
  type Personnel,
  type Situation,
  type Team,
} from "../src/index.ts";

const [OFF, DEF] = generateTeams(new Rng("formation-test"), 2) as [Team, Team];
const FIRST_AND_TEN: Situation = { quarter: 1, clock: 600, down: 1, distance: 10, yardline: 35 };

function defense(pkg: DefensePackage, coverage: Coverage, blitz = 0, seed = 1) {
  return buildDefense(DEF, pkg, coverage, pickBlitzers(new Rng(seed), buildDefense(DEF, pkg, coverage), blitz));
}

describe("building formations", () => {
  it("puts the right 11 on the field for every personnel group", () => {
    for (const personnel of Object.keys(PERSONNEL) as Personnel[]) {
      const o = buildOffense(OFF, personnel, "shotgun");
      const ids = offensePlayers(o).map((p) => p.id);
      expect(ids).toHaveLength(11);
      expect(new Set(ids).size).toBe(11);
      const c = PERSONNEL[personnel];
      expect(o.rbs[0]!.position).toBe("RB");
      // The fullback in two-back sets is the best lead blocker, a back or a tight end.
      expect(o.rbs.every((p) => p.position === "RB" || p.position === "TE")).toBe(true);
      expect([o.rbs.length, o.tes.length, o.wrs.length]).toEqual([c.rb, c.te, c.wr]);
      expect(receivers(o)).toHaveLength(5);
    }
  });

  it("puts the right 11 on the field for every defensive package", () => {
    for (const pkg of Object.keys(PACKAGES) as DefensePackage[]) {
      const d = buildDefense(DEF, pkg, "cover_3");
      expect(d.all).toHaveLength(11);
      expect(new Set(d.all.map((p) => p.id)).size).toBe(11);
      const c = PACKAGES[pkg];
      expect([d.dl.length, d.lb.length, d.cb.length, d.s.length]).toEqual([c.dl, c.lb, c.cb, c.s]);
    }
  });

  it("blitzers come from the back seven and join the rush", () => {
    const d = defense("nickel", "cover_0", 2);
    expect(d.blitzers).toHaveLength(2);
    expect(d.rushers).toHaveLength(6);
    for (const b of d.blitzers) {
      expect(b.position).not.toBe("DL");
      expect(d.all.map((p) => p.id)).toContain(b.id);
    }
  });

  it("coverage covers everyone unless the defense sends more than it can spare", () => {
    const eleven = buildOffense(OFF, "11", "shotgun");
    const covered = assignCoverage(eleven, defense("nickel", "cover_3"));
    expect([...covered.values()].every((d) => d !== null)).toBe(true);
    // Goal-line front (5 DL) plus a two-man blitz leaves four to cover five.
    const spread = buildOffense(OFF, "10", "shotgun");
    const leaky = assignCoverage(spread, defense("goal_line", "cover_0", 2));
    expect([...leaky.values()].filter((d) => d === null)).toHaveLength(1);
    // Nobody covers two receivers.
    const ids = [...leaky.values()].filter((d) => d).map((d) => d!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

function play<T>(n: number, sim: (rng: Rng) => T, seed = 1): T[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => sim(rng));
}

describe("formation effects", () => {
  const ctx = (formations: Formations, situation = FIRST_AND_TEN) => ({ offense: OFF, defense: DEF, situation, formations });
  const eleven = buildOffense(OFF, "11", "shotgun");
  const passes = (d: ReturnType<typeof defense>, n = 12000) => play(n, (rng) => simulatePass(rng, ctx({ offense: eleven, defense: d })));

  it("light boxes give up more rushing yards than stacked ones", () => {
    const ypc = (d: ReturnType<typeof defense>) => {
      const runs = play(12000, (rng) => simulateRun(rng, ctx({ offense: eleven, defense: d })));
      return runs.reduce((s, e) => s + e.yardsGained, 0) / runs.length;
    };
    expect(ypc(defense("dime", "cover_4"))).toBeGreaterThan(ypc(defense("base", "cover_1")) + 0.4);
  });

  it("blitzing raises the sack rate", () => {
    const sackRate = (es: PassPlayEvent[]) => es.filter((e) => e.outcome === "sack").length / es.length;
    expect(sackRate(passes(defense("nickel", "cover_0", 2)))).toBeGreaterThan(sackRate(passes(defense("nickel", "cover_1"))) * 1.25);
  });

  it("two-deep shells take away the deep ball", () => {
    const deepComp = (es: PassPlayEvent[]) => {
      const deep = es.filter((e) => e.airYards >= 20 && e.outcome !== "sack");
      return deep.filter((e) => e.outcome === "complete").length / deep.length;
    };
    expect(deepComp(passes(defense("nickel", "cover_0", 2), 30000))).toBeGreaterThan(deepComp(passes(defense("nickel", "cover_4"), 30000)) + 0.08);
  });

  it("an uncovered receiver draws far more than his usual share of targets", () => {
    const spread = buildOffense(OFF, "10", "shotgun");
    const d = defense("goal_line", "cover_0", 2);
    const open = [...assignCoverage(spread, d).entries()].find(([, v]) => v === null)![0];
    const es = play(6000, (rng) => simulatePass(rng, ctx({ offense: spread, defense: d })));
    const thrown = es.filter((e) => e.outcome !== "sack");
    expect(thrown.filter((e) => e.target === open).length / thrown.length).toBeGreaterThan(0.3);
  });

  it("every run and pass records who was on the field", () => {
    const d = defense("nickel", "cover_1", 1);
    for (const e of [...passes(d, 300), ...play(300, (rng) => simulateRun(rng, ctx({ offense: eleven, defense: d })))]) {
      const f = e.formation;
      expect(new Set(f.offense.players).size).toBe(11);
      expect(new Set(f.defense.players).size).toBe(11);
      for (const id of f.defense.rushers) expect(f.defense.players).toContain(id);
      for (const id of f.defense.blitzers) expect(f.defense.rushers).toContain(id);
    }
  });
});

describe("scheme choices", () => {
  const choose = (situation: Situation, margin = 0, n = 3000) =>
    play(n, (rng) => {
      const offense = chooseOffense(rng, OFF, { situation, margin });
      return { offense, defense: chooseDefense(rng, DEF, { situation, margin }, offense) };
    });

  it("goal line brings heavy personnel and a goal-line defense", () => {
    const picks = choose({ quarter: 2, clock: 400, down: 3, distance: 1, yardline: 99 });
    expect(picks.filter((p) => ["13", "12", "21"].includes(p.offense.personnel)).length / picks.length).toBeGreaterThan(0.8);
    expect(picks.filter((p) => p.defense.package === "goal_line").length / picks.length).toBeGreaterThan(0.4);
  });

  it("3rd and long means spread sets, shotgun, and extra defensive backs", () => {
    const picks = choose({ quarter: 2, clock: 400, down: 3, distance: 12, yardline: 40 });
    expect(picks.every((p) => p.offense.personnel === "10" || p.offense.personnel === "11" || p.offense.personnel === "12")).toBe(true);
    expect(picks.filter((p) => p.offense.set === "shotgun").length / picks.length).toBeGreaterThan(0.9);
    expect(picks.filter((p) => p.defense.package === "nickel" || p.defense.package === "dime").length / picks.length).toBeGreaterThan(0.85);
  });

  it("prevent defense late: no blitz, nothing deep", () => {
    const picks = choose({ quarter: 4, clock: 60, down: 1, distance: 10, yardline: 30 }, -5);
    for (const p of picks) {
      expect(p.defense.blitzers).toHaveLength(0);
      expect(["cover_2", "cover_3", "cover_4"]).toContain(p.defense.coverage);
    }
  });

  it("full games mix personnel and coverages at realistic rates", () => {
    const counts: Record<string, number> = {};
    let snaps = 0;
    let blitzes = 0;
    let dropbacks = 0;
    for (let i = 0; i < 40; i++) {
      const [h, a] = generateTeams(new Rng(`scheme-${i}`), 2) as [Team, Team];
      for (const { event: e } of simulateGame(h, a, i).plays) {
        if (e.kind !== "run" && e.kind !== "pass") continue;
        snaps++;
        counts[e.formation.offense.personnel] = (counts[e.formation.offense.personnel] ?? 0) + 1;
        if (e.kind === "pass") {
          dropbacks++;
          if (e.formation.defense.blitzers.length) blitzes++;
        }
      }
    }
    expect(counts["11"]! / snaps).toBeGreaterThan(0.5);
    expect(counts["11"]! / snaps).toBeLessThan(0.75);
    expect(blitzes / dropbacks).toBeGreaterThan(0.15);
    expect(blitzes / dropbacks).toBeLessThan(0.4);
  });
});
