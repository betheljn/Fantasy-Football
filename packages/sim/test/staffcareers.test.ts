import { describe, expect, it } from "vitest";
import {
  allTeams,
  computeRecords,
  draftOrder,
  generateLeague,
  reputation,
  runStaffOffseason,
  simulatePlayoffs,
  simulateSeason,
  type League,
  type StaffCareer,
  type StaffMember,
  type TeamStaff,
} from "../src/index.ts";

const LEAGUE = generateLeague("staff-careers-test");
const SEASON = simulateSeason(LEAGUE);
const PLAYOFFS = simulatePlayoffs(LEAGUE, SEASON);
const ORDER = draftOrder(PLAYOFFS);
const RECORDS = computeRecords(LEAGUE, SEASON.results);
const run = (league: League = LEAGUE, lastPct = new Map<string, number>()) =>
  runStaffOffseason(league, SEASON.results, PLAYOFFS, ORDER, [], new Map(), lastPct);
const RESULT = run();
const SLOTS: (keyof TeamStaff)[] = ["hc", "oc", "dc", "gm", "scout"];
const members = (l: League): Array<[string, keyof TeamStaff, StaffMember]> =>
  allTeams(l).flatMap((t) => SLOTS.map((s) => [t.abbr, s, t.staff![s]] as [string, keyof TeamStaff, StaffMember]));

/** Every head coach has been with his team long enough to be judged. */
function veteranCoaches(league: League, changes: Partial<StaffMember> = {}): League {
  const teams: League["teams"] = {};
  for (const t of allTeams(league)) teams[t.abbr] = { ...t, staff: { ...t.staff!, hc: { ...t.staff!.hc, tenure: 4, ...changes } as TeamStaff["hc"] } };
  return { ...league, teams };
}

describe("staff offseason", () => {
  it("leaves every team with a full staff and no one in two jobs", () => {
    const ids = new Set<string>();
    for (const [, slot, m] of members(RESULT.league)) {
      expect(m.role).toBe({ hc: "HC", oc: "OC", dc: "DC", gm: "GM", scout: "SCOUT" }[slot]);
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
    }
    for (const m of RESULT.pool) expect(ids.has(m.id)).toBe(false);
  });

  it("ages everyone a year; tenure grows for those who stayed and resets for new hires", () => {
    const before = new Map(members(LEAGUE).map(([t, s, m]) => [`${t}:${s}`, m]));
    for (const [t, s, m] of members(RESULT.league)) {
      const old = before.get(`${t}:${s}`)!;
      if (old.id === m.id) {
        expect(m.age).toBe(old.age + 1);
        expect(m.tenure).toBe(old.tenure + 1);
        expect(m.experience).toBe(old.experience + 1);
      } else {
        expect(m.tenure).toBe(0);
      }
    }
  });

  it("logs a change for every seat that changed hands, naming the new hire", () => {
    const before = new Map(members(LEAGUE).map(([t, s, m]) => [`${t}:${s}`, m.id]));
    const changed = members(RESULT.league).filter(([t, s, m]) => before.get(`${t}:${s}`) !== m.id);
    const roleOf = { hc: "HC", oc: "OC", dc: "DC", gm: "GM", scout: "SCOUT" } as const;
    for (const [t, s, m] of changed) {
      const logged = RESULT.changes.filter((c) => c.team === t && c.role === roleOf[s]).at(-1);
      expect(logged?.in).toBe(`${m.firstName} ${m.lastName}`);
    }
    expect(RESULT.changes.length).toBe(changed.length);
  });

  it("records head coach seasons and Coach of the Year", () => {
    for (const t of allTeams(LEAGUE)) {
      const c = RESULT.careers.get(t.staff!.hc.id)!;
      expect(c.record.wins).toBe(RECORDS.get(t.abbr)!.wins);
      expect(c.stints[0]).toMatchObject({ team: t.abbr, role: "HC", from: LEAGUE.season, to: LEAGUE.season });
    }
    const champHc = allTeams(LEAGUE).find((t) => t.abbr === PLAYOFFS.champion)!.staff!.hc;
    expect(RESULT.careers.get(champHc.id)!.titles).toBe(1);
    const coty = RESULT.coachOfTheYear!;
    expect(RESULT.careers.get(coty.id)!.coachOfTheYear).toBe(1);
    expect(coty.overExpected).toBeGreaterThan(0);
  });

  it("fires head coaches after losing seasons, never one who made the playoffs", () => {
    const league = veteranCoaches(LEAGUE);
    const bad = new Map(allTeams(league).map((t) => [t.abbr, 0.2]));
    const r = run(league, bad);
    const fired = r.changes.filter((c) => c.role === "HC" && c.reason === "fired");
    expect(fired.length).toBeGreaterThan(5);
    const inField = new Set(PLAYOFFS.seeds.map((s) => s.team));
    for (const c of fired) expect(inField.has(c.team)).toBe(false);
    for (const c of fired) expect(c.in).not.toBe(c.out); // no rehiring the coach you just fired
    // Winning teams keep their coach.
    for (const t of allTeams(league)) {
      const rec = RECORDS.get(t.abbr)!;
      if (rec.wins >= 12) expect(fired.some((c) => c.team === t.abbr)).toBe(false);
    }
  });

  it("gives first-year head coaches a grace season", () => {
    const league = veteranCoaches(LEAGUE, { tenure: 0 });
    const r = run(league, new Map(allTeams(league).map((t) => [t.abbr, 0.2])));
    expect(r.changes.filter((c) => c.role === "HC" && c.reason === "fired" && c.out !== null)).toHaveLength(0);
  });

  it("retires the oldest staff and replaces them", () => {
    const league = veteranCoaches(LEAGUE, { age: 70 });
    const r = run(league);
    expect(r.changes.filter((c) => c.role === "HC" && c.reason === "retired")).toHaveLength(50);
    for (const t of allTeams(r.league)) expect(t.staff!.hc.age).toBeLessThan(70);
  });

  it("replaces a coordinator hired away as a head coach", () => {
    const league = veteranCoaches(LEAGUE, { age: 70 });
    const r = run(league);
    const promoted = r.changes.filter((c) => c.from === "promoted coordinator");
    expect(promoted.length).toBeGreaterThan(0);
    const hiredAway = r.changes.filter((c) => c.reason === "hired away");
    expect(hiredAway.length).toBe(promoted.length);
  });

  it("is deterministic", () => {
    const again = run();
    expect(again.changes).toEqual(RESULT.changes);
    expect(again.league.teams).toEqual(RESULT.league.teams);
  });
});

describe("reputation", () => {
  const career = (wins: number, losses: number, titles: number): StaffCareer => ({
    id: "x",
    name: "X",
    stints: [{ team: "AA", role: "HC", from: 2031, to: 2035, wins, losses, titles }],
    record: { wins, losses, ties: 0 },
    playoffTrips: 0,
    titles,
    coachOfTheYear: 0,
    timesFired: 0,
    status: "unemployed",
  });

  it("rewards winning and titles, discounts small samples, and ignores other roles", () => {
    expect(reputation(undefined, "HC")).toBe(0);
    expect(reputation(career(70, 30, 1), "HC")).toBeGreaterThan(reputation(career(70, 30, 0), "HC"));
    expect(reputation(career(70, 30, 0), "HC")).toBeGreaterThan(reputation(career(14, 6, 0), "HC"));
    expect(reputation(career(30, 70, 0), "HC")).toBeLessThan(0);
    expect(reputation(career(70, 30, 3), "GM")).toBe(0);
  });
});
