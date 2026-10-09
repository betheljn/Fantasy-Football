import { describe, expect, it } from "vitest";
import {
  LEAGUE_STRUCTURE,
  REGION_CORES,
  SKILL_GROUP_KEYS,
  allTeams,
  createPlayer,
  generateLeague,
  persona,
  playerOverall,
  regionOf,
  regions,
  skillGroupOf,
} from "../src/index.ts";

const LEAGUE = generateLeague("regions-test");
const PLAYERS = allTeams(LEAGUE).flatMap((t) => t.roster);

describe("regions and their talent cores", () => {
  it("every division is a region with a core of three skill groups; every group is some region's core", () => {
    const divisions = LEAGUE_STRUCTURE.flatMap((c) => c.divisions.map((d) => d.name));
    expect(regions().map((r) => r.name)).toEqual(divisions);
    for (const d of divisions) expect(REGION_CORES[d]).toHaveLength(3);
    for (const g of SKILL_GROUP_KEYS) expect(Object.values(REGION_CORES).some((core) => core.includes(g))).toBe(true);
    expect(regionOf("GA")).toBe("Southeast");
    expect(regionOf("OH")).toBe("Great Lakes");
  });

  it("puts each player in a skill group his position belongs to", () => {
    for (const p of PLAYERS.slice(0, 400)) {
      const g = skillGroupOf(p);
      if (p.position === "QB") expect(g).toBe("passers");
      if (p.position === "OL") expect(g).toBe("bigMen");
      if (["K", "P", "LS"].includes(p.position)) expect(g).toBe("kicking");
    }
  });
});

describe("home states", () => {
  it("every generated player has one, and personas use it", () => {
    for (const p of PLAYERS) {
      expect(p.home).toBeDefined();
      expect(regionOf(p.home!)).toBeDefined();
      expect(persona(p).homeState).toBe(p.home);
    }
  });

  it("the best players in a group mostly come from regions whose core it is", () => {
    // Pool several leagues for a big sample.
    const pool = ["a", "b", "c", "d"].flatMap((s) => allTeams(generateLeague(`regions-${s}`)).flatMap((t) => t.roster));
    const coreShare = (players: typeof pool) =>
      players.filter((p) => REGION_CORES[regionOf(p.home!)!]!.includes(skillGroupOf(p))).length / players.length;
    const best = pool.filter((p) => playerOverall(p) >= 72);
    const rest = pool.filter((p) => playerOverall(p) < 60);
    // Better players lean harder to the regions known for them.
    expect(coreShare(best)).toBeGreaterThan(coreShare(rest) + 0.08);
    // The best speed players: the Southeast leads.
    const fast = best.filter((p) => skillGroupOf(p) === "speed");
    const byRegion = new Map<string, number>();
    for (const p of fast) byRegion.set(regionOf(p.home!)!, (byRegion.get(regionOf(p.home!)!) ?? 0) + 1);
    const top = [...byRegion.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(top).toBe("Southeast");
  });

  it("players from before regional talent keep the home state from their id", () => {
    const old = createPlayer({ id: "OLD-1", firstName: "A", lastName: "B", position: "QB" });
    expect(old.home).toBeUndefined();
    expect(persona(old).homeState).toBe(persona({ id: "OLD-1" }).homeState);
    // The same id with a home of its own is a different player (ids repeat across leagues).
    expect(persona({ id: "OLD-1", home: "HI" }).homeState).toBe("HI");
    expect(persona({ id: "OLD-1", home: "HI" }).weights).toEqual(persona(old).weights);
  });
});
