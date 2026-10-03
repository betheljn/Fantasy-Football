// Special teams: the eleven on each side for every kick, and how likely a
// kick is to be blocked. Units are picked from the depth chart (no dice), so
// they never change a game; they're recorded on the kick for the field to
// show everyone. Blocks are rare and come from the matchup: the rushers'
// burst and leap against the protection, the snap, the kicker's lift, and a
// long kick's lower flight.
import type { Player, PlayerId } from "../model/player.ts";
import type { Position } from "../model/positions.ts";
import { passRushing } from "../model/ratings.ts";
import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { avg, clamp, edge, weightedPick } from "./common.ts";

/** Where a player lines up on a kick (drawn like the matching scrimmage spot). */
export type SpecialRole = "K" | "P" | "H" | "LS" | "OL" | "TE" | "DL" | "LB" | "CB" | "S" | "RB" | "WR" | "KR" | "COVER";

export interface UnitMember {
  id: PlayerId;
  role: SpecialRole;
}

/** Both units on a kick: the kicking team's and the other side's. */
export interface SpecialUnits {
  kicking: UnitMember[];
  receiving: UnitMember[];
}

export type KickKind = "field_goal" | "extra_point" | "punt" | "kickoff";

/** Builds an 11-man unit without repeats, filling any gaps from the rest of the roster. */
class Unit {
  private used = new Set<PlayerId>();
  readonly members: UnitMember[] = [];
  private readonly team: Team;
  constructor(team: Team) {
    this.team = team;
  }
  add(p: Player | undefined, role: SpecialRole) {
    if (!p || this.used.has(p.id) || this.members.length >= 11) return;
    this.used.add(p.id);
    this.members.push({ id: p.id, role });
  }
  /** The next `n` at a position in depth-chart order (skipping anyone already in). */
  take(pos: Position, n: number, role: SpecialRole, from = 0) {
    for (const id of this.team.depthChart[pos].slice(from)) {
      if (n <= 0) break;
      const p = this.team.roster.find((x) => x.id === id);
      if (p && !this.used.has(p.id)) {
        this.add(p, role);
        n--;
      }
    }
  }
  /** The best `n` of a pool by `score`. */
  best(pool: readonly Player[], n: number, role: SpecialRole, score: (p: Player) => number) {
    for (const p of [...pool].filter((x) => !this.used.has(x.id)).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, n)) this.add(p, role);
  }
  done(fill: SpecialRole): UnitMember[] {
    this.best(this.team.roster, 11 - this.members.length, fill, (p) => p.ratings.speed);
    return this.members;
  }
}

const backups = (team: Team, positions: readonly Position[]) => {
  const starting = new Set(positions.flatMap((pos) => starters(team, pos).map((p) => p.id)));
  return team.roster.filter((p) => positions.includes(p.position) && !starting.has(p.id));
};
const coverSpeed = (p: Player) => p.ratings.speed + p.ratings.tackle * 0.6 + p.ratings.pursuit * 0.4;

/** The kicking team's unit. */
export function kickingUnit(team: Team, kind: KickKind): UnitMember[] {
  const u = new Unit(team);
  if (kind === "field_goal" || kind === "extra_point") {
    u.take("K", 1, "K");
    u.take("P", 1, "H");
    u.take("LS", 1, "LS");
    u.take("OL", 6, "OL");
    u.take("TE", 2, "TE");
    return u.done("OL");
  }
  if (kind === "punt") {
    u.take("P", 1, "P");
    u.take("LS", 1, "LS");
    u.take("OL", 5, "OL");
    u.best(backups(team, ["S", "LB"]), 1, "S", (p) => p.ratings.awareness + p.ratings.passBlockPower);
    // Gunners and coverage: the fastest backups who can tackle.
    u.best(backups(team, ["CB", "WR", "S", "LB", "RB", "TE"]), 3, "COVER", coverSpeed);
    return u.done("COVER");
  }
  u.take("K", 1, "K");
  u.best(backups(team, ["LB", "S", "CB", "WR", "TE", "RB"]), 10, "COVER", coverSpeed);
  return u.done("COVER");
}

