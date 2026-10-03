// Injuries. Players involved in a play can get hurt: ball carriers, tacklers,
// pass rushers, blockers, returners. Older players get hurt a little more,
// players with stamina a little less. An injury takes a player out of the
// rest of the game, and often the next few weeks (sometimes the season).
// Injured players sit on game day; teams fill in from the depth chart. Every
// injury is recorded on the play it happened, so the feed and replays show it.
import type { PlayEvent } from "../play/events.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { BASE_STARTERS, POSITIONS, type Position } from "../model/positions.ts";
import type { Team } from "../model/team.ts";
import type { League } from "../league/league.ts";
import { Rng } from "../rng.ts";

/** Fewest healthy players a team needs at each position to field a game (a position at its minimum plays through knocks). */
export const GAME_MIN: Record<Position, number> = {
  QB: 2, RB: 3, WR: 6, TE: 3, OL: 9, DL: 7, LB: 5, CB: 5, S: 3, K: 1, P: 1, LS: 1,
};

/** Weeks out for a season-ending injury (healed in the offseason). */
export const SEASON_ENDING = 99;

export const INJURY_RULES = {
  /** Chance per play for the player at the center of it (ball carrier, tackler, sacked QB, returner). */
  contact: 0.009,
  /** Chance per play for one other player on the field on each side (blocks, pile-ups, pursuit). */
  onField: 0.0045,
  /** Each year past 28 adds this share; each stamina point above 70 takes off a little. */
  agePerYear: 0.04,
  staminaPerPoint: 0.006,
};

/** Severity: weeks out, and how often (0 = back next week). */
const SEVERITY: ReadonlyArray<{ share: number; weeks: [number, number] }> = [
  { share: 0.38, weeks: [0, 0] },
  { share: 0.3, weeks: [1, 2] },
  { share: 0.19, weeks: [3, 6] },
  { share: 0.09, weeks: [7, 12] },
  { share: 0.04, weeks: [SEASON_ENDING, SEASON_ENDING] },
];

const MINOR = ["ankle", "hamstring", "shoulder", "hand", "ribs", "back", "foot", "groin", "concussion"];
const MAJOR = ["knee", "ankle", "shoulder", "foot", "hamstring", "back"];
const SEASON = ["torn ACL", "broken leg", "torn Achilles", "shoulder surgery"];

/** A player who got hurt in a game. */
export interface Injury {
  player: PlayerId;
  team: string;
  /** Body part, e.g. "ankle", "torn ACL". */
  type: string;
  /** Games he'll miss after this one (0 = just the rest of this game; SEASON_ENDING = out for the season). */
  weeks: number;
}

/** A player's current injury (on the player, between games). */
export interface PlayerInjury {
  type: string;
  /** Games left to miss; SEASON_ENDING = out for the season. */
  weeks: number;
}

export function injuryLabel(i: { type: string; weeks: number }): string {
  if (i.weeks >= SEASON_ENDING) return `${i.type}, out for the season`;
  if (i.weeks === 0) return `${i.type}, out for the game`;
  return `${i.type}, out ${i.weeks} week${i.weeks === 1 ? "" : "s"}`;
}

/** Short tag for a roster line: "OUT 2 wk" or "OUT season". */
export function outLabel(i: { weeks: number }): string {
  return i.weeks >= SEASON_ENDING ? "OUT season" : `OUT ${i.weeks} wk`;
}

/** Players at risk on a play, and the base chance for each. */
function exposures(e: PlayEvent, rng: Rng): Array<[PlayerId, number]> {
  const out: Array<[PlayerId, number]> = [];
  const { contact, onField } = INJURY_RULES;
  if (e.kind === "run" || e.kind === "pass") {
    if (e.kind === "run") out.push([e.rusher, contact]);
    else if (e.outcome === "sack") out.push([e.passer, contact]);
    else if (e.outcome === "complete" && e.target) out.push([e.target, contact]);
    if (e.tackler) out.push([e.tackler, contact * 0.6]);
    // Someone else on each side: blocking, rushing, in the pile or in pursuit.
    const off = e.formation.offense.players;
    const def = e.formation.defense.players;
    if (off.length > 0) out.push([off[rng.int(0, off.length - 1)]!, onField]);
    if (def.length > 0) out.push([def[rng.int(0, def.length - 1)]!, onField]);
  } else if (e.kind === "kickoff" || e.kind === "punt") {
    if (e.returner && !("fairCatch" in e && e.fairCatch) && !e.touchback) out.push([e.returner, contact]);
    if (e.tackler) out.push([e.tackler, contact * 0.8]);
  }
  return out;
}

