import { describe, expect, it } from "vitest";
import { FLOW, GameFlow, Rng, aiHalftime, bigPlay, expectSecondHalf, generateTeams, halfFilm, newDuelBook, recordCalls, simulateGame, startCoachedGame, type PlayEvent, type Team } from "../src/index.ts";

const [A, B] = generateTeams(new Rng("flow-test"), 2) as [Team, Team];
const film = (runShare: number | null, manShare: number | null) => ({ offenseCalls: 20, runShare, defenseCalls: 20, manShare });
const s = { quarter: 1, clock: 900, down: 1 as const, distance: 10, yardline: 30 };

describe("the game's flow (rules 9)", () => {
  it("reads the first half's film from the duel book", () => {
    const book = newDuelBook();
    for (let i = 0; i < 6; i++) recordCalls(book, B.abbr, A.abbr, s, i < 4 ? "inside_run" : "quick", "cover_3");
    for (let i = 0; i < 4; i++) recordCalls(book, A.abbr, B.abbr, s, "quick", i < 3 ? "man_press" : "cover_2");
    expect(halfFilm(book, B.abbr)).toEqual({ offenseCalls: 6, runShare: 4 / 6, defenseCalls: 4, manShare: 3 / 4 });
    expect(halfFilm(undefined, B.abbr)).toMatchObject({ runShare: null, manShare: null });
  });

  it("expects a team behind to throw and one ahead to run, and a man defense to stay man", () => {
    expect(aiHalftime(film(0.4, 0.45), -14).defense).toBe("pass");
    expect(aiHalftime(film(0.4, 0.45), 14).defense).toBe("run");
    expect(aiHalftime(film(0.9, 0.45), 0).defense).toBe("balanced"); // a first half's run share doesn't carry over
    expect(aiHalftime(film(0.4, 0.8), 0).offense).toBe("man");
    expect(aiHalftime(film(0.4, 0.1), 0).offense).toBe("zone");
    expect(expectSecondHalf(film(null, null), 0)).toEqual({ run: FLOW.typicalRun, man: FLOW.typicalMan });
  });

  it("pays a focus when it's aimed right, costs it when not, and evens out at the typical mix", () => {
    const f = new GameFlow();
    f.setPlan(B.abbr, { defense: "run", offense: "balanced" });
    const vsRun = f.swing(A, B, "inside_run", "cover_3");
    const vsPass = f.swing(A, B, "quick", "cover_3");
    expect(vsRun).toBeCloseTo(-FLOW.focus);
    expect(vsPass).toBeGreaterThan(0);
    // At the typical run share, the focus is worth nothing on average.
    expect(FLOW.typicalRun * vsRun + (1 - FLOW.typicalRun) * vsPass).toBeCloseTo(0);
    // A halftime adjuster gets more out of it.
    const adj = { ...B, staff: { hc: { abilities: ["halftime_adjuster"] } } } as unknown as Team;
    expect(f.swing(A, adj, "inside_run", "cover_3")).toBeCloseTo(-FLOW.focus * FLOW.adjuster);
  });

  it("swings momentum to whoever made a big play, fading over the next snaps", () => {
    const play = (over: Partial<PlayEvent>) => ({ kind: "pass", offense: A.abbr, defense: B.abbr, start: s, yardsGained: 6, firstDown: false, touchdown: false, turnover: null, penalty: null, ...over }) as PlayEvent;
    expect(bigPlay(play({ yardsGained: 40 }))).toBe(A.abbr);
    expect(bigPlay(play({ turnover: { type: "interception" } as never }))).toBe(B.abbr);
    expect(bigPlay(play({ start: { ...s, down: 3 } }))).toBe(B.abbr);
    expect(bigPlay(play({ start: { ...s, down: 3 }, firstDown: true }))).toBeNull();
    expect(bigPlay(play({}))).toBeNull();
    const f = new GameFlow();
    f.play(play({ touchdown: true }));
    const now = f.swing(A, B, undefined, undefined);
    expect(now).toBeCloseTo(FLOW.momentum);
    f.play(play({}));
    expect(f.swing(A, B, undefined, undefined)).toBeCloseTo(FLOW.momentum * FLOW.fade);
    expect(f.swing(B, A, undefined, undefined)).toBeLessThan(0);
  });

  it("asks a coach once at halftime (both coaches in a duel), keeps the answer, and replays it the same", () => {
    const g = startCoachedGame(A, B, "flow-coached", A.abbr, { rules: 9 });
    const asked: string[] = [];
    while (g.prompt) {
      const p = g.prompt;
      if (p.kind === "halftime") {
        asked.push(p.team);
        expect(p.situation.quarter).toBe(3);
        g.answer({ halftime: { defense: "pass", offense: "zone" } });
      } else g.answer();
    }
    expect(asked).toEqual([A.abbr]);
    expect(startCoachedGame(A, B, "flow-coached", A.abbr, { rules: 9 }, g.calls).result).toEqual(g.result);
    expect(() => {
      const h = startCoachedGame(A, B, "flow-bad", A.abbr, { rules: 9 });
      while (h.prompt && h.prompt.kind !== "halftime") h.answer();
      h.answer({ halftime: { defense: "everything", offense: "zone" } } as never);
    }).toThrow(/halftime plan/);

    const duel = startCoachedGame(A, B, "flow-duel", A.abbr, { rules: 9, rival: B.abbr });
    const both: string[] = [];
    while (duel.prompt) {
      if (duel.prompt.kind === "halftime") both.push(duel.prompt.team);
      duel.answer();
    }
    expect(both).toEqual([A.abbr, B.abbr].sort((x, y) => (x === duel.result!.home ? -1 : y === duel.result!.home ? 1 : 0)));
  });

  it("never pauses under rules 8, and plays the same game every time", () => {
    const g = startCoachedGame(A, B, "flow-old", A.abbr, { rules: 8 });
    while (g.prompt) {
      expect(g.prompt.kind).not.toBe("halftime");
      g.answer();
    }
    expect(simulateGame(A, B, "flow-same", { rules: 9 })).toEqual(simulateGame(A, B, "flow-same", { rules: 9 }));
  });
});
