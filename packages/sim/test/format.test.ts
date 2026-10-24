import { describe, expect, it } from "vitest";
import { FORMATS, allTeams, conferenceOf, divisionOf, generateLeague, generateSchedule, leagueFormat } from "../src/index.ts";

const BASE = generateLeague("format-test");
const LEAGUE = { ...BASE, format: 2 };

describe("league formats", () => {
  it("leagues from before formats are format 1", () => {
    expect(leagueFormat(BASE).version).toBe(1);
    expect(generateSchedule(BASE).weeks).toBe(22);
    expect(leagueFormat(LEAGUE)).toBe(FORMATS[2]);
  });
});

describe("the 15-game season (format 2)", () => {
  for (const season of [2031, 2032, 2033, 2034]) {
    it(`${season}: 15 games each (4 division, 6 conference, 5 non-conference), 7-8 at home, no repeats, one bye in weeks 5-12`, () => {
      const s = generateSchedule(LEAGUE, { season });
      expect(s.weeks).toBe(16);
      expect(s.games).toHaveLength((50 * 15) / 2);
      for (const t of allTeams(LEAGUE)) {
        const games = s.games.filter((g) => g.home === t.abbr || g.away === t.abbr);
        const opp = games.map((g) => (g.home === t.abbr ? g.away : g.home));
        expect(games).toHaveLength(15);
        expect(new Set(opp).size).toBe(15);
        const div = divisionOf(LEAGUE, t.abbr).teams;
        const conf = conferenceOf(LEAGUE, t.abbr).name;
        expect(opp.filter((o) => div.includes(o))).toHaveLength(4);
        expect(opp.filter((o) => !div.includes(o) && conferenceOf(LEAGUE, o).name === conf)).toHaveLength(6);
        expect(opp.filter((o) => conferenceOf(LEAGUE, o).name !== conf)).toHaveLength(5);
        const home = games.filter((g) => g.home === t.abbr).length;
        expect(home).toBeGreaterThanOrEqual(7);
        expect(home).toBeLessThanOrEqual(8);
        const div2 = games.filter((g) => g.kind === "division" && g.home === t.abbr).length;
        expect(div2).toBe(2);
        expect(s.byes[t.abbr]).toHaveLength(1);
        expect(s.byes[t.abbr]![0]).toBeGreaterThanOrEqual(5);
        expect(s.byes[t.abbr]![0]).toBeLessThanOrEqual(12);
        expect(new Set(games.map((g) => g.week)).size).toBe(15);
      }
      for (let w = 1; w <= 16; w++) {
        const off = Object.values(s.byes).filter((b) => b.includes(w)).length;
        if (w < 5 || w > 12) expect(off).toBe(0);
        else {
          expect(off).toBeGreaterThanOrEqual(4);
          expect(off).toBeLessThanOrEqual(8);
        }
      }
    });
  }

  it("is the same schedule for the same league and season, and changes opponents from year to year", () => {
    const a = generateSchedule(LEAGUE, { season: 2031 });
    expect(generateSchedule(LEAGUE, { season: 2031 })).toEqual(a);
    const b = generateSchedule(LEAGUE, { season: 2032 });
    const opps = (s: typeof a) => new Set(s.games.filter((g) => g.home === "OH" || g.away === "OH").map((g) => (g.home === "OH" ? g.away : g.home)));
    const same = [...opps(a)].filter((o) => opps(b).has(o)).length;
    expect(same).toBeLessThan(15);
  });
});
