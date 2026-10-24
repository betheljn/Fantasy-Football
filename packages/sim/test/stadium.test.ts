import { describe, expect, it } from "vitest";
import {
  CURRENT_FORMAT,
  VIDEO_BOARD_MAX,
  crowdNoise,
  describeStadium,
  generateLeague,
  openProjects,
  projectProblems,
  renameProblem,
  renameStadium,
  roofOf,
  standsOf,
  startLeagueBusiness,
  startProject,
  surfaceOf,
  syncVenues,
  videoBoardOf,
  type TeamBusiness,
} from "../src/index.ts";

const league = { ...generateLeague("stadium-test"), format: CURRENT_FORMAT };
const business = startLeagueBusiness(league);
const open = Object.entries(business).find(([, b]) => !b.stadium.dome)!;
const domed = Object.entries(business).find(([, b]) => b.stadium.dome)!;
const rich = (b: TeamBusiness): TeamBusiness => ({ ...b, cash: 2_000_000 });

describe("the stadium's design", () => {
  it("older stadiums read as they were", () => {
    expect([roofOf(open[1].stadium), surfaceOf(open[1].stadium), standsOf(open[1].stadium), videoBoardOf(open[1].stadium)]).toEqual(["open", "grass", "classic", 1]);
    expect([roofOf(domed[1].stadium), surfaceOf(domed[1].stadium)]).toEqual(["dome", "turf"]);
    expect(describeStadium(open[1].stadium)).toMatch(/^Open air · grass · classic bowl · [\d,]+ seats$/);
  });

  it("projects check what's possible", () => {
    const [abbr, b] = [open[0], rich(open[1])];
    expect(projectProblems(b, "retractable", abbr, "cash")).toEqual([]);
    expect(projectProblems(b, "grass", abbr, "cash")).toContain("The field is already grass.");
    expect(projectProblems(rich(domed[1]), "grass", domed[0], "cash")).toContain("Grass won't grow under a dome.");
    expect(projectProblems(rich(domed[1]), "retractable", domed[0], "cash")).toContain("The stadium already has a roof.");
    const roofing = startProject(b, "retractable", abbr, "cash", 2031);
    expect(projectProblems(roofing, "dome", abbr, "cash")).toContain("Something else is being built there.");
    const maxed = { ...b, stadium: { ...b.stadium, videoBoard: VIDEO_BOARD_MAX } };
    expect(projectProblems(maxed, "videoBoard", abbr, "cash")).toContain("The boards don't get any bigger.");
  });

  it("projects open for next season: roofs, fields, stands and boards", () => {
    const [abbr, b0] = [open[0], rich(open[1])];
    let b = startProject(b0, "retractable", abbr, "cash", 2031);
    b = startProject(b, "steep", abbr, "bonds", 2031);
    b = startProject(b, "turf", abbr, "cash", 2031);
    b = startProject(b, "videoBoard", abbr, "cash", 2031);
    b = openProjects(b, 2031);
    expect([roofOf(b.stadium), surfaceOf(b.stadium), standsOf(b.stadium), videoBoardOf(b.stadium)]).toEqual(["retractable", "turf", "steep", 2]);
    expect(b.stadium.dome).toBe(false);
    expect(b.stadium.capacity).toBe(b0.stadium.capacity - 3_000);
    expect(b.pending).toEqual([]);
    // A dome brings turf with it.
    const d = openProjects(startProject(b0, "dome", abbr, "cash", 2031), 2031);
    expect([roofOf(d.stadium), surfaceOf(d.stadium), d.stadium.dome]).toEqual(["dome", "turf", true]);
  });

  it("steep stands are louder, and the team's venue carries the design", () => {
    const b = open[1];
    const steep = { ...b, stadium: { ...b.stadium, stands: "steep" as const } };
    expect(crowdNoise(steep)).toBeCloseTo(Math.min(1, crowdNoise(b) + 0.12));
    const synced = syncVenues({ league, business: { ...business, [open[0]]: steep } }).league;
    expect(synced.teams[open[0]]!.venue).toMatchObject({ roof: "open", surface: "grass", stands: "steep", dome: false });
  });

  it("you can name it yourself, unless a sponsor's name is on it", () => {
    const b = open[1];
    expect(renameStadium(b, "  The   Pit ", 2031).stadium.name).toBe("The Pit");
    expect(renameProblem(b, "X", 2031)).toContain("at least three");
    const sponsored = { ...b, stadium: { ...b.stadium, naming: { sponsor: "Acme Mutual", perYear: 5000, through: 2033 } } };
    expect(renameProblem(sponsored, "The Pit", 2032)).toContain("Acme Mutual");
    expect(renameProblem(sponsored, "The Pit", 2034)).toBeNull();
  });
});

