import { describe, expect, it } from "vitest";
import {
  NICKNAMES,
  STATES,
  allTeams,
  conferenceOf,
  divisionOf,
  generateLeague,
  simulateGame,
  teamRatings,
  validateTeam,
} from "../src/index.ts";

const LEAGUE = generateLeague("league-test");

describe("generateLeague", () => {
  it("has 50 teams, one per state, in 2 conferences of 5 divisions of 5", () => {
    const teams = allTeams(LEAGUE);
    expect(teams).toHaveLength(50);
    expect(new Set(teams.map((t) => t.abbr))).toEqual(new Set(STATES.map(([, abbr]) => abbr)));
    expect(LEAGUE.conferences).toHaveLength(2);
    for (const c of LEAGUE.conferences) {
      expect(c.divisions).toHaveLength(5);
      for (const d of c.divisions) expect(d.teams).toHaveLength(5);
    }
  });

  it("gives every team a distinct fictional nickname and matching state name", () => {
    const teams = allTeams(LEAGUE);
    expect(new Set(teams.map((t) => t.nickname)).size).toBe(50);
    for (const t of teams) {
      expect(NICKNAMES).toContain(t.nickname);
      expect(STATES.find(([, a]) => a === t.abbr)![0]).toBe(t.state);
    }
  });

  it("every roster is valid and player ids are unique league-wide", () => {
    const ids = new Set<string>();
    for (const t of allTeams(LEAGUE)) {
      expect(validateTeam(t)).toEqual([]);
      for (const p of t.roster) {
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      }
    }
    expect(ids.size).toBe(3600);
  });

  it("is deterministic per seed", () => {
    expect(generateLeague("league-test")).toEqual(LEAGUE);
    expect(generateLeague("other-seed")).not.toEqual(LEAGUE);
  });

  it("looks up divisions and conferences", () => {
    expect(divisionOf(LEAGUE, "TX").name).toBe("Southwest");
    expect(conferenceOf(LEAGUE, "TX").abbr).toBe("WC");
    expect(conferenceOf(LEAGUE, "ME").abbr).toBe("EC");
    expect(() => divisionOf(LEAGUE, "ZZ")).toThrow();
  });

  it("has competitive balance: a real spread of team strength, but no runaway teams", () => {
    const overall = allTeams(LEAGUE).map((t) => teamRatings(t).overall);
    const spread = Math.max(...overall) - Math.min(...overall);
    expect(spread).toBeGreaterThan(4);
    expect(spread).toBeLessThan(20);
  });

  it("any two league teams can play a game", () => {
    const g = simulateGame(LEAGUE.teams["TX"]!, LEAGUE.teams["ME"]!, 1);
    expect(g.plays.length).toBeGreaterThan(100);
  });
});
