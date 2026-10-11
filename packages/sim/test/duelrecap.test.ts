import { describe, expect, it } from "vitest";
import { Rng, duelRecap, generateTeams, isNullified, revealCall, simulateGame, startCoachedGame, type PlayEvent, type Team } from "../src/index.ts";

const [A, B] = generateTeams(new Rng("duelrecap-test"), 2) as [Team, Team];

describe("the reveal", () => {
  const base = simulateGame(A, B, "reveal").plays.find((p) => p.event.kind === "run")!.event as Extract<PlayEvent, { kind: "run" }>;

  it("names both calls, who won the call and why", () => {
    const r = revealCall({ ...base, calls: { offense: "inside_run", defense: "run_blitz" } })!;
    expect(r).toMatchObject({ edge: -2, winner: "defense" });
    expect(r.text).toBe("Inside run vs Run blitz: the defense won the call outright. The run blitz shot the gap the run was going to.");
    expect(revealCall({ ...base, calls: { offense: "quick", defense: "cover_3" } })!.text).toBe("Quick game vs Cover 3: the offense won the call.");
    expect(revealCall({ ...base, calls: { offense: "quick", defense: "base" } })!.winner).toBe("even");
  });

  it("has nothing to reveal without calls (older rules) or off a scrimmage play", () => {
    expect(revealCall({ ...base, calls: undefined })).toBeNull();
    const kick = simulateGame(A, B, "reveal").plays.find((p) => p.event.kind === "punt")!.event;
    expect(revealCall(kick)).toBeNull();
  });
});

describe("the duel recap", () => {
  const game = simulateGame(A, B, "recap");

  it("accounts for every snap on both sides of the ball", () => {
    const r = duelRecap(game, A.abbr)!;
    const snaps = (offense: string) => game.plays.filter((p) => (p.event.kind === "run" || p.event.kind === "pass") && p.event.offense === offense && !isNullified(p.event)).length;
    expect(r.offense.snaps).toBe(snaps(A.abbr));
    expect(r.defense.snaps).toBe(snaps(B.abbr));
    for (const s of [r.offense, r.defense]) {
      expect(s.won + s.lost + s.even).toBe(s.snaps);
      expect(s.byCall.won.plays + s.byCall.lost.plays + s.byCall.even.plays).toBe(s.snaps);
      expect(s.concepts.reduce((t, c) => t + c.plays, 0)).toBe(s.snaps);
    }
    expect(r.headline).toMatch(/\d+%/);
    expect(r.best?.reveal).toBeDefined();
  });

  it("is the other side of the opponent's recap", () => {
    const mine = duelRecap(game, A.abbr)!;
    const theirs = duelRecap(game, B.abbr)!;
    expect(mine.offense.won).toBe(theirs.defense.lost);
    expect(mine.defense.won).toBe(theirs.offense.lost);
  });

  it("calls won go better than calls lost, across games", () => {
    const line = { won: { y: 0, n: 0 }, lost: { y: 0, n: 0 } };
    for (let i = 0; i < 30; i++) {
      const r = duelRecap(simulateGame(A, B, `recap-${i}`), A.abbr)!;
      for (const k of ["won", "lost"] as const) {
        line[k].y += r.offense.byCall[k].yards;
        line[k].n += r.offense.byCall[k].plays;
      }
    }
    expect(line.won.y / line.won.n).toBeGreaterThan(line.lost.y / line.lost.n + 1);
  });

  it("tells you when they caught on to your favourite call", () => {
    const game = startCoachedGame(A, B, "recap-read", A.abbr);
    while (game.prompt) {
      const p = game.prompt;
      game.answer(p.kind === "offense" && (p.suggestion === "run" || p.suggestion === "pass") ? { call: "run", concept: "inside_run" } : undefined);
    }
    const r = duelRecap(game.result!, A.abbr)!;
    expect(r.offense.concepts[0]!.label).toBe("Inside run");
    expect(r.reads[0]).toMatch(/^Inside run was your most-called play \(100% of snaps\)/);
  });

  it("is null for a game without calls", () => {
    expect(duelRecap(simulateGame(A, B, "recap", { rules: 3 }), A.abbr)).toBeNull();
  });
});
