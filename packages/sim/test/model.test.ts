import { describe, expect, it } from "vitest";
import {
  BASE_STARTERS,
  POSITIONS,
  RATING_KEYS,
  ROSTER_MAX,
  buildDepthChart,
  createPlayer,
  makeRatings,
  overall,
  playerOverall,
  starters,
  validateTeam,
} from "../src/index.ts";
import { minimalTeam } from "./fixtures.ts";

describe("ratings", () => {
  it("fills every key and clamps to 0-99", () => {
    const r = makeRatings({ speed: 140, strength: -5, catching: 71.6 });
    expect(Object.keys(r).sort()).toEqual([...RATING_KEYS].sort());
    expect(r.speed).toBe(99);
    expect(r.strength).toBe(0);
    expect(r.catching).toBe(72);
    expect(r.awareness).toBe(50);
  });

  it("overall is 50 for an all-50 player at every position", () => {
    for (const pos of POSITIONS) expect(overall(pos, makeRatings())).toBe(50);
  });

  it("overall depends on position-relevant ratings only", () => {
    const cannon = makeRatings({ throwPower: 99, shortAccuracy: 99, mediumAccuracy: 99, deepAccuracy: 99, awareness: 99, throwUnderPressure: 99 });
    expect(overall("QB", cannon)).toBeGreaterThan(80);
    expect(overall("OL", cannon)).toBeLessThan(60);
    expect(overall("K", cannon)).toBe(overall("K", makeRatings({ awareness: 99 })));
  });
});

describe("team", () => {
  it("fixture team is valid", () => {
    expect(validateTeam(minimalTeam())).toEqual([]);
  });

  it("depth chart is sorted by overall, best first", () => {
    const team = minimalTeam();
    for (const pos of POSITIONS) {
      const ovrs = team.depthChart[pos].map((id) =>
        playerOverall(team.roster.find((p) => p.id === id)!),
      );
      expect(ovrs).toEqual([...ovrs].sort((a, b) => b - a));
    }
    expect(starters(team, "QB")[0]!.lastName).toBe("QB1");
    expect(starters(team, "OL")).toHaveLength(BASE_STARTERS.OL);
  });

  it("depth chart is deterministic regardless of roster order", () => {
    const team = minimalTeam();
    expect(buildDepthChart([...team.roster].reverse())).toEqual(team.depthChart);
  });

  it("flags oversized rosters, duplicates, and bad depth entries", () => {
    const team = minimalTeam();
    const extras = Array.from({ length: ROSTER_MAX }, (_, i) =>
      createPlayer({ id: `x${i}`, firstName: "X", lastName: `${i}`, position: "WR", jersey: 100 + i }),
    );
    const dup = createPlayer({ id: "QB-Z", firstName: "Dup", lastName: "Dup", position: "QB", jersey: 1 });
    const bad = {
      ...team,
      roster: [...team.roster, ...extras, dup],
      depthChart: { ...team.depthChart, K: ["QB-Z"], P: [] },
    };
    const issues = validateTeam(bad).join("\n");
    expect(issues).toMatch(/max 72/);
    expect(issues).toMatch(/Duplicate player id QB-Z/);
    expect(issues).toMatch(/Duplicate jersey #1/);
    expect(issues).toMatch(/Depth chart K lists QB-Z, who is a QB/);
    expect(issues).toMatch(/Depth chart P has 0, needs 1/);
  });
});
