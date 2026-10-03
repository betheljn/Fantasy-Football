import { describe, expect, it } from "vitest";
import { replayTeams, simulateGame } from "@dynasty/sim";
import { stagedOffseason } from "@dynasty/sim";
import { forMember, recordChoice } from "../src/offseason.ts";
import { advance, nextStep, openSeason, playedSeason, scheduleOf } from "../src/season.ts";
import { newLeagueState, type LeagueState } from "../src/state.ts";

const humans = { OH: "m1", TX: "m2" };
const opened = openSeason({ ...newLeagueState("season-test"), humans });

describe("online season", () => {
  it("plays a week; the AI covers friends who didn't ready up, and never trades their players", { timeout: 60_000 }, () => {
    const a = advance(opened, new Set(["OH"]));
    expect(a.summary).toMatchObject({ kind: "week", week: 1, covered: ["TX"] });
    expect(a.state.weeksPlayed).toBe(1);
    expect(a.state.progress.covered).toEqual([{ week: 1, teams: ["TX"] }]);
    // The state passed in is untouched, and the same choices replay the same week.
    expect(opened.weeksPlayed).toBe(0);
    expect(opened.progress.results).toHaveLength(0);
    const again = advance(opened, new Set(["OH"]));
    expect(again.state.progress.results).toEqual(a.state.progress.results);
    for (const t of [...opened.progress.trades, ...a.state.progress.trades]) expect(t.teams.some((x) => x === "OH" || x === "TX")).toBe(false);
  });

  it("runs a whole season: weeks, playoffs, offseason into the next season", { timeout: 300_000 }, () => {
    let s: LeagueState = opened;
    const weeks = scheduleOf(s).weeks;
    const steps: string[] = [];
    for (let i = 0; i < weeks; i++) {
      const r = advance(s, new Set(Object.keys(humans)));
      s = r.state;
      steps.push(r.summary.kind);
    }
    expect(s.weeksPlayed).toBe(weeks);
    expect(s.progress.results.filter((g) => g.home === "OH" || g.away === "OH")).toHaveLength(20);
    expect(nextStep(s)).toEqual({ kind: "playoffs" });
    const po = advance(s, new Set());
    expect(po.summary.kind).toBe("playoffs");
    s = po.state;
    expect(s.progress.playoffs?.champion).toBeTruthy();
    expect(nextStep(s)).toEqual({ kind: "offseason", stage: "open" });
    // Draft week ends; then a stage at a time, Ohio making some calls and Texas none.
    s = advance(s, new Set()).state;
    expect(nextStep(s)).toEqual({ kind: "offseason", stage: "staff" });
    const order = ["staff", "hire", "resign", "draft", "freeagency", "cuts"] as const;
    let off = { state: s, summary: null as unknown as ReturnType<typeof advance>["summary"] };
    for (const [i, stage] of order.entries()) {
      expect(nextStep(off.state)).toEqual({ kind: "offseason", stage });
      if (stage === "resign") off.state = recordChoice(off.state, "OH", { stage, keep: [] }).state!;
      if (stage === "draft") {
        const late = [...stagedOffseason(off.state.dynasty, playedSeason(off.state), off.state.offseason!.choices, "draft").state!.draftClass.prospects].reverse();
        off.state = recordChoice(off.state, "OH", { stage, board: [late[0]!.player.id] }).state!;
        // Texas's copy of the save doesn't show Ohio's board; Ohio's does.
        expect(forMember(off.state, "TX").offseason!.choices.boards).toEqual({});
        expect(forMember(off.state, "OH").offseason!.choices.boards?.OH).toEqual([late[0]!.player.id]);
      }
      if (stage === "freeagency") {
        // The draft went by Ohio's board: its first pick is the one prospect on it.
        const { draft } = stagedOffseason(off.state.dynasty, playedSeason(off.state), off.state.offseason!.choices, "freeagency");
        expect(draft!.picks.find((p) => p.team === "OH")!.player.id).toBe(off.state.offseason!.choices.boards!.OH![0]);
      }
      off = advance(off.state, new Set());
      expect(off.summary).toMatchObject({ kind: "offseason", done: stage, next: order[i + 1] ?? null });
      if (stage === "resign") expect((off.summary as { covered: string[] }).covered).toEqual(["TX"]);
    }
    expect(off.summary).toMatchObject({ season: 2031, nextSeason: 2032 });
    // Calls for the wrong stage are turned down.
    expect(recordChoice(off.state, "OH", { stage: "cuts", cuts: [] }).problems).toHaveLength(1);
    s = off.state;
    expect(s.offseason).toBeUndefined();
    expect(s.dynasty.league.season).toBe(2032);
    expect(s.weeksPlayed).toBe(0);
    expect(s.progress.results).toHaveLength(0);
    expect(s.dynasty.history.at(-1)?.champion).toBe(po.state.progress.playoffs!.champion);
    expect(s.dynasty.springs?.at(-1)).toBeTruthy();
    expect(nextStep(s)).toEqual({ kind: "week", week: 1 });
    expect(steps.every((k) => k === "week")).toBe(true);
    // Every game replays exactly from the roster log (trades and moves came after many of them).
    const before = po.state;
    for (const g of [before.progress.results[0]!, before.progress.results[300]!, before.progress.results.at(-1)!]) {
      const teams = replayTeams(before.progress.lineups, before.dynasty.league, g)!;
      expect(teams).not.toBeNull();
      const again = simulateGame(teams.home, teams.away, g.seed);
      expect([again.score[g.home], again.score[g.away]]).toEqual([g.homeScore, g.awayScore]);
    }
  });
});
