import { describe, expect, it } from "vitest";
import {
  CURRENT_FORMAT,
  PRACTICE,
  aiPracticePlan,
  developmentFactor,
  finishSeason,
  generateLeague,
  generateSchedule,
  playSeason,
  playWeek,
  practiceEdge,
  practiceFor,
  practiceGrowth,
  practiceProblem,
  startDynasty,
  type League,
  type PracticePlan,
} from "../src/index.ts";

const league: League = { ...generateLeague("practice-test"), format: CURRENT_FORMAT };
const OH = league.teams.OH!;
const TX = league.teams.TX!;

describe("practice plans", () => {
  it("are checked", () => {
    expect(practiceProblem({ installs: ["quick", "cover_2"], intensity: "hard" })).toBeNull();
    expect(practiceProblem({ installs: ["quick", "screen", "draw", "cover_2"], intensity: "normal" })).toContain("at most");
    expect(practiceProblem({ installs: ["quick", "quick"], intensity: "normal" })).toContain("once");
    expect(practiceProblem({ installs: ["nope" as never], intensity: "normal" })).toContain("isn't a play");
  });

  it("AI teams install two plays and a defense for the opponent; a person's standing plan wins", () => {
    const plan = aiPracticePlan(OH, TX);
    expect(plan).toEqual(aiPracticePlan(OH, TX));
    expect(plan.installs).toHaveLength(3);
    expect(practiceProblem(plan)).toBeNull();
    const mine: PracticePlan = { installs: ["deep_shot"], intensity: "light" };
    const withMine = { ...league, teams: { ...league.teams, OH: { ...OH, practice: mine } } };
    expect(practiceFor(withMine, { home: "OH", away: "TX" })).toEqual({ OH: mine, TX: aiPracticePlan(TX, OH) });
  });

  it("installs help their calls (less after a light week); a hard week tires legs late", () => {
    const p = (o: PracticePlan, d: PracticePlan) => ({ OH: o, TX: d });
    const none: PracticePlan = { installs: [], intensity: "normal" };
    expect(practiceEdge(p({ installs: ["quick"], intensity: "normal" }, none), "OH", "TX", "quick", "base", 1)).toBe(PRACTICE.installEdge);
    expect(practiceEdge(p({ installs: ["quick"], intensity: "light" }, none), "OH", "TX", "quick", "base", 1)).toBeCloseTo(PRACTICE.installEdge * PRACTICE.lightInstall);
    expect(practiceEdge(p(none, { installs: ["base"], intensity: "normal" }), "OH", "TX", "quick", "base", 1)).toBe(-PRACTICE.installEdge);
    expect(practiceEdge(p({ installs: [], intensity: "hard" }, none), "OH", "TX", "quick", "base", 3)).toBe(0);
    expect(practiceEdge(p({ installs: [], intensity: "hard" }, none), "OH", "TX", "quick", "base", 4)).toBe(-PRACTICE.fatigueEdge);
    expect(practiceEdge(undefined, "OH", "TX", "quick", "base", 4)).toBe(0);
  });
});

describe("practice through the season", () => {
  it("each game records both plans; teams log their weeks; hard weeks bring practice injuries", { timeout: 60_000 }, () => {
    const hard = Object.fromEntries(Object.entries(league.teams).map(([k, t]) => [k, { ...t, practice: { installs: [], intensity: "hard" as const } }]));
    let l: League = { ...league, teams: hard };
    const schedule = generateSchedule(l);
    let practiceHurt = 0;
    for (let w = 1; w <= 4; w++) {
      const before = new Set(Object.values(l.teams).flatMap((t) => t.roster.filter((p) => p.injury).map((p) => p.id)));
      const r = playWeek(l, schedule, w);
      for (const g of r.games) expect(Object.keys(g.summary.practice!).sort()).toEqual([g.summary.home, g.summary.away].sort());
      const inGames = new Set(r.games.flatMap((g) => g.result.injuries).map((i) => i.player));
      practiceHurt += Object.values(r.league.teams).flatMap((t) => t.roster.filter((p) => p.injury && !before.has(p.id) && !inGames.has(p.id))).length;
      l = r.league;
    }
    expect(practiceHurt).toBeGreaterThan(10);
    const played = Object.values(l.teams).filter((t) => t.practiceLog);
    expect(played.length).toBeGreaterThan(40);
    expect(played.every((t) => t.practiceLog!.hard === t.practiceLog!.weeks)).toBe(true);
  });

  it("hard weeks grow players a little more, light ones a little less", () => {
    expect(practiceGrowth({ hard: 15, light: 0, weeks: 15 })).toBeCloseTo(1 + PRACTICE.growth);
    expect(practiceGrowth({ hard: 0, light: 15, weeks: 15 })).toBeCloseTo(1 - PRACTICE.growth);
    expect(practiceGrowth(undefined)).toBe(1);
    expect(developmentFactor({ ...OH, practiceLog: { hard: 10, light: 0, weeks: 10 } }).growth / developmentFactor(OH).growth).toBeCloseTo(1 + PRACTICE.growth);
  });

  it("the log is used up by the offseason", { timeout: 120_000 }, () => {
    const d = startDynasty("practice-season", 2);
    const after = finishSeason(d, playSeason(d)).dynasty;
    expect(Object.values(after.league.teams).every((t) => !t.practiceLog)).toBe(true);
  });
});
