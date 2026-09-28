// Playoffs: 16 teams. The 10 division winners get automatic bids; the 6
// highest-ranked other teams get at-large bids. All 16 are seeded by the final
// regular-season ranking. Fixed bracket (1v16, 8v9, ...), higher seed hosts,
// championship at a neutral site.
import { simulateGame, type GameResult } from "../game/game.ts";
import type { League } from "./league.ts";
import { computeRankings, type RankingEntry } from "./rankings.ts";
import type { SeasonResult } from "./season.ts";
import { divisionStandings, type GameSummary, type TeamRecord } from "./standings.ts";

export const PLAYOFF_TEAMS = 16;

export type PlayoffRound = "round_of_16" | "quarterfinal" | "semifinal" | "championship";
export const PLAYOFF_ROUNDS: PlayoffRound[] = ["round_of_16", "quarterfinal", "semifinal", "championship"];

export const ROUND_NAMES: Record<PlayoffRound, string> = {
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinals",
  semifinal: "Semifinals",
  championship: "League Championship",
};

/**
 * Bracket order: adjacent pairs meet, and winners of adjacent games meet next
 * round. 1 and 2 can only meet in the final.
 */
export const BRACKET: ReadonlyArray<readonly [number, number]> = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

export interface PlayoffSeed {
  seed: number;
  team: string;
  /** Final regular-season ranking. */
  rank: number;
  /** Division winner (automatic bid) or at-large. */
  bid: "division_winner" | "at_large";
  record: TeamRecord;
}

export interface PlayoffGame {
  round: PlayoffRound;
  homeSeed: number;
  awaySeed: number;
  neutralSite: boolean;
  summary: GameSummary;
}

export interface PlayoffResult {
  /** The final regular-season ranking the field was drawn from. */
  ranking: RankingEntry[];
  seeds: PlayoffSeed[];
  games: PlayoffGame[];
  champion: string;
  runnerUp: string;
}

/** Division winners plus the best-ranked at-large teams, seeded 1-16 by ranking. */
export function selectPlayoffField(league: League, results: readonly GameSummary[], ranking = computeRankings(league, results)): PlayoffSeed[] {
  const winners = new Set(divisionStandings(league, results).map((d) => d.teams[0]!.team));
  const atLarge = ranking.filter((e) => !winners.has(e.team)).slice(0, PLAYOFF_TEAMS - winners.size);
  const field = new Set([...winners, ...atLarge.map((e) => e.team)]);
  return ranking
    .filter((e) => field.has(e.team))
    .map((e, i) => ({
      seed: i + 1,
      team: e.team,
      rank: e.rank,
      bid: winners.has(e.team) ? ("division_winner" as const) : ("at_large" as const),
      record: e.record,
    }));
}

function playoffWeek(season: SeasonResult, round: PlayoffRound): number {
  return season.schedule.weeks + PLAYOFF_ROUNDS.indexOf(round) + 1;
}

export interface PlayoffOptions {
  onGame?: (game: GameResult, round: PlayoffRound) => void;
}

export function simulatePlayoffs(league: League, season: SeasonResult, opts: PlayoffOptions = {}): PlayoffResult {
  const ranking = computeRankings(league, season.results);
  const seeds = selectPlayoffField(league, season.results, ranking);
  const bySeed = new Map(seeds.map((s) => [s.seed, s]));
  const games: PlayoffGame[] = [];

  const play = (round: PlayoffRound, a: PlayoffSeed, b: PlayoffSeed): PlayoffSeed => {
    const [home, away] = a.seed < b.seed ? [a, b] : [b, a];
    const neutralSite = round === "championship";
    const id = `${season.season}-${round}-${away.team}@${home.team}`;
    const seed = `${league.seed}:${id}`;
    const result = simulateGame(league.teams[home.team]!, league.teams[away.team]!, seed, { playoff: true, neutralSite });
    opts.onGame?.(result, round);
    if (!result.winner) throw new Error(`Playoff game ${id} ended in a tie`);
    games.push({
      round,
      homeSeed: home.seed,
      awaySeed: away.seed,
      neutralSite,
      summary: {
        id,
        week: playoffWeek(season, round),
        home: home.team,
        away: away.team,
        kind: "interconference",
        homeScore: result.score[home.team]!,
        awayScore: result.score[away.team]!,
        overtime: result.overtime,
        winner: result.winner,
        seed,
      },
    });
    return result.winner === home.team ? home : away;
  };

  // Fixed bracket: winners of adjacent games meet in the next round.
  let alive = BRACKET.map(([a, b]) => play("round_of_16", bySeed.get(a)!, bySeed.get(b)!));
  for (const round of ["quarterfinal", "semifinal", "championship"] as const) {
    const next: PlayoffSeed[] = [];
    for (let i = 0; i < alive.length; i += 2) next.push(play(round, alive[i]!, alive[i + 1]!));
    alive = next;
  }
  const final = games[games.length - 1]!.summary;
  const champion = alive[0]!.team;
  return { ranking, seeds, games, champion, runnerUp: final.home === champion ? final.away : final.home };
}
