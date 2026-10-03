import type { Player } from "../model/player.ts";
import { passRushing } from "../model/ratings.ts";
import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { clamp, edge, exponential, weightedPick, type PlayContext } from "./common.ts";
import type { FieldGoalEvent, Fumble, PuntEvent } from "./events.ts";
import { blockChance, pickBlocker, specialUnits } from "./special.ts";

/** Kick distance: line of scrimmage to goal line + 10 yard end zone + 7 yard snap. */
export function fieldGoalDistance(yardline: number): number {
  return 100 - yardline + 17;
}

/** Probability a kicker makes a kick of `distance` yards (block chance not included). */
export function fieldGoalProbability(kicker: Player, distance: number): number {
  const range = 56 + 6 * edge(kicker.ratings.kickPower);
  const ceiling = clamp(0.97 + 0.02 * edge(kicker.ratings.kickAccuracy), 0.9, 0.995);
  return ceiling / (1 + Math.exp((distance - range) / 5));
}

export function kickerOf(team: Team): Player {
  return starters(team, "K")[0]!;
}

export function simulateFieldGoal(rng: Rng, ctx: PlayContext): FieldGoalEvent {
  const kicker = kickerOf(ctx.offense);
  const distance = fieldGoalDistance(ctx.situation.yardline);
  const units = specialUnits(ctx.offense, ctx.defense, "field_goal");
  const blocked = rng.chance(blockChance("field_goal", ctx.offense, ctx.defense, units, distance));
  const blockedBy = blocked ? pickBlocker(rng, ctx.defense, units).id : null;
  const made = !blocked && rng.chance(fieldGoalProbability(kicker, distance));
  // A miss gives the defense the ball at the spot of the kick, or their 20 if that's better.
  const spotOfKick = ctx.situation.yardline - 7;
  return {
    kind: "field_goal",
    offense: ctx.offense.abbr,
    defense: ctx.defense.abbr,
    start: { ...ctx.situation },
    kicker: kicker.id,
    distance,
    made,
    blocked,
    blockedBy,
    units,
    duration: 5,
    nextYardline: made ? null : Math.max(20, 100 - spotOfKick),
  };
}

/** Best kick returner among the non-starting WRs, CBs and RBs. */
export function returnerOf(team: Team): Player {
  const starterIds = new Set([
    ...starters(team, "WR").map((p) => p.id),
    ...starters(team, "CB").map((p) => p.id),
    ...starters(team, "RB", 1).map((p) => p.id),
  ]);
  const pool = team.roster.filter((p) => ["WR", "CB", "RB"].includes(p.position) && !starterIds.has(p.id));
  return pool.reduce((best, p) => (p.ratings.kickReturn > best.ratings.kickReturn ? p : best), pool[0] ?? starters(team, "WR")[0]!);
}

/**
 * Special-teams coverage unit: backups at LB/S/CB/WR/TE/RB (starters rest on
 * kick coverage). Falls back to starters if the roster is thin.
 */
export function coverageUnit(team: Team): Player[] {
  const starterIds = new Set(
    (["LB", "S", "CB", "WR", "TE", "RB"] as const).flatMap((pos) => starters(team, pos).map((p) => p.id)),
  );
  const backups = team.roster.filter((p) => ["LB", "S", "CB", "WR", "TE", "RB"].includes(p.position) && !starterIds.has(p.id));
  return backups.length >= 5 ? backups : team.roster.filter((p) => ["LB", "S", "CB"].includes(p.position));
}

/** Coverage player who makes the tackle on a return: speed and tackling matter. */
export function pickCoverageTackler(rng: Rng, unit: readonly Player[]): Player {
  return weightedPick(rng, unit, (p) => (p.ratings.speed + p.ratings.tackle + p.ratings.pursuit) / 3);
}

/** Fumble by a returner after possession. Recovery is roughly a coin flip. */
export function returnFumble(rng: Rng, returner: Player, tackler: Player | null, unit: readonly Player[], rate: number): Fumble | null {
  if (!rng.chance(rate * clamp(1 - 0.5 * edge(returner.ratings.carrying), 0.4, 1.8))) return null;
  const lost = rng.chance(0.5);
  return {
    by: returner.id,
    forcedBy: tackler?.id ?? null,
    recoveredBy: lost ? rng.pick(unit).id : returner.id,
    lost,
  };
}

export const PUNT_MUFF_RATE = { returned: 0.015, fairCatch: 0.004 };

