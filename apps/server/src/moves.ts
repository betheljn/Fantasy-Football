// A friend's own moves in an online league: their depth chart, injured
// reserve, free-agent signings, and trades with AI teams. Each one goes through
// the same sim rules (and the same functions, with the same arguments) as in
// the app, so a move made on a phone lands exactly the same here.
import {
  SCOUTING,
  projectProblems,
  renameProblem,
  renameStadium,
  startLeagueBusiness,
  startProject,
  type ProjectKind,
  practiceProblem,
  type PracticePlan,
  generateDraftClass,
  recruitingPoints,
  abilityProblem,
  chooseAbility,
  type CoachAbility,
  buyUpgrade,
  seasonXp,
  totalXp,
  upgradeProblem,
  type UpgradeTrack,
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
  tradeDeadline,
  type League,
  type Position,
  type TradeProposal,
  type TradeVerdict,
  type TradeWindow,
  type CoachCall,
} from "@dynasty/sim";
import { scheduleOf } from "./season.ts";
import { duelUnderWay } from "./duels.ts";
import { placeSlate } from "./picks.ts";
import type { LeagueState } from "./state.ts";

export type Move =
  | { kind: "depth"; pos: Position; ids: string[] }
  | { kind: "ir"; player: string }
  | { kind: "sign"; player: string }
  | { kind: "trade"; proposal: TradeProposal }
  /** Your calls so far in your game this week (empty: leave it all to your coaches). */
  | { kind: "coach"; game: string; calls: Array<CoachCall | null> }
  /** The next tier of an owner upgrade (any time: upgrades never touch a play). */
  | { kind: "upgrade"; track: UpgradeTrack }
  /** A new ability for one of your coaches (before the season's first week: abilities never change mid-season). */
  | { kind: "ability"; ability: CoachAbility }
  /** Your standing recruiting plan: points a week per prospect in next year's class (empty: your staff recruits). */
  | { kind: "recruit"; plan: Array<{ prospect: string; points: number }> }
  /** This week's scouting points on next year's class (empty: your scouts choose). */
  | { kind: "scout"; plan: Array<{ prospect: string; points: number }> }
  /** Build on your stadium (cash or bonds; it opens next season). */
  | { kind: "build"; project: ProjectKind; financing: "cash" | "bonds" }
  /** Name your stadium. */
  | { kind: "rename"; name: string }
  /** Your week's practice, standing until changed (null: your staff plans it). */
  | { kind: "practice"; plan: PracticePlan | null }
  /** A slate on the coming week's board: picks by prop id and side (the board sets the lines), and the points played. */
  | { kind: "slate"; picks: Array<{ prop: string; side: "over" | "under"; via?: { host: string; fade: boolean } }>; stake: number };

/** Most calls a coached game can have (a long overtime game has well under this). */
export const MAX_CALLS = 600;

export type MoveResult = { state: LeagueState; problems: []; verdict?: TradeVerdict } | { state: null; problems: string[]; verdict?: TradeVerdict };

const refuse = (...problems: string[]): MoveResult => ({ state: null, problems });

