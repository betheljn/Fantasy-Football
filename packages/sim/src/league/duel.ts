// A scheduled game between two friends, both calling plays: a duel. The
// calls are kept as one list in the order the game asked for them (each
// prompt names the team it's for). Neither coach may see the other's call
// before making their own, so each is shown the calls up to the last play,
// never the other's answers since; with the seed and teams that's enough to
// replay the game so far, and the call waiting on them comes separately.
import { gameConditions } from "../game/conditions.ts";
import type { CoachCall, SnapPrompt } from "../drive/drive.ts";
import { checkAnswer } from "../drive/drive.ts";
import type { CoachedGame } from "../game/game.ts";
import { startCoachedGame } from "../game/game.ts";
import type { League } from "./league.ts";
import type { ScheduledGame } from "./schedule.ts";
import { gameDayTeam } from "../game/injuries.ts";
import { gameSeed } from "./season.ts";
import { kickoffAbilities } from "../dynasty/coaches.ts";

/** The duel as the week will play it: home coached, away its rival, picked up from the calls so far. */
export function duelScheduledGame(league: League, game: ScheduledGame, calls: ReadonlyArray<CoachCall | null> = []): CoachedGame {
  if (game.week === 1) league = kickoffAbilities(league);
  const home = gameDayTeam(league.teams[game.home]!);
  const away = gameDayTeam(league.teams[game.away]!);
  return startCoachedGame(home.team, away.team, gameSeed(league, game), game.home, { rival: game.away, conditions: gameConditions(league, game) }, calls);
}

/** A call waiting in a duel, without the game so far (replay the visible calls for that). */
export type DuelPrompt = SnapPrompt & { drive: number };

export interface DuelView {
  /** The calls this coach may see: all of them, less the other coach's answers since the last play. */
  calls: Array<CoachCall | null>;
  /** Whose call it is now (null once the game is over). */
  turn: string | null;
  /** The call waiting on this coach (null when it's the other coach's turn, or the game is over). */
  prompt: DuelPrompt | null;
  /** Calls made so far (the index the next call goes in). */
  made: number;
  /** The snap a call is waiting on (public: both sides see the down, distance and who has the ball). */
  at: { situation: SnapPrompt["situation"]; offense: string; defense: string } | null;
  over: boolean;
}

/** One coach's view of a duel. */
export function duelView(league: League, game: ScheduledGame, calls: ReadonlyArray<CoachCall | null>, team: string): DuelView {
  const g = duelScheduledGame(league, game);
  // Who each call was for, and how many plays had happened when it was made.
  const asked: Array<{ team: string; plays: number }> = [];
  for (const c of calls) {
    if (!g.prompt) break;
    asked.push({ team: g.prompt.team, plays: g.prompt.sofar.plays.length });
    g.answer(c ?? undefined);
  }
  const p = g.prompt;
  const hiddenFrom = p ? asked.findIndex((a) => a.team !== team && a.plays === p.sofar.plays.length) : -1;
  const visible = g.calls.slice(0, hiddenFrom < 0 ? g.calls.length : hiddenFrom);
  let prompt: DuelPrompt | null = null;
  if (p && p.team === team) {
    const { sofar: _sofar, ...rest } = p;
    prompt = rest;
  }
  // Who has the ball: the offense's call or the defense's are about a snap; a timeout or a try, the last play's offense.
  const last = p?.sofar.plays.at(-1)?.event;
  const offense = !p ? null : p.kind === "offense" || p.kind === "try" ? p.team : p.kind === "defense" ? p.opponent : (last?.offense ?? p.team);
  const at = p && offense ? { situation: p.situation, offense, defense: offense === game.home ? game.away : game.home } : null;
  return { calls: visible, turn: p?.team ?? null, prompt, made: g.calls.length, over: !p, at };
}

/**
 * Add `team`'s answer to its waiting call (undefined: the coaches' call).
 * Throws if it isn't that team's call or the answer doesn't fit.
 */
export function duelAnswer(league: League, game: ScheduledGame, calls: ReadonlyArray<CoachCall | null>, team: string, answer: CoachCall | undefined): Array<CoachCall | null> {
  const g = duelScheduledGame(league, game, calls);
  if (!g.prompt) throw new Error("The game is over");
  if (g.prompt.team !== team) throw new Error("It isn't your call");
  checkAnswer(g.prompt, answer);
  g.answer(answer);
  return g.calls;
}
