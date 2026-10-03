// The dynasty loop: play a season, then run the offseason, over and over.
// Each call returns a new Dynasty; nothing is mutated, so every past season's
// league (and therefore every game) can still be replayed.
import { teamChoices, type PerTeam } from "../choices.ts";
import { applyBreakouts, playSpring, type SpringSeason } from "../spring/spring.ts";
import { closeSeasonBooks, startLeagueBusiness, type SeasonFinances, type TeamBusiness } from "../business/business.ts";
import { hofBallot, hofVote, inductees, type HofVote, type Inductee } from "../collect/halloffame.ts";
import { rivalries, rivalryGames, type RivalryGame } from "../collect/rivalries.ts";
import { collectSeason, collectWeek, startCollection, type Collection, type Moment, type RecordBook } from "../collect/moments.ts";
import { aiInSeasonMoves, endSeasonMoves, freeAgentPool } from "../contracts/inseason.ts";
import { POSITIONS, BASE_STARTERS, type Position } from "../model/positions.ts";
import { capHit, deadMoney } from "../model/contract.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { ROSTER_MAX, starters } from "../model/team.ts";
import { generateLeague, allTeams, teamRatings, type League } from "../league/league.ts";
import { REGULAR_SEASON_WEEKS } from "../league/schedule.ts";
import { generateSchedule, type Schedule } from "../league/schedule.ts";
import { playWeek, type SeasonResult } from "../league/season.ts";
import { healAll } from "../game/injuries.ts";
import { aiTradeWeek, draftWeekWindow, seasonWindow, type TradeRecord } from "../contracts/trades.ts";
import { simulatePlayoffs, type PlayoffResult } from "../league/playoffs.ts";
import { divisionStandings, type DivisionStandings, type TeamRecord } from "../league/standings.ts";
import { PLAYER_STAT_KEYS, type PlayerStatKey } from "../stats/boxscore.ts";
import { addGameToSeason, createSeasonStats, type SeasonStats } from "../league/seasonstats.ts";
import { computeAwards, type Award } from "./awards.ts";
import { developLeague } from "./development.ts";
import { generateDraftClass, type DraftClass } from "./draftclass.ts";
import { draftOrder, draftSteps, runDraft, type DraftPick, type DraftResult, type DraftTurn } from "./draft.ts";
import { processRetirements, type Retiree, type RetirementResult } from "./retirement.ts";
import { ROSTER_MIN, ROSTER_POSITION_MAX, makeRosterMoves, type RosterCuts } from "./roster.ts";
import { assignContracts } from "../gen/contract-gen.ts";
import {
  contractPlan,
  openContractYear,
  freeAgencyPlan,
  runFreeAgency,
  settleCap,
  signDraftPicks,
  summarizeContracts,
  type ContractMove,
  type ContractPlan,
  type ContractSummary,
  type FreeAgencyChoices,
  type FreeAgencyResult,
  type FreeAgencyPlan,
  type IncentiveTriggers,
  type OpenYearResult,
  type ResignChoices,
} from "../contracts/offseason.ts";
import { advanceScoutingWeek, createScouting, runCombine, scoutSeason, type ScoutingState } from "./scouting.ts";
import {
  staffHiring,
  staffReleases,
  type CoachOfTheYear,
  type StaffCareer,
  type StaffChange,
  type StaffDecisions,
  type StaffHires,
  type StaffOffseasonResult,
  type StaffReleases,
} from "./staffcareers.ts";
import type { StaffMember } from "../model/staff.ts";
import { computeRecords, winPct } from "../league/standings.ts";

/** League-wide talent and age, recorded each season to watch for drift. */
export interface TalentSnapshot {
  /** Average starter overall across the league. */
  starterOverall: number;
  /** Average overall of everyone on a roster. */
  rosterOverall: number;
  averageAge: number;
  /** Share of rostered players aged 30 or older. */
  thirtyPlus: number;
  /** Players rated 80 or better. */
  stars: number;
}

