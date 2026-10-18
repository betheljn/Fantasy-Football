// The online league's season, advanced one step at a time by the server: each
// regular-season week, then the playoffs, then the offseason stage by stage
// (draft week ends; staff, hires, re-signings, the draft, free agency, cuts)
// into the next season. Pure functions over the league state; the sim decides
// everything.
//
// Friends' teams are never traded by the AI. A friend who readied up runs their
// own team that week; anyone who didn't is covered by the AI (injured reserve
// and free-agent signings, as for every AI team).
import {
  type Story,
  withOwners,
  syncVenues,
  advanceScoutingWeek,
  createScouting,
  generateDraftClass,
  seasonWeeks,
  type ScoutingState,
  addGameToSeason,
  aiInSeasonMoves,
  aiTradeWeek,
  collectSeason,
  collectWeek,
  computeRecords,
  createSeasonStats,
  divisionStandings,
  draftWeekTrades,
  finishStagedOffseason,
  OFFSEASON_STAGES,
  STAGE_CHOICE_KEY,
  injuryNews,
  logTeam,
  logTrades,
  playWeek,
  seasonSchedule,
  seasonWindow,
  simulatePlayoffs,
  startCollection,
  startLog,
  withSpring,
  type Collection,
  type GameSummary,
  type InSeasonMove,
  type OffseasonStage,
  type PlayedSeason,
  type InjuryNews,
  type LineupLog,
  type PlayoffResult,
  type Schedule,
  type SeasonStats,
  type TradeRecord,
} from "@dynasty/sim";
import type { LeagueState } from "./state.ts";
import { weekDuels } from "./duels.ts";
import { campNews, postseasonStories, weekNews } from "./news.ts";
import { openBoard, picksOf, settleWeek } from "./picks.ts";

/** Everything played this season so far (cleared when the next season opens). */
export interface SeasonProgress {
  results: GameSummary[];
  stats: SeasonStats;
  trades: TradeRecord[];
  collection: Collection;
  injuryNews: InjuryNews[];
  moves: InSeasonMove[];
  /** The playoffs, once played. */
  playoffs: PlayoffResult | null;
  /** Each week, the friends' teams the AI covered (they didn't ready up). */
  covered: Array<{ week: number; teams: string[] }>;
  /** Rosters through the season, so every game replays exactly. */
  lineups: LineupLog;
  /** Next year's draft class as every team has scouted and recruited it so far (absent: from before weekly scouting online). */
  scouting?: ScoutingState;
  /** The season's news: the national feed, and each friend's own stories (tagged for them; sent only to them). */
  news?: Story[];
}

/**
 * What one advance did, for the members' feed. An offseason step finishes
 * `done` ("open" = draft week ended) and moves on to `next` (null: the new
 * season opened); `covered` are friends who left that stage to the AI.
 */
export type AdvanceSummary =
  | { kind: "week"; season: number; week: number; games: GameSummary[]; covered: string[]; trades: number; moves: number }
  | { kind: "playoffs"; season: number; champion: string; runnerUp: string }
  | { kind: "offseason"; season: number; done: "open" | OffseasonStage; next: OffseasonStage | null; covered: string[]; nextSeason?: number };

/** What the next advance plays: a week, the playoffs, or an offseason stage ("open": draft week ends). */
export type NextStep = { kind: "week"; week: number } | { kind: "playoffs" } | { kind: "offseason"; stage: "open" | OffseasonStage };

export function emptyProgress(): SeasonProgress {
  return { results: [], stats: createSeasonStats(), trades: [], collection: startCollection(undefined), injuryNews: [], moves: [], playoffs: null, covered: [], lineups: { entries: [], departed: [] } };
}

const schedules = new Map<string, Schedule>();
/** This season's schedule (deterministic, so worked out once per process). */
export function scheduleOf(s: LeagueState): Schedule {
  const key = `${s.seed}:${s.dynasty.league.season}`;
  let sched = schedules.get(key);
  if (!sched) {
    sched = seasonSchedule(s.dynasty);
    schedules.set(key, sched);
  }
  return sched;
}

export function nextStep(s: LeagueState): NextStep {
  if (s.offseason) return { kind: "offseason", stage: s.offseason.stage };
  if (s.weeksPlayed < scheduleOf(s).weeks) return { kind: "week", week: s.weeksPlayed + 1 };
  return s.progress.playoffs ? { kind: "offseason", stage: "open" } : { kind: "playoffs" };
}

const humanTeams = (s: LeagueState) => new Set(Object.keys(s.humans));
const tradedIds = (trades: readonly TradeRecord[]) => new Set(trades.flatMap((t) => t.players.map((p) => p.id)));

