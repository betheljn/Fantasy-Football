import { describe, expect, it } from "vitest";
import { POSITIONS, REPLACEMENT_LEVEL, allTeams, fantasyDraftOrder, generateLeague, letterGrade, rosterNorms, rosterReport, teamRatings } from "../src/index.ts";

const LEAGUE = generateLeague("grade-test");
const NORMS = rosterNorms(LEAGUE);
const ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

describe("letter grades", () => {
  it("run A+ to F on a curve, average is a C", () => {
    expect(letterGrade(2)).toBe("A+");
    expect(letterGrade(0)).toBe("C+");
    expect(letterGrade(-0.2)).toBe("C");
    expect(letterGrade(-3)).toBe("F");
    for (let z = -3; z < 3; z += 0.05) expect(ORDER.indexOf(letterGrade(z))).toBeGreaterThanOrEqual(ORDER.indexOf(letterGrade(z + 0.05)));
  });
});

describe("roster reports", () => {
  it("grade every position and trait; better rosters grade higher", () => {
    const teams = allTeams(LEAGUE).sort((a, b) => teamRatings(b).overall - teamRatings(a).overall);
    const best = rosterReport(teams[0]!.roster, NORMS);
    const worst = rosterReport(teams.at(-1)!.roster, NORMS);
    expect(best.positions.map((p) => p.position)).toEqual([...POSITIONS]);
    expect(best.traits.length).toBeGreaterThan(8);
    expect(ORDER.indexOf(best.overall.grade)).toBeLessThan(ORDER.indexOf(worst.overall.grade));
  });

  it("an empty or thin roster is an F and needs starters first", () => {
    const empty = rosterReport([], NORMS);
    expect(empty.overall).toEqual({ score: REPLACEMENT_LEVEL, grade: "F" });
    expect(empty.needs[0]).toBe("OL");
    const qbOnly = rosterReport(allTeams(LEAGUE)[0]!.roster.filter((p) => p.position === "QB").slice(0, 1), NORMS);
    const qb = qbOnly.positions.find((p) => p.position === "QB")!;
    expect(qb.have).toBe(1);
    expect(qb.short).toBe(qb.target - 1);
    expect(qbOnly.needs).toContain("OL");
  });
});

describe("choosing a draft slot", () => {
  it("puts you at your pick and keeps everyone else's order", () => {
    const base = fantasyDraftOrder(LEAGUE);
    for (const slot of [1, 17, 50]) {
      const o = fantasyDraftOrder(LEAGUE, { team: "OH", slot });
      expect(o[slot - 1]).toBe("OH");
      expect(o.filter((a) => a !== "OH")).toEqual(base.filter((a) => a !== "OH"));
    }
    expect(() => fantasyDraftOrder(LEAGUE, { team: "OH", slot: 51 })).toThrow(/1 to 50/);
  });
});
