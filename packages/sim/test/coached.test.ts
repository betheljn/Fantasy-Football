import { describe, expect, it } from "vitest";
import {
  Rng,
  TIMEOUT_WINDOW,
  coachScheduledGame,
  coachingReport,
  generateLeague,
  generateSchedule,
  playWeek,
  generateTeams,
  halfSecondsLeft,
  packageOptions,
  personnelOptions,
  pointsForEvent,
  simulateGame,
  startCoachedGame,
  type CoachCall,
  type GamePrompt,
  type GameResult,
  type Team,
} from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("coached-test"), 2) as [Team, Team];

type Picker = (prompt: GamePrompt, rng: Rng) => CoachCall | undefined;

/** Play a coached game to the end, answering each prompt with `pick` (undefined = the coaches' call). */
function coach(seed: string, team: string, pick: Picker, home = HOME, away = AWAY): { result: GameResult; prompts: GamePrompt[] } {
  const rng = new Rng(`${seed}:picks`);
  const game = startCoachedGame(home, away, seed, team);
  const prompts: GamePrompt[] = [];
  while (game.prompt) {
    prompts.push(game.prompt);
    game.answer(pick(game.prompt, rng));
    if (prompts.length > 1000) throw new Error("runaway game");
  }
  return { result: game.result!, prompts };
}

/** Say exactly what the coaches would. */
const echo: Picker = (p) => {
  switch (p.kind) {
    case "offense":
      return { call: p.suggestion, personnel: p.formation.personnel, set: p.formation.set };
    case "defense":
      return { package: p.formation.package, coverage: p.formation.coverage, blitz: p.formation.blitzers.length };
    case "timeout":
      return { timeout: p.suggestion };
    case "try":
      return { try: p.suggestion };
  }
};

/** Any legal call. */
const random: Picker = (p, rng) => {
  switch (p.kind) {
    case "offense":
      return { call: rng.pick(p.options), ...(rng.chance(0.5) ? { personnel: rng.pick(p.personnelOptions), set: rng.pick(["shotgun", "under_center"] as const) } : {}) };
    case "defense":
      return { package: rng.pick(p.packageOptions), coverage: rng.pick(p.coverageOptions), blitz: rng.int(0, p.maxBlitz) };
    case "timeout":
      return { timeout: rng.chance(0.5) };
    case "try":
      return { try: rng.chance(0.5) ? "two_point" : "kick" };
  }
};

const withoutCoach = ({ coached: _c, ...rest }: GameResult) => rest;