/** A season opens: fresh progress and the AI's first round of trade talks (before week 1). */
export function openSeason(s: LeagueState): LeagueState {
  // Last year's recruiting plans were for last year's class.
  const { recruiting: _plans, ...fresh } = s;
  s = { ...fresh, dynasty: syncVenues(withOwners(s.dynasty, humanTeams(s))) };
  const league = s.dynasty.league;
  const talks = aiTradeWeek(league, seasonWindow(league, 0), humanTeams(s));
  const lineups = logTrades(startLog(league), league, talks.league, talks.trades, 1);
  // Training camp's stories open the season's news.
  const news = s.dynasty.camp?.length ? campNews(league, s.dynasty.camp, [...humanTeams(s)]) : [];
  const opened: LeagueState = { ...s, dynasty: { ...s.dynasty, league: talks.league }, weeksPlayed: 0, progress: { ...emptyProgress(), collection: startCollection(s.dynasty.recordBook), trades: talks.trades, lineups, ...(news.length ? { news } : {}) } };
  // Week 1's board and show (last season's shows are done; the hosts' records carry on).
  return openBoard({ ...opened, picks: { ...picksOf(opened), shows: [], last: [] } }, scheduleOf(opened), 1);
}

/**
 * Play the next step. `ready` are the friends' teams that readied up; the
 * other friends' teams are covered by the AI this time.
 */
export function advance(s: LeagueState, ready: ReadonlySet<string>): { state: LeagueState; summary: AdvanceSummary } {
  // Every friend is an owner, earning XP (leagues from before owners get theirs now).
  s = { ...s, dynasty: syncVenues(withOwners(s.dynasty, humanTeams(s))) };
  const step = nextStep(s);
  if (step.kind === "week") return playNextWeek(s, ready);
  if (step.kind === "playoffs") return playPlayoffs(s);
  return step.stage === "open" ? openOffseason(s) : finishStage(s, step.stage);
}

function playNextWeek(s: LeagueState, ready: ReadonlySet<string>) {
  const sched = scheduleOf(s);
  const week = s.weeksPlayed + 1;
  const p = s.progress;
  const league0 = s.dynasty.league;
  // Stats are added in place: work on a copy so the state passed in is left alone.
  const stats = structuredClone(p.stats);
  // Friends' coached games are played with their calls (anything they didn't call is their coaches').
  const coached = Object.entries(s.coaching ?? {})
    .filter(([, c]) => sched.games.some((g) => g.id === c.game && g.week === week))
    .map(([team, c]) => ({ game: c.game, team, calls: c.calls }) as { game: string; team: string; calls: typeof c.calls; rival?: string })
    // Games between friends: both coaches' calls.
    .concat(weekDuels(s, week));
  // Scouting and recruiting for the week (friends recruit with their standing plans; everyone else on their own).
  const cls = generateDraftClass(league0);
  const scoutingNow = p.scouting ?? createScouting(league0, cls);
  const recruiting = Object.fromEntries(Object.entries(s.recruiting ?? {}).filter(([team, plan]) => s.humans[team] && plan.length > 0));
  // Friends who placed this week's scouting points spend them as placed (the rest scout on their own).
  const scoutChoices = Object.fromEntries(Object.entries(s.scoutPlans ?? {}).filter(([team, plan]) => s.humans[team] && plan.length > 0));
  const scouting = scoutingNow.week < seasonWeeks(scoutingNow) ? advanceScoutingWeek(scoutingNow, league0, cls, scoutChoices, recruiting) : scoutingNow;
  const played = playWeek(league0, sched, week, (g) => addGameToSeason(stats, g), coached);
  const collection = collectWeek(structuredClone(p.collection), league0, sched.season, played.games);
  const hurt = injuryNews(league0, [...played.games.flatMap((g) => g.result.injuries), ...played.practiceInjuries], week);
  // Injured reserve and signings: the AI's teams, plus friends who didn't ready up.
  const runOwn = new Set([...humanTeams(s)].filter((t) => ready.has(t)));
  const covered = [...humanTeams(s)].filter((t) => !ready.has(t)).sort();
  const ai = aiInSeasonMoves(played.league, sched.season, week, runOwn);
  // (A league started before rosters were logged starts its log now.)
  let lineups = p.lineups ?? startLog(league0);
  for (const abbr of new Set(ai.moves.map((m) => m.team))) lineups = logTeam(lineups, ai.league.teams[abbr]!, week + 1);
  // Trade talks for next week, never involving friends' teams.
  const talks = aiTradeWeek(ai.league, seasonWindow(ai.league, week), humanTeams(s), tradedIds(p.trades));
  lineups = logTrades(lineups, ai.league, talks.league, talks.trades, week + 1);
  const games = played.games.map((g) => g.summary);
  const news = weekNews({
    before: league0,
    after: talks.league,
    schedule: sched,
    week,
    games: played.games,
    resultsBefore: p.results,
    stats,
    injuries: hurt,
    trades: talks.trades,
    ...(s.dynasty.careers ? { careers: s.dynasty.careers } : {}),
    rivalryHistory: s.dynasty.rivalryGames ?? [],
    told: p.news ?? [],
    friends: [...humanTeams(s)],
  });
  const progress: SeasonProgress = {
    ...p,
    results: [...p.results, ...games],
    stats,
    trades: [...p.trades, ...talks.trades],
    collection,
    injuryNews: [...p.injuryNews, ...hurt],
    moves: [...p.moves, ...ai.moves],
    covered: covered.length ? [...p.covered, { week, teams: covered }] : p.covered,
    lineups,
    scouting,
    news: [...(p.news ?? []), ...news],
  };
  // The week's slates and the hosts' picks are settled; then next week's board and show.
  const settled = settleWeek({ ...withoutCoaching(s), dynasty: { ...s.dynasty, league: talks.league }, weeksPlayed: week, progress }, sched.season, week, played.games);
  return {
    state: openBoard(settled, sched, week + 1),
    summary: { kind: "week" as const, season: sched.season, week, games, covered, trades: talks.trades.length, moves: ai.moves.length },
  };
}

