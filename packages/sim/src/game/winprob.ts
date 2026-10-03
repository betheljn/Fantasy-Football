// Win chances through a game, for showing how it swung: before kickoff from
// the two teams' strength, then after every play from the score, the time
// left, who has the ball and where. For display only: the game is already
// decided by the time anyone watches it.
import { teamRatings } from "../league/league.ts";
import type { Team } from "../model/team.ts";
import type { GameResult } from "./game.ts";

/** Spread of the final margin over a whole game, in points. */
const GAME_SD = 13.5;
/** Points of expected margin per point of team overall, and for playing at home. */
const PER_OVERALL = 1.2;
const HOME_POINTS = 2;

/** How many points better the home team should be, from the two rosters (before kickoff). */
export function pregameEdge(home: Team, away: Team, neutralSite = false): number {
  return (teamRatings(home).overall - teamRatings(away).overall) * PER_OVERALL + (neutralSite ? 0 : HOME_POINTS);
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26). */
function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Seconds of regulation left after a play; overtime keeps a floor of uncertainty (a score can come any time). */
function secondsLeft(quarter: number, clock: number): number {
  return quarter <= 4 ? (4 - quarter) * 900 + clock : clock / 4 + 100;
}

/** Events that say nothing about who has the ball or how the game stands. */
const QUIET = new Set(["timeout", "penalty"]);

/** Expected points for whoever has the ball next, from the next real snap. */
function ballValue(e: GameResult["plays"][number]["event"]): { team: string; points: number } {
  switch (e.kind) {
    case "kickoff":
      // The receiving team, at about its own 25.
      return { team: e.defense, points: 0.4 };
    case "conversion":
      return { team: e.offense, points: 0.95 };
    case "field_goal":
      return { team: e.offense, points: 2.4 };
    default:
      return { team: e.offense, points: 0.4 + (e.start.yardline - 25) * 0.06 };
  }
}

/**
 * The home team's chance to win before kickoff and after each play (aligned
 * with game.plays). Timeouts and penalties leave it where it was. After the
 * last play it's settled: 1, 0, or 0.5 for a tie.
 */
export function winChances(game: GameResult, edge: number): { pregame: number; after: number[] } {
  const pregame = phi(edge / GAME_SD);
  const after: number[] = [];
  const plays = game.plays;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i]!;
    if (i === plays.length - 1) {
      after.push(game.winner === game.home ? 1 : game.winner === game.away ? 0 : 0.5);
      continue;
    }
    if (QUIET.has(p.event.kind)) {
      after.push(after[i - 1] ?? pregame);
      continue;
    }
    const f = secondsLeft(p.quarter, p.clockAfter) / 3600;
    const lead = (p.score[game.home] ?? 0) - (p.score[game.away] ?? 0);
    // Whoever snaps next has the ball (skipping timeouts and penalties).
    let j = i + 1;
    while (j < plays.length - 1 && QUIET.has(plays[j]!.event.kind)) j++;
    const ball = ballValue(plays[j]!.event);
    const withBall = ball.team === game.home ? ball.points : -ball.points;
    const sd = GAME_SD * Math.sqrt(f) + 0.75;
    after.push(phi((lead + withBall + edge * f) / sd));
  }
  return { pregame, after };
}
