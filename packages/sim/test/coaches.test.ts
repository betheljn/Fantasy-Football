import { describe, expect, it } from "vitest";
import {
  CURRENT_FORMAT,
  DEFENSE_DESIGN_EDGE,
  PLAY_DESIGN_EDGE,
  Rng,
  abilityProblem,
  abilitySlots,
  bankCoaches,
  callerSkill,
  chooseAbility,
  clockMistakeChance,
  coachLevel,
  coachSeasonXp,
  developmentFactor,
  finishSeason,
  openSlots,
  playDesignEdge,
  playSeason,
  simulateRun,
  startDynasty,
  withOwners,
  xpForCoachLevel,
  type Dynasty,
  type GameSummary,
  type Team,
} from "../src/index.ts";

const base = startDynasty("coaches-test", 2);
const OH = base.league.teams.OH!;
const TX = base.league.teams.TX!;
const toLevel = (level: number) => Array.from({ length: level - 1 }, (_, i) => xpForCoachLevel(i + 1)).reduce((a, b) => a + b, 0);
const withCoach = (t: Team, role: "hc" | "oc" | "dc", patch: object): Team => ({ ...t, staff: { ...t.staff!, [role]: { ...t.staff![role], ...patch } } });

describe("coach levels", () => {
  it("open an ability slot at levels 3, 6 and 9", () => {
    expect(coachLevel(0).level).toBe(1);
    expect(abilitySlots(toLevel(2))).toBe(0);
    expect(abilitySlots(toLevel(3))).toBe(1);
    expect(abilitySlots(toLevel(6))).toBe(2);
    expect(abilitySlots(toLevel(10))).toBe(3);
    expect(coachLevel(10_000_000)).toMatchObject({ level: 10, next: 0 });
  });

  it("each coach earns from his side of the ball; the clinic adds to it", () => {
    const g: GameSummary = { id: "g", week: 1, home: "OH", away: "TX", kind: "division", homeScore: 21, awayScore: 7, overtime: false, winner: "OH", seed: "g", calls: { OH: [40, 30, 25], TX: [30, 40, 18] } };
    const xp = (role: "HC" | "OC" | "DC", t = OH) => coachSeasonXp(role, t, { results: [g] });
    const calls = (role: "HC" | "OC" | "DC", t = OH) => xp(role, t).find((l) => l.source === "calls")!.count;
    expect(calls("HC")).toBe(40);
    expect(calls("OC")).toBe(25);
    expect(calls("DC")).toBe(15);
    const total = (role: "HC" | "OC" | "DC", t = OH) => xp(role, t).reduce((s, l) => s + l.xp, 0);
    expect(total("OC", { ...OH, upgrades: { clinic: 2 } })).toBe(Math.round(150 * 1.3) + Math.round(25 * 1.3));
    expect(total("OC")).toBe(150 + 25);
  });
});

describe("banking and abilities", () => {
  it("AI coaches fill their slots; yours wait for you", () => {
    const rich = (t: Team) => ({ ...t, staff: { ...t.staff!, hc: { ...t.staff!.hc, xp: toLevel(3) - 10 }, oc: { ...t.staff!.oc, xp: toLevel(6) - 10 } } });
    const league = { ...base.league, teams: { ...base.league.teams, OH: rich(OH), TX: rich(TX) } };
    const g: GameSummary = { id: "g", week: 1, home: "OH", away: "TX", kind: "division", homeScore: 21, awayScore: 7, overtime: false, winner: "OH", seed: "g" };
    const banked = bankCoaches(league, { results: [g] }, new Set(["OH"]));
    const tx = banked.teams.TX!.staff!;
    expect(tx.hc.abilities).toHaveLength(1);
    expect(tx.oc.abilities).toHaveLength(2);
    expect(openSlots(tx.oc)).toBe(0);
    // Yours: the slots are open until you pick.
    const oh = banked.teams.OH!.staff!;
    expect(oh.oc.abilities ?? []).toHaveLength(0);
    expect(openSlots(oh.oc)).toBe(2);
    const picked = chooseAbility(banked, "OH", "shot_caller");
    expect(picked.teams.OH!.staff!.oc.abilities).toEqual(["shot_caller"]);
    expect(abilityProblem(picked.teams.OH, "shot_caller")).toContain("already has");
    expect(abilityProblem(picked.teams.OH, "pressure_packages")).toContain("no open ability slot");
  });

  it("a season banks XP for every coach, and it follows a fired coach", { timeout: 120_000 }, () => {
    let d: Dynasty = withOwners({ ...base, league: { ...base.league, format: CURRENT_FORMAT } }, ["OH"]);
    const before = new Set(Object.values(d.league.teams).flatMap((t) => [t.staff!.hc.id, t.staff!.oc.id, t.staff!.dc.id]));
    d = finishSeason(d, playSeason(d)).dynasty;
    const coaches = Object.values(d.league.teams).flatMap((t) => [t.staff!.hc, t.staff!.oc, t.staff!.dc]);
    // Everyone who coached the season has XP; new hires from outside the league start at none.
    expect(coaches.filter((c) => before.has(c.id)).every((c) => (c.xp ?? 0) > 0)).toBe(true);
    const fired = d.staffPool.filter((c) => before.has(c.id));
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.every((c) => (c.xp ?? 0) > 0)).toBe(true);
  });
});

describe("abilities on the field and off it", () => {
  it("play design moves the matchup edge, and the runs go better", () => {
    const guru = withCoach(OH, "oc", { abilities: ["run_game_guru", "red_zone_wizard"] });
    const fits = withCoach(TX, "dc", { abilities: ["run_fits", "coverage_scholar"] });
    expect(playDesignEdge(guru, TX, "inside_run", "base", false)).toBe(PLAY_DESIGN_EDGE);
    expect(playDesignEdge(guru, TX, "inside_run", "base", true)).toBe(2 * PLAY_DESIGN_EDGE);
    expect(playDesignEdge(guru, TX, "deep_shot", "base", false)).toBe(0);
    expect(playDesignEdge(OH, fits, "inside_run", "base", false)).toBe(-DEFENSE_DESIGN_EDGE);
    expect(playDesignEdge(OH, fits, "quick", "cover_3", false)).toBe(-DEFENSE_DESIGN_EDGE);
    const ypc = (t: Team) => {
      const rng = new Rng("ypc");
      let y = 0;
      for (let i = 0; i < 1500; i++) y += simulateRun(rng, { offense: t, defense: TX, situation: { quarter: 1, clock: 900, down: 1, distance: 10, yardline: 30 }, concepts: { offense: "inside_run", defense: "base" } }).yardsGained;
      return y / 1500;
    };
    expect(ypc(guru)).toBeGreaterThan(ypc(OH));
  });

  it("head coaches: developer, clock manager, film junkie, halftime adjuster", () => {
    expect(developmentFactor(withCoach(OH, "hc", { abilities: ["developer"] })).growth / developmentFactor(OH).growth).toBeCloseTo(1.05);
    expect(clockMistakeChance(withCoach(OH, "hc", { gameManagement: 20, abilities: ["clock_manager"] }))).toBe(0);
    const film = withCoach(OH, "hc", { abilities: ["film_junkie", "halftime_adjuster"] });
    const first = { quarter: 1, clock: 900, down: 1 as const, distance: 10, yardline: 30 };
    expect(callerSkill(film, "offense", first) - callerSkill(OH, "offense", first)).toBeCloseTo(0.5);
    expect(callerSkill(film, "offense", { ...first, quarter: 3 }) - callerSkill(OH, "offense", first)).toBeCloseTo(1.25);
  });
});
