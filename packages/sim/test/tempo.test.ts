import { describe, expect, it } from "vitest";
import { Rng, generateTeams, startCoachedGame, type CoachCall, type GamePrompt, type PlayEvent, type Team } from "../src/index.ts";

const teams = generateTeams(new Rng("tempo-test"), 6) as Team[];
const [A, B] = teams as [Team, Team];

/** Coach A through a game under `rules`, answering with `call` (undefined: the coaches'). */
function coach(seed: string, call: (p: GamePrompt) => CoachCall | undefined, rules = 10, home = A, away = B) {
  const g = startCoachedGame(home, away, seed, home.abbr, { rules });
  const prompts: GamePrompt[] = [];
  while (g.prompt) {
    prompts.push(g.prompt);
    g.answer(call(g.prompt));
  }
  return { g, prompts, result: g.result! };
}

const passes = (r: { plays: Array<{ event: PlayEvent }> }, team: string) =>
  r.plays.map((p) => p.event).filter((e): e is Extract<PlayEvent, { kind: "pass" }> => e.kind === "pass" && e.offense === team && e.outcome === "complete");

describe("clock calls (rules 10)", () => {
  it("a throw to the sideline mostly ends out of bounds, with little after the catch", () => {
    const side = (p: GamePrompt): CoachCall | undefined => (p.kind === "offense" && p.suggestion === "pass" ? { call: "pass", sideline: true } : undefined);
    const caught = [0, 1, 2, 3].flatMap((i) => passes(coach(`side-${i}`, side).result, A.abbr));
    const normal = [0, 1, 2, 3].flatMap((i) => passes(coach(`side-${i}`, () => undefined).result, A.abbr));
    const oob = (xs: typeof caught) => xs.filter((e) => e.outOfBounds).length / xs.length;
    const yac = (xs: typeof caught) => xs.reduce((n, e) => n + e.yardsAfterCatch, 0) / xs.length;
    expect(oob(caught)).toBeGreaterThan(0.5);
    expect(oob(normal)).toBeLessThan(0.25);
    expect(yac(caught)).toBeLessThan(yac(normal));
  });

  it("no-huddle snaps the ball sooner (more snaps a game), and replays the same", () => {
    const hurry = (p: GamePrompt): CoachCall | undefined => (p.kind === "offense" ? { call: p.suggestion, hurry: true } : undefined);
    const snaps = (r: { plays: Array<{ event: PlayEvent }> }) => r.plays.filter((p) => (p.event.kind === "run" || p.event.kind === "pass")).length;
    const fast = [0, 1, 2].map((i) => coach(`hurry-${i}`, hurry));
    const plain = [0, 1, 2].map((i) => coach(`hurry-${i}`, () => undefined));
    expect(fast.reduce((n, x) => n + snaps(x.result), 0)).toBeGreaterThan(plain.reduce((n, x) => n + snaps(x.result), 0) * 1.1);
    const again = startCoachedGame(A, B, "hurry-0", A.abbr, { rules: 10 }, fast[0]!.g.calls);
    expect(again.result).toEqual(fast[0]!.result);
  });

  it("turns away a sideline run, and clock calls under older rules", () => {
    const g = startCoachedGame(A, B, "tempo-bad", A.abbr, { rules: 10 });
    while (g.prompt && g.prompt.kind !== "offense") g.answer();
    expect(() => g.answer({ call: "run", sideline: true })).toThrow(/sideline/);
    const old = startCoachedGame(A, B, "tempo-old", A.abbr, { rules: 9 });
    while (old.prompt && old.prompt.kind !== "offense") old.answer();
    expect(() => old.answer({ call: (old.prompt as { suggestion: "run" }).suggestion, hurry: true })).toThrow(/clock calls/);
  });
});

describe("injuries you answer (rules 10)", () => {
  it("asks a coach who replaces a hurt player, puts him in that slot, and replays the same", () => {
    // Find a game where one of A's players gets hurt with a choice of replacements.
    let found: { seed: string; prompt: Extract<GamePrompt, { kind: "injury" }>; pick: string } | null = null;
    for (let i = 0; i < 40 && !found; i++) {
      const seed = `inj-${i}`;
      coach(seed, (p) => {
        if (!found && p.kind === "injury" && p.options.length >= 2) found = { seed, prompt: p, pick: p.options.find((id) => id !== p.suggestion)! };
        return undefined;
      });
    }
    expect(found).not.toBeNull();
    const f = found!;
    expect(f.prompt.team).toBe(A.abbr);
    expect(f.prompt.options).not.toContain(f.prompt.player);
    expect(f.prompt.options).toContain(f.prompt.suggestion);
    // Answer with someone other than the next man up.
    const { g } = coach(f.seed, (p) => (p.kind === "injury" && p.player === f.prompt.player ? { replace: f.pick } : undefined));
    // He takes the field after (at a position that lines up on scrimmage plays).
    if (!["K", "P", "LS"].includes(f.prompt.position)) {
      const later = g.result!.plays.slice(f.prompt.sofar.plays.length).map((x) => x.event);
      const on = later.some((e) => (e.kind === "run" || e.kind === "pass") && [...e.formation.offense.players, ...e.formation.defense.players].includes(f.pick));
      expect(on).toBe(true);
    }
    expect(startCoachedGame(A, B, f.seed, A.abbr, { rules: 10 }, g.calls).result).toEqual(g.result);
    // A bad pick is turned away.
    const h = startCoachedGame(A, B, f.seed, A.abbr, { rules: 10 });
    while (h.prompt && !(h.prompt.kind === "injury" && h.prompt.player === f.prompt.player)) h.answer();
    expect(() => h.answer({ replace: f.prompt.player })).toThrow(/players who can go in/);
  });

  it("never asks under rules 9", () => {
    for (let i = 0; i < 6; i++) for (const p of coach(`inj-old-${i}`, () => undefined, 9).prompts) expect(p.kind).not.toBe("injury");
  });
});
