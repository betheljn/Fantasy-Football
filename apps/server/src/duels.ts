// Duels: a week's game between two friends, both calling plays. The calls
// are one list in the order the game asks for them (the sim works out whose
// call each is), kept on the server; each friend is shown only what the sim's
// duelView allows (never the other's call before making their own). A friend
// can hand the rest of a drive, a half or the game to their coaches; anything
// not called when the week is played is the coaches' too.
import { duelAnswer, duelScheduledGame, duelView, type CoachCall, type DuelView, type ScheduledGame } from "@dynasty/sim";
import { scheduleOf } from "./season.ts";
import type { LeagueState } from "./state.ts";

/** Calls left to the coaches until the end of a drive, a half or the game (and which one: a drive number or a half). */
export interface Handoff {
  until: "drive" | "half" | "game";
  at: number;
}

export interface DuelEntry {
  calls: Array<CoachCall | null>;
  /** Friends who handed calls to their coaches, by team. */
  handoffs?: Record<string, Handoff>;
}

/** Which half a quarter is in (each overtime period on its own), as the sim counts them. */
const halfOf = (quarter: number) => (quarter <= 2 ? 1 : quarter <= 4 ? 2 : quarter);

/** This week's game for `team` against another friend, if it has one. */
export function duelGameFor(s: LeagueState, team: string): ScheduledGame | null {
  const sched = scheduleOf(s);
  if (s.weeksPlayed >= sched.weeks) return null;
  const week = s.weeksPlayed + 1;
  const g = sched.games.find((x) => x.week === week && (x.home === team || x.away === team));
  if (!g) return null;
  return s.humans[g.home] && s.humans[g.away] ? g : null;
}

/** A friend's duel this week has started (roster moves wait until it's played). */
export function duelUnderWay(s: LeagueState, team: string): boolean {
  const g = duelGameFor(s, team);
  return !!g && (s.duels?.[g.id]?.calls.length ?? 0) > 0;
}

export interface DuelInfo extends DuelView {
  game: string;
  home: string;
  away: string;
  week: number;
  /** Your hand-off to your coaches, if any. */
  handoff: Handoff | null;
}

/** One friend's view of their duel this week (null: no duel this week). */
export function duelFor(s: LeagueState, team: string): DuelInfo | null {
  const g = duelGameFor(s, team);
  if (!g) return null;
  const entry = s.duels?.[g.id];
  const view = duelView(s.dynasty.league, g, entry?.calls ?? [], team);
  return { ...view, game: g.id, home: g.home, away: g.away, week: g.week, handoff: entry?.handoffs?.[team] ?? null };
}

export type DuelResult = { state: LeagueState; problem: null } | { state: null; problem: string };
const refuse = (problem: string): DuelResult => ({ state: null, problem });

/**
 * A friend's call (null: their coaches' call). `at` is how many calls they saw
 * made, so a call meant for a moment that has passed is turned away.
 */
export function makeDuelCall(s: LeagueState, team: string, at: number, call: CoachCall | null): DuelResult {
  const g = duelGameFor(s, team);
  if (!g) return refuse("You don't have a game against a friend this week.");
  const entry = s.duels?.[g.id] ?? { calls: [] };
  if (at !== entry.calls.length) return refuse("The game has moved on since: have another look.");
  let calls: Array<CoachCall | null>;
  try {
    calls = duelAnswer(s.dynasty.league, g, entry.calls, team, call ?? undefined);
  } catch (e) {
    return refuse((e as Error).message);
  }
  return { state: withDuel(s, g, settle(s, g, { ...entry, calls })), problem: null };
}

/** Hand your calls to your coaches until the end of this drive, this half or the game. */
export function handDuel(s: LeagueState, team: string, until: Handoff["until"]): DuelResult {
  const g = duelGameFor(s, team);
  if (!g) return refuse("You don't have a game against a friend this week.");
  const entry = s.duels?.[g.id] ?? { calls: [] };
  const game = duelScheduledGame(s.dynasty.league, g, entry.calls);
  const p = game.prompt;
  if (!p) return refuse("The game is over.");
  const at = until === "drive" ? p.drive : until === "half" ? halfOf(p.situation.quarter) : 0;
  return { state: withDuel(s, g, settle(s, g, { ...entry, handoffs: { ...entry.handoffs, [team]: { until, at } } })), problem: null };
}

/** Answer every call that's been handed to the coaches, until one waits on a friend. */
function settle(s: LeagueState, g: ScheduledGame, entry: DuelEntry): DuelEntry {
  const game = duelScheduledGame(s.dynasty.league, g, entry.calls);
  const covered = () => {
    const p = game.prompt;
    const h = p && entry.handoffs?.[p.team];
    if (!p || !h) return false;
    return h.until === "game" || (h.until === "drive" ? p.drive === h.at : halfOf(p.situation.quarter) === h.at);
  };
  while (covered()) game.answer();
  return { ...entry, calls: game.calls };
}

function withDuel(s: LeagueState, g: ScheduledGame, entry: DuelEntry): LeagueState {
  return { ...s, duels: { ...s.duels, [g.id]: entry } };
}

/** This week's duels as the week plays them (home coached, away its rival). */
export function weekDuels(s: LeagueState, week: number) {
  const sched = scheduleOf(s);
  return Object.entries(s.duels ?? {}).flatMap(([id, d]) => {
    const g = sched.games.find((x) => x.id === id && x.week === week);
    return g ? [{ game: id, team: g.home, rival: g.away, calls: d.calls }] : [];
  });
}
