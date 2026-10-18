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
