// Playing a season: simulate each scheduled game and keep a compact summary.
import { advanceInjuries, gameDayTeam } from "../game/injuries.ts";
import { simulateGame, startCoachedGame, type CoachedGame, type GameResult } from "../game/game.ts";
import type { League } from "./league.ts";
import { generateSchedule, type Schedule, type ScheduledGame } from "./schedule.ts";
import { divisionStandings, type CoachedCalls, type DivisionStandings, type GameSummary } from "./standings.ts";

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

/**
 * Play one scheduled game (injured players sit). A game a person coached is
 * played with their calls (any calls not made are the coaches').
 */
export function playGame(league: League, game: ScheduledGame, coached?: CoachedCalls): { summary: GameSummary; result: GameResult } {
  const seed = gameSeed(league, game);
  // Injured players sit.
  const home = gameDayTeam(league.teams[game.home]!);
  const away = gameDayTeam(league.teams[game.away]!);
  const result = simulateGame(home.team, away.team, seed, coached ? { coach: coached.team, calls: coached.calls } : {});
  const out = home.out.length + away.out.length > 0 ? { out: { [game.home]: home.out, [game.away]: away.out } } : {};
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
    rules: result.rules ?? 1,
    ...out,
    ...(coached ? { coached: { team: coached.team, calls: [...coached.calls] } } : {}),
  };
  return { summary, result };
}

/** Coach `team` in a scheduled game: the same teams and seed the week will play it with (picked up from `calls` so far). */
export function coachScheduledGame(league: League, game: ScheduledGame, team: string, calls: CoachedCalls["calls"] = []): CoachedGame {
  const home = gameDayTeam(league.teams[game.home]!);
  const away = gameDayTeam(league.teams[game.away]!);
  return startCoachedGame(home.team, away.team, gameSeed(league, game), team, {}, calls);
}

/**
 * Play one week's games (injured players sit), then move injuries on a week:
 * everyone hurt heals a week, and this week's injuries take hold. Returns the
 * league after the week.
 */
export function playWeek(
  league: League,
  schedule: Schedule,
  week: number,
  onGame?: (game: GameResult, scheduled: ScheduledGame) => void,
  /** A game a person coached this week (by game id), played with their calls. */
  coached?: { game: string } & CoachedCalls,
): { league: League; games: Array<{ summary: GameSummary; result: GameResult }> } {
  const games = schedule.games.filter((g) => g.week === week).map((g) => {
    const played = playGame(league, g, coached?.game === g.id ? coached : undefined);
    onGame?.(played.result, g);
    return played;
  });
  return { league: advanceInjuries(league, games.flatMap((g) => g.result.injuries)), games };
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
