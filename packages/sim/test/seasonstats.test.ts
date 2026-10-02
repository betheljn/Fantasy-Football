import { describe, expect, it } from "vitest";
import {
  LEADER_CATEGORIES,
  addGameToSeason,
  buildBoxScore,
  computeRecords,
  createSeasonStats,
  generateLeague,
  leaders,
  passerRating,
  simulateSeason,
  type GameResult,
} from "../src/index.ts";

const LEAGUE = generateLeague("stats-test");
const STATS = createSeasonStats();
const GAMES: GameResult[] = [];
const SEASON = simulateSeason(LEAGUE, {
  throughWeek: 6,
  onGame: (g) => {
    addGameToSeason(STATS, g);
    GAMES.push(g);
  },
});

describe("season stats", () => {
  it("player totals equal the sum of the box scores", () => {
    const boxes = GAMES.map(buildBoxScore);
    const sumBox = (key: "passYds" | "rushYds" | "recTd" | "tackles" | "sacks") =>
      boxes.reduce((s, b) => s + Object.values(b.players).reduce((x, p) => x + p[key], 0), 0);
    const sumSeason = (key: "passYds" | "rushYds" | "recTd" | "tackles" | "sacks") =>
      [...STATS.players.values()].reduce((s, p) => s + p.stats[key], 0);
    for (const key of ["passYds", "rushYds", "recTd", "tackles", "sacks"] as const) expect(sumSeason(key)).toBe(sumBox(key));
  });

  it("long plays keep the season best, not a sum", () => {
    const boxes = GAMES.map(buildBoxScore);
    for (const p of STATS.players.values()) {
      const best = Math.max(0, ...boxes.map((b) => b.players[p.id]?.rushLong ?? 0));
      expect(p.stats.rushLong).toBe(best);
    }
  });

  it("team totals match the standings, and offense for = defense allowed league-wide", () => {
    const records = computeRecords(LEAGUE, SEASON.results);
    let yardsFor = 0;
    let yardsAllowed = 0;
    for (const t of STATS.teams.values()) {
      const r = records.get(t.team)!;
      expect(t.games).toBe(r.wins + r.losses + r.ties);
      expect(t.pointsFor).toBe(r.pointsFor);
      expect(t.pointsAgainst).toBe(r.pointsAgainst);
      yardsFor += t.offense.totalYards;
      yardsAllowed += t.allowed.totalYards;
    }
    expect(yardsFor).toBe(yardsAllowed);
  });

  it("counts games played and never more than the team played", () => {
    for (const p of STATS.players.values()) {
      expect(p.games).toBeGreaterThan(0);
      expect(p.games).toBeLessThanOrEqual(STATS.teams.get(p.team)!.games);
    }
    // Each team's starting QB (its leading passer) plays every game. A backup
    // can see real snaps too, when the starter gets hurt mid-game.
    const lead = new Map<string, { games: number; passAtt: number }>();
    for (const p of STATS.players.values()) if ((lead.get(p.team)?.passAtt ?? 0) < p.stats.passAtt) lead.set(p.team, { games: p.games, passAtt: p.stats.passAtt });
    for (const [team, q] of lead) expect(q.games).toBe(STATS.teams.get(team)!.games);
  });
});

describe("passerRating", () => {
  it("matches the NFL formula", () => {
    expect(passerRating({ passAtt: 30, passCmp: 20, passYds: 250, passTd: 2, passInt: 1 })).toBeCloseTo(100.69, 1);
    expect(passerRating({ passAtt: 10, passCmp: 10, passYds: 200, passTd: 3, passInt: 0 })).toBeCloseTo(158.3, 1);
    expect(passerRating({ passAtt: 10, passCmp: 0, passYds: 0, passTd: 0, passInt: 5 })).toBe(0);
    expect(passerRating({ passAtt: 0, passCmp: 0, passYds: 0, passTd: 0, passInt: 0 })).toBe(0);
  });
});

describe("leaders", () => {
  it("are sorted and respect qualifiers", () => {
    for (const cat of LEADER_CATEGORIES) {
      const top = leaders(STATS, cat, 10);
      for (let i = 1; i < top.length; i++) expect(top[i - 1]!.value).toBeGreaterThanOrEqual(top[i]!.value);
      if (cat.qualifier) {
        for (const l of top) {
          expect(cat.qualifier.stat(l.player)).toBeGreaterThanOrEqual(cat.qualifier.perGame * STATS.teams.get(l.player.team)!.games);
        }
      }
    }
  });

  it("finds real leaders in the main categories", () => {
    const byKey = (k: string) => leaders(STATS, LEADER_CATEGORIES.find((c) => c.key === k)!, 1)[0]!;
    expect(byKey("passYds").value).toBeGreaterThan(1000);
    expect(byKey("rushYds").value).toBeGreaterThan(400);
    expect(byKey("rating").value).toBeGreaterThan(70);
  });
});
