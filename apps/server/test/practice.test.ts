import { describe, expect, it } from "vitest";
import { applyMove } from "../src/moves.ts";
import { advance, openSeason } from "../src/season.ts";
import { newLeagueState } from "../src/state.ts";

describe("practice online", () => {
  const opened = openSeason({ ...newLeagueState("practice-online"), humans: { OH: "m1", TX: "m2" } });
  const plan = { installs: ["deep_shot", "cover_4"] as Array<"deep_shot" | "cover_4">, intensity: "hard" as const };

  it("a friend sets their plan; it's checked, and set once their game is under way", () => {
    expect(applyMove(opened, "OH", { kind: "practice", plan: { installs: ["quick", "screen", "draw", "cover_2"], intensity: "normal" } }).problems[0]).toContain("at most");
    const r = applyMove(opened, "OH", { kind: "practice", plan });
    expect(r.problems).toEqual([]);
    expect(r.state!.dynasty.league.teams.OH!.practice).toEqual(plan);
    const coaching = { ...r.state!, coaching: { OH: { game: "x", calls: [null] } } };
    expect(applyMove(coaching, "OH", { kind: "practice", plan: null }).problems[0]).toContain("under way");
    expect(applyMove(r.state!, "OH", { kind: "practice", plan: null }).state!.dynasty.league.teams.OH!.practice).toBeUndefined();
  });

  it("the week is played with it", { timeout: 120_000 }, () => {
    const s = applyMove(opened, "OH", { kind: "practice", plan }).state!;
    const after = advance(s, new Set(["OH", "TX"])).state;
    const game = after.progress.results.find((g) => g.home === "OH" || g.away === "OH")!;
    expect(game.practice!.OH).toEqual(plan);
    expect(after.dynasty.league.teams.OH!.practiceLog).toEqual({ hard: 1, light: 0, weeks: 1 });
  });
});