function chance(base: number, p: Player): number {
  const age = 1 + INJURY_RULES.agePerYear * Math.max(0, p.age - 28);
  const stamina = Math.max(0.6, 1 - INJURY_RULES.staminaPerPoint * (p.ratings.stamina - 70));
  return base * age * stamina;
}

function severity(rng: Rng): { type: string; weeks: number } {
  let r = rng.next();
  for (const s of SEVERITY) {
    r -= s.share;
    if (r <= 0 || s === SEVERITY[SEVERITY.length - 1]) {
      const weeks = rng.int(s.weeks[0], s.weeks[1]);
      const type = weeks >= SEASON_ENDING ? rng.pick(SEASON) : weeks >= 3 ? rng.pick(MAJOR) : rng.pick(MINOR);
      return { type, weeks };
    }
  }
  return { type: "ankle", weeks: 0 };
}

const count = (team: Team, pos: Position) => {
  let n = 0;
  for (const p of team.roster) if (p.position === pos) n++;
  return n;
};

/** The team without this player for the rest of the game (off the roster and depth chart). */
export function sideline(team: Team, id: PlayerId): Team {
  const depthChart = { ...team.depthChart };
  for (const pos of POSITIONS) if (depthChart[pos].includes(id)) depthChart[pos] = depthChart[pos].filter((x) => x !== id);
  return { ...team, roster: team.roster.filter((p) => p.id !== id), depthChart };
}

/**
 * Tracks injuries through one game: after each play, who got hurt, and the
 * teams without them. Its own random stream, so injuries don't shift the rest
 * of the game's randomness (only who's on the field).
 */
export class InjuryTracker {
  private readonly rng: Rng;
  readonly all: Injury[] = [];
  readonly teams: Record<string, Team>;

  /** Each player in the game, and his team. */
  private readonly players = new Map<PlayerId, { player: Player; team: string }>();

  constructor(seed: string, teams: Record<string, Team>) {
    this.rng = new Rng(`${seed}:injuries`);
    this.teams = { ...teams };
    for (const [abbr, t] of Object.entries(teams)) for (const p of t.roster) this.players.set(p.id, { player: p, team: abbr });
  }

  /** Check a play; returns the injuries on it (and updates `teams`). */
  check(e: PlayEvent): Injury[] {
    const hurt: Injury[] = [];
    for (const [id, base] of exposures(e, this.rng)) {
      const who = this.players.get(id);
      if (!who) continue;
      const abbr = who.team;
      const team = this.teams[abbr]!;
      const p = who.player;
      if (!this.rng.chance(chance(base, p))) continue;
      if (count(team, p.position) <= GAME_MIN[p.position]) continue; // nobody left to replace him: he plays through it
      const s = severity(this.rng);
      const injury: Injury = { player: id, team: abbr, type: s.type, weeks: s.weeks };
      hurt.push(injury);
      this.all.push(injury);
      this.teams[abbr] = sideline(team, id);
      this.players.delete(id);
    }
    return hurt;
  }
}

/**
 * A team as it takes the field: injured players sit, unless a position would
 * fall below what a game needs (then the least hurt play through it). `out`
 * are the players who sat.
 */
export function gameDayTeam(team: Team): { team: Team; out: PlayerId[] } {
  // The hurt, and anyone holding out for a new deal, sit (unless the team is too thin to play without them).
  const weeksOut = (p: Player) => Math.max(p.injury?.weeks ?? 0, p.holdout?.weeks ?? 0);
  const injured = team.roster.filter((p) => weeksOut(p) > 0);
  if (injured.length === 0) return { team, out: [] };
  const sitting = new Set<PlayerId>();
  for (const pos of POSITIONS) {
    const hurt = injured.filter((p) => p.position === pos).sort((a, b) => weeksOut(b) - weeksOut(a) || a.id.localeCompare(b.id));
    const spare = count(team, pos) - GAME_MIN[pos];
    for (const p of hurt.slice(0, Math.max(0, spare))) sitting.add(p.id);
  }
  return { team: withOut(team, sitting), out: [...sitting] };
}

/** The team with these players sitting out (for replaying a game exactly as it was played). */
export function withOut(team: Team, out: ReadonlySet<PlayerId>): Team {
  if (out.size === 0) return team;
  const depthChart = { ...team.depthChart };
  for (const pos of POSITIONS) depthChart[pos] = depthChart[pos].filter((id) => !out.has(id));
  return { ...team, roster: team.roster.filter((p) => !out.has(p.id)), depthChart };
}

/**
 * After a week: everyone hurt heals a week (byes count), then this week's new
 * injuries take hold. Season-ending injuries wait for the offseason.
 */
