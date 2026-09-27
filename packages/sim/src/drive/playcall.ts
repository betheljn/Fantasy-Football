// Offensive decision making: what to call on each snap, when to use timeouts,
// and what to try after a TD.
import { playerOverall } from "../model/player.ts";
import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { clamp } from "../play/common.ts";
import type { Situation } from "../play/events.ts";
import { fieldGoalDistance, fieldGoalProbability, kickerOf } from "../play/kicking.ts";
import { hasTwoMinuteWarning, TWO_MINUTE_WARNING, type Pace } from "./clock.ts";

export type PlayCall = "run" | "pass" | "punt" | "field_goal" | "kneel" | "spike";

export interface CallContext {
  offense: Team;
  situation: Situation;
  /** Offense score minus defense score. */
  margin: number;
  /** Is the clock running into this snap? */
  clockRunning: boolean;
  offenseTimeouts: number;
  defenseTimeouts: number;
}

/** Seconds left in the current half (quarters 2 and 4 end a half). */
export function halfSecondsLeft(s: Situation): number {
  return s.quarter === 1 || s.quarter === 3 ? s.clock + 900 : s.clock;
}

export function paceFor(c: Pick<CallContext, "situation" | "margin">): Pace {
  const s = c.situation;
  const late = halfSecondsLeft(s);
  if (s.quarter >= 4 && c.margin > 0 && late <= 300) return "milk";
  if (s.quarter >= 4 && c.margin < 0 && late <= 300) return "hurry";
  // Tied late: play to win rather than let the clock run out.
  if (s.quarter >= 4 && c.margin === 0 && late <= 120) return "hurry";
  if (s.quarter === 2 && late <= 120) return "hurry";
  return "normal";
}

/** Team pass tendency from personnel: a strong QB relative to the RB leans pass. */
export function passLean(team: Team): number {
  const qb = playerOverall(starters(team, "QB")[0]!);
  const rb = playerOverall(starters(team, "RB")[0]!);
  return clamp(0.56 + 0.004 * (qb - rb), 0.46, 0.66);
}

export function passProbability(c: CallContext): number {
  const s = c.situation;
  const toGoal = 100 - s.yardline;
  let p = passLean(c.offense);

  if (s.down === 1) p -= 0.05;
  else if (s.down === 2) p += s.distance >= 8 ? 0.1 : s.distance <= 3 ? -0.15 : 0;
  else p += s.distance >= 5 ? 0.3 : s.distance >= 3 ? 0.1 : -0.2; // 3rd/4th down
  if (toGoal <= 3) p -= 0.15;

  const pace = paceFor(c);
  if (pace === "hurry") p += c.margin <= -9 ? 0.35 : 0.25;
  if (pace === "milk") p -= 0.3;
  return clamp(p, 0.05, 0.95);
}

/**
 * Can the offense kneel out the half from here? Walks the remaining snaps:
 * each kneel takes ~2s, then the clock runs 39s unless the defense stops it
 * with a timeout or the two-minute warning intervenes.
 */
export function canKneelOut(s: Situation, defenseTimeouts: number): boolean {
  let clock = s.clock;
  let timeouts = defenseTimeouts;
  for (let down = s.down; down <= 4; down++) {
    clock -= 2;
    if (clock <= 0) return true;
    if (down === 4) return false; // would turn it over on downs with time left
    if (timeouts > 0) {
      timeouts--;
      continue;
    }
    const next = clock - 39;
    clock = hasTwoMinuteWarning(s.quarter) && clock > TWO_MINUTE_WARNING && next <= TWO_MINUTE_WARNING ? TWO_MINUTE_WARNING : next;
    if (clock <= 0) return true;
  }
  return false;
}

function shouldKneel(c: CallContext): boolean {
  const s = c.situation;
  if (s.quarter >= 4 && c.margin > 0) return canKneelOut(s, c.defenseTimeouts);
  // End of first half, backed up with nothing to gain.
  return s.quarter === 2 && s.clock <= 30 && s.yardline < 50 && c.margin >= 0 && canKneelOut(s, c.defenseTimeouts);
}

function scrimmage(rng: Rng, c: CallContext): PlayCall {
  return rng.chance(passProbability(c)) ? "pass" : "run";
}

export function callPlay(rng: Rng, c: CallContext): PlayCall {
  const s = c.situation;
  const toGoal = 100 - s.yardline;
  const fgProb = fieldGoalProbability(kickerOf(c.offense), fieldGoalDistance(s.yardline));
  const late = halfSecondsLeft(s);
  // Late in the game a field goal is only worth it if it ties or takes the lead.
  const fgHelps = !(s.quarter >= 4 && late <= 120 && c.margin < -3);

  if (shouldKneel(c)) return "kneel";

  // Last chance to kick before the half/game ends: with no way to stop the
  // clock after another play, kick now.
  const lastKick = late <= 12 || (late <= 25 && c.offenseTimeouts === 0);
  if (lastKick && fgProb >= 0.3 && fgHelps) return "field_goal";

  // Out of timeouts with the clock running at the end of a half: spike it.
  if (c.clockRunning && c.offenseTimeouts === 0 && paceFor(c) === "hurry" && late <= 60 && late > 1 && s.down < 4) {
    return "spike";
  }

  if (s.down === 4) {
    // Late and trailing: must go for it, unless a FG does the job.
    // In overtime, trailing means this possession is the last chance.
    const desperate = s.quarter >= 4 && c.margin < 0 && (late <= 240 || s.quarter >= 5);
    if (desperate && !(fgHelps && c.margin >= -3 && fgProb >= 0.5)) return scrimmage(rng, c);

    const goForIt =
      (s.distance <= 1 && s.yardline >= 40) ||
      (s.distance <= 2 && s.yardline >= 55 && fgProb < 0.8) ||
      (s.distance <= 4 && s.yardline >= 60 && fgProb < 0.45) || // no-man's land
      (s.distance <= 2 && toGoal <= 5);
    if (goForIt) return scrimmage(rng, c);
    if (fgProb >= 0.45 && fgHelps) return "field_goal";
    return "punt";
  }

  return scrimmage(rng, c);
}

/**
 * Who, if anyone, calls a timeout while the clock is running between plays.
 * The offense saves time in a two-minute drill; the defense saves time when
 * the offense is trying to run out the clock on them.
 */
export function timeoutCaller(c: CallContext): "offense" | "defense" | null {
  const late = halfSecondsLeft(c.situation);
  const pace = paceFor(c);
  // Offense keeps its last timeout for the final seconds (e.g. to set up a kick).
  if (pace === "hurry" && late <= 120 && (c.offenseTimeouts > 1 || (c.offenseTimeouts === 1 && late <= 45))) {
    return "offense";
  }
  if (pace === "milk" && c.defenseTimeouts > 0 && late <= 240 && c.margin <= 16) return "defense";
  return null;
}

/**
 * Go for two per a simplified late-game chart (margin after the TD, before the try);
 * otherwise kick.
 */
export function goForTwo(quarter: number, marginAfterTd: number): boolean {
  return quarter >= 4 && [-10, -5, -2, 1, 5, 12].includes(marginAfterTd);
}