/** Trading now: the regular season up to the deadline, then draft week (playoffs done, offseason not opened). */
export function tradeWindowOf(s: LeagueState): TradeWindow | null {
  const league = s.dynasty.league;
  if (s.offseason) return null;
  if (s.weeksPlayed < scheduleOf(s).weeks) return tradesOpen(s.weeksPlayed, tradeDeadline(league)) ? seasonWindow(league, s.weeksPlayed) : null;
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
  if (duelUnderWay(s, t.from) || duelUnderWay(s, t.to)) return ["A duel is under way: trades wait until it's played."];
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

  if (move.kind === "slate") return placeSlate(s, team, move.picks, move.stake);

  if (move.kind === "upgrade") {
    // This season's XP so far counts toward your level.
    const live = totalXp(seasonXp(team, { results: p.results, playoffs: p.playoffs }));
    const problem = upgradeProblem(s.dynasty.owners?.[team], move.track, live);
    if (problem) return refuse(problem);
    return { state: { ...s, dynasty: buyUpgrade(s.dynasty, team, move.track, live) }, problems: [] };
  }

  if (move.kind === "build" || move.kind === "rename") {
    const all = s.dynasty.business ?? startLeagueBusiness(league);
    const b = all[team];
    if (!b) return refuse("No stadium for your team.");
    if (move.kind === "rename") {
      const problem = renameProblem(b, move.name, league.season);
      if (problem) return refuse(problem);
      return { state: { ...s, dynasty: { ...s.dynasty, business: { ...all, [team]: renameStadium(b, move.name, league.season) } } }, problems: [] };
    }
    const problems = projectProblems(b, move.project, team, move.financing);
    if (problems.length) return refuse(...problems);
    return { state: { ...s, dynasty: { ...s.dynasty, business: { ...all, [team]: startProject(b, move.project, team, move.financing, league.season) } } }, problems: [] };
  }

  if (move.kind === "scout") {
    if (!seasonOn) return refuse("Scouting runs during the regular season.");
    const ids = new Set(generateDraftClass(league).prospects.map((x) => x.player.id));
    if (move.plan.some((a) => !ids.has(a.prospect) || !Number.isInteger(a.points) || a.points <= 0)) return refuse("That plan doesn't match next year's class.");
    const used = move.plan.reduce((n, a) => n + a.points, 0);
    if (used > SCOUTING.pointsPerWeek) return refuse(`That's ${used} points; you have ${SCOUTING.pointsPerWeek} a week.`);
    const { [team]: _old, ...others } = s.scoutPlans ?? {};
    return { state: { ...s, scoutPlans: move.plan.length ? { ...others, [team]: move.plan } : others }, problems: [] };
  }

  if (move.kind === "practice") {
    if (!seasonOn) return refuse("Practice runs during the regular season.");
    // Practice is part of this week's game: set once it's being coached or dueled.
    if (s.coaching?.[team] || duelUnderWay(s, team)) return refuse("Your game this week is under way: practice is set until it's played.");
    if (move.plan) {
      const problem = practiceProblem(move.plan);
      if (problem) return refuse(problem);
    }
    const { practice: _old, ...rest } = league.teams[team]!;
    const updated = move.plan ? { ...rest, practice: move.plan } : rest;
    return { state: withLeague(s, { ...league, teams: { ...league.teams, [team]: updated } }), problems: [] };
  }

  if (move.kind === "recruit") {
    if (!seasonOn) return refuse("Recruiting runs during the regular season.");
    const ids = new Set(generateDraftClass(league).prospects.map((x) => x.player.id));
    if (move.plan.some((a) => !ids.has(a.prospect) || !Number.isInteger(a.points) || a.points <= 0)) return refuse("That plan doesn't match next year's class.");
    if (new Set(move.plan.map((a) => a.prospect)).size !== move.plan.length) return refuse("One entry per prospect.");
    const max = recruitingPoints(league.teams[team]);
    const used = move.plan.reduce((n, a) => n + a.points, 0);
    if (used > max) return refuse(`That's ${used} points a week; you have ${max}.`);
    const { [team]: _old, ...others } = s.recruiting ?? {};
    return { state: { ...s, recruiting: move.plan.length ? { ...others, [team]: move.plan } : others }, problems: [] };
  }

  if (move.kind === "ability") {
    if (s.weeksPlayed > 0 || s.offseason) return refuse("Coaches pick up new abilities before the season starts.");
    // Your week-1 game is already being called with the coaches' own picks.
    if (s.coaching?.[team] || duelUnderWay(s, team)) return refuse("Your week-1 game is under way: your coaches made their own picks for it.");
    const problem = abilityProblem(league.teams[team], move.ability);
    if (problem) return refuse(problem);
    return { state: withLeague(s, chooseAbility(league, team, move.ability)), problems: [] };
  }

  if (move.kind === "trade") {
    const w = tradeWindowOf(s);
    if (!w) return refuse("Trading is closed right now.");
    const t = move.proposal;
    if (t.from !== team) return refuse("You can only offer your own players and picks.");
    if (s.humans[t.to]) return refuse("Trades between friends aren't in online leagues yet.");
    if (duelUnderWay(s, team)) return refuse("Your duel is under way: trades wait until it's played.");
    const problems = checkTrade(league, w, t);
    if (problems.length) return refuse(...problems);
    const verdict = judgeTrade(league, w, t, t.to, true);
    if (!verdict.accept) return { state: null, problems: [], verdict };
    return { state: tradeOnto(s, w, t, new Set([team])), problems: [], verdict };
  }

  if (!seasonOn) return refuse("Moves can be made during the regular season.");
  const own = league.teams[team]!;
  // A duel under way is played with the rosters it started with.
  if (move.kind !== "coach" && duelUnderWay(s, team)) return refuse("Your duel is under way: roster moves wait until it's played.");

  if (move.kind === "coach") {
    const g = scheduleOf(s).games.find((x) => x.id === move.game);
    if (!g || g.week !== week || (g.home !== team && g.away !== team)) return refuse("That isn't your game this week.");
    if (s.humans[g.home === team ? g.away : g.home]) return refuse("Games between friends are duels: call yours from the duel screen.");
    if (move.calls.length > MAX_CALLS) return refuse("Too many calls.");
    const { [team]: _old, ...others } = s.coaching ?? {};
    const coaching = move.calls.length ? { ...others, [team]: { game: move.game, calls: move.calls } } : others;
    return { state: { ...s, coaching }, problems: [] };
  }

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
