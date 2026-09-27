import { describe, expect, it } from "vitest";
import {
  Rng,
  buildBoxScore,
  displayName,
  formatBoxScore,
  formatPlayByPlay,
  generateTeams,
  lookupFor,
  simulateGame,
  type BoxScore,
  type GameResult,
  type PlayerStats,
  type Team,
} from "../src/index.ts";

const GAMES: Array<{ game: GameResult; box: BoxScore; home: Team; away: Team }> = Array.from({ length: 200 }, (_, i) => {
  const [home, away] = generateTeams(new Rng(`box-${i}`), 2) as [Team, Team];
  const game = simulateGame(home, away, i);
  return { game, box: buildBoxScore(game), home, away };
});

const sum = (players: PlayerStats[], key: keyof PlayerStats) => players.reduce((s, p) => s + (p[key] as number), 0);

describe("buildBoxScore", () => {
  it("player lines add up to team totals", () => {
    for (const { game, box } of GAMES) {
      for (const abbr of [game.home, game.away]) {
        const t = box.teams[abbr]!;
        const ps = Object.values(box.players).filter((p) => p.team === abbr);
        expect(sum(ps, "rushYds")).toBe(t.rushYds);
        expect(sum(ps, "rushAtt")).toBe(t.rushAtt);
        expect(sum(ps, "passYds")).toBe(t.passYdsGross);
        expect(sum(ps, "recYds")).toBe(t.passYdsGross);
        expect(sum(ps, "rec")).toBe(t.passCmp);
        expect(sum(ps, "passAtt")).toBe(t.passAtt);
        expect(t.passYdsNet).toBe(t.passYdsGross - t.sackYdsLost);
        expect(t.totalYards).toBe(t.rushYds + t.passYdsNet);
      }
    }
  });

  it("the final score can be rebuilt from the box score", () => {
    for (const { game, box } of GAMES) {
      for (const abbr of [game.home, game.away]) {
        const t = box.teams[abbr]!;
        const ps = Object.values(box.players).filter((p) => p.team === abbr);
        const tds = sum(ps, "rushTd") + sum(ps, "recTd") + sum(ps, "defTd") + sum(ps, "kickRetTd") + sum(ps, "puntRetTd");
        const pts = 6 * tds + 3 * sum(ps, "fgMade") + sum(ps, "xpMade") + 2 * t.twoPtConv + 2 * t.safeties;
        expect(pts).toBe(game.score[abbr]);
      }
    }
  });

  it("total yards match the drive chart", () => {
    for (const { game, box } of GAMES) {
      for (const abbr of [game.home, game.away]) {
        const driveYards = game.drives.filter((d) => d.offense === abbr).reduce((s, d) => s + d.yards, 0);
        expect(box.teams[abbr]!.totalYards).toBe(driveYards);
      }
    }
  });

  it("time of possession covers the whole game clock", () => {
    for (const { game, box } of GAMES) {
      const top = box.teams[game.home]!.timeOfPossession + box.teams[game.away]!.timeOfPossession;
      const otUsed = game.overtime ? 600 - game.final.clock : 0;
      expect(top).toBe(3600 + otUsed);
    }
  });

  it("every player in a box score has a distinct display name on their team", () => {
    for (const { home, away } of GAMES) {
      for (const t of [home, away]) {
        const names = t.roster.map(displayName);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });
});

describe("gamebook text", () => {
  it("renders play-by-play and box score for a game", () => {
    const { game, box, home, away } = GAMES[0]!;
    const who = lookupFor(home, away);
    const pbp = formatPlayByPlay(game, who);
    const text = formatBoxScore(game, box, home, away, who);
    expect(pbp).toContain("1ST QUARTER");
    expect(pbp).toContain("4TH QUARTER");
    expect(pbp.split("\n").length).toBeGreaterThan(game.plays.length);
    expect(text).toContain("TEAM STATS");
    expect(text).toContain("Passing");
    expect(text).toContain(String(game.score[home.abbr]));
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });
});
