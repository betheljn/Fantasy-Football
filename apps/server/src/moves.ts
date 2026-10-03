// A friend's own moves in an online league: their depth chart, injured
// reserve, free-agent signings, and trades with AI teams. Each one goes through
// the same sim rules (and the same functions, with the same arguments) as in
// the app, so a move made on a phone lands exactly the same here.
import {
  DRAFT_WEEK,
  POSITIONS,
  applyTrade,
  checkTrade,
  draftOrder,
  draftWeekWindow,
  irProblems,
  judgeTrade,
  logTeam,
  logTrades,
  placeOnIR,
  seasonWindow,
  signFreeAgent,
  signingProblems,
  startLog,
  tradesOpen,
  type League,
  type Position,
  type TradeProposal,
  type TradeVerdict,
  type TradeWindow,
} from "@dynasty/sim";
import { scheduleOf } from "./season.ts";
import type { LeagueState } from "./state.ts";

export type Move =
  | { kind: "depth"; pos: Position; ids: string[] }
  | { kind: "ir"; player: string }
  | { kind: "sign"; player: string }
  | { kind: "trade"; proposal: TradeProposal };

export type MoveResult = { state: LeagueState; problems: []; verdict?: TradeVerdict } | { state: null; problems: string[]; verdict?: TradeVerdict };

const refuse = (...problems: string[]): MoveResult => ({ state: null, problems });

/** Trading now: the regular season up to the deadline, then draft week (playoffs done, offseason not opened). */
export function tradeWindowOf(s: LeagueState): TradeWindow | null {
  const league = s.dynasty.league;
  if (s.offseason) return null;
  if (s.weeksPlayed < scheduleOf(s).weeks) return tradesOpen(s.weeksPlayed) ? seasonWindow(league, s.weeksPlayed) : null;
  return s.progress.playoffs ? draftWeekWindow(league, draftOrder(s.progress.playoffs)) : null;
}

const withLeague = (s: LeagueState, league: League): LeagueState => ({ ...s, dynasty: { ...s.dynasty, league } });

/** Make a trade (already checked): rosters, picks, the lineup log and the season's trades. Friends keep their depth charts. */
function tradeOnto(s: LeagueState, w: TradeWindow, t: TradeProposal, keepDepth: ReadonlySet<string>): LeagueState {
  const league = s.dynasty.league;
  const p = s.progress;
  const done = applyTrade(league, w, t, keepDepth);
  const lineups = logTrades(p.lineups ?? startLog(league), league, done.league, [done.record], w.week === 0 ? DRAFT_WEEK : w.week);
  return { ...withLeague(s, done.league), progress: { ...p, lineups, trades: [...p.trades, done.record] } };
}

/** Can one friend offer this trade to another right now? Empty = yes (the other friend decides). */
export function friendTradeProblems(s: LeagueState, team: string, t: TradeProposal): string[] {
  const w = tradeWindowOf(s);
  if (!w) return ["Trading is closed right now."];
  if (t.from !== team) return ["You can only offer your own players and picks."];
  if (!s.humans[t.to] || t.to === team) return ["Offers go to a friend's team."];
  return checkTrade(s.dynasty.league, w, t);
}

/** A friend accepted: the trade happens if it still works (rosters and picks may have moved since the offer). */
export function acceptFriendTrade(s: LeagueState, t: TradeProposal): MoveResult {
  const problems = friendTradeProblems(s, t.from, t);
  if (problems.length) return refuse(...problems);
  return { state: tradeOnto(s, tradeWindowOf(s)!, t, new Set([t.from, t.to])), problems: [] };
}

export function applyMove(s: LeagueState, team: string, move: Move): MoveResult {
  const league = s.dynasty.league;
  const p = s.progress;
  const seasonOn = s.weeksPlayed < scheduleOf(s).weeks;
  const week = s.weeksPlayed + 1;
  // (A league started before rosters were logged has no log yet; moves start it, as in the app.)
  const log = p.lineups ?? startLog(league);

  if (move.kind === "trade") {
    const w = tradeWindowOf(s);
    if (!w) return refuse("Trading is closed right now.");
    const t = move.proposal;
    if (t.from !== team) return refuse("You can only offer your own players and picks.");
    if (s.humans[t.to]) return refuse("Trades between friends aren't in online leagues yet.");
    const problems = checkTrade(league, w, t);
    if (problems.length) return refuse(...problems);
    const verdict = judgeTrade(league, w, t, t.to, true);
    if (!verdict.accept) return { state: null, problems: [], verdict };
    return { state: tradeOnto(s, w, t, new Set([team])), problems: [], verdict };
  }

  if (!seasonOn) return refuse("Moves can be made during the regular season.");
  const own = league.teams[team]!;

  if (move.kind === "depth") {
    if (!POSITIONS.includes(move.pos)) return refuse(`No position ${move.pos}.`);
    const onRoster = new Set(own.roster.map((x) => x.id));
    if (move.ids.length === 0 || new Set(move.ids).size !== move.ids.length || move.ids.some((id) => !onRoster.has(id))) {
      return refuse("That depth chart doesn't match your roster.");
    }
    const updated = { ...own, depthChart: { ...own.depthChart, [move.pos]: move.ids } };
    return {
      state: { ...withLeague(s, { ...league, teams: { ...league.teams, [team]: updated } }), progress: { ...p, lineups: logTeam(log, updated, week) } },
      problems: [],
    };
  }

  if (move.kind === "ir") {
    const problems = irProblems(own, move.player);
    if (problems.length) return refuse(...problems);
    const done = placeOnIR(league, team, move.player, s.weeksPlayed, true);
    return {
      state: { ...withLeague(s, done.league), progress: { ...p, lineups: logTeam(log, done.league.teams[team]!, week), moves: [...p.moves, done.move] } },
      problems: [],
    };
  }

  const problems = signingProblems(league, league.season, team, move.player);
  if (problems.length) return refuse(...problems);
  const done = signFreeAgent(league, league.season, team, move.player, s.weeksPlayed, true);
  return {
    state: { ...withLeague(s, done.league), progress: { ...p, lineups: logTeam(log, done.league.teams[team]!, week), moves: [...p.moves, done.move] } },
    problems: [],
  };
}
