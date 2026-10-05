import { describe, expect, it } from "vitest";
import {
  COACH_BUDGET,
  coachBuildProblem,
  coachPointsSpent,
  defaultCoachBuild,
  developmentFactor,
  generateLeague,
  installHeadCoach,
  offenseProfile,
  defenseProfile,
  OFFENSE_PROFILES,
  DEFENSE_PROFILES,
  coachingEdges,
  playsUpTempo,
  simulateGame,
  type CoachBuild,
} from "../src/index.ts";

const LEAGUE = generateLeague("coach-build-test");
const named = (style: CoachBuild["style"]) => defaultCoachBuild(style, { firstName: "Dana", lastName: "Reyes" });

describe("building a head coach", () => {
  it("a default build spends exactly the style's budget", () => {
    for (const style of ["offense", "defense", "balanced"] as const) {
      const b = named(style);
      expect(coachPointsSpent(b)).toBe(COACH_BUDGET.points[style]);
      expect(coachBuildProblem(b)).toBeNull();
    }
  });

  it("rejects builds over budget, out of range or unnamed", () => {
    const b = named("offense");
    expect(coachBuildProblem({ ...b, ratings: { ...b.ratings, development: b.ratings.development + 1 } })).toMatch(/1 point over/);
    expect(coachBuildProblem({ ...b, ratings: { ...b.ratings, discipline: 95 } })).toMatch(/Ratings run/);
    expect(coachBuildProblem({ ...b, firstName: " " })).toMatch(/name/);
    expect(coachBuildProblem({ ...b, age: 70 })).toMatch(/Age/);
    // A balanced coach's play calling is ignored (he doesn't call plays).
    const bal = named("balanced");
    expect(coachBuildProblem({ ...bal, ratings: { ...bal.ratings, playCalling: 90 } })).toBeNull();
  });

  it("replaces the head coach, keeps the coordinators on your schemes, and lets the old coach go", () => {
    const old = LEAGUE.teams.OH!.staff!;
    const build: CoachBuild = { ...named("defense"), offenseScheme: "Air Raid", defenseScheme: "Blitz Heavy" };
    const { league, released } = installHeadCoach(LEAGUE, "OH", build);
    const s = league.teams.OH!.staff!;
    expect(s.hc.lastName).toBe("Reyes");
    expect(s.hc.calls).toEqual({ side: "defense", scheme: "Blitz Heavy", playCalling: build.ratings.playCalling });
    expect(s.hc.contract!.signed).toBe(LEAGUE.season);
    expect(s.oc.id).toBe(old.oc.id);
    expect(s.oc.scheme).toBe("Air Raid");
    expect(s.dc.scheme).toBe("Blitz Heavy");
    expect(released!.id).toBe(old.hc.id);
    expect(released!.contract).toBeUndefined();
    expect(league.teams.MI).toBe(LEAGUE.teams.MI);
  });
});

describe("a head coach who calls one side", () => {
  const build = (style: CoachBuild["style"], over: Partial<CoachBuild["ratings"]> = {}, extra: Partial<CoachBuild> = {}): CoachBuild => {
    const b = { ...named(style), ...extra };
    return { ...b, ratings: { ...b.ratings, ...over } };
  };

  it("runs his scheme and tempo on offense; his play calling sets the edge", () => {
    const team = (pc: number) => installHeadCoach(LEAGUE, "OH", build("offense", { gameManagement: 40, discipline: 40, development: 40, playCalling: pc }, { offenseScheme: "Power Run", tempo: 80 })).league.teams.OH!;
    const strong = team(90);
    expect(offenseProfile(strong)).toBe(OFFENSE_PROFILES["Power Run"]);
    expect(playsUpTempo(strong)).toBe(true);
    const weak = team(40);
    const d = LEAGUE.teams.MI!;
    expect(coachingEdges(strong, d).run).toBeGreaterThan(coachingEdges(weak, d).run);
    expect(coachingEdges(strong, d).completion).toBeGreaterThan(coachingEdges(weak, d).completion);
  });

  it("runs his scheme on defense; a balanced coach leaves both to the coordinators", () => {
    const def = installHeadCoach(LEAGUE, "OH", build("defense", {}, { defenseScheme: "Two-High Zone" })).league.teams.OH!;
    expect(defenseProfile(def)).toBe(DEFENSE_PROFILES["Two-High Zone"]);
    const bal = installHeadCoach(LEAGUE, "OH", build("balanced", {}, { offenseScheme: "West Coast", defenseScheme: "Man Press" })).league.teams.OH!;
    expect(bal.staff!.hc.calls).toBeUndefined();
    expect(offenseProfile(bal)).toBe(OFFENSE_PROFILES["West Coast"]);
    expect(defenseProfile(bal)).toBe(DEFENSE_PROFILES["Man Press"]);
  });

  it("his development rating drives player growth", () => {
    const team = (dev: number) => installHeadCoach(LEAGUE, "OH", build("balanced", { development: dev, gameManagement: 40, discipline: 40 })).league.teams.OH!;
    expect(developmentFactor(team(90)).growth).toBeGreaterThan(developmentFactor(team(40)).growth);
  });

  it("games with him stay deterministic", () => {
    const l = installHeadCoach(LEAGUE, "OH", build("offense")).league;
    const a = simulateGame(l.teams.OH!, l.teams.MI!, "coach-game");
    const b = simulateGame(l.teams.OH!, l.teams.MI!, "coach-game");
    expect(a.score).toEqual(b.score);
  });
});

describe("setting up your team", () => {
  it("applies the look and the coach, and the replaced coach joins the pool", async () => {
    const { setUpTeam } = await import("../src/index.ts");
    const dynasty = { league: LEAGUE, history: [], careers: new Map(), staffPool: [], staffCareers: new Map() };
    const d = setUpTeam(dynasty, "OH", { identity: { nickname: "Tigers", logo: "tigers" }, coach: named("offense") });
    expect(d.league.teams.OH!.nickname).toBe("Tigers");
    expect(d.league.teams.OH!.staff!.hc.lastName).toBe("Reyes");
    expect(d.staffPool.map((m) => m.id)).toEqual([LEAGUE.teams.OH!.staff!.hc.id]);
    expect(setUpTeam(dynasty, "OH", {})).toEqual(dynasty);
  });
});
