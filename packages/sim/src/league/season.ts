// Playing a season: simulate each scheduled game and keep a compact summary.
import { simulateGame, type GameResult } from "../game/game.ts";
import type { League } from "./league.ts";
import { generateSchedule, type Schedule, type ScheduledGame } from "./schedule.ts";
import { divisionStandings, type DivisionStandings, type GameSummary } from "./standings.ts";

export interface SeasonResult {
  season: number;
  schedule: Schedule;
  /** One per scheduled game, in schedule order. */
  results: GameSummary[];
  standings: DivisionStandings[];
}

export interface SeasonOptions {
  schedule?: Schedule;
  /** Play only through this week (default: the whole regular season). */
  throughWeek?: number;
  /** Called with every full game result, e.g. to accumulate season stats. */
  onGame?: (game: GameResult, scheduled: ScheduledGame) => void;
}

/** Seed for one scheduled game: replaying the game with it reproduces it exactly. */
export function gameSeed(league: League, game: ScheduledGame): string {
  return `${league.seed}:${game.id}`;
}

export function playGame(league: League, game: ScheduledGame): { summary: GameSummary; result: GameResult } {
  const seed = gameSeed(league, game);
  const result = simulateGame(league.teams[game.home]!, league.teams[game.away]!, seed);
  const summary: GameSummary = {
    id: game.id,
    week: game.week,
    home: game.home,
    away: game.away,
    kind: game.kind,
    homeScore: result.score[game.home]!,
    awayScore: result.score[game.away]!,
    overtime: result.overtime,
    winner: result.winner,
    seed,
  };
  return { summary, result };
}

export function simulateSeason(league: League, opts: SeasonOptions = {}): SeasonResult {
  const schedule = opts.schedule ?? generateSchedule(league);
  const last = opts.throughWeek ?? schedule.weeks;
  const results: GameSummary[] = [];
  for (const g of schedule.games) {
    if (g.week > last) continue;
    const { summary, result } = playGame(league, g);
    opts.onGame?.(result, g);
    results.push(summary);
  }
  return { season: schedule.season, schedule, results, standings: divisionStandings(league, results) };
}