/** The other side: the block team on kicks from scrimmage, the return team otherwise. */
export function receivingUnit(team: Team, kind: KickKind, returner?: PlayerId | null): UnitMember[] {
  const u = new Unit(team);
  if (kind === "field_goal" || kind === "extra_point") {
    u.take("DL", 5, "DL");
    u.take("LB", 3, "LB");
    u.take("CB", 2, "CB");
    u.take("S", 1, "S");
    return u.done("LB");
  }
  u.add(team.roster.find((p) => p.id === returner), "KR");
  if (kind === "punt") {
    u.best(backups(team, ["CB"]), 2, "CB", (p) => p.ratings.press + p.ratings.speed);
    u.take("DL", 4, "DL");
    u.take("LB", 3, "LB");
    u.take("S", 1, "S");
    return u.done("LB");
  }
  u.best(backups(team, ["LB", "TE", "OL"]), 5, "LB", (p) => p.ratings.strength + p.ratings.impactBlocking);
  u.best(backups(team, ["RB", "WR", "TE", "S"]), 5, "RB", (p) => p.ratings.speed + p.ratings.strength * 0.5);
  return u.done("WR");
}

/** Both units for a kick. */
export function specialUnits(kicking: Team, receiving: Team, kind: KickKind, returner?: PlayerId | null): SpecialUnits {
  return { kicking: kickingUnit(kicking, kind), receiving: receivingUnit(receiving, kind, returner) };
}

/** League-average chance a kick is blocked, before the matchup. */
export const BLOCK_RATE: Record<Exclude<KickKind, "kickoff">, number> = { field_goal: 0.009, extra_point: 0.004, punt: 0.0032 };

/** How well a player gets after a kick: get-off, the rush and the leap. */
export function kickRush(p: Player): number {
  return passRushing(p.ratings) * 0.5 + p.ratings.jumping * 0.25 + p.ratings.acceleration * 0.25;
}

const byId = (team: Team) => new Map(team.roster.map((p) => [p.id, p]));

/** The players in a unit, in order. */
function players(team: Team, members: readonly UnitMember[]): Player[] {
  const m = byId(team);
  return members.map((x) => m.get(x.id)).filter((p): p is Player => !!p);
}

/**
 * Chance this kick is blocked: rare, and decided by the matchup. A strong
 * rush against a weak edge, a slow snap, a kicker without lift and a long
 * kick (a lower flight) all raise it.
 */
export function blockChance(kind: Exclude<KickKind, "kickoff">, kicking: Team, receiving: Team, units: SpecialUnits, distance = 0): number {
  const rushers = players(receiving, units.receiving).sort((a, b) => kickRush(b) - kickRush(a)).slice(0, 4);
  const line = players(kicking, units.kicking.filter((x) => x.role === "OL" || x.role === "TE" || x.role === "LS"));
  const rush = avg(rushers, kickRush);
  const protect = avg(line, (p) => (p.ratings.passBlockPower + p.ratings.passBlockFinesse) / 2);
  const snapper = players(kicking, units.kicking.filter((x) => x.role === "LS"))[0];
  const kicker = players(kicking, units.kicking.filter((x) => x.role === "K" || x.role === "P"))[0];
  let chance = BLOCK_RATE[kind] * Math.exp(0.05 * (rush - protect));
  if (snapper) chance *= clamp(1 - 0.35 * edge(snapper.ratings.snapping), 0.6, 1.6);
  else chance *= 1.6;
  if (kicker) chance *= clamp(1 - 0.25 * edge(kicker.ratings.kickPower), 0.7, 1.4);
  // Long field goals fly lower.
  if (kind === "field_goal") chance *= 1 + Math.max(0, distance - 40) / 25;
  return clamp(chance, 0.001, 0.06);
}

/** Who got a hand on it: the best rushers are likeliest. */
export function pickBlocker(rng: Rng, receiving: Team, units: SpecialUnits): Player {
  const pool = players(receiving, units.receiving).filter((p) => ["DL", "LB"].includes(units.receiving.find((x) => x.id === p.id)!.role));
  return weightedPick(rng, pool.length ? pool : players(receiving, units.receiving), (p) => Math.max(1, kickRush(p) - 40) ** 2);
}
