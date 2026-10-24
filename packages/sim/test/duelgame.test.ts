import { describe, expect, it } from "vitest";
import { Rng, callingStyle, coachingReport, generateTeams, simulateGame, startCoachedGame, type CoachCall, type GamePrompt, type Team } from "../src/index.ts";

const [A, B] = generateTeams(new Rng("duelgame-test"), 2) as [Team, Team];

/** Echo the coaches on every prompt (the concept too, so it counts as an answer). */
const echo = (p: GamePrompt): CoachCall | undefined =>
  p.kind === "offense"
    ? { call: p.suggestion, ...(p.concepts && (p.suggestion === "run" || p.suggestion === "pass") ? { concept: p.concepts[p.suggestion] } : {}) }
    : p.kind === "defense"
      ? { concept: p.concept! }
      : p.kind === "timeout"
        ? { timeout: p.suggestion }
        : p.kind === "halftime"
          ? { halftime: p.suggestion }
          : { try: p.suggestion };

describe("a duel between two coaches", () => {
  it("asks both teams, each only for its own calls", () => {
    const game = startCoachedGame(A, B, "duel-g1", A.abbr, { rival: B.abbr });
    const asked = new Set<string>();
    const kinds = new Map<string, Set<string>>();
    while (game.prompt) {
      const p = game.prompt;
      asked.add(p.team);
      kinds.set(p.team, (kinds.get(p.team) ?? new Set()).add(p.kind));
      // On offense or defense, the prompt is for the team on that side of the ball.
      if (p.kind === "offense") expect(p.situation).toBeDefined();
      game.answer();
    }
    expect([...asked].sort()).toEqual([A.abbr, B.abbr].sort());
    for (const t of [A.abbr, B.abbr]) {
      expect(kinds.get(t)!.has("offense")).toBe(true);
      expect(kinds.get(t)!.has("defense")).toBe(true);
    }
    expect(game.result!.coached).toMatchObject({ team: A.abbr, rival: B.abbr });
  });

  it("keeps whose each call was, so each coach's calling style counts only their own", () => {
    const game = startCoachedGame(A, B, "duel-g3", A.abbr, { rival: B.abbr });
    while (game.prompt) game.answer(echo(game.prompt));
    const coached = game.result!.coached!;
    expect(coached.by).toHaveLength(coached.calls.length);
    const styleA = callingStyle([{ coached }], A.abbr);
    const styleB = callingStyle([{ coached }], B.abbr);
    const all = callingStyle([{ coached: { team: A.abbr, calls: coached.calls } }], A.abbr);
    // Between them, the two coaches made every call.
    expect(styleA.offenseCalls + styleB.offenseCalls).toBe(all.offenseCalls);
    expect(styleA.defenseCalls + styleB.defenseCalls).toBe(all.defenseCalls);
    expect(styleA.offenseCalls).toBeGreaterThan(0);
    expect(styleB.defenseCalls).toBeGreaterThan(0);
  });

  it("leaving every call to the coaches is the same game as nobody coaching", () => {
    const game = startCoachedGame(A, B, "duel-g2", A.abbr, { rival: B.abbr });
    while (game.prompt) game.answer(echo(game.prompt));
    expect(game.result!.plays).toEqual(simulateGame(A, B, "duel-g2").plays);
  });

  it("replays exactly from the merged calls", () => {
    const rng = new Rng("duel-picks");
    const game = startCoachedGame(A, B, "duel-g3", A.abbr, { rival: B.abbr });
    while (game.prompt) {
      const p = game.prompt;
      game.answer(p.kind === "offense" && p.options.includes("pass") ? { call: "pass", concept: rng.pick(["quick", "deep_shot", "screen"] as const) } : p.kind === "defense" ? { concept: rng.pick(["cover_2", "run_blitz", "man_press"] as const) } : undefined);
    }
    const replay = simulateGame(A, B, "duel-g3", { coach: A.abbr, rival: B.abbr, calls: game.result!.coached!.calls });
    expect(replay).toEqual(game.result);
    // And picking up mid-game from the calls so far lands on the same prompt.
    const half = game.result!.coached!.calls.slice(0, 40);
    const resumed = startCoachedGame(A, B, "duel-g3", A.abbr, { rival: B.abbr }, half);
    const again = startCoachedGame(A, B, "duel-g3", A.abbr, { rival: B.abbr });
    for (const c of half) again.answer(c ?? undefined);
    expect(resumed.prompt).toEqual(again.prompt);
  });

  it("each coach's report counts only their own calls", () => {
    const game = startCoachedGame(A, B, "duel-g4", A.abbr, { rival: B.abbr });
    while (game.prompt) {
      const p = game.prompt;
      // Only B changes anything: it calls Cover 4 on every defensive snap.
      game.answer(p.kind === "defense" && p.team === B.abbr && p.concept !== "cover_4" ? { concept: "cover_4" } : undefined);
    }
    const calls = game.result!.coached!.calls;
    const mine = coachingReport(A, B, "duel-g4", A.abbr, calls, { rival: B.abbr });
    const theirs = coachingReport(A, B, "duel-g4", B.abbr, calls, { rival: A.abbr });
    expect(mine.changed).toBe(0);
    expect(theirs.changed).toBeGreaterThan(10);
  });
});

