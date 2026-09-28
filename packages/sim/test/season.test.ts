import { describe, expect, it } from "vitest";
import {
  GAMES_PER_TEAM,
  computeRecords,
  conferenceTable,
  divisionStandings,
  gameSeed,
  generateLeague,
  generateSchedule,
  simulateGame,
  simulateSeason,
  winPct,
  type GameSummary,
} from "../src/index.ts";

const LEAGUE = generateLeague("season-test");
const SEASON = simulateSeason(LEAGUE);

describe("simulateSeason", () => {
  it("plays every scheduled game and every team finishes with 20 decisions", () => {
    expect(SEASON.results).toHaveLength(SEASON.schedule.games.length);
    const records = computeRecords(LEAGUE, SEASON.results);
    let wins = 0;
    let losses = 0;
    let pf = 0;
    let pa = 0;
    for (const r of records.values()) {
      expect(r.wins + r.losses + r.ties).toBe(GAMES_PER_TEAM);
      expect(r.home.wins + r.home.losses + r.home.ties).toBe(10);
      expect(r.division.wins + r.division.losses + r.division.ties).toBe(8);
      expect(r.conference.wins + r.conference.losses + r.conference.ties).toBe(16);
      wins += r.wins;
      losses += r.losses;
      pf += r.pointsFor;
      pa += r.pointsAgainst;
    }
    expect(wins).toBe(losses);
    expect(pf).toBe(pa);
  });

  it("every game can be replayed exactly from its seed", () => {
    for (const g of SEASON.results.slice(0, 20)) {
      const replay = simulateGame(LEAGUE.teams[g.home]!, LEAGUE.teams[g.away]!, g.seed);
      expect([replay.score[g.home], replay.score[g.away]]).toEqual([g.homeScore, g.awayScore]);
      expect(g.seed).toBe(gameSeed(LEAGUE, SEASON.schedule.games.find((s) => s.id === g.id)!));
    }
  });

  it("is deterministic, and can stop partway through", () => {
    const partial = simulateSeason(LEAGUE, { throughWeek: 2, schedule: SEASON.schedule });
    expect(partial.results).toEqual(SEASON.results.filter((g) => g.week <= 2));
    expect(partial.results.every((g) => g.week <= 2)).toBe(true);
  });

  it("standings are ordered by win pct, and tiebreakers only appear between equal records", () => {
    for (const div of SEASON.standings) {
      expect(div.teams).toHaveLength(5);
      for (let i = 1; i < div.teams.length; i++) {
        const [above, below] = [div.teams[i - 1]!, div.teams[i]!];
        expect(winPct(above.record)).toBeGreaterThanOrEqual(winPct(below.record));
        if (above.tiebreaker) expect(winPct(above.record)).toBe(winPct(below.record));
      }
    }
  });

  it("better teams tend to win more", () => {
    const table = conferenceTable(LEAGUE, SEASON.results, "EC");
    expect(table).toHaveLength(25);
    const top = table.slice(0, 5).map((t) => winPct(t.record));
    const bottom = table.slice(-5).map((t) => winPct(t.record));
    expect(Math.min(...top)).toBeGreaterThan(Math.max(...bottom));
  });

  it("the schedule option is honored", () => {
    const schedule = generateSchedule(LEAGUE, { season: 2032 });
    const s = simulateSeason(LEAGUE, { schedule, throughWeek: 1 });
    expect(s.season).toBe(2032);
  });
});

// --- tiebreakers, on hand-made results ---------------------------------------

// Northeast division: ME, NH, VT, MA, RI.
let n = 0;
function game(home: string, away: string, homeScore: number, awayScore: number, kind: GameSummary["kind"] = "division"): GameSummary {
  n++;
  const winner = homeScore === awayScore ? null : homeScore > awayScore ? home : away;
  return { id: `g${n}`, week: n, home, away, kind, homeScore, awayScore, overtime: false, winner, seed: `s${n}` };
}
const northeast = (results: GameSummary[]) => divisionStandings(LEAGUE, results).find((d) => d.division === "Northeast")!.teams;

describe("division tiebreakers", () => {
  it("head-to-head decides a two-way tie", () => {
    // ME and NH both 1-1 (VT 0-1); ME beat NH.
    const t = northeast([game("ME", "NH", 21, 14), game("TX", "ME", 24, 10, "interconference"), game("NH", "VT", 17, 3)]);
    const me = t.findIndex((x) => x.team === "ME");
    const nh = t.findIndex((x) => x.team === "NH");
    expect(me).toBeLessThan(nh);
    expect(t[me]!.tiebreaker).toBe("head-to-head");
  });

  it("division record decides when head-to-head is split", () => {
    // ME and NH split; both 2-2 overall. ME 2-1 in the division, NH 1-2 (NH's other win is
    // out of conference). VT drops to 1-2 so it isn't part of the tie.
    const results = [
      game("ME", "NH", 21, 14),
      game("NH", "ME", 21, 14),
      game("ME", "VT", 17, 10),
      game("MA", "ME", 24, 3),
      game("VT", "NH", 20, 10),
      game("NH", "TX", 30, 3, "interconference"),
      game("RI", "VT", 7, 0),
    ];
    const t = northeast(results);
    expect(t.findIndex((x) => x.team === "ME")).toBeLessThan(t.findIndex((x) => x.team === "NH"));
    expect(t.find((x) => x.team === "ME")!.tiebreaker).toBe("division record");
  });

  it("a three-way head-to-head split falls through to the next rule", () => {
    // ME beat NH, NH beat VT, VT beat ME: all 2-2, all 1-1 head-to-head and 1-1 in the
    // division; common games needs 4 opponents, so conference record separates VT (2-1)
    // from ME and NH (1-1). ME and NH then start over at head-to-head: ME beat NH.
    const results = [
      game("ME", "NH", 21, 14),
      game("NH", "VT", 21, 14),
      game("VT", "ME", 21, 14),
      game("VT", "CT", 28, 0, "conference"),
      game("ME", "TX", 7, 30, "interconference"),
      game("NH", "TX", 7, 30, "interconference"),
      game("VT", "TX", 7, 30, "interconference"),
      game("ME", "OR", 20, 3, "interconference"),
      game("NH", "OR", 20, 3, "interconference"),
    ];
    const t = northeast(results).filter((x) => ["ME", "NH", "VT"].includes(x.team));
    expect(t.map((x) => `${x.team} ${x.record.wins}-${x.record.losses}`)).toEqual(["VT 2-2", "ME 2-2", "NH 2-2"]);
    expect(t[0]!.tiebreaker).toBe("conference record");
    expect(t[1]!.tiebreaker).toBe("head-to-head");
  });

  it("identical teams are separated by a reproducible coin toss", () => {
    const results = [game("ME", "TX", 10, 3, "interconference"), game("NH", "TX", 10, 3, "interconference")];
    const a = northeast(results);
    const b = northeast(results);
    expect(a.map((x) => x.team)).toEqual(b.map((x) => x.team));
    const top = a.filter((x) => x.team === "ME" || x.team === "NH");
    expect(top[0]!.tiebreaker).toBe("coin toss");
  });
});
