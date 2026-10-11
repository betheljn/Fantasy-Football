import { describe, expect, it } from "vitest";
import {
  DEFENSE_CONCEPT_INFO,
  OFFENSE_CONCEPT_INFO,
  Rng,
  conceptMatchup,
  checkAnswer,
  duelBucket,
  generateStaff,
  generateTeams,
  simulateGame,
  startCoachedGame,
  type CoachCall,
  type GamePrompt,
  type GameResult,
  type Team,
  type TeamStaff,
} from "../src/index.ts";

const [A, B] = generateTeams(new Rng("duelcall-test"), 2) as [Team, Team];
const BASE: TeamStaff = generateStaff(new Rng("duel-staff"), "X");
const staffed = (t: Team, oc = 58, dc = 58): Team => ({
  ...t,
  staff: {
    ...BASE,
    hc: (({ calls: _calls, ...hc }) => hc)(BASE.hc),
    oc: { ...BASE.oc, scheme: "Pro Style", playCalling: oc },
    dc: { ...BASE.dc, scheme: "Multiple", playCalling: dc },
  } as TeamStaff,
});

const scrimmage = (g: GameResult) => g.plays.map((p) => p.event).filter((e) => e.kind === "run" || e.kind === "pass");

function coach(home: Team, away: Team, seed: string, team: string, pick: (p: GamePrompt) => CoachCall | undefined): GameResult {
  const game = startCoachedGame(home, away, seed, team);
  let n = 0;
  while (game.prompt) {
    game.answer(pick(game.prompt));
    if (++n > 1000) throw new Error("runaway game");
  }
  return game.result!;
}

describe("the play duel's AI callers (rules 4)", () => {
  it("both sides call a concept on every run and pass, matching the play", () => {
    const g = simulateGame(A, B, "duel-1");
    expect(g.rules).toBe(4);
    const plays = scrimmage(g);
    expect(plays.length).toBeGreaterThan(80);
    for (const e of plays) {
      expect(e.calls).toBeDefined();
      expect(OFFENSE_CONCEPT_INFO[e.calls!.offense].kind).toBe(e.kind);
      // The defense lines up in its call's shell.
      expect(e.formation.defense.coverage).toBe(DEFENSE_CONCEPT_INFO[e.calls!.defense].coverage);
    }
  });

  it("older rules have no calls", () => {
    for (const e of scrimmage(simulateGame(A, B, "duel-1", { rules: 3 }))) expect(e.calls).toBeUndefined();
  });

  it("is deterministic", () => {
    expect(simulateGame(A, B, "duel-2")).toEqual(simulateGame(A, B, "duel-2"));
  });

  it("better play callers win more of the calls", () => {
    const edge = (sharp: boolean) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const g = simulateGame(staffed(A, sharp ? 95 : 25, sharp ? 95 : 25), staffed(B), `duel-q${i}`);
        for (const e of scrimmage(g)) {
          const mine = e.offense === A.abbr;
          const x = conceptMatchup(e.calls!.offense, e.calls!.defense).edge;
          sum += mine ? x : -x;
          n++;
        }
      }
      return sum / n;
    };
    expect(edge(true)).toBeGreaterThan(edge(false) + 0.1);
  }, 30_000);

  it("reads your tendencies: always run inside and the defense loads up for it", () => {
    let early = 0, earlyBlitz = 0, late = 0, lateBlitz = 0;
    for (let i = 0; i < 12; i++) {
      const g = coach(A, B, `duel-t${i}`, A.abbr, (p) => (p.kind === "offense" && (p.suggestion === "run" || p.suggestion === "pass") ? { call: "run", concept: "inside_run" } : undefined));
      for (const p of g.plays) {
        const e = p.event;
        if ((e.kind !== "run" && e.kind !== "pass") || e.offense !== A.abbr || !e.calls) continue;
        if (duelBucket(e.start) !== "early") continue;
        const blitz = e.calls.defense === "run_blitz" ? 1 : 0;
        if (p.quarter <= 1) (early++, (earlyBlitz += blitz));
        else if (p.quarter >= 3) (late++, (lateBlitz += blitz));
      }
    }
    expect(lateBlitz / late).toBeGreaterThan(earlyBlitz / early + 0.1);
  }, 30_000);

  it("takes a coached concept, and checks it fits the call", () => {
    const g = coach(A, B, "duel-c", A.abbr, (p) => (p.kind === "offense" && (p.suggestion === "run" || p.suggestion === "pass") ? { call: "pass", concept: "deep_shot" } : p.kind === "defense" ? { concept: "cover_4" } : undefined));
    for (const e of scrimmage(g)) {
      if (e.offense === A.abbr && e.calls) expect(e.calls.offense).toBe("deep_shot");
      if (e.defense === A.abbr && e.calls) {
        expect(e.calls.defense).toBe("cover_4");
        expect(e.formation.defense.coverage).toBe("cover_4");
        expect(e.formation.defense.blitzers).toHaveLength(0);
      }
    }
    const game = startCoachedGame(A, B, "duel-c", A.abbr);
    while (game.prompt && game.prompt.kind !== "offense") game.answer();
    const prompt = game.prompt!;
    if (prompt.kind !== "offense") throw new Error("no offense prompt");
    expect(prompt.concepts).toBeDefined();
    expect(() => checkAnswer(prompt, { call: "run", concept: "screen" })).toThrow();
    expect(() => checkAnswer(prompt, { call: "pass", concept: "screen" })).not.toThrow();
  }, 30_000);

  it("taking every suggestion plays the same game as nobody coaching", () => {
    const echo = (p: GamePrompt): CoachCall | undefined =>
      p.kind === "offense"
        ? { call: p.suggestion, ...(p.concepts && (p.suggestion === "run" || p.suggestion === "pass") ? { concept: p.concepts[p.suggestion] } : {}) }
        : p.kind === "defense"
          ? { concept: p.concept! }
          : undefined;
    const coached = coach(A, B, "duel-e", B.abbr, echo);
    const plain = simulateGame(A, B, "duel-e");
    expect(coached.plays).toEqual(plain.plays);
  });
});
