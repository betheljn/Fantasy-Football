import { describe, expect, it } from "vitest";
import { duelScheduledGame, type CoachCall } from "@dynasty/sim";
import { duelFor, handDuel, makeDuelCall } from "../src/duels.ts";
import { applyMove } from "../src/moves.ts";
import { forMember } from "../src/offseason.ts";
import { advance, openSeason, scheduleOf } from "../src/season.ts";
import { newLeagueState, type LeagueState } from "../src/state.ts";

// Two friends who meet in week 1: Ohio and its opener's opponent.
const base = newLeagueState("duel-test");
const game = scheduleOf(base).games.find((g) => g.week === 1 && (g.home === "OH" || g.away === "OH"))!;
const RIVAL = game.home === "OH" ? game.away : game.home;
const opened = openSeason({ ...base, humans: { OH: "m1", [RIVAL]: "m2" } });

/** Whoever's turn it is calls (a pass with a concept on offense, a concept on defense). */
function step(s: LeagueState): LeagueState {
  const view = [duelFor(s, "OH")!, duelFor(s, RIVAL)!].find((v) => v.prompt)!;
  const team = view.prompt!.team;
  const p = view.prompt!;
  const call: CoachCall | null = p.kind === "offense" && p.options.includes("pass") ? { call: "pass", concept: team === "OH" ? "quick" : "play_action" } : p.kind === "defense" ? { concept: team === "OH" ? "cover_4" : "run_blitz" } : null;
  const r = makeDuelCall(s, team, view.made, call);
  if (!r.state) throw new Error(r.problem);
  return r.state;
}

describe("duels between friends online", () => {
  it("shows each friend only their own call, in turn", () => {
    const oh = duelFor(opened, "OH")!;
    const rival = duelFor(opened, RIVAL)!;
    expect(oh.game).toBe(game.id);
    expect(oh.turn).toBe(rival.turn);
    // Exactly one of them is waited on.
    expect([oh.prompt, rival.prompt].filter(Boolean)).toHaveLength(1);
    const waiting = oh.prompt ? "OH" : RIVAL;
    const other = waiting === "OH" ? RIVAL : "OH";
    expect(makeDuelCall(opened, other, 0, null).problem).toBe("It isn't your call");
    expect(makeDuelCall(opened, waiting, 3, null).problem).toContain("moved on");
  });

  it("the defense never sees the offense's call before making its own", () => {
    let s = opened;
    let checked = 0;
    for (let i = 0; i < 200 && checked < 3; i++) {
      s = step(s);
      for (const team of ["OH", RIVAL]) {
        const v = duelFor(s, team)!;
        if (v.prompt?.kind !== "defense") continue;
        const all = s.duels![game.id]!.calls;
        // The offense's call is the last one made; the defense sees everything before it.
        expect(v.calls).toEqual(all.slice(0, all.length - 1));
        expect(duelFor(s, team === "OH" ? RIVAL : "OH")!.calls).toEqual(all);
        checked++;
      }
    }
    expect(checked).toBe(3);
  });

  it("a friend can hand the rest of the game to their coaches; the other keeps calling", () => {
    let s = opened;
    const handed = handDuel(s, "OH", "game");
    expect(handed.problem).toBeNull();
    s = handed.state!;
    // From here only the rival is ever asked.
    for (let i = 0; i < 30; i++) {
      expect(duelFor(s, "OH")!.prompt).toBeNull();
      if (duelFor(s, RIVAL)!.over) break;
      s = step(s);
    }
  });

  it("locks roster moves and trades once the duel is under way", () => {
    const s = step(opened);
    const oh = s.dynasty.league.teams.OH!;
    expect(applyMove(s, "OH", { kind: "depth", pos: "QB", ids: oh.depthChart.QB }).problems[0]).toContain("duel is under way");
    expect(applyMove(opened, "OH", { kind: "depth", pos: "QB", ids: oh.depthChart.QB }).problems).toEqual([]);
  });

  it("the week plays the duel with both friends' calls, then clears it", { timeout: 120_000 }, () => {
    let s = opened;
    for (let i = 0; i < 25; i++) s = step(s);
    const calls = s.duels![game.id]!.calls;
    // The save each friend downloads never holds the duel.
    expect(forMember(s, "OH").duels).toBeUndefined();
    const after = advance(s, new Set(["OH", RIVAL])).state;
    const summary = after.progress.results.find((x) => x.id === game.id)!;
    expect(summary.coached).toMatchObject({ team: game.home, rival: game.away });
    expect(summary.coached!.calls.slice(0, calls.length)).toEqual(calls);
    expect(after.duels).toBeUndefined();
    // The rest of the game was the coaches': the same as finishing it with nobody calling.
    const g = duelScheduledGame(s.dynasty.league, game, calls);
    while (g.prompt) g.answer();
    expect(summary.homeScore).toBe(g.result!.score[game.home]);
  });
});
