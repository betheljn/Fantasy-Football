import type { Player } from "../model/player.ts";
import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { clamp, edge, exponential, type PlayContext } from "./common.ts";
import type { FieldGoalEvent, PuntEvent } from "./events.ts";

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
  const blocked = rng.chance(0.015);
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
    duration: 5,
    nextYardline: made ? null : Math.max(20, 100 - spotOfKick),
  };
}

/** Best non-starter by speed among WR/CB/RB: the punt returner. */
export function returnerOf(team: Team): Player {
  const starterIds = new Set([
    ...starters(team, "WR").map((p) => p.id),
    ...starters(team, "CB").map((p) => p.id),
    ...starters(team, "RB", 1).map((p) => p.id),
  ]);
  const pool = team.roster.filter((p) => ["WR", "CB", "RB"].includes(p.position) && !starterIds.has(p.id));
  return pool.reduce((best, p) => (p.ratings.speed > best.ratings.speed ? p : best), pool[0] ?? starters(team, "WR")[0]!);
}

export function simulatePunt(rng: Rng, ctx: PlayContext): PuntEvent {
  const punter = starters(ctx.offense, "P")[0]!;
  const returner = returnerOf(ctx.defense);
  const sit = ctx.situation;
  const gross = Math.round(clamp(rng.normal(46 + 3 * edge(punter.ratings.kickPower), 5.5), 25, 70));
  const landing = sit.yardline + gross; // punting team's perspective

  const base = {
    kind: "punt" as const,
    offense: ctx.offense.abbr,
    defense: ctx.defense.abbr,
    start: { ...sit },
    punter: punter.id,
  };

  // Into the end zone, or rolls in: touchback.
  const rollsIn = landing > 90 && rng.chance(clamp(1 - edge(punter.ratings.kickAccuracy) * 0.3, 0.2, 1) * (landing - 90) / 12);
  if (landing >= 100 || rollsIn) {
    return { ...base, grossYards: Math.min(gross, 100 - sit.yardline), returner: null, returnYards: 0, fairCatch: false, touchback: true, touchdown: false, nextYardline: 20, duration: 6 };
  }

  const catchSpot = 100 - landing; // receiving team's perspective
  // Deep in their own end, returners mostly fair catch.
  const fairCatch = rng.chance(catchSpot < 15 ? 0.7 : 0.4);
  let returnYards = 0;
  if (!fairCatch) {
    returnYards = Math.max(0, Math.round(rng.normal(8 + 3 * edge(returner.ratings.speed), 6)));
    if (rng.chance(0.03 + 0.01 * edge(returner.ratings.elusiveness))) returnYards += Math.round(15 + exponential(rng, 20));
  }
  const end = Math.min(100, catchSpot + returnYards);
  return {
    ...base,
    grossYards: gross,
    returner: returner.id,
    returnYards: end - catchSpot,
    fairCatch,
    touchback: false,
    touchdown: end >= 100,
    nextYardline: end,
    duration: Math.round(clamp(6 + returnYards / 6, 5, 15)),
  };
}
