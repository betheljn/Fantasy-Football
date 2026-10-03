import { describe, expect, it } from "vitest";
import { Rng, generateTeams, personnelOptions, pointsForEvent, simulateGame, startCoachedGame, type CoachCall, type GameResult, type Personnel, type Team } from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("coached-test"), 2) as [Team, Team];

/** Play a coached game to the end, answering each prompt with `pick` (undefined = the coaches' call). */
function coach(seed: string, team: string, pick: (options: CoachCall["call"][], rng: Rng, groups: Personnel[]) => CoachCall | undefined): GameResult {
  const rng = new Rng(`${seed}:picks`);
  const game = startCoachedGame(HOME, AWAY, seed, team);
  let snaps = 0;
  while (game.prompt) {
    game.answer(pick(game.prompt.options, rng, game.prompt.personnelOptions));
    if (++snaps > 400) throw new Error("runaway game");
  }
  return game.result!;
}

const withoutCoach = ({ coached: _c, ...rest }: GameResult) => rest;

describe("coached games", () => {
  it("pause only for the coached team's snaps on offense", () => {
    const game = startCoachedGame(HOME, AWAY, "pause", HOME.abbr);
    expect(game.prompt).not.toBeNull();
    let n = 0;
    while (game.prompt) {
      expect(game.prompt.team).toBe(HOME.abbr);
      expect(game.prompt.options).toContain(game.prompt.suggestion);
      expect(game.prompt.options).toEqual(expect.arrayContaining(["run", "pass", "kneel"]));
      game.answer();
      n++;
    }
    // Every offensive call HOME made in the plain game was put to the coach.
    expect(n).toBeGreaterThan(40);
    expect(game.result!.coached!.calls).toHaveLength(n);
  });

  it("taking every suggestion plays the same game as nobody coaching", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const plain = simulateGame(HOME, AWAY, seed);
      expect(withoutCoach(coach(seed, HOME.abbr, () => undefined))).toEqual(plain);
      expect(withoutCoach(coach(seed, AWAY.abbr, () => undefined))).toEqual(plain);
    }
  });

  it("the same calls give the same game, replayed or picked up halfway", () => {
    const pick = (options: CoachCall["call"][], rng: Rng) => ({ call: rng.pick(options.filter((o) => o === "run" || o === "pass")) });
    const played = coach("replay", HOME.abbr, pick);
    const calls = played.coached!.calls;
    expect(simulateGame(HOME, AWAY, "replay", { coach: HOME.abbr, calls })).toEqual(played);
    // Close the app halfway: start again from the answers so far, then finish with the rest.
    const half = Math.floor(calls.length / 2);
    const resumed = startCoachedGame(HOME, AWAY, "replay", HOME.abbr, {}, calls.slice(0, half));
    for (const c of calls.slice(half)) resumed.answer(c ?? undefined);
    expect(resumed.result).toEqual(played);
    // Different calls, different game.
    expect(withoutCoach(played)).not.toEqual(simulateGame(HOME, AWAY, "replay"));
  });

  it("any legal call keeps the game sound", () => {
    for (let i = 0; i < 25; i++) {
      const g = coach(`fuzz-${i}`, i % 2 ? HOME.abbr : AWAY.abbr, (options, rng, groups) => ({
        call: rng.pick(options),
        ...(rng.chance(0.5) ? { personnel: rng.pick(groups), set: rng.pick(["shotgun", "under_center"] as const) } : {}),
      }));
      // The score is exactly the sum of the plays' points.
      const total: Record<string, number> = { [HOME.abbr]: 0, [AWAY.abbr]: 0 };
      for (const p of g.plays) for (const [t, pts] of Object.entries(pointsForEvent(p.event))) total[t]! += pts;
      expect(total).toEqual(g.score);
      expect(g.final.quarter).toBeGreaterThanOrEqual(4);
    }
  });

  it("refuses a call that isn't open", () => {
    const game = startCoachedGame(HOME, AWAY, "refuse", HOME.abbr);
    while (game.prompt && game.prompt.situation.down === 4) game.answer();
    expect(game.prompt!.options).not.toContain("punt");
    expect(() => game.answer({ call: "punt" })).toThrow();
  });

  it("lines up in the formation you call, and the defense sees it", () => {
    const g = coach("formation", HOME.abbr, (options) => ({ call: options.includes("run") ? "run" : options[0]!, personnel: "21", set: "under_center" }));
    const mine = g.plays.map((p) => p.event).filter((e) => (e.kind === "run" || e.kind === "pass") && e.offense === HOME.abbr && e.start.down > 0);
    expect(mine.length).toBeGreaterThan(30);
    for (const e of mine) if ("formation" in e && e.formation) expect([e.formation.offense.personnel, e.formation.offense.set]).toEqual(["21", "under_center"]);
  });

  it("only offers personnel the depth chart can fill", () => {
    expect(personnelOptions(HOME)).toEqual(["10", "11", "12", "13", "21"]);
    const thin: Team = { ...HOME, depthChart: { ...HOME.depthChart, TE: HOME.depthChart.TE.slice(0, 2) } };
    expect(personnelOptions(thin)).not.toContain("13");
    const game = startCoachedGame(thin, AWAY, "thin", thin.abbr);
    expect(() => game.answer({ call: "run", personnel: "13" })).toThrow();
  });

  it("hands a drive to the coordinator", () => {
    const game = startCoachedGame(HOME, AWAY, "auto", HOME.abbr);
    const first = game.prompt!.drive;
    game.answer({ call: "pass" });
    const before = game.calls.length;
    game.autoDrive();
    expect(game.prompt === null || game.prompt.drive !== first).toBe(true);
    expect(game.calls.slice(before).every((c) => c === null)).toBe(true);
  });
});
