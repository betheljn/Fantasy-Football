// Offseason roster moves: fill empty positions, then cut down to 72.
import { POSITIONS, type Position } from "../model/positions.ts";
import { playerOverall, type DevTrait, type Player, type PlayerId } from "../model/player.ts";
import { ROSTER_MAX, buildDepthChart, validateTeam, type Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import { generatePlayer, pickJersey } from "../gen/team-gen.ts";
import type { League } from "../league/league.ts";
import type { Prospect } from "./draftclass.ts";
import { quickEstimate, type ScoutingState } from "./scouting.ts";

/** Fewest players a team keeps at each position (enough to field a game-day 53). */
export const ROSTER_MIN: Record<Position, number> = {
  QB: 2, RB: 3, WR: 6, TE: 3, OL: 9, DL: 7, LB: 5, CB: 5, S: 3, K: 1, P: 1, LS: 1,
};
/** Most players a team keeps at each position. */
export const ROSTER_POSITION_MAX: Record<Position, number> = {
  QB: 4, RB: 7, WR: 13, TE: 7, OL: 17, DL: 14, LB: 11, CB: 11, S: 8, K: 2, P: 2, LS: 2,
};

const TRAIT_GROWTH_GUESS: Record<DevTrait, number> = { normal: 1, impact: 1.3, star: 1.6, elite: 2 };

export interface RosterMove {
  team: string;
  player: Player;
}

export interface Signing extends RosterMove {
  from: "undrafted" | "free_agent";
}

export interface RosterMovesResult {
  league: League;
  cuts: RosterMove[];
  signings: Signing[];
  /** Undrafted prospects nobody signed. */
  unsigned: Prospect[];
}

/**
 * How much a team values keeping a player: what he is now, plus the growth it
 * expects. Veterans: from age and (if known) development trait. Rookies whose
 * ceiling is still hidden: from the team's scouting estimate of his potential.
 */
export function keepValue(player: Player, potentialEstimate?: number): number {
  const ovr = playerOverall(player);
  let growth: number;
  if (potentialEstimate !== undefined) {
    growth = Math.max(0, potentialEstimate - ovr) * 0.5;
  } else {
    const trait = player.devTraitRevealed ? TRAIT_GROWTH_GUESS[player.devTrait] : 1.2;
    growth = Math.max(0, 25 - player.age) * 1.5 * trait;
  }
  // Teams discount declining veterans: a year past 29 costs as much as 2.5 points of overall.
  const aging = Math.max(0, player.age - 29) * 2.5;
  return ovr + growth - aging;
}

export interface RosterMoveOptions {
  /** Undrafted prospects available to sign. */
  undrafted?: Prospect[];
  /** Scouting knowledge of the draft class (for valuing rookies and undrafted players). */
  scouting?: ScoutingState;
  /** Teams sign undrafted players in this order (e.g. the draft order); default league order. */
  order?: string[];
}

/**
 * Fill every position up to its minimum (undrafted prospects first, then
 * replacement-level free agents), cut each roster to 72 by releasing the
 * players the team values least (from positions over their maximum first,
 * never below a minimum), then top up any roster still short of 72 with the
 * best undrafted players left. Depth charts are rebuilt.
 */
export function makeRosterMoves(league: League, opts: RosterMoveOptions = {}): RosterMovesResult {
  const rng = new Rng(`${league.seed}:${league.season}:rostermoves`);
  const pool = [...(opts.undrafted ?? [])];
  const prospectIds = new Set(pool.map((p) => p.player.id));
  const order = opts.order ?? Object.keys(league.teams);
  const cuts: RosterMove[] = [];
  const signings: Signing[] = [];
  const rosters = new Map<string, Player[]>(Object.entries(league.teams).map(([t, team]) => [t, [...team.roster]]));

  // Rookies drafted this year are valued on the team's scouting estimate of their ceiling.
  const draftedRookies = new Set<PlayerId>();
  if (opts.scouting) {
    for (const r of rosters.values()) for (const p of r) if (p.id.startsWith(`D${opts.scouting.classSeason}-`)) draftedRookies.add(p.id);
  }
  const value = (team: string, p: Player) => {
    if (opts.scouting && (draftedRookies.has(p.id) || prospectIds.has(p.id))) {
      const est = quickEstimate(opts.scouting, team, { player: p, projection: { overall: 0, potential: 0, value: 0 }, boardRank: 0 });
      return keepValue(p, est.potential);
    }
    return keepValue(p);
  };
  const count = (roster: Player[], pos: Position) => roster.filter((p) => p.position === pos).length;

  // 1. Fill positions below their minimum.
  for (const team of order) {
    const roster = rosters.get(team)!;
    for (const pos of POSITIONS) {
      while (count(roster, pos) < ROSTER_MIN[pos]) {
        const candidates = pool.filter((p) => p.player.position === pos);
        let player: Player;
        let from: Signing["from"];
        if (candidates.length > 0) {
          const best = candidates.reduce((a, b) => (value(team, b.player) > value(team, a.player) ? b : a));
          pool.splice(pool.indexOf(best), 1);
          player = best.player;
          from = "undrafted";
        } else {
          player = generatePlayer(rng, {
            id: `FA${league.season}-${team}-${signings.length + 1}`,
            position: pos,
            talentMean: 52, // replacement level
            jersey: 0,
          });
          from = "free_agent";
        }
        player = { ...player, jersey: pickJersey(rng, pos, new Set(roster.map((p) => p.jersey))) };
        roster.push(player);
        signings.push({ team, player, from });
      }
    }
  }

  // 2. Cut down to the roster maximum.
  for (const team of order) {
    const roster = rosters.get(team)!;
    while (roster.length > ROSTER_MAX) {
      const over = POSITIONS.filter((pos) => count(roster, pos) > ROSTER_POSITION_MAX[pos]);
      const cuttable = roster.filter((p) =>
        over.length > 0 ? over.includes(p.position) : count(roster, p.position) > ROSTER_MIN[p.position],
      );
      const worst = cuttable.reduce((a, b) => (value(team, b) < value(team, a) ? b : a));
      roster.splice(roster.indexOf(worst), 1);
      cuts.push({ team, player: worst });
    }
  }

  // 3. Teams short of 72 sign the best undrafted players left (positions under their max).
  for (const team of order) {
    const roster = rosters.get(team)!;
    while (roster.length < ROSTER_MAX) {
      const candidates = pool.filter((p) => count(roster, p.player.position) < ROSTER_POSITION_MAX[p.player.position]);
      if (candidates.length === 0) break;
      const best = candidates.reduce((a, b) => (value(team, b.player) > value(team, a.player) ? b : a));
      pool.splice(pool.indexOf(best), 1);
      const player = { ...best.player, jersey: pickJersey(rng, best.player.position, new Set(roster.map((p) => p.jersey))) };
      roster.push(player);
      signings.push({ team, player, from: "undrafted" });
    }
  }

  const teams: Record<string, Team> = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    const roster = rosters.get(abbr)!;
    const team = { ...t, roster, depthChart: buildDepthChart(roster) };
    const problems = validateTeam(team);
    if (problems.length > 0) throw new Error(`${abbr} roster invalid after moves: ${problems.join("; ")}`);
    teams[abbr] = team;
  }
  return { league: { ...league, teams }, cuts, signings, unsigned: pool };
}