export function simulatePunt(rng: Rng, ctx: PlayContext): PuntEvent {
  const punter = starters(ctx.offense, "P")[0]!;
  const returner = returnerOf(ctx.defense);
  const coverage = coverageUnit(ctx.offense);
  const sit = ctx.situation;
  const units = specialUnits(ctx.offense, ctx.defense, "punt", returner.id);

  const base = {
    kind: "punt" as const,
    offense: ctx.offense.abbr,
    defense: ctx.defense.abbr,
    start: { ...sit },
    punter: punter.id,
    units,
    blocked: false,
    blockedBy: null,
    returner: null,
    returnYards: 0,
    fairCatch: false,
    touchback: false,
    muffed: false,
    fumble: null,
    recoveredByKickingTeam: false,
    touchdown: false,
    safety: false,
    tackler: null,
  };

  // Blocked: the ball goes backwards and the receiving team takes over.
  if (rng.chance(blockChance("punt", ctx.offense, ctx.defense, units))) {
    const blocker = pickBlocker(rng, ctx.defense, units);
    const spot = sit.yardline - rng.int(5, 12); // kicking team's perspective
    if (spot <= 0) {
      // Loose in the end zone: defense falls on it for a TD, or the punt team covers it for a safety.
      const td = rng.chance(0.5);
      return { ...base, grossYards: 0, blocked: true, blockedBy: blocker.id, touchdown: td, safety: !td, nextYardline: td ? 100 : 20, duration: 4 };
    }
    const scoop = Math.max(0, Math.round(rng.normal(3, 6)));
    const end = Math.min(100, 100 - spot + scoop);
    return { ...base, grossYards: 0, blocked: true, blockedBy: blocker.id, returnYards: end - (100 - spot), touchdown: end >= 100, nextYardline: end, duration: 5 };
  }

  const gross = Math.round(clamp(rng.normal(46 + 3 * edge(punter.ratings.kickPower), 5.5), 25, 70));
  const landing = sit.yardline + gross; // punting team's perspective

  // Into the end zone, or rolls in: touchback.
  const rollsIn = landing > 90 && rng.chance(clamp(1 - edge(punter.ratings.kickAccuracy) * 0.3, 0.2, 1) * (landing - 90) / 12);
  if (landing >= 100 || rollsIn) {
    return { ...base, grossYards: Math.min(gross, 100 - sit.yardline), touchback: true, nextYardline: 20, duration: 6 };
  }

  const catchSpot = 100 - landing; // receiving team's perspective
  // Deep in their own end, returners mostly fair catch.
  const fairCatch = rng.chance(catchSpot < 15 ? 0.7 : 0.4);

  // Muffed catch: a live ball, recovered by either side.
  const muffRate = (fairCatch ? PUNT_MUFF_RATE.fairCatch : PUNT_MUFF_RATE.returned) * clamp(1 - 0.5 * edge(returner.ratings.catching), 0.4, 1.8);
  if (rng.chance(muffRate)) {
    const kickingRecovers = rng.chance(0.55);
    const recoverer = kickingRecovers ? rng.pick(coverage) : returner;
    return {
      ...base,
      grossYards: gross,
      returner: returner.id,
      fairCatch,
      muffed: true,
      fumble: { by: returner.id, forcedBy: null, recoveredBy: recoverer.id, lost: kickingRecovers },
      recoveredByKickingTeam: kickingRecovers,
      nextYardline: kickingRecovers ? landing : catchSpot,
      duration: 6,
    };
  }

  if (fairCatch) {
    return { ...base, grossYards: gross, returner: returner.id, fairCatch: true, nextYardline: catchSpot, duration: 6 };
  }

  let returnYards = Math.max(0, Math.round(rng.normal(8 + 3 * edge(returner.ratings.kickReturn), 6)));
  if (rng.chance(0.03 + 0.01 * edge((returner.ratings.kickReturn + returner.ratings.elusiveness) / 2))) returnYards += Math.round(15 + exponential(rng, 20));
  const end = Math.min(100, catchSpot + returnYards);
  const touchdown = end >= 100;
  const tackler = touchdown ? null : pickCoverageTackler(rng, coverage);
  const fumble = touchdown ? null : returnFumble(rng, returner, tackler, coverage, 0.01);
  return {
    ...base,
    grossYards: gross,
    returner: returner.id,
    returnYards: end - catchSpot,
    touchdown,
    tackler: tackler?.id ?? null,
    fumble,
    recoveredByKickingTeam: !!fumble?.lost,
    nextYardline: fumble?.lost ? 100 - end : end,
    duration: Math.round(clamp(6 + returnYards / 6, 5, 15)),
  };
}
