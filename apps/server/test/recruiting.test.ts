import { describe, expect, it } from "vitest";
import { generateDraftClass, interestIn, isLocal, recruitingPoints } from "@dynasty/sim";
import { applyMove } from "../src/moves.ts";
import { forMember } from "../src/offseason.ts";
import { advance, openSeason, playedSeason } from "../src/season.ts";
import { newLeagueState } from "../src/state.ts";

describe("recruiting online", () => {
  const opened = openSeason({ ...newLeagueState("recruit-online"), humans: { OH: "m1", TX: "m2" } });
  const cls = generateDraftClass(opened.dynasty.league);
  const oh = opened.dynasty.league.teams.OH!;
  const target = cls.prospects.find((p) => p.boardRank <= 30)!;

  it("a friend sets a standing plan within their points; it's private", () => {
    const max = recruitingPoints(oh);
    expect(applyMove(opened, "OH", { kind: "recruit", plan: [{ prospect: target.player.id, points: max + 1 }] }).problems[0]).toContain("you have");
    expect(applyMove(opened, "OH", { kind: "recruit", plan: [{ prospect: "nobody", points: 2 }] }).problems[0]).toContain("next year's class");
    const r = applyMove(opened, "OH", { kind: "recruit", plan: [{ prospect: target.player.id, points: max }] });
    expect(r.problems).toEqual([]);
    expect(forMember(r.state!, "TX").recruiting).toBeUndefined();
    expect(forMember(r.state!, "OH").recruiting?.OH).toEqual([{ prospect: target.player.id, points: max }]);
  });

  it("each week builds interest from the plan (everyone else recruits on their own), and the offseason gets it", { timeout: 120_000 }, () => {
    const max = recruitingPoints(oh);
    let s = applyMove(opened, "OH", { kind: "recruit", plan: [{ prospect: target.player.id, points: max }] }).state!;
    s = advance(s, new Set(["OH", "TX"])).state;
    s = advance(s, new Set(["OH", "TX"])).state;
    const sc = s.progress.scouting!;
    expect(sc.week).toBe(2);
    const once = max * (isLocal(oh, target) ? 1.6 : 1);
    expect(interestIn(sc, "OH", target.player.id)).toBeCloseTo(once + max * (isLocal(oh, target) ? 1.6 : 1) * (1 - once / 100));
    // TX left it to its staff: the AI recruited for it.
    expect(Object.keys(sc.interest!.TX!).length).toBeGreaterThan(0);
    expect(playedSeason({ ...s, progress: { ...s.progress, playoffs: { champion: "", runnerUp: "", seeds: [], games: [], ranking: [] } } }).scouting).toBe(sc);
  });

  it("plans clear when a new season opens", () => {
    const s = applyMove(opened, "OH", { kind: "recruit", plan: [{ prospect: target.player.id, points: 2 }] }).state!;
    expect(openSeason(s).recruiting).toBeUndefined();
  });
});

import { SCOUTING, knowledge } from "@dynasty/sim";

describe("scouting points online", () => {
  const opened = openSeason({ ...newLeagueState("scout-online"), humans: { OH: "m1", TX: "m2" } });
  const cls = generateDraftClass(opened.dynasty.league);
  const target = cls.prospects.find((p) => p.boardRank > 200)!;

  it("this week's points are checked, private, spent when the week is played, then cleared", { timeout: 120_000 }, () => {
    expect(applyMove(opened, "OH", { kind: "scout", plan: [{ prospect: target.player.id, points: SCOUTING.pointsPerWeek + 1 }] }).problems[0]).toContain("a week");
    const s = applyMove(opened, "OH", { kind: "scout", plan: [{ prospect: target.player.id, points: SCOUTING.pointsPerWeek }] }).state!;
    expect(forMember(s, "TX").scoutPlans).toBeUndefined();
    const after = advance(s, new Set(["OH", "TX"])).state;
    expect(after.scoutPlans).toBeUndefined();
    // Ohio put the whole week on him; Texas didn't.
    expect(knowledge(after.progress.scouting!, "OH", target.player.id)).toBeGreaterThan(knowledge(after.progress.scouting!, "TX", target.player.id) + 0.2);
  });
});
