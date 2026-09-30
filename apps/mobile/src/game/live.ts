// The game as it stands after a given play: what the scoreboard, line score,
// feed and box score show while watching, so nothing ahead is spoiled.
import { buildBoxScore, periodLabel, type BoxScore, type GameResult } from "@dynasty/sim";

/** The game cut off after play `upto` (inclusive); -1 = before the kickoff. */
export function gameSoFar(game: GameResult, upto: number): GameResult {
  const plays = game.plays.slice(0, upto + 1);
  return { ...game, plays, drives: game.drives.filter((d) => d.plays.to <= plays.length) };
}

export function scoreAfter(game: GameResult, upto: number): Record<string, number> {
  return upto < 0 ? { [game.home]: 0, [game.away]: 0 } : game.plays[Math.min(upto, game.plays.length - 1)]!.score;
}

export interface LineScore {
  periods: string[];
  points: Record<string, number[]>;
}

/** Points by period through play `upto` (periods not yet reached are left off). */
export function lineScoreAfter(game: GameResult, upto: number): LineScore {
  const points: Record<string, number[]> = { [game.home]: [0, 0, 0, 0], [game.away]: [0, 0, 0, 0] };
  let prev = scoreAfter(game, -1);
  for (const p of game.plays.slice(0, upto + 1)) {
    for (const team of [game.home, game.away]) {
      const row = points[team]!;
      while (row.length < p.quarter) row.push(0);
      row[p.quarter - 1]! += p.score[team]! - prev[team]!;
    }
    prev = p.score;
  }
  const n = points[game.home]!.length;
  return { periods: Array.from({ length: n }, (_, i) => periodLabel(i + 1)), points };
}

export function boxScoreAfter(game: GameResult, upto: number): BoxScore {
  return buildBoxScore(gameSoFar(game, upto));
}

/** Seconds as "31:04" (time of possession). */
export function minutes(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