export interface SeasonRecord {
  season: number;
  champion: string;
  runnerUp: string;
  /** Final regular-season Top 25 (team abbr + record). */
  top25: Array<{ rank: number; team: string; record: string }>;
  divisionWinners: string[];
  awards: Award[];
  /** First ten picks of the draft held after this season. */
  topPicks: Array<{ pick: number; team: string; player: string; position: string }>;
  /** The five best players who retired after this season. */
  notableRetirements: Array<{ player: string; position: string; team: string; age: number; overall: number }>;
  talent: TalentSnapshot;
  coachOfTheYear: CoachOfTheYear | null;
  /** Firings, retirements and hires this offseason. */
  staffChanges: StaffChange[];
  /** Re-signings, extensions, free agency, cuts and dead money this offseason. */
  contracts: ContractSummary;
  /** Veteran price level this offseason (1 = base market curve). */
  marketIndex: number;
}

export interface CareerLine {
  id: PlayerId;
  name: string;
  position: string;
  /** Teams in order played for. */
  teams: string[];
  seasons: number;
  games: number;
  stats: Record<PlayerStatKey, number>;
  /** Last season he played, his jersey then, and seasons with each team. */
  lastSeason?: number;
  jersey?: number;
  teamSeasons?: Record<string, number>;
}

export interface Dynasty {
  /** The league as it stands for the next season to be played. */
  league: League;
  history: SeasonRecord[];
  careers: Map<PlayerId, CareerLine>;
  /** Division slot order for the next schedule (last season's finish). */
  slotOrder?: Record<string, string[]>;
  /** Coaches and executives out of work, available to hire. */
  staffPool: StaffMember[];
  staffCareers: Map<string, StaffCareer>;
  /** Each team's win pct last season (for multi-year job reviews). */
  lastWinPct?: Map<string, number>;
  /** League records since the dynasty began, and every moment worth keeping. */
  recordBook?: RecordBook;
  moments?: Moment[];
  /** Every rivalry game since the dynasty began (for the trophies and series records). */
  rivalryGames?: RivalryGame[];
  /** The Hall of Fame, and each year's vote. */
  hallOfFame?: Inductee[];
  hofVotes?: HofVote[];
  /** Every team's business (market, stadium, fans, prices, cash), and the last few seasons' books. */
  business?: Record<string, TeamBusiness>;
  finances?: Record<string, SeasonFinances[]>;
  /** The last few spring seasons. */
  springs?: SpringSeason[];
}

/** Offseasons simulated (without games) before a new dynasty's first season. */
export const BURN_IN_OFFSEASONS = 15;

/**
 * Start a new dynasty. A freshly generated league's young players are more
 * talented than real draft classes, so on its own the league would spike in
 * quality for a decade and settle back. Running the offseason cycle quietly
 * first (retire, develop, draft, cut; no games) starts the dynasty from a
 * settled league with realistic ages and career stages.
 */
