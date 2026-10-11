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