import { duelAnswer, duelScheduledGame, duelView, generateLeague, generateSchedule, playWeek } from "../src/index.ts";

describe("a scheduled duel between friends", () => {
  const league = generateLeague("duel-league");
  const schedule = generateSchedule(league);
  const game = schedule.games.find((g) => g.week === 1)!;
  const [home, away] = [game.home, game.away];

  /** Both coaches call until `stop` (each the opposite of their coaches on defense). */
  function play(stop = Infinity) {
    let calls: Array<CoachCall | null> = [];
    for (let i = 0; i < stop; i++) {
      const g = duelScheduledGame(league, game, calls);
      const p = g.prompt;
      if (!p) break;
      const answer: CoachCall | undefined = p.kind === "offense" && p.options.includes("pass") ? { call: "pass", concept: p.team === home ? "quick" : "deep_shot" } : p.kind === "defense" ? { concept: p.team === home ? "cover_2" : "run_blitz" } : undefined;
      calls = duelAnswer(league, game, calls, p.team, answer);
    }
    return calls;
  }

  it("never shows a coach the other's call before they make theirs", () => {
    let checked = 0;
    const all = play();
    for (let n = 1; n < all.length; n++) {
      const sofar = all.slice(0, n);
      const g = duelScheduledGame(league, game, sofar);
      const p = g.prompt!;
      if (p.kind !== "defense") continue;
      // The defense coach's turn, right after the offense called the play.
      const view = duelView(league, game, sofar, p.team);
      expect(view.prompt?.kind).toBe("defense");
      expect(view.calls.length).toBeLessThan(sofar.length);
      // Replaying what they can see stops before the offense's call, on the same game so far.
      const seen = duelScheduledGame(league, game, view.calls);
      expect(seen.prompt!.team).not.toBe(p.team);
      expect(seen.prompt!.sofar.plays).toEqual(p.sofar.plays);
      // The offense coach sees everything (it's their own call).
      expect(duelView(league, game, sofar, seen.prompt!.team).calls).toEqual(sofar);
      expect(duelView(league, game, sofar, seen.prompt!.team).prompt).toBeNull();
      if (++checked >= 5) break;
    }
    expect(checked).toBe(5);
  }, 30_000);

  it("turns away a call out of turn", () => {
    const g = duelScheduledGame(league, game);
    const other = g.prompt!.team === home ? away : home;
    expect(() => duelAnswer(league, game, [], other, undefined)).toThrow("It isn't your call");
  });

  it("the week plays the duel exactly as the coaches called it", () => {
    const calls = play();
    const final = duelScheduledGame(league, game, calls);
    expect(final.prompt).toBeNull();
    const week = playWeek(league, schedule, 1, undefined, [{ game: game.id, team: home, rival: away, calls }]);
    const played = week.games.find((g) => g.summary.id === game.id)!;
    expect(played.result.plays).toEqual(final.result!.plays);
    expect(played.summary.coached).toMatchObject({ team: home, rival: away });
    // Half a duel: the coaches call the rest.
    const half = calls.slice(0, 60);
    const partial = playWeek(league, schedule, 1, undefined, [{ game: game.id, team: home, rival: away, calls: half }]).games.find((g) => g.summary.id === game.id)!;
    expect(partial.summary.coached!.calls.slice(0, 60)).toEqual(half);
  }, 30_000);
});
