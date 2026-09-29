import { describe, expect, it } from "vitest";
import {
  DEFENSIVE_SCHEMES,
  GM_PHILOSOPHIES,
  OFFENSIVE_SCHEMES,
  Rng,
  allTeams,
  formatStaff,
  generateLeague,
  generateStaff,
  staffOverall,
} from "../src/index.ts";

const LEAGUE = generateLeague("staff-test");

describe("staff generation", () => {
  it("gives every team a full staff with sensible ratings, ages and schemes", () => {
    const ids = new Set<string>();
    for (const t of allTeams(LEAGUE)) {
      const s = t.staff!;
      expect(s).toBeDefined();
      for (const m of [s.hc, s.oc, s.dc, s.gm, s.scout]) {
        expect(ids.has(m.id)).toBe(false);
        ids.add(m.id);
        expect(m.age).toBeGreaterThanOrEqual(34);
        expect(m.age).toBeLessThanOrEqual(66);
        expect(m.experience).toBeLessThanOrEqual(m.age - 30);
        expect(staffOverall(m)).toBeGreaterThanOrEqual(30);
        expect(staffOverall(m)).toBeLessThanOrEqual(95);
      }
      expect(OFFENSIVE_SCHEMES).toContain(s.oc.scheme);
      expect(DEFENSIVE_SCHEMES).toContain(s.dc.scheme);
      expect(GM_PHILOSOPHIES).toContain(s.gm.philosophy);
    }
  });

  it("spreads schemes and quality across the league", () => {
    const teams = allTeams(LEAGUE);
    expect(new Set(teams.map((t) => t.staff!.oc.scheme)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(teams.map((t) => t.staff!.dc.scheme)).size).toBeGreaterThanOrEqual(4);
    const hc = teams.map((t) => staffOverall(t.staff!.hc));
    expect(Math.max(...hc) - Math.min(...hc)).toBeGreaterThan(10);
  });

  it("is deterministic", () => {
    expect(generateStaff(new Rng(1), "TX")).toEqual(generateStaff(new Rng(1), "TX"));
    expect(generateLeague("staff-test")).toEqual(LEAGUE);
  });

  it("formats for display", () => {
    const text = formatStaff(LEAGUE.teams["TX"]!.staff!);
    for (const role of ["Head Coach", "Offensive Coordinator", "Defensive Coordinator", "General Manager", "Scouting Director"]) {
      expect(text).toContain(role);
    }
  });
});
