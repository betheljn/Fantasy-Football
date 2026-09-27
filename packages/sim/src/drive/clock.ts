import type { Rng } from "../rng.ts";
import type { PlayEvent } from "../play/events.ts";

export const QUARTER_SECONDS = 15 * 60;
export const TWO_MINUTE_WARNING = 120;
export const TIMEOUTS_PER_HALF = 3;

export type Pace = "normal" | "hurry" | "milk";

export interface ClockState {
  quarter: number;
  clock: number;
}

/** Two-minute warning in the 2nd and 4th quarters and in overtime. */
export function hasTwoMinuteWarning(quarter: number): boolean {
  return quarter === 2 || quarter >= 4;
}

/** In these windows an out-of-bounds play stops the clock until the next snap. */
export function outOfBoundsStopsClock(c: ClockState): boolean {
  return (c.quarter === 2 && c.clock <= 120) || (c.quarter >= 4 && c.clock <= 300);
}

/** Whether the clock stops when this play ends (otherwise it keeps running to the next snap). */
export function playStopsClock(e: PlayEvent, after: ClockState): boolean {
  switch (e.kind) {
    case "field_goal":
    case "punt":
    case "kickoff":
    case "conversion":
    case "spike":
    case "timeout":
      return true;
    case "kneel":
      return false;
    case "penalty":
      return false; // pre-snap foul: the clock is left as it was (the drive doesn't advance it)
    default:
      if (e.stopReason === null) return false;
      if (e.stopReason === "out_of_bounds") return outOfBoundsStopsClock(after);
      return true;
  }
}

/** Seconds between the end of one play and the next snap when the clock is running. */
export function runoffSeconds(rng: Rng, pace: Pace): number {
  switch (pace) {
    case "hurry":
      return Math.round(Math.max(6, rng.normal(14, 3)));
    case "milk":
      return 39;
    default:
      return Math.round(Math.max(18, rng.normal(34, 4)));
  }
}

/**
 * Clock after the live part of a play, and whether it keeps running toward the
 * next snap. A play that starts before 2:00 and ends after it stops for the
 * two-minute warning.
 */
export function clockAfterPlay(before: ClockState, e: PlayEvent): { clock: number; running: boolean } {
  const clock = Math.max(0, before.clock - e.duration);
  if (hasTwoMinuteWarning(before.quarter) && before.clock > TWO_MINUTE_WARNING && clock <= TWO_MINUTE_WARNING) {
    return { clock, running: false };
  }
  if (clock === 0) return { clock, running: false };
  return { clock, running: !playStopsClock(e, { quarter: before.quarter, clock }) };
}

/**
 * Run `seconds` off a running clock toward the next snap. Stops at the
 * two-minute warning, in which case the clock is no longer running.
 */
export function runClock(c: ClockState, seconds: number): { clock: number; running: boolean } {
  const next = Math.max(0, c.clock - seconds);
  if (hasTwoMinuteWarning(c.quarter) && c.clock > TWO_MINUTE_WARNING && next <= TWO_MINUTE_WARNING) {
    return { clock: TWO_MINUTE_WARNING, running: false };
  }
  return { clock: next, running: next > 0 };
}
