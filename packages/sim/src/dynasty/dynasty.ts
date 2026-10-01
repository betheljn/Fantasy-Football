// The dynasty loop: play a season, then run the offseason, over and over.
// Each call returns a new Dynasty; nothing is mutated, so every past season's
// league (and therefore every game) can still be replayed.
import { POSITIONS, BASE_STARTERS } from "../model/positions.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { starters } from "../model/team.ts";
import { generateLeague, allTeams, teamRatings, type League } from "../league/league.ts";
import { REGULAR_SEASON_WEEKS } from "../league/schedule.ts";
import { generateSchedule, type Schedule } from "../league/schedule.ts";
import { simulateSeason, type SeasonResult } from "../league/season.ts";
import { simulatePlayoffs, type PlayoffResult } from "../league/playoffs.ts";
import { divisionStandings, type DivisionStandings, type TeamRecord } from "../league/standings.ts";
import { PLAYER_STAT_KEYS, type PlayerStatKey } from "../stats/boxscore.ts";
import { addGameToSeason, createSeasonStats, type SeasonStats } from "../league/seasonstats.ts";
import { computeAwards, type Award } from "./awards.ts";
import { developLeague } from "./development.ts";
import { generateDraftClass, type DraftClass } from "./draftclass.ts";
import { draftOrder, draftSteps, runDraft, type DraftPick, type DraftResult, type DraftTurn } from "./draft.ts";
import { processRetirements, type Retiree, type RetirementResult } from "./retirement.ts";
import { makeRosterMoves } from "./roster.ts";
import { assignContracts } from "../gen/contract-gen.ts";
import {
  contractPlan,
  openContractYear,
  runFreeAgency,
  settleCap,
  signDraftPicks,
  summarizeContracts,
  type ContractMove,
  type ContractPlan,
  type ContractSummary,
  type IncentiveTriggers,
  type OpenYearResult,
  type ResignChoices,
} from "../contracts/offseason.ts";
import { advanceScoutingWeek, createScouting, runCombine, scoutSeason, type ScoutingState } from "./scouting.ts";
import { runStaffOffseason, type CoachOfTheYear, type StaffCareer, type StaffChange, type StaffOffseasonResult } from "./staffcareers.ts";
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
  return { ...moves.league, season: league.season + 1 };
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
  return finishSeason(dynasty, playSeason(dynasty)).dynasty;
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
}

/** Play the whole season at once. An app can instead play it week by week (same games, same seeds). */
export function playSeason(dynasty: Dynasty): PlayedSeason {
  const stats = createSeasonStats();
  const season = simulateSeason(dynasty.league, { schedule: seasonSchedule(dynasty), onGame: (g) => addGameToSeason(stats, g) });
  return { season, stats, playoffs: simulatePlayoffs(dynasty.league, season) };
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
}

/** Your team's calls for the rest of the offseason (anything left out is the AI's). */
export interface OffseasonChoices {
  resign?: ResignChoices;
}

/** A team's re-signing picture at this point of the offseason. */
export function offseasonContractPlan(state: OffseasonState, team: string): ContractPlan {
  return contractPlan(state.dynasty.league, state.developed, state.triggers, state.order, team);
}

export function beginOffseason(dynasty: Dynasty, played: PlayedSeason): OffseasonState {
  const league = dynasty.league;
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
    for (const k of PLAYER_STAT_KEYS) next.stats[k] = k.endsWith("Long") ? Math.max(next.stats[k], line.stats[k]) : next.stats[k] + line.stats[k];
    careers.set(line.id, next);
  }

  // Offseason.
  // Staff moves come first: a new GM runs the draft, a new head coach shapes development.
  const order = draftOrder(playoffs);
  const staff = runStaffOffseason(league, season.results, playoffs, order, dynasty.staffPool, dynasty.staffCareers, dynasty.lastWinPct);
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
  return completeOffseason(s, runDraft(s.contracts!.league, s.draftClass, s.scouting, s.order));
}

/** Settle expiring contracts (with a team's own re-signing calls, if given). The draft comes next. */
export function resolveContracts(state: OffseasonState, resign?: ResignChoices): OffseasonState {
  return { ...state, contracts: openContractYear(state.dynasty.league, state.developed, state.triggers, state.order, resign) };
}

/** The draft, pausing at each pick of the `humans` teams (see draftSteps). Needs resolveContracts first. */
export function offseasonDraft(state: OffseasonState, humans: ReadonlySet<string>): Generator<DraftTurn, DraftResult, PlayerId> {
  if (!state.contracts) throw new Error("Resolve contracts before the draft");
  return draftSteps(state.contracts.league, state.draftClass, state.scouting, state.order, humans);
}

/** After the draft: free agency, roster moves, the cap, and the season's record. */
export function completeOffseason(state: OffseasonState, draft: DraftResult): { dynasty: Dynasty; log: OffseasonLog } {
  const { dynasty, played, awards, standings, careers, order, staff, records, retired, scouting } = state;
  const winPctNow = state.winPct;
  const league = dynasty.league;
  const { playoffs } = played;
  const opened = state.contracts;
  if (!opened) throw new Error("Resolve contracts before completing the offseason");
  const next = league.season + 1;
  const freeAgency = runFreeAgency(signDraftPicks(draft.league, draft.picks, next), opened.freeAgents, next, opened.marketIndex, winPctNow);
  const moves = makeRosterMoves(freeAgency.league, { undrafted: draft.undrafted, scouting, order });
  let settled = settleCap(moves.league, moves.cuts, next);
  const contractMoves = [...opened.moves, ...freeAgency.moves, ...settled.moves];
  // Cap cuts leave holes; refill them from the undrafted players left (at the minimum).
  let leftovers = moves.unsigned;
  for (let pass = 0; pass < 3 && settled.moves.some((m) => m.kind === "cap cut"); pass++) {
    const refill = makeRosterMoves(settled.league, { undrafted: leftovers, scouting, order });
    leftovers = refill.unsigned;
    settled = settleCap(refill.league, refill.cuts, next);
    contractMoves.push(...settled.moves);
  }
  const nextLeague: League = { ...settled.league, season: next };

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
