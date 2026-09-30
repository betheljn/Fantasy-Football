import { BASE_STARTERS, POSITIONS, type Position } from "./positions.ts";
import { playerOverall, type Player, type PlayerId } from "./player.ts";
import type { TeamStaff } from "./staff.ts";

export const ROSTER_MAX = 72;
export const GAME_DAY_ACTIVES = 53;

/** Ordered player ids per position; index 0 is the starter. */
export type DepthChart = Record<Position, PlayerId[]>;

export interface Team {
  readonly id: string;
  /** Fictional team, one per US state, e.g. "Ohio Ironclads". */
  readonly state: string;
  readonly nickname: string;
  readonly abbr: string;
  readonly roster: Player[];
  depthChart: DepthChart;
  /** Coaches and front office. Optional: without staff, the team plays with neutral, average-staff behavior. */
  staff?: TeamStaff;
  /** Cap bookkeeping for the current season (absent = nothing carried over). */
  cap?: TeamCap;
  /** Staff buyouts still being paid: each remaining season of a fired staff member's deal, $K. */
  staffDeadMoney?: ReadonlyArray<{ readonly season: number; readonly amount: number; readonly name: string }>;
}

export interface TeamCap {
  /** Unused cap carried in from last season, $K. */
  readonly rollover: number;
  /** Dead money charged this season from players no longer on the roster, $K. */
  readonly deadMoney: number;
  /** Incentives earned last season, charged to this season's cap, $K. */
  readonly incentives?: number;
  /** Shortfall below the cap floor, paid out to the roster and charged to the cap, $K. */
  readonly floorPayment?: number;
}

export function teamName(team: Team): string {
  return `${team.state} ${team.nickname}`;
}

/** Depth chart by position overall, best first. Ties broken by id so it is deterministic. */
export function buildDepthChart(roster: readonly Player[]): DepthChart {
  const chart = {} as DepthChart;
  for (const pos of POSITIONS) {
    chart[pos] = roster
      .filter((p) => p.position === pos)
      .map((p) => ({ id: p.id, ovr: playerOverall(p) }))
      .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id))
      .map((p) => p.id);
  }
  return chart;
}

export function getPlayer(team: Team, id: PlayerId): Player {
  const player = team.roster.find((p) => p.id === id);
  if (!player) throw new Error(`Player ${id} is not on ${team.abbr}`);
  return player;
}

/** The top `count` players on the depth chart at `pos` (defaults to base-formation starters). */
export function starters(team: Team, pos: Position, count = BASE_STARTERS[pos]): Player[] {
  return team.depthChart[pos].slice(0, count).map((id) => getPlayer(team, id));
}

/** Returns a list of problems; an empty list means the team is valid. */
export function validateTeam(team: Team): string[] {
  const issues: string[] = [];
  const ids = new Set<PlayerId>();
  const jerseys = new Set<number>();

  if (team.roster.length > ROSTER_MAX) {
    issues.push(`Roster has ${team.roster.length} players (max ${ROSTER_MAX})`);
  }
  for (const p of team.roster) {
    if (ids.has(p.id)) issues.push(`Duplicate player id ${p.id}`);
    ids.add(p.id);
    if (jerseys.has(p.jersey)) issues.push(`Duplicate jersey #${p.jersey}`);
    jerseys.add(p.jersey);
  }

  for (const pos of POSITIONS) {
    const listed = team.depthChart[pos] ?? [];
    if (listed.length < BASE_STARTERS[pos]) {
      issues.push(`Depth chart ${pos} has ${listed.length}, needs ${BASE_STARTERS[pos]}`);
    }
    for (const id of listed) {
      const p = team.roster.find((r) => r.id === id);
      if (!p) issues.push(`Depth chart ${pos} lists ${id}, who is not on the roster`);
      else if (p.position !== pos) issues.push(`Depth chart ${pos} lists ${id}, who is a ${p.position}`);
    }
  }
  return issues;
}
