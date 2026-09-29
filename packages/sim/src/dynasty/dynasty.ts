// The dynasty loop: play a season, then run the offseason, over and over.
// Each call returns a new Dynasty; nothing is mutated, so every past season's
// league (and therefore every game) can still be replayed.
import { POSITIONS, BASE_STARTERS } from "../model/positions.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { starters } from "../model/team.ts";
import { generateLeague, allTeams, teamRatings, type League } from "../league/league.ts";
import { REGULAR_SEASON_WEEKS } from "../league/schedule.ts";
import { generateSchedule } from "../league/schedule.ts";
import { simulateSeason } from "../league/season.ts";
import { simulatePlayoffs } from "../league/playoffs.ts";
import { divisionStandings } from "../league/standings.ts";
import { PLAYER_STAT_KEYS, type PlayerStatKey } from "../stats/boxscore.ts";
import { addGameToSeason, createSeasonStats } from "../league/seasonstats.ts";
import { computeAwards, type Award } from "./awards.ts";
import { developLeague } from "./development.ts";
import { generateDraftClass } from "./draftclass.ts";
import { draftOrder, runDraft } from "./draft.ts";
import { processRetirements } from "./retirement.ts";
import { makeRosterMoves } from "./roster.ts";
import { createScouting, runCombine, scoutSeason } from "./scouting.ts";
import { runStaffOffseason, type CoachOfTheYear, type StaffCareer, type StaffChange } from "./staffcareers.ts";
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
  // The quiet offseasons are the years before the first season, so their
  // draft classes (and player ids) never collide with the real ones.
  const generated = generateLeague(seed);
  let league: League = { ...generated, season: generated.season - burnIn };
  for (let i = 0; i < burnIn; i++) league = quietOffseason(league);
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
  const league = dynasty.league;

  // The class entering next season is scouted while this season is played.
  const draftClass = generateDraftClass(league);
  const scouting = scoutSeason(league, draftClass);

  const stats = createSeasonStats();
  const schedule = generateSchedule(league, dynasty.slotOrder ? { slotOrder: dynasty.slotOrder } : {});
  const season = simulateSeason(league, { schedule, onGame: (g) => addGameToSeason(stats, g) });
  const playoffs = simulatePlayoffs(league, season);
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
  const draft = runDraft(developed, draftClass, scouting, order);
  const moves = makeRosterMoves(draft.league, { undrafted: draft.undrafted, scouting, order });
  const nextLeague: League = { ...moves.league, season: league.season + 1 };

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
  };

  return {
    league: nextLeague,
    history: [...dynasty.history, record],
    careers,
    slotOrder: Object.fromEntries(standings.map((d) => [d.division, d.teams.map((t) => t.team)])),
    staffPool: staff.pool,
    staffCareers: staff.careers,
    lastWinPct: new Map([...records.values()].map((r) => [r.team, winPct(r)])),
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
