import { describe, expect, it } from "vitest";
import { coachScheduledGame, simulateGame, withOut, type CoachCall } from "@dynasty/sim";
import { applyMove } from "../src/moves.ts";
import { forMember } from "../src/offseason.ts";
import { advance, openSeason, scheduleOf } from "../src/season.ts";
import { newLeagueState, type LeagueState } from "../src/state.ts";

const opened = openSeason({ ...newLeagueState("coach-test"), humans: { OH: "m1", TX: "m2" } });
const week1 = (s: LeagueState, team: string) => scheduleOf(s).games.find((g) => g.week === 1 && (g.home === team || g.away === team))!;

/** Coach Ohio's week 1 game on "the phone": go for it on every 4th down. */
function coachOhio(s: LeagueState): Array<CoachCall | null> {
  const game = coachScheduledGame(s.dynasty.league, week1(s, "OH"), "OH");
  while (game.prompt) {
    const p = game.prompt;
    game.answer(p.kind === "offense" && p.situation.down === 4 && (p.suggestion === "punt" || p.suggestion === "field_goal") ? { call: "run" } : undefined);
  }
  return game.calls;
}

describe("coaching online", () => {
  it("a friend's calls are stored, kept private, and the week is played with them", { timeout: 120_000 }, () => {
    const g = week1(opened, "OH");
    // (Ohio plays an AI team in week 1 here; games between friends are covered below.)
    expect(opened.humans[g.home === "OH" ? g.away : g.home]).toBeUndefined();
    const calls = coachOhio(opened);
    const r = applyMove(opened, "OH", { kind: "coach", game: g.id, calls });
    expect(r.problems).toEqual([]);
    // Texas can't see Ohio's calls.
    expect(forMember(r.state!, "TX").coaching).toBeUndefined();
    expect(forMember(r.state!, "OH").coaching?.OH?.calls).toEqual(calls);
    // The week: Ohio's game is the one coached on the phone.
    const after = advance(r.state!, new Set(["OH", "TX"])).state;
    const summary = after.progress.results.find((x) => x.id === g.id)!;
    expect(summary.coached).toEqual({ team: "OH", calls });
    expect(after.coaching).toBeUndefined();
    // And it replays exactly from the summary.
    const league = opened.dynasty.league;
    const sat = (abbr: string) => withOut(league.teams[abbr]!, new Set(summary.out?.[abbr] ?? []));
    const replay = simulateGame(sat(g.home), sat(g.away), summary.seed, { coach: "OH", calls, rules: summary.rules ?? 1 });
    expect(replay.score).toEqual({ [g.home]: summary.homeScore, [g.away]: summary.awayScore });
  });

  it("refuses someone else's game, games between friends, and too many calls", () => {
    const tx = week1(opened, "TX");
    expect(applyMove(opened, "OH", { kind: "coach", game: tx.id, calls: [null] }).problems).toHaveLength(1);
    const both = { ...opened, humans: { ...opened.humans, [week1(opened, "OH").home === "OH" ? week1(opened, "OH").away : week1(opened, "OH").home]: "m3" } };
    expect(applyMove(both, "OH", { kind: "coach", game: week1(opened, "OH").id, calls: [null] }).problems[0]).toContain("between friends");
    expect(applyMove(opened, "OH", { kind: "coach", game: week1(opened, "OH").id, calls: Array(601).fill(null) }).problems[0]).toContain("Too many");
  });
});
