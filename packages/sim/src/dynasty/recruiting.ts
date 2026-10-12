// Recruiting: building a prospect's interest in your program before the
// draft. The draft is still the only way in; recruiting decides how much you
// learn about a prospect (every visit scouts him too) and which program he
// leans to, and other teams shy off a player leaning elsewhere (step 2).
//
// Every team gets recruiting points each week of the season: a base, a swing
// for the head coach, and the owner's recruiting upgrade. Points spent on a
// prospect build his interest (0-100) with diminishing returns; a prospect
// from your own region warms to you faster (local talent costs less), but you
// can recruit anywhere. Interest you stop working on fades a little each week.
// A prospect leans to the program he's warmest on, once he's warm enough and
// clear of the next one. AI teams recruit too: high on their own boards, a
// little more at home, and where they already have a head start.
import type { Team } from "../model/team.ts";
import type { PlayerId } from "../model/player.ts";
import type { League } from "../league/league.ts";
import { regionOf } from "../gen/regions.ts";
import { staffEdge } from "../play/coaching.ts";
import { draftValue, type DraftClass, type Prospect } from "./draftclass.ts";
import type { ScoutingState } from "./scouting.ts";

export const RECRUITING = {
  /** Points every team gets each week... */
  basePoints: 10,
  /** ...plus or minus this much for the head coach (an average one: 0)... */
  coachSwing: 4,
  /** ...plus this much per tier of the owner's recruiting upgrade. */
  perUpgradeTier: 2,
  /** Interest per point spent, before diminishing returns. */
  gain: 1,
  /** A prospect from your region warms to you this much faster. */
  localBoost: 1.6,
  /** Interest kept each week you don't recruit him. */
  fade: 0.97,
  /** Each recruiting point also counts this much as a scouting point (a visit is a look). */
  scoutShare: 0.5,
  /** A prospect leans to a program once his interest there is this high... */
  leanAt: 40,
  /** ...and this far ahead of the next one. */
  leanMargin: 10,
  /** Prospects an AI team works on at a time. */
  aiTargets: 3,
  /** How far down its own board an AI team looks for targets. */
  aiReach: 60,
  /** The consensus top prospects AI teams consider at all. */
  aiPool: 120,
} as const;

export type RecruitingChoices = Record<string, ReadonlyArray<{ prospect: PlayerId; points: number }>>;

/** A team's recruiting points for a week. */
export function recruitingPoints(team: Team | undefined): number {
  const hc = team?.staff?.hc;
  // Recruiting is the head coach selling the program: his management and development of players.
  const coach = hc ? Math.max(-1, Math.min(1, staffEdge((hc.gameManagement + hc.development) / 2))) : 0;
  return Math.round(RECRUITING.basePoints + RECRUITING.coachSwing * coach + RECRUITING.perUpgradeTier * (team?.upgrades?.recruiting ?? 0));
}

/** The region a team recruits at home in: its program's region, or its state's. */
export const homeRegion = (team: Team) => team.region ?? regionOf(team.abbr);

/** Is this prospect local to the team (grew up in its region)? */
export function isLocal(team: Team, prospect: Prospect): boolean {
  const home = prospect.player.home;
  return !!home && regionOf(home) === homeRegion(team);
}

/** Interest gained from `points` this week, from where it stands. */
export function interestGain(current: number, points: number, local: boolean): number {
  return points * RECRUITING.gain * (local ? RECRUITING.localBoost : 1) * (1 - current / 100);
}

/** A team's interest from a prospect, 0-100. */
export const interestIn = (state: ScoutingState, team: string, prospect: PlayerId) => state.interest?.[team]?.[prospect] ?? 0;

export interface Leaning {
  team: string;
  interest: number;
  /** How far ahead of the next program. */
  margin: number;
  /** 0-1: how firmly (0 just leaning, 1 all but certain). */
  strength: number;
}

/** The program a prospect leans to, if any. */
export function leaningOf(state: ScoutingState, prospect: PlayerId): Leaning | null {
  let first: { team: string; v: number } | null = null;
  let second = 0;
  for (const [team, byProspect] of Object.entries(state.interest ?? {})) {
    const v = byProspect[prospect] ?? 0;
    if (!first || v > first.v) {
      second = first?.v ?? 0;
      first = { team, v };
    } else if (v > second) second = v;
  }
  if (!first || first.v < RECRUITING.leanAt || first.v - second < RECRUITING.leanMargin) return null;
  return { team: first.team, interest: first.v, margin: first.v - second, strength: Math.min(1, (first.v - RECRUITING.leanAt) / (100 - RECRUITING.leanAt) + (first.v - second) / 100) };
}

