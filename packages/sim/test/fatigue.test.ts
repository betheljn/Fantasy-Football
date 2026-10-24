import { describe, expect, it } from "vitest";
import { FATIGUE, FatigueTracker, Rng, generateTeams, simulateGame, startCoachedGame, type PlayEvent, type Team } from "../src/index.ts";

const [A, B] = generateTeams(new Rng("fatigue-test"), 2) as [Team, Team];

/** A run play with these players on the field. */
const run = (off: string[], def: string[], rusher = off[0]!): PlayEvent => ({ kind: "run", rusher, formation: { offense: { players: off }, defense: { players: def } } }) as unknown as PlayEvent;

describe("fatigue (rules 8)", () => {
  const dl = A.depthChart.DL;
  const cb = A.depthChart.CB;

  it("drains players on the field (the trenches and the ball carrier most), and the sideline gives it back", () => {
    const f = new FatigueTracker({ [A.abbr]: A, [B.abbr]: B });
    f.play(run([B.depthChart.RB[0]!], [dl[0]!, cb[0]!]), 1);
    expect(f.energyOf(dl[0]!)).toBeLessThan(f.energyOf(cb[0]!));
    expect(100 - f.energyOf(B.depthChart.RB[0]!)).toBeGreaterThan(100 - f.energyOf(cb[0]!));
    const after = f.energyOf(dl[0]!);
    f.play(run([], []), 1);
    expect(f.energyOf(dl[0]!)).toBeCloseTo(Math.min(100, after + FATIGUE.recover));
  });

  it("sits a tired rotating player until he's rested, and plays him a step slower meanwhile", () => {
    const f = new FatigueTracker({ [A.abbr]: A, [B.abbr]: B });
    const starter = dl[0]!;
    for (let i = 0; i < 40 && !f.resting(A.abbr, starter); i++) f.play(run([], [starter]), 1);
    expect(f.resting(A.abbr, starter)).toBe(true);
    const view = f.view(A);
    // Moved behind the fresh linemen.
    expect(view.depthChart.DL.indexOf(starter)).toBeGreaterThan(view.depthChart.DL.indexOf(dl[1]!));
    const tired = view.roster.find((p) => p.id === starter)!;
    const fresh = A.roster.find((p) => p.id === starter)!;
    expect(tired.ratings.speed).toBeLessThan(fresh.ratings.speed);
    // Back once rested, not the moment he's over the line.
    while (f.energyOf(starter) < FATIGUE.tired + 2) f.play(run([], []), 1);
    expect(f.resting(A.abbr, starter)).toBe(true);
    while (f.energyOf(starter) < FATIGUE.rested) f.play(run([], []), 1);
    expect(f.resting(A.abbr, starter)).toBe(false);
  });

  it("gives energy back at quarter breaks, and more at halftime", () => {
    const f = new FatigueTracker({ [A.abbr]: A, [B.abbr]: B });
    for (let i = 0; i < 15; i++) f.play(run([], [dl[0]!, dl[1]!]), 1);
    const q1 = f.energyOf(dl[0]!);
    f.play(run([], [dl[1]!]), 2);
    expect(f.energyOf(dl[0]!)).toBeCloseTo(Math.min(100, q1 + FATIGUE.quarterBreak + FATIGUE.recover));
    for (let i = 0; i < 15; i++) f.play(run([], [dl[0]!]), 2);
    const q2 = f.energyOf(dl[0]!);
    f.play(run([], [dl[1]!]), 3);
    expect(f.energyOf(dl[0]!)).toBeCloseTo(Math.min(100, q2 + FATIGUE.halftime + FATIGUE.recover));
  });

  it("lets a person keep a tired starter in or rest a fresh one", () => {
    const f = new FatigueTracker({ [A.abbr]: A, [B.abbr]: B });
    for (let i = 0; i < 40 && !f.resting(A.abbr, dl[0]!); i++) f.play(run([], [dl[0]!]), 1);
    f.override(A.abbr, { keep: [dl[0]!], rest: [cb[0]!, B.depthChart.QB[0]!] });
    const view = f.view(A);
    expect(view.depthChart.DL[0]).toBe(dl[0]);
    expect(view.depthChart.CB.at(-1)).toBe(cb[0]);
    // (Another team's players are ignored.)
    expect(f.resting(B.abbr, B.depthChart.QB[0]!)).toBe(false);
  });

  it("rotates the defensive line in a game, plays the same every time, and leaves rules 7 games alone", () => {
    const shares = (rules: number) => {
      const r = simulateGame(A, B, "fatigue-game", { rules });
      const snaps = r.plays.filter((p) => (p.event.kind === "run" || p.event.kind === "pass") && p.event.offense === B.abbr);
      const on = snaps.filter((p) => (p.event as Extract<PlayEvent, { kind: "run" }>).formation.defense.players.includes(dl[0]!)).length;
      return { r, share: on / snaps.length };
    };
    const eight = shares(8);
    expect(eight.share).toBeLessThan(0.85);
    expect(shares(7).share).toBeGreaterThan(0.9);
    expect(simulateGame(A, B, "fatigue-game", { rules: 8 })).toEqual(eight.r);
  });

  it("shows a coach their players' energy, and takes their lineup calls (replayed the same)", () => {
    const g = startCoachedGame(A, B, "fatigue-coached", A.abbr, { rules: 8 });
    let rested = false;
    let sawEnergy = false;
    const restWho = A.depthChart.RB[0]!;
    while (g.prompt) {
      const p = g.prompt;
      if ((p.kind === "offense" || p.kind === "defense") && p.energy) sawEnergy = true;
      if (p.kind === "offense" && !rested) {
        g.answer({ call: p.suggestion, lineup: { rest: [restWho] } });
        rested = true;
      } else g.answer();
    }
    expect(sawEnergy).toBe(true);
    // After the call, the rested back never carried again.
    const at = g.result!.plays.findIndex((p) => p.event.kind === "run" || p.event.kind === "pass");
    const later = g.result!.plays.slice(at + 2).filter((p) => p.event.kind === "run" && p.event.offense === A.abbr);
    expect(later.some((p) => (p.event as Extract<PlayEvent, { kind: "run" }>).rusher === restWho)).toBe(false);
    const again = startCoachedGame(A, B, "fatigue-coached", A.abbr, { rules: 8 }, g.calls);
    expect(again.result).toEqual(g.result);
    // No lineup calls under older rules.
    const old = startCoachedGame(A, B, "fatigue-old", A.abbr, { rules: 7 });
    while (old.prompt && old.prompt.kind !== "offense") old.answer();
    expect(() => old.answer({ call: (old.prompt as { suggestion: "run" }).suggestion, lineup: { rest: [restWho] } })).toThrow(/lineup/);
  });
});