describe("coached games", () => {
  it("pause only for the coached team's own calls", () => {
    const { prompts } = coach("pause", HOME.abbr, () => undefined);
    for (const p of prompts) expect(p.team).toBe(HOME.abbr);
    const kinds = new Set(prompts.map((p) => p.kind));
    expect(kinds).toEqual(new Set(["offense", "defense", "timeout", "try"]));
    for (const p of prompts) if (p.kind === "offense") expect(p.options).toContain(p.suggestion);
    // Timeouts come up only late in a half (or when the head coach would call one), with the clock running and one to spend.
    for (const p of prompts.filter((x) => x.kind === "timeout")) {
      expect(p.suggestion || halfSecondsLeft(p.situation) <= TIMEOUT_WINDOW).toBe(true);
      expect(p.clockRunning).toBe(true);
      expect(p.timeouts.own).toBeGreaterThan(0);
    }
  });

  it("taking (or repeating) every suggestion plays the same game as nobody coaching", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const plain = simulateGame(HOME, AWAY, seed);
      for (const team of [HOME.abbr, AWAY.abbr]) {
        expect(withoutCoach(coach(seed, team, () => undefined).result)).toEqual(plain);
        expect(withoutCoach(coach(seed, team, echo).result)).toEqual(plain);
      }
    }
  });

  it("the same calls give the same game, replayed or picked up halfway", () => {
    const { result: played } = coach("replay", HOME.abbr, random);
    const calls = played.coached!.calls;
    expect(simulateGame(HOME, AWAY, "replay", { coach: HOME.abbr, calls })).toEqual(played);
    const half = Math.floor(calls.length / 2);
    const resumed = startCoachedGame(HOME, AWAY, "replay", HOME.abbr, {}, calls.slice(0, half));
    for (const c of calls.slice(half)) resumed.answer(c ?? undefined);
    expect(resumed.result).toEqual(played);
    expect(withoutCoach(played)).not.toEqual(simulateGame(HOME, AWAY, "replay"));
  });

  it("any legal call keeps the game sound", () => {
    for (let i = 0; i < 25; i++) {
      const { result: g } = coach(`fuzz-${i}`, i % 2 ? HOME.abbr : AWAY.abbr, random);
      const total: Record<string, number> = { [HOME.abbr]: 0, [AWAY.abbr]: 0 };
      for (const p of g.plays) for (const [t, pts] of Object.entries(pointsForEvent(p.event))) total[t]! += pts;
      expect(total).toEqual(g.score);
      expect(g.final.quarter).toBeGreaterThanOrEqual(4);
    }
  });

  it("refuses a call that isn't open, or an answer to a different question", () => {
    const game = startCoachedGame(HOME, AWAY, "refuse", HOME.abbr);
    while (game.prompt && !(game.prompt.kind === "offense" && game.prompt.situation.down < 4)) game.answer();
    expect(game.prompt!.kind === "offense" && game.prompt!.options.includes("punt")).toBe(false);
    expect(() => game.answer({ call: "punt" })).toThrow();
    expect(() => game.answer({ timeout: true })).toThrow();
    // Turned away, the game is still waiting on the same snap, and carries on.
    expect(game.prompt!.kind).toBe("offense");
    game.answer({ call: "run" });
    while (game.prompt) game.answer();
    expect(game.result!.coached!.calls[0]).toEqual({ call: "run" });
  });

  it("lines up in the formation you call on offense", () => {
    const { result: g } = coach("formation", HOME.abbr, (p) => (p.kind === "offense" ? { call: p.options.includes("run") ? "run" : p.options[0]!, personnel: "21", set: "under_center" } : undefined));
    const mine = g.plays.map((p) => p.event).filter((e) => (e.kind === "run" || e.kind === "pass") && e.offense === HOME.abbr);
    expect(mine.length).toBeGreaterThan(30);
    for (const e of mine) if (e.kind === "run" || e.kind === "pass") expect([e.formation.offense.personnel, e.formation.offense.set]).toEqual(["21", "under_center"]);
  });

  it("lines up in the defense you call", () => {
    const { result: g, prompts } = coach("defense", HOME.abbr, (p) => (p.kind === "defense" ? { package: "nickel", coverage: "cover_0", blitz: 2 } : undefined));
    expect(prompts.filter((p) => p.kind === "defense").length).toBeGreaterThan(30);
    const theirs = g.plays.map((p) => p.event).filter((e) => (e.kind === "run" || e.kind === "pass") && e.offense === AWAY.abbr);
    for (const e of theirs) {
      if (e.kind !== "run" && e.kind !== "pass") continue;
      expect([e.formation.defense.package, e.formation.defense.coverage, e.formation.defense.blitzers.length]).toEqual(["nickel", "cover_0", 2]);
    }
  });

  it("calls your timeouts and your tries", () => {
    const { result: g, prompts } = coach("clock", HOME.abbr, (p) => (p.kind === "timeout" ? { timeout: true } : p.kind === "try" ? { try: "two_point" } : undefined));
    const asked = prompts.filter((p) => p.kind === "timeout").length;
    expect(asked).toBeGreaterThan(0);
    const mine = g.plays.map((p) => p.event).filter((e) => e.kind === "timeout" && e.team === HOME.abbr);
    expect(mine.length).toBeGreaterThan(0);
    const tries = g.plays.map((p) => p.event).filter((e) => e.kind === "conversion" && e.team === HOME.abbr);
    expect(tries.length).toBe(prompts.filter((p) => p.kind === "try").length);
    for (const e of tries) if (e.kind === "conversion") expect(e.method).toBe("two_point");
  });

  it("only offers personnel and packages the depth chart can fill", () => {
    expect(personnelOptions(HOME)).toEqual(["10", "11", "12", "13", "21"]);
    const thin: Team = { ...HOME, depthChart: { ...HOME.depthChart, TE: HOME.depthChart.TE.slice(0, 2), CB: HOME.depthChart.CB.slice(0, 3) } };
    expect(personnelOptions(thin)).not.toContain("13");
    expect(packageOptions(thin)).not.toContain("dime");
    const game = startCoachedGame(thin, AWAY, "thin", thin.abbr);
    while (game.prompt && game.prompt.kind !== "offense") game.answer();
    expect(() => game.answer({ call: "run", personnel: "13" })).toThrow();
  });

  it("hands a drive to the coordinator", () => {
    const game = startCoachedGame(HOME, AWAY, "auto", HOME.abbr);
    const first = game.prompt!.drive;
    game.answer();
    const before = game.calls.length;
    game.autoDrive();
    expect(game.prompt === null || game.prompt.drive !== first).toBe(true);
    expect(game.calls.slice(before).every((c) => c === null)).toBe(true);
  });

  it("shows the game so far at every pause, a true start of the final game", () => {
    const { result, prompts } = coach("sofar", HOME.abbr, random);
    let last = -1;
    for (const p of prompts) {
      const n = p.sofar.plays.length;
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
      expect(p.sofar.plays).toEqual(result.plays.slice(0, n));
      expect(p.sofar.score).toEqual(n ? result.plays[n - 1]!.score : { [HOME.abbr]: 0, [AWAY.abbr]: 0 });
    }
  });

  it("hands the rest of the half to the coaches", () => {
    const game = startCoachedGame(HOME, AWAY, "half", HOME.abbr);
    game.autoHalf();
    expect(game.prompt!.situation.quarter).toBeGreaterThanOrEqual(3);
    game.autoHalf();
    expect(game.prompt === null || game.prompt.situation.quarter >= 5).toBe(true);
  });

  it("plays the week with the game you coached, and keeps your calls on the result", () => {
    const league = generateLeague("coached-week");
    const schedule = generateSchedule(league);
    const g = schedule.games.find((x) => x.week === 1)!;
    const coached = coachScheduledGame(league, g, g.home);
    const rng = new Rng("week-picks");
    while (coached.prompt) coached.answer(random(coached.prompt, rng));
    const week = playWeek(league, schedule, 1, undefined, { game: g.id, team: g.home, calls: coached.calls });
    const mine = week.games.find((x) => x.summary.id === g.id)!;
    expect(mine.result).toEqual(coached.result);
    expect(mine.summary.coached).toEqual({ team: g.home, calls: coached.calls });
    // Everyone else's games are untouched.
    const plain = playWeek(league, schedule, 1);
    for (const x of plain.games) if (x.summary.id !== g.id) expect(week.games.find((y) => y.summary.id === x.summary.id)!.result).toEqual(x.result);
  });

  it("reports how your calls went", () => {
    const gamble: Picker = (p) => (p.kind === "offense" && p.situation.down === 4 && (p.suggestion === "punt" || p.suggestion === "field_goal") ? { call: "run" } : undefined);
    const { result } = coach("report", HOME.abbr, gamble);
    const report = coachingReport(HOME, AWAY, "report", HOME.abbr, result.coached!.calls);
    expect(report.calls).toBe(result.coached!.calls.length);
    expect(report.changed).toBe(result.coached!.calls.filter((c) => c !== null).length);
    expect(report.fourthDowns.tried).toBe(report.changed);
    expect(report.offense.coaches.plays).toBeGreaterThan(30);
    // Leaving everything to the coaches changes nothing.
    const none = coachingReport(HOME, AWAY, "report", HOME.abbr, coach("report", HOME.abbr, () => undefined).result.coached!.calls);
    expect(none.changed).toBe(0);
    expect(none.offense.mine.plays).toBe(0);
  });
});