/** The week's coached calls, duels and scouting points are used up once it's played. */
function withoutCoaching(s: LeagueState): LeagueState {
  const { coaching: _done, duels: _duels, scoutPlans: _scouted, ...rest } = s;
  return rest;
}

function seasonResult(s: LeagueState) {
  const sched = scheduleOf(s);
  const { results } = s.progress;
  return { season: sched.season, schedule: sched, results, standings: divisionStandings(s.dynasty.league, results) };
}

function playPlayoffs(s: LeagueState) {
  const playoffs = simulatePlayoffs(s.dynasty.league, seasonResult(s));
  const news = postseasonStories(s.dynasty.league, s.dynasty.league.season, playoffs, [...humanTeams(s)]);
  return {
    state: { ...s, progress: { ...s.progress, playoffs, news: [...(s.progress.news ?? []), ...news] } },
    summary: { kind: "playoffs" as const, season: s.dynasty.league.season, champion: playoffs.champion, runnerUp: playoffs.runnerUp },
  };
}

/** The season as played, for the offseason (the same every stage, so it always works out the same). */
export function playedSeason(s: LeagueState): PlayedSeason {
  const p = s.progress;
  return { season: seasonResult(s), stats: p.stats, playoffs: p.playoffs!, trades: p.trades, collection: p.collection, ...(p.scouting ? { scouting: p.scouting } : {}) };
}

/** Draft week ends (the AI's last trades) and the offseason opens: friends' staff calls are due first. */
function openOffseason(s: LeagueState) {
  const p = s.progress;
  const playoffs = p.playoffs!;
  const season = seasonResult(s);
  const week = draftWeekTrades(s.dynasty.league, playoffs, humanTeams(s), tradedIds(p.trades));
  // The season's moments, settled now so the offseason's stages all start from the same place.
  const collection = structuredClone(p.collection);
  collectSeason(collection, s.dynasty.league, season.season, p.stats, computeRecords(s.dynasty.league, p.results), playoffs);
  const state: LeagueState = {
    ...s,
    dynasty: { ...s.dynasty, league: week.league },
    progress: { ...p, trades: [...p.trades, ...week.trades], collection },
    offseason: { stage: "staff", choices: {} },
  };
  return { state, summary: { kind: "offseason" as const, season: season.season, done: "open" as const, next: "staff" as const, covered: [] } };
}

/**
 * An offseason stage closes: friends who made no call there are left to the
 * AI. After the cuts, the offseason is worked out with everyone's calls, the
 * spring season is played, and the next season opens.
 */
function finishStage(s: LeagueState, stage: OffseasonStage) {
  const o = s.offseason!;
  const made = o.choices[STAGE_CHOICE_KEY[stage]] ?? {};
  const covered = [...humanTeams(s)].filter((t) => !(t in made)).sort();
  const season = s.dynasty.league.season;
  const i = OFFSEASON_STAGES.indexOf(stage);
  if (i < OFFSEASON_STAGES.length - 1) {
    const next = OFFSEASON_STAGES[i + 1]!;
    return { state: { ...s, offseason: { ...o, stage: next } }, summary: { kind: "offseason" as const, season, done: stage, next, covered } };
  }
  const done = finishStagedOffseason(s.dynasty, playedSeason(s), o.choices).dynasty;
  const dynasty = withSpring(done, humanTeams(s));
  const { offseason: _over, ...rest } = s;
  const next = openSeason({ ...rest, dynasty });
  return { state: next, summary: { kind: "offseason" as const, season, done: stage, next: null, covered, nextSeason: dynasty.league.season } };
}
