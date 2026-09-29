import { describe, expect, it } from "vitest";
import {
  advanceSeason,
  allTeams,
  simulateGame,
  startDynasty,
  talentSnapshot,
  validateTeam,
  type Dynasty,
} from "../src/index.ts";

// A short burn-in keeps the test quick; the real default is 15 offseasons.
const START: Dynasty = startDynasty("dynasty-test", 4);
const ONE = advanceSeason(START);
const TWO = advanceSeason(ONE);

describe("startDynasty", () => {
  it("starts in the first season, with valid 72-man rosters and no history", () => {
    expect(START.league.season).toBe(2031);
    expect(START.history).toHaveLength(0);
    for (const t of allTeams(START.league)) {
      expect(t.roster).toHaveLength(72);
      expect(validateTeam(t)).toEqual([]);
    }
  });
});

describe("advanceSeason", () => {
  it("plays a season and returns the league a year later, still valid", () => {
    expect(ONE.league.season).toBe(2032);
    expect(TWO.league.season).toBe(2033);
    for (const t of allTeams(TWO.league)) {
      expect(t.roster).toHaveLength(72);
      expect(validateTeam(t)).toEqual([]);
    }
    const ids = allTeams(TWO.league).flatMap((t) => t.roster.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("records the season in history", () => {
    const h = ONE.history[0]!;
    expect(h.season).toBe(2031);
    expect(Object.keys(START.league.teams)).toContain(h.champion);
    expect(h.runnerUp).not.toBe(h.champion);
    expect(h.top25).toHaveLength(25);
    expect(h.divisionWinners).toHaveLength(10);
    expect(h.topPicks).toHaveLength(10);
    expect(h.awards.map((a) => a.award)).toEqual(
      expect.arrayContaining(["MVP", "Offensive Player of the Year", "Defensive Player of the Year"]),
    );
    // The second season has rookies from the first draft, so a Rookie of the Year.
    expect(TWO.history[1]!.awards.some((a) => a.award === "Rookie of the Year")).toBe(true);
    expect(h.talent.starterOverall).toBeGreaterThan(50);
  });

  it("builds careers across seasons", () => {
    const veteran = [...TWO.careers.values()].find((c) => c.seasons === 2 && c.stats.passAtt > 200)!;
    expect(veteran).toBeDefined();
    expect(veteran.games).toBeGreaterThan(20);
    expect(veteran.stats.passYds).toBeGreaterThan(ONE.careers.get(veteran.id)!.stats.passYds);
  });

  it("carries staff careers, the unemployed pool and last season's records forward", () => {
    expect(ONE.history[0]!.coachOfTheYear).not.toBeNull();
    expect(ONE.lastWinPct!.size).toBe(50);
    const hc = allTeams(TWO.league)[0]!.staff!.hc;
    const career = TWO.staffCareers.get(hc.id);
    if (hc.tenure >= 1) expect(career!.record.wins + career!.record.losses).toBeGreaterThan(0);
    for (const m of TWO.staffPool) expect(TWO.staffCareers.get(m.id)!.status).toBe("unemployed");
  });

  it("uses last season's division finish for the next schedule", () => {
    expect(Object.keys(ONE.slotOrder!)).toHaveLength(10);
    for (const teams of Object.values(ONE.slotOrder!)) expect(teams).toHaveLength(5);
  });

  it("never changes the league it was given, so old seasons can be replayed", () => {
    const before = JSON.stringify(START.league);
    advanceSeason(START);
    expect(JSON.stringify(START.league)).toBe(before);
    const [h, a] = Object.values(START.league.teams);
    expect(simulateGame(h!, a!, "replay")).toEqual(simulateGame(h!, a!, "replay"));
  });

  it("is deterministic", () => {
    expect(advanceSeason(START).history).toEqual(ONE.history);
  });

  it("keeps league talent steady from season to season", () => {
    const [a, b] = [talentSnapshot(START.league), talentSnapshot(TWO.league)];
    expect(Math.abs(a.starterOverall - b.starterOverall)).toBeLessThan(2);
    expect(Math.abs(a.averageAge - b.averageAge)).toBeLessThan(1);
  });
}, 60_000);
