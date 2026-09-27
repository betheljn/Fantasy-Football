import type { Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { clamp, edge, exponential } from "./common.ts";
import type { KickoffEvent, Situation } from "./events.ts";
import { coverageUnit, kickerOf, pickCoverageTackler, returnFumble, returnerOf } from "./kicking.ts";

/** League rule: kickoffs are from the 35; a touchback puts the ball at the 30. */
export const KICKOFF_SPOT = 35;
export const KICKOFF_TOUCHBACK = 30;
/** Free kick after a safety is from the kicking team's 20. */
export const FREE_KICK_SPOT = 20;
export const ONSIDE_RECOVERY_RATE = 0.12;

export interface KickoffOptions {
  kicking: Team;
  receiving: Team;
  quarter: number;
  clock: number;
  onside?: boolean;
  /** Free kick after a safety (from the 20). */
  freeKick?: boolean;
}

export function simulateKickoff(rng: Rng, o: KickoffOptions): KickoffEvent {
  const kicker = kickerOf(o.kicking);
  const from = o.freeKick ? FREE_KICK_SPOT : KICKOFF_SPOT;
  const start: Situation = { quarter: o.quarter, clock: o.clock, down: 1, distance: 10, yardline: from };
  const base = {
    kind: "kickoff" as const,
    offense: o.kicking.abbr,
    defense: o.receiving.abbr,
    start,
    kicker: kicker.id,
    onside: !!o.onside,
    freeKick: !!o.freeKick,
    fumble: null,
    tackler: null,
  };

  if (o.onside) {
    const recovered = rng.chance(ONSIDE_RECOVERY_RATE);
    const spot = from + rng.int(10, 13); // kicking team's perspective
    return {
      ...base,
      returner: null,
      returnYards: 0,
      touchback: false,
      touchdown: false,
      recoveredByKickingTeam: recovered,
      nextYardline: recovered ? spot : 100 - spot,
      duration: 3,
    };
  }

  const k = kicker.ratings;
  // Deep kicks into the end zone become touchbacks; stronger legs get more of them.
  if (!o.freeKick && rng.chance(clamp(0.55 + 0.1 * edge(k.kickPower), 0.3, 0.8))) {
    return { ...base, returner: null, returnYards: 0, touchback: true, touchdown: false, recoveredByKickingTeam: false, nextYardline: KICKOFF_TOUCHBACK, duration: 0 };
  }

  const returner = returnerOf(o.receiving);
  const r = returner.ratings;
  // Where the returner fields it, receiving team's perspective.
  const kickLength = o.freeKick ? rng.normal(52 + 3 * edge(k.kickPower), 6) : rng.normal(62 + 2 * edge(k.kickPower), 4);
  const caught = Math.round(clamp(100 - from - kickLength, 0, 40));
  let returnYards = Math.max(0, Math.round(rng.normal(o.freeKick ? 10 : 24 + 3 * edge(r.speed), 7)));
  if (rng.chance(0.03 + 0.01 * edge(r.elusiveness))) returnYards += Math.round(10 + exponential(rng, 20));
  const end = Math.min(100, caught + returnYards);
  const touchdown = end >= 100;
  const coverage = coverageUnit(o.kicking);
  const tackler = touchdown ? null : pickCoverageTackler(rng, coverage);
  const fumble = touchdown ? null : returnFumble(rng, returner, tackler, coverage, 0.008);
  return {
    ...base,
    returner: returner.id,
    returnYards: end - caught,
    touchback: false,
    touchdown,
    fumble,
    tackler: tackler?.id ?? null,
    // A lost fumble gives the kicking team the ball where it came loose.
    recoveredByKickingTeam: !!fumble?.lost,
    nextYardline: fumble?.lost ? 100 - end : end,
    duration: Math.round(clamp(5 + returnYards / 8, 4, 15)),
  };
}