export function startDynasty(seed: number | string, burnIn = BURN_IN_OFFSEASONS): Dynasty {
  const steps = buildDynasty(seed, burnIn);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * startDynasty one offseason at a time: yields progress (0-1) after each quiet
 * offseason so an app can stay responsive and show it; returns the dynasty.
 */
export function* buildDynasty(seed: number | string, burnIn = BURN_IN_OFFSEASONS): Generator<number, Dynasty, void> {
  // The quiet offseasons are the years before the first season, so their
  // draft classes (and player ids) never collide with the real ones.
  const generated = generateLeague(seed);
  let league: League = { ...generated, season: generated.season - burnIn };
  for (let i = 0; i < burnIn; i++) {
    league = quietOffseason(league);
    yield (i + 1) / (burnIn + 1);
  }
  // Fresh contracts for the settled league (burn-in rookies arrived without deals).
  league = assignContracts(league);
  return { league, history: [], careers: new Map(), staffPool: [], staffCareers: new Map() };
}

/**
 * An offseason without a season: draft order by team strength (weakest first),
 * scouting at its automatic end-of-season level, then the usual moves.
 */
export function quietOffseason(league: League): League {
  const draftClass = generateDraftClass(league);
  const scouting = runCombine({ ...createScouting(league, draftClass), week: REGULAR_SEASON_WEEKS });
  const order = allTeams(league)
    .map((t) => ({ t: t.abbr, r: teamRatings(t).overall }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.t);
  const retired = processRetirements(league);
  const developed = developLeague(retired.league);
  const draft = runDraft(developed, draftClass, scouting, order);
  const moves = makeRosterMoves(draft.league, { undrafted: draft.undrafted, scouting, order });
  const rostered = new Set(allTeams(moves.league).flatMap((t) => t.roster.map((p) => p.id)));
  const freeAgents = freeAgentPool([...moves.cuts.map((c) => c.player), ...moves.unsigned.map((p) => p.player)], rostered);
  return { ...moves.league, season: league.season + 1, freeAgents };
}

/** Bring in-season scouting to draft day: any weeks not scouted get the AI's choices, then the combine. */
export function finishScouting(scouting: ScoutingState, league: League, draftClass: DraftClass): ScoutingState {
  let state = scouting;
  while (state.week < REGULAR_SEASON_WEEKS) state = advanceScoutingWeek(state, league, draftClass);
  return state.combineDone ? state : runCombine(state);
}

export function talentSnapshot(league: League): TalentSnapshot {
  const teams = allTeams(league);
  const starterOvr = teams.flatMap((t) => POSITIONS.flatMap((pos) => starters(t, pos, BASE_STARTERS[pos]).map(playerOverall)));
  const roster = teams.flatMap((t) => t.roster);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    starterOverall: mean(starterOvr),
    rosterOverall: mean(roster.map(playerOverall)),
    averageAge: mean(roster.map((p) => p.age)),
    thirtyPlus: roster.filter((p) => p.age >= 30).length / roster.length,
    stars: roster.filter((p) => playerOverall(p) >= 80).length,
  };
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

/** Play one season and its offseason. Returns the dynasty ready for the next season. */
export function advanceSeason(dynasty: Dynasty): Dynasty {
  const played = playSeason(dynasty);
  const traded = new Set((played.trades ?? []).flatMap((t) => t.players.map((p) => p.id)));
  const draftWeek = draftWeekTrades(played.league, played.playoffs, new Set(), traded);
  const next = finishSeason({ ...dynasty, league: draftWeek.league }, { ...played, trades: [...(played.trades ?? []), ...draftWeek.trades] }).dynasty;
  return withSpring(next);
}

/** The spring season before `dynasty.league.season`: played, its breakouts sent home better. */
export function withSpring(dynasty: Dynasty, keepDepth: ReadonlySet<string> = new Set()): Dynasty {
  const { spring } = playSpring(dynasty.league, dynasty.league.season);
  return { ...dynasty, league: applyBreakouts(dynasty.league, spring, keepDepth), springs: [...(dynasty.springs ?? []), spring].slice(-3) };
}

/**
 * Draft week: once the playoffs are over, AI teams (all but `humans`) make a
 * round of trades, with the draft order known. Run it before the offseason.
 */
export function draftWeekTrades(league: League, playoffs: PlayoffResult, humans: ReadonlySet<string> = new Set(), traded: ReadonlySet<PlayerId> = new Set()): { league: League; trades: TradeRecord[] } {
  return aiTradeWeek(league, draftWeekWindow(league, draftOrder(playoffs)), humans, traded);
}

/** This season's schedule (division slots come from last season's finish). */
export function seasonSchedule(dynasty: Dynasty): Schedule {
  return generateSchedule(dynasty.league, dynasty.slotOrder ? { slotOrder: dynasty.slotOrder } : {});
}

/** A season as played: every regular-season result, the season's stats, and the playoffs. */
export interface PlayedSeason {
  season: SeasonResult;
  stats: SeasonStats;
  playoffs: PlayoffResult;
  /** Scouting of next year's class done during the season (e.g. with a user's weekly choices); AI scouting if absent. */
  scouting?: ScoutingState;
  /** Trades made during the season. */
  trades?: TradeRecord[];
  /** Moments and the record book through the season (the season-long moments come at the end). */
  collection?: Collection;
  /** Your Hall of Fame ballot (up to five names). */
  hofVote?: PlayerId[];
}

/**
 * Play the whole season at once, week by week: trade talks before each week
 * up to the deadline, then the week's games. Returns the season and the
 * league as it ended (rosters changed by trades). An app can instead play it
 * week by week itself (same trades, games and seeds).
 */
export function playSeason(dynasty: Dynasty): PlayedSeason & { league: League } {
  const stats = createSeasonStats();
  const schedule = seasonSchedule(dynasty);
  let league = dynasty.league;
  const trades: TradeRecord[] = [];
  const traded = new Set<PlayerId>();
  const results = [];
  let collection = startCollection(dynasty.recordBook);
  for (let week = 1; week <= schedule.weeks; week++) {
    const talks = aiTradeWeek(league, seasonWindow(league, week - 1), new Set(), traded);
    league = talks.league;
    for (const t of talks.trades) {
      trades.push(t);
      for (const p of t.players) traded.add(p.id);
    }
    const played = playWeek(league, schedule, week, (g) => addGameToSeason(stats, g));
    collection = collectWeek(collection, league, schedule.season, played.games);
    league = aiInSeasonMoves(played.league, schedule.season, week).league;
    for (const g of played.games) results.push(g.summary);
  }
  const season = { season: schedule.season, schedule, results, standings: divisionStandings(league, results) };
  return { season, stats, playoffs: simulatePlayoffs(league, season), trades, league, collection };
}

/** Everything the offseason did, in full (history keeps only the highlights). */
export interface OffseasonLog {
  retirees: Retiree[];
  draft: DraftPick[];
  contractMoves: ContractMove[];
  staffChanges: StaffChange[];
}

/**
 * Close out a played season: awards, careers, then the offseason (staff,
 * retirements, development, contracts, the draft, free agency, roster moves).
 * Returns the dynasty ready for next season and a full log of the offseason.
 */
export function finishSeason(dynasty: Dynasty, played: PlayedSeason): { dynasty: Dynasty; log: OffseasonLog } {
  return finishOffseason(beginOffseason(dynasty, played));
}

/**
 * The offseason paused where a team's own decisions come in: awards and
 * careers recorded, staff moves, retirements and development done; contracts,
 * the draft and free agency still to come.
 */
export interface OffseasonState {
  dynasty: Dynasty;
  played: PlayedSeason;
  awards: Award[];
  standings: DivisionStandings[];
  careers: Map<PlayerId, CareerLine>;
  order: string[];
  staff: StaffOffseasonResult;
  records: Map<string, TeamRecord>;
  retired: RetirementResult;
  /** Rosters after retirements and development. */
  developed: League;
  draftClass: DraftClass;
  scouting: ScoutingState;
  winPct: Map<string, number>;
  triggers: IncentiveTriggers;
  /** Set once expiring contracts are settled (resolveContracts); the draft comes next. */
  contracts?: OpenYearResult;
  /** Set once the draft and free agency are done (runOffseasonFreeAgency); roster cuts come next. */
  freeAgency?: { draft: DraftResult; result: FreeAgencyResult };
}

/** Your team's calls (or several teams') for the rest of the offseason (anything left out is the AI's). */
export interface OffseasonChoices {
  resign?: PerTeam<ResignChoices>;
  freeAgency?: PerTeam<FreeAgencyChoices>;
}

/** A team's re-signing picture at this point of the offseason. */
export function offseasonContractPlan(state: OffseasonState, team: string): ContractPlan {
  return contractPlan(state.dynasty.league, state.developed, state.triggers, state.order, team);
}

/** Your calls on your own staff this offseason, or several teams' (anything left out is the AI's). */
export interface StaffChoices {
  decisions?: PerTeam<StaffDecisions>;
  hires?: PerTeam<StaffHires>;
}

/** The staff offseason after departures (with your decisions), before hiring: for listing your candidates. */
export function offseasonStaffReleases(dynasty: Dynasty, played: PlayedSeason, decisions?: PerTeam<StaffDecisions>): StaffReleases {
  const league = dynasty.league;
  return staffReleases(league, played.season.results, played.playoffs, draftOrder(played.playoffs), dynasty.staffPool, dynasty.staffCareers, dynasty.lastWinPct, decisions);
}

export function beginOffseason(dynasty: Dynasty, played: PlayedSeason, staffChoices: StaffChoices = {}): OffseasonState {
  // Injured reserve rejoins the roster, everyone hurt heals, and last season's free agents leave.
  const league = healAll(endSeasonMoves(dynasty.league));
  const { season, stats, playoffs } = played;

  // The class entering next season was scouted while this season was played.
  const draftClass = generateDraftClass(league);
  const scouting = played.scouting ? finishScouting(played.scouting, league, draftClass) : scoutSeason(league, draftClass);

  const awards = computeAwards(league, stats, season.results);
  const standings = divisionStandings(league, season.results);

  // Careers: fold this season in.
  const careers = new Map(dynasty.careers);
  const players = new Map<PlayerId, Player>();
  for (const t of Object.values(league.teams)) for (const p of t.roster) players.set(p.id, p);
  for (const line of stats.players.values()) {
    const p = players.get(line.id);
    if (!p) continue;
    const prev = careers.get(line.id);
    const next: CareerLine = prev
      ? { ...prev, stats: { ...prev.stats }, teams: [...prev.teams] }
      : { id: p.id, name: fullName(p), position: p.position, teams: [], seasons: 0, games: 0, stats: Object.fromEntries(PLAYER_STAT_KEYS.map((k) => [k, 0])) as Record<PlayerStatKey, number> };
    next.seasons++;
    next.games += line.games;
    if (next.teams.at(-1) !== line.team) next.teams.push(line.team);
    next.lastSeason = season.season;
    next.jersey = p.jersey;
    next.teamSeasons = { ...(next.teamSeasons ?? {}), [line.team]: (next.teamSeasons?.[line.team] ?? 0) + 1 };
    for (const k of PLAYER_STAT_KEYS) next.stats[k] = k.endsWith("Long") ? Math.max(next.stats[k], line.stats[k]) : next.stats[k] + line.stats[k];
    careers.set(line.id, next);
  }

  // Offseason.
  // Staff moves come first: a new GM runs the draft, a new head coach shapes development.
  const order = draftOrder(playoffs);
  const staff = staffHiring(staffReleases(league, season.results, playoffs, order, dynasty.staffPool, dynasty.staffCareers, dynasty.lastWinPct, staffChoices.decisions), staffChoices.hires);
  const records = computeRecords(league, season.results);
  const retired = processRetirements(staff.league);
  const developed = developLeague(retired.league);
  const winPctNow = new Map([...records.values()].map((r) => [r.team, winPct(r)]));
  const triggers = { awardWinners: new Set(awards.map((a) => a.player)), playoffTeams: new Set(playoffs.seeds.map((s) => s.team)), winPct: winPctNow };
  return { dynasty, played, awards, standings, careers, order, staff, records, retired, developed, draftClass, scouting, winPct: winPctNow, triggers };
}

/** Run the rest of the offseason (with your choices, if any) and return next season's dynasty. */
export function finishOffseason(state: OffseasonState, choices: OffseasonChoices = {}): { dynasty: Dynasty; log: OffseasonLog } {
  const s = state.contracts ? state : resolveContracts(state, choices.resign);
  return completeOffseason(s, runDraft(s.contracts!.league, s.draftClass, s.scouting, s.order), choices.freeAgency);
}

/** Settle expiring contracts (with a team's own re-signing calls, if given). The draft comes next. */
export function resolveContracts(state: OffseasonState, resign?: PerTeam<ResignChoices>): OffseasonState {
  return { ...state, contracts: openContractYear(state.dynasty.league, state.developed, state.triggers, state.order, resign) };
}

/** The draft, pausing at each pick of the `humans` teams (see draftSteps). Needs resolveContracts first. */
export function offseasonDraft(state: OffseasonState, humans: ReadonlySet<string>): Generator<DraftTurn, DraftResult, PlayerId> {
  if (!state.contracts) throw new Error("Resolve contracts before the draft");
  return draftSteps(state.contracts.league, state.draftClass, state.scouting, state.order, humans);
}

/**
 * The whole draft at once, with each team in `boards` taking the first
 * prospect still available on its own ranked board (and, if the board runs
 * out, the best left on its scouting board). Teams without a board pick as the
 * AI does. Needs resolveContracts first.
 */
export function draftWithBoards(state: OffseasonState, boards: ReadonlyMap<string, readonly PlayerId[]>): DraftResult {
  const steps = offseasonDraft(state, new Set(boards.keys()));
  let r = steps.next();
  while (!r.done) {
    const turn = r.value;
    const left = new Set(turn.board.map((e) => e.prospect.player.id));
    const pick = (boards.get(turn.team) ?? []).find((id) => left.has(id)) ?? turn.board[0]!.prospect.player.id;
    r = steps.next(pick);
  }
  return r.value;
}

/** After the draft: free agency, roster moves, the cap, and the season's record. */
/** The free-agent market as it opens after the draft, from one team's point of view. */
export function offseasonFreeAgencyPlan(state: OffseasonState, draft: DraftResult, team: string): FreeAgencyPlan {
  const opened = state.contracts;
  if (!opened) throw new Error("Resolve contracts before free agency");
  const next = state.dynasty.league.season + 1;
  return freeAgencyPlan(signDraftPicks(draft.league, draft.picks, next), opened.freeAgents, next, opened.marketIndex, state.winPct, team);
}

/** Sign the draft class and run free agency (with a team's own offers, if given). Roster cuts come next. */
export function runOffseasonFreeAgency(state: OffseasonState, draft: DraftResult, choices?: PerTeam<FreeAgencyChoices>): OffseasonState {
  const opened = state.contracts;
  if (!opened) throw new Error("Resolve contracts before free agency");
  const next = state.dynasty.league.season + 1;
  const result = runFreeAgency(signDraftPicks(draft.league, draft.picks, next), opened.freeAgents, next, opened.marketIndex, state.winPct, choices);
  return { ...state, freeAgency: { draft, result } };
}

/** One player on a roster that's being cut down, with what cutting him would mean for the cap. */
export interface RosterPlanPlayer {
  player: Player;
  overall: number;
  /** Next season: what he counts against the cap, what cutting him leaves behind, and what it saves. */
  capHit: number;
  deadMoney: number;
  savings: number;
  /** Drafted this offseason. */
  rookie: boolean;
}

export interface RosterPlan {
  team: string;
  season: number;
  players: RosterPlanPlayer[];
  /** Who the front office would cut. */
  aiCuts: PlayerId[];
  max: number;
  positionMin: Record<Position, number>;
  positionMax: Record<Position, number>;
}

/** A team's roster after free agency, before cuts to 72. */
export function offseasonRosterPlan(state: OffseasonState, team: string): RosterPlan {
  const fa = state.freeAgency;
  if (!fa) throw new Error("Run free agency before roster cuts");
  const next = state.dynasty.league.season + 1;
  const ai = makeRosterMoves(fa.result.league, { undrafted: fa.draft.undrafted, scouting: state.scouting, order: state.order });
  const drafted = new Set(fa.draft.picks.filter((p) => p.team === team).map((p) => p.player.id));
  return {
    team,
    season: next,
    players: fa.result.league.teams[team]!.roster.map((p) => {
      const hit = p.contract ? capHit(p.contract, next) : 0;
      const dead = p.contract ? deadMoney(p.contract, next) : 0;
      return { player: p, overall: playerOverall(p), capHit: hit, deadMoney: dead, savings: hit - dead, rookie: drafted.has(p.id) };
    }),
    aiCuts: ai.cuts.filter((c) => c.team === team).map((c) => c.player.id),
    max: ROSTER_MAX,
    positionMin: ROSTER_MIN,
    positionMax: ROSTER_POSITION_MAX,
  };
}

export function completeOffseason(
  state: OffseasonState,
  draft: DraftResult,
  freeAgencyChoices?: PerTeam<FreeAgencyChoices>,
  /** Teams' own roster cuts (yours, or each friend's); everyone else's are the AI's. */
  cutChoices?: PerTeam<RosterCuts>,
): { dynasty: Dynasty; log: OffseasonLog } {
  const s = state.freeAgency ? state : runOffseasonFreeAgency(state, draft, freeAgencyChoices);
  const { dynasty, played, awards, standings, careers, order, staff, records, retired, scouting } = s;
  const winPctNow = s.winPct;
  const league = dynasty.league;
  const { playoffs } = played;
  const opened = s.contracts!;
  const next = league.season + 1;
  const freeAgency = s.freeAgency!.result;
  draft = s.freeAgency!.draft;
  const moves = makeRosterMoves(freeAgency.league, { undrafted: draft.undrafted, scouting, order, ...(cutChoices ? { cuts: cutChoices } : {}) });
  let settled = settleCap(moves.league, moves.cuts, next);
  const contractMoves = [...opened.moves, ...freeAgency.moves, ...settled.moves];
  // Cap cuts leave holes; refill them from the undrafted players left (at the minimum).
  let leftovers = moves.unsigned;
  for (let pass = 0; pass < 8 && settled.moves.some((m) => m.kind === "cap cut"); pass++) {
    const refill = makeRosterMoves(settled.league, { undrafted: leftovers, scouting, order });
    leftovers = refill.unsigned;
    settled = settleCap(refill.league, refill.cuts, next);
    contractMoves.push(...settled.moves);
  }
  // Who's left unsigned stays available through the season.
  const capCuts = contractMoves.filter((m) => m.kind === "cap cut").map((m) => m.player);
  const rostered = new Set(allTeams(settled.league).flatMap((t) => t.roster.map((p) => p.id)));
  const freeAgents = freeAgentPool([...freeAgency.unsigned, ...moves.cuts.map((c) => c.player), ...capCuts, ...leftovers.map((p) => p.player)], rostered);
  const nextLeague: League = { ...settled.league, season: next, freeAgents };

  // Close the books: every team's season finances, cash and fans.
  // Your team (any team making its own cuts and offers) runs its own business.
  const humans = new Set([...teamChoices(cutChoices).keys(), ...teamChoices(freeAgencyChoices).keys()]);
  const books = closeSeasonBooks(league, dynasty.business ?? startLeagueBusiness(league), league.season, played.season.results, records, dynasty.lastWinPct ?? new Map(), humans);
  const finances: Record<string, SeasonFinances[]> = {};
  for (const [abbr, f] of Object.entries(books.finances)) finances[abbr] = [...(dynasty.finances?.[abbr] ?? []), f].slice(-5);

  // The Hall of Fame vote (on the league as the season ended).
  const vote = hofVote(league.seed, league.season, hofBallot(dynasty, league.season), played.hofVote);
  const newClass = inductees(vote, careers);

  // The season's moments and records join the dynasty's.
  const collection = played.collection ?? startCollection(dynasty.recordBook);
  if (!collection.seasonDone) collectSeason(collection, league, league.season, played.stats, records, playoffs);

  const record: SeasonRecord = {
    season: league.season,
    champion: playoffs.champion,
    runnerUp: playoffs.runnerUp,
    top25: playoffs.ranking.slice(0, 25).map((e) => ({
      rank: e.rank,
      team: e.team,
      record: `${e.record.wins}-${e.record.losses}${e.record.ties ? `-${e.record.ties}` : ""}`,
    })),
    divisionWinners: standings.map((d) => d.teams[0]!.team),
    awards,
    topPicks: draft.picks.slice(0, 10).map((p) => ({ pick: p.overall, team: p.team, player: fullName(p.player), position: p.player.position })),
    notableRetirements: [...retired.retirees]
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 5)
      .map((r) => ({ player: fullName(r.player), position: r.player.position, team: r.team, age: r.player.age, overall: r.overall })),
    talent: talentSnapshot(league),
    coachOfTheYear: staff.coachOfTheYear,
    staffChanges: staff.changes,
    contracts: summarizeContracts(nextLeague, contractMoves, next),
    marketIndex: opened.marketIndex,
  };

  return {
    dynasty: {
      league: nextLeague,
      history: [...dynasty.history, record],
      careers,
      slotOrder: Object.fromEntries(standings.map((d) => [d.division, d.teams.map((t) => t.team)])),
      staffPool: staff.pool,
      staffCareers: staff.careers,
      lastWinPct: new Map([...records.values()].map((r) => [r.team, winPct(r)])),
      recordBook: collection.book,
      moments: [...(dynasty.moments ?? []), ...collection.moments],
      rivalryGames: [...(dynasty.rivalryGames ?? []), ...rivalryGames(rivalries(league.seed), played.season.results, league.season)],
      hallOfFame: [...(dynasty.hallOfFame ?? []), ...newClass],
      hofVotes: [...(dynasty.hofVotes ?? []), vote].slice(-5),
      business: books.business,
      finances,
    },
    log: { retirees: retired.retirees, draft: draft.picks, contractMoves, staffChanges: staff.changes },
  };
}

/** Run `seasons` seasons from the dynasty's current state. */
export function runDynasty(dynasty: Dynasty, seasons: number, onSeason?: (d: Dynasty) => void): Dynasty {
  let d = dynasty;
  for (let i = 0; i < seasons; i++) {
    d = advanceSeason(d);
    onSeason?.(d);
  }
  return d;
}