/** Every prospect anyone is recruiting, and the program he leans to (null: no one yet). */
export function allLeanings(state: ScoutingState): Map<PlayerId, Leaning | null> {
  const ids = new Set<PlayerId>();
  for (const byProspect of Object.values(state.interest ?? {})) for (const id of Object.keys(byProspect)) ids.add(id);
  return new Map([...ids].map((id) => [id, leaningOf(state, id)]));
}

/** Where an AI team spends its points: the best prospects on its board it can win over (home and head starts count). */
export function aiRecruitingChoices(
  state: ScoutingState,
  league: League,
  draftClass: DraftClass,
  team: string,
  estimate: (p: Prospect) => { overall: number; potential: number },
  /** Every prospect's leaning this week (worked out once for all teams), if at hand. */
  leanings: ReadonlyMap<PlayerId, Leaning | null> = allLeanings(state),
): Array<{ prospect: PlayerId; points: number }> {
  const t = league.teams[team];
  if (!t) return [];
  const points = recruitingPoints(t);
  // Only the top of the class is worth chasing: look at the consensus top ones, by its own estimates.
  const ranked = draftClass.prospects
    .filter((p) => p.boardRank <= RECRUITING.aiPool)
    .map((p) => {
      const est = estimate(p);
      return { p, value: draftValue(p.player.position, est.overall, est.potential) };
    })
    .sort((a, b) => b.value - a.value || a.p.player.id.localeCompare(b.p.player.id))
    .slice(0, RECRUITING.aiReach)
    .map((e) => {
      const mine = interestIn(state, team, e.p.player.id);
      const lean = leanings.get(e.p.player.id) ?? null;
      // Don't chase a prospect firmly leaning elsewhere.
      const lost = lean && lean.team !== team && lean.strength > 0.5 ? 0.3 : 1;
      return { id: e.p.player.id, priority: e.value * (isLocal(t, e.p) ? 1.4 : 1) * (1 + mine / 100) * lost };
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, RECRUITING.aiTargets);
  if (!ranked.length) return [];
  const each = Math.floor(points / ranked.length);
  return ranked.map((e, i) => ({ prospect: e.id, points: each + (i < points - each * ranked.length ? 1 : 0) }));
}

/**
 * One week of recruiting for every team (`choices` for teams people run;
 * everyone else recruits on its own). Returns the new interest and the
 * scouting points the visits are worth, by team.
 */
export function recruitingWeek(
  state: ScoutingState,
  league: League,
  draftClass: DraftClass,
  estimate: (team: string, p: Prospect) => { overall: number; potential: number },
  choices: RecruitingChoices = {},
): { interest: Record<string, Record<PlayerId, number>>; visits: Record<string, Record<PlayerId, number>> } {
  const byId = new Map(draftClass.prospects.map((p) => [p.player.id, p]));
  const leanings = allLeanings(state);
  const interest: Record<string, Record<PlayerId, number>> = {};
  const visits: Record<string, Record<PlayerId, number>> = {};
  for (const team of Object.keys(league.teams)) {
    const t = league.teams[team]!;
    const spend = choices[team] ?? aiRecruitingChoices(state, league, draftClass, team, (p) => estimate(team, p), leanings);
    const mine: Record<PlayerId, number> = {};
    // Interest you don't work on fades.
    for (const [id, v] of Object.entries(state.interest?.[team] ?? {})) {
      const faded = v * RECRUITING.fade;
      if (faded >= 0.5) mine[id] = faded;
    }
    let left = recruitingPoints(t);
    const seen: Record<PlayerId, number> = {};
    for (const { prospect, points } of spend) {
      const p = Math.min(Math.max(0, Math.floor(points)), left);
      const pr = byId.get(prospect);
      if (p <= 0 || !pr) continue;
      // This week's work replaces the fade: build from last week's interest (or this week's, on a second visit).
      const from = prospect in seen ? mine[prospect]! : (state.interest?.[team]?.[prospect] ?? 0);
      mine[prospect] = Math.min(100, from + interestGain(from, p, isLocal(t, pr)));
      seen[prospect] = (seen[prospect] ?? 0) + p * RECRUITING.scoutShare;
      left -= p;
    }
    interest[team] = mine;
    visits[team] = seen;
  }
  return { interest, visits };
}
