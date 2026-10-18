import { describe, expect, it } from "vitest";
import { xpForLevel } from "@dynasty/sim";
import { applyMove } from "../src/moves.ts";
import { openSeason } from "../src/season.ts";
import { newLeagueState } from "../src/state.ts";

describe("owner upgrades online", () => {
  const opened = openSeason({ ...newLeagueState("upgrade-online"), humans: { OH: "m1", TX: "m2" } });

  it("every friend is an owner; an upgrade needs the points, then rides on the team", () => {
    expect(Object.keys(opened.dynasty.owners ?? {}).sort()).toEqual(["OH", "TX"]);
    expect(applyMove(opened, "OH", { kind: "upgrade", track: "facilities" }).problems[0]).toContain("takes 1 point (you have 0)");
    const rich = { ...opened, dynasty: { ...opened.dynasty, owners: { ...opened.dynasty.owners, OH: { xp: xpForLevel(1), seasons: [] } } } };
    const r = applyMove(rich, "OH", { kind: "upgrade", track: "facilities" });
    expect(r.problems).toEqual([]);
    expect(r.state!.dynasty.league.teams.OH!.upgrades).toEqual({ facilities: 1 });
    expect(r.state!.dynasty.owners!.TX!.upgrades).toBeUndefined();
  });
});

describe("coach abilities online", () => {
  it("are picked before the season starts, with an open slot", { timeout: 60_000 }, () => {
    const s = openSeason({ ...newLeagueState("ability-online"), humans: { OH: "m1" } });
    expect(applyMove(s, "OH", { kind: "ability", ability: "shot_caller" }).problems[0]).toContain("no open ability slot");
    const league = s.dynasty.league;
    const oh = league.teams.OH!;
    const leveled = { ...s, dynasty: { ...s.dynasty, league: { ...league, teams: { ...league.teams, OH: { ...oh, staff: { ...oh.staff!, oc: { ...oh.staff!.oc, xp: 99_999 } } } } } } };
    const r = applyMove(leveled, "OH", { kind: "ability", ability: "shot_caller" });
    expect(r.problems).toEqual([]);
    expect(r.state!.dynasty.league.teams.OH!.staff!.oc.abilities).toEqual(["shot_caller"]);
    expect(applyMove({ ...leveled, weeksPlayed: 1 }, "OH", { kind: "ability", ability: "shot_caller" }).problems[0]).toContain("before the season starts");
  });
});

describe("week 1 kicks off with every slot filled", () => {
  it("open slots are the coaches' own picks once week 1 is played", { timeout: 120_000 }, async () => {
    const { advance } = await import("../src/season.ts");
    const s = openSeason({ ...newLeagueState("kickoff-online"), humans: { OH: "m1" } });
    const league = s.dynasty.league;
    const oh = league.teams.OH!;
    const leveled = { ...s, dynasty: { ...s.dynasty, league: { ...league, teams: { ...league.teams, OH: { ...oh, staff: { ...oh.staff!, oc: { ...oh.staff!.oc, scheme: "Air Raid" as const, xp: 99_999 } } } } } } };
    // Coaching week 1 started: too late to pick.
    expect(applyMove({ ...leveled, coaching: { OH: { game: "x", calls: [null] } } }, "OH", { kind: "ability", ability: "run_game_guru" }).problems[0]).toContain("under way");
    const after = advance(leveled, new Set(["OH"])).state;
    expect(after.dynasty.league.teams.OH!.staff!.oc.abilities).toEqual(["shot_caller", "quick_game_architect", "red_zone_wizard"]);
  });
});