import { Rng, SURFACE_EFFECTS, conditionEffects, describeConditions, gameConditions, generateTeams, simulateGame, type GameConditions, type Team } from "../src/index.ts";

describe("the stadium in games (rules 7)", () => {
  const withVenue = (venue: NonNullable<Team["venue"]>) => ({ ...league, teams: { ...league.teams, OH: { ...league.teams.OH!, venue } } });
  const days = (roof: "open" | "retractable") => Array.from({ length: 120 }, (_, i) => gameConditions(withVenue({ dome: false, noise: 0.5, roof, surface: "grass" }), { id: `d${i}`, week: 14, home: "OH" }));

  it("a retractable roof closes against bad weather and opens on a fine day", () => {
    const open = days("open");
    const roofed = days("retractable");
    for (const [i, o] of open.entries()) {
      const r = roofed[i]!;
      const bad = o.precip !== "none" || o.temp < 40 || o.wind >= 20;
      expect(r.roofClosed ?? false).toBe(bad);
      if (bad) expect(r).toMatchObject({ dome: true, precip: "none", wind: 0 });
      else expect(r).toMatchObject({ temp: o.temp, precip: o.precip, wind: o.wind, roof: "retractable" });
    }
    expect(roofed.some((r) => r.roofClosed)).toBe(true);
    expect(roofed.some((r) => !r.roofClosed)).toBe(true);
    expect(describeConditions(roofed.find((r) => r.roofClosed)!)).toMatch(/^Roof closed/);
  });

  it("the field plays only from rules 7", () => {
    const turf: GameConditions = { dome: false, temp: 65, precip: "none", wind: 0, noise: 0.5, surface: "turf" };
    expect(conditionEffects(turf, true)).toMatchObject(SURFACE_EFFECTS.turf);
    expect(conditionEffects(turf, false)).toMatchObject({ breakaway: 1, yac: 0, injury: 1 });
    const [A, B] = generateTeams(new Rng("field-rules"), 2) as [Team, Team];
    const six = simulateGame(A, B, "f1", { rules: 6, conditions: turf });
    const sixGrass = simulateGame(A, B, "f1", { rules: 6, conditions: { ...turf, surface: "grass" } });
    expect(six.plays).toEqual(sixGrass.plays);
  });

  it("turf means more injuries over a run of games", { timeout: 60_000 }, () => {
    const [A, B] = generateTeams(new Rng("field-injuries"), 2) as [Team, Team];
    const hurt = (surface: "turf" | "grass") =>
      Array.from({ length: 80 }, (_, i) => simulateGame(A, B, `fi-${i}`, { conditions: { dome: false, temp: 65, precip: "none", wind: 0, noise: 0.5, surface } }).injuries.length).reduce((a, b) => a + b, 0);
    expect(hurt("turf")).toBeGreaterThan(hurt("grass"));
  });
});

import { buildDesignedStadium, designProblem, startDynasty } from "../src/index.ts";

describe("designing your stadium", () => {
  it("checks the design, and builds it for a new program", () => {
    expect(designProblem({ roof: "dome", surface: "grass", stands: "classic", name: "The Barn" })).toContain("Grass won't grow");
    expect(designProblem({ roof: "open", surface: "grass", stands: "classic", name: "X" })).toContain("at least three");
    const d = startDynasty("design-test", 1);
    const made = buildDesignedStadium(d, "OH", { roof: "retractable", surface: "turf", stands: "steep", name: "The Foundry" });
    const s = made.business!.OH!.stadium;
    expect([s.name, roofOf(s), surfaceOf(s), standsOf(s), s.dome]).toEqual(["The Foundry", "retractable", "turf", "steep", false]);
    expect(made.league.teams.OH!.venue).toMatchObject({ roof: "retractable", surface: "turf", stands: "steep" });
    expect(() => buildDesignedStadium(d, "OH", { roof: "dome", surface: "grass", stands: "classic", name: "Nope" })).toThrow();
  });
});