export function advanceInjuries(league: League, injuries: readonly Injury[]): League {
  const fresh = new Map(injuries.filter((i) => i.weeks > 0).map((i) => [i.player, i]));
  let changed = false;
  const teams: League["teams"] = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    let touched = false;
    const roster = t.roster.map((p0) => {
      // A holdout counts down a week (and ends) like an injury heals.
      let p = p0;
      if (p.holdout) {
        touched = true;
        if (p.holdout.weeks <= 1) {
          const { holdout: _over, ...rest } = p;
          p = rest;
        } else p = { ...p, holdout: { weeks: p.holdout.weeks - 1 } };
      }
      const now = fresh.get(p.id);
      if (now) {
        touched = true;
        return { ...p, injury: { type: now.type, weeks: now.weeks } };
      }
      if (!p.injury) return p;
      touched = true;
      if (p.injury.weeks >= SEASON_ENDING) return p;
      if (p.injury.weeks <= 1) {
        const { injury: _healed, ...rest } = p;
        return rest;
      }
      return { ...p, injury: { ...p.injury, weeks: p.injury.weeks - 1 } };
    });
    teams[abbr] = touched ? { ...t, roster } : t;
    changed ||= touched;
  }
  return changed ? { ...league, teams } : league;
}

/** Everyone healthy again (the offseason). */
export function healAll(league: League): League {
  const teams: League["teams"] = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    teams[abbr] = t.roster.some((p) => p.injury)
      ? {
          ...t,
          roster: t.roster.map((p) => {
            if (!p.injury) return p;
            const { injury: _healed, ...rest } = p;
            return rest;
          }),
        }
      : t;
  }
  return { ...league, teams };
}

/** One injured player on a report. */
export interface InjuryReportEntry {
  player: Player;
  team: string;
  injury: PlayerInjury;
  /** Starting for his team when healthy (top of the depth chart). */
  starter: boolean;
  /** First week he's back, with `weeksPlayed` weeks played (null: out for the season). */
  returnWeek: number | null;
}

/** The week a player is back, with `weeksPlayed` weeks played (null: out for the season). */
export function returnWeek(injury: { weeks: number }, weeksPlayed: number): number | null {
  return injury.weeks >= SEASON_ENDING ? null : weeksPlayed + 1 + injury.weeks;
}

/** Everyone hurt (on one team, or the whole league), starters and longest absences first. */
export function injuryReport(league: League, weeksPlayed: number, team?: string): InjuryReportEntry[] {
  const out: InjuryReportEntry[] = [];
  for (const t of Object.values(league.teams)) {
    if (team && t.abbr !== team) continue;
    for (const p of t.roster) {
      if (!p.injury) continue;
      const rank = t.depthChart[p.position].indexOf(p.id);
      out.push({ player: p, team: t.abbr, injury: p.injury, starter: rank >= 0 && rank < BASE_STARTERS[p.position], returnWeek: returnWeek(p.injury, weeksPlayed) });
    }
  }
  return out.sort((a, b) => Number(b.starter) - Number(a.starter) || b.injury.weeks - a.injury.weeks || a.player.id.localeCompare(b.player.id));
}

/** An injury worth a headline: who, how bad, and whether he starts. */
export interface InjuryNews {
  week: number;
  team: string;
  player: PlayerId;
  name: string;
  position: Position;
  overall: number;
  type: string;
  weeks: number;
  starter: boolean;
}

/** This week's injuries that matter (a starter or a good player, out at least a week), worst first. */
export function injuryNews(league: League, injuries: readonly Injury[], week: number): InjuryNews[] {
  const news: InjuryNews[] = [];
  for (const i of injuries) {
    if (i.weeks < 1) continue;
    const t = league.teams[i.team];
    const p = t?.roster.find((x) => x.id === i.player);
    if (!t || !p) continue;
    const rank = t.depthChart[p.position].indexOf(p.id);
    const starter = rank >= 0 && rank < BASE_STARTERS[p.position];
    const ovr = playerOverall(p);
    if (!starter && ovr < 70) continue;
    news.push({ week, team: t.abbr, player: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position, overall: ovr, type: i.type, weeks: i.weeks, starter });
  }
  return news.sort((a, b) => b.weeks - a.weeks || b.overall - a.overall);
}

/** "Back week 9", "Back next season" or "Out for the season" (`seasonWeeks`: regular-season weeks). */
export function backLabel(returnWeek: number | null, seasonWeeks: number): string {
  if (returnWeek === null) return "Out for the season";
  return returnWeek > seasonWeeks ? "Back next season" : `Back week ${returnWeek}`;
}
