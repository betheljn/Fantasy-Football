import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import type { PlayContext } from "../play/common.ts";
import type { ConversionEvent, PlayEvent, Situation } from "../play/events.ts";
import { fieldGoalProbability, kickerOf, simulateFieldGoal, simulatePunt } from "../play/kicking.ts";
import { simulatePass } from "../play/pass.ts";
import { simulateRun } from "../play/run.ts";
import { QUARTER_SECONDS, clockAfterPlay, runClock, runoffSeconds } from "./clock.ts";
import { callPlay, goForTwo, halfSecondsLeft, paceFor, timeoutCaller, type CallContext, type PlayCall } from "./playcall.ts";

export type DriveResultType =
  | "touchdown"
  | "field_goal"
  | "missed_field_goal"
  | "punt"
  | "punt_return_touchdown"
  | "turnover"
  | "defensive_touchdown"
  | "turnover_on_downs"
  | "safety"
  | "end_of_half"
  | "end_of_game";

/** What happens after the drive, for the game loop to act on. */
export type NextPossession =
  | { kind: "kickoff"; kickingTeam: string }
  /** After a safety: the team that gave it up free-kicks from its own 20. */
  | { kind: "free_kick"; kickingTeam: string }
  | { kind: "scrimmage"; team: string; yardline: number }
  | { kind: "none" };

export interface DrivePlay {
  event: PlayEvent;
  /** Quarter and game clock after the play (before any runoff to the next snap). */
  quarter: number;
  clockAfter: number;
}

export interface DriveInput {
  offense: Team;
  defense: Team;
  quarter: number;
  clock: number;
  /** Offense's own perspective: 0 = own goal line. */
  yardline: number;
  /** Score entering the drive, keyed by team abbr. */
  score: Record<string, number>;
  /** Timeouts left this half, keyed by team abbr. */
  timeouts: Record<string, number>;
}

export interface DriveResult {
  offense: string;
  defense: string;
  start: { quarter: number; clock: number; yardline: number };
  end: { quarter: number; clock: number };
  plays: DrivePlay[];
  result: DriveResultType;
  /** Points scored during the drive, by team abbr (either side can score). */
  points: Record<string, number>;
  timeouts: Record<string, number>;
  next: NextPossession;
  /** Scrimmage plays and net yards (excludes kicks, tries and timeouts). */
  scrimmagePlays: number;
  yards: number;
  /** Game-clock seconds the drive took. */
  seconds: number;
}

const SCRIMMAGE_KINDS = new Set<PlayEvent["kind"]>(["run", "pass", "kneel", "spike"]);

export function simulateDrive(rng: Rng, input: DriveInput): DriveResult {
  const { offense, defense } = input;
  const off = offense.abbr;
  const def = defense.abbr;
  const points: Record<string, number> = { [off]: 0, [def]: 0 };
  const timeouts: Record<string, number> = { ...input.timeouts };
  const plays: DrivePlay[] = [];

  let quarter = input.quarter;
  let clock = input.clock;
  let clockRunning = false; // a new possession always starts with the clock stopped
  let yardline = input.yardline;
  let down: Situation["down"] = 1;
  let distance = Math.min(10, 100 - yardline);
  let elapsed = 0;

  const margin = () => input.score[off]! + points[off]! - (input.score[def]! + points[def]!);
  const callContext = (): CallContext => ({
    offense,
    situation: { quarter, clock, down, distance, yardline },
    margin: margin(),
    clockRunning,
    offenseTimeouts: timeouts[off]!,
    defenseTimeouts: timeouts[def]!,
  });

  const finish = (result: DriveResultType, next: NextPossession): DriveResult => {
    const scrimmage = plays.filter((p) => SCRIMMAGE_KINDS.has(p.event.kind));
    const yards = scrimmage.reduce((s, p) => s + ("yardsGained" in p.event ? p.event.yardsGained : 0), 0);
    return {
      offense: off,
      defense: def,
      start: { quarter: input.quarter, clock: input.clock, yardline: input.yardline },
      end: { quarter, clock },
      plays,
      result,
      points,
      timeouts,
      next,
      scrimmagePlays: scrimmage.length,
      yards,
      seconds: elapsed,
    };
  };

  /** Touchdown by `team` (offense or defense): six points plus the try. */
  const touchdown = (team: Team, other: Team) => {
    points[team.abbr]! += 6;
    const marginAfterTd =
      input.score[team.abbr]! + points[team.abbr]! - (input.score[other.abbr]! + points[other.abbr]!);
    const conv = simulateConversion(rng, team, other, quarter, clock, marginAfterTd);
    if (conv.success) points[team.abbr]! += conv.method === "kick" ? 1 : 2;
    plays.push({ event: conv, quarter, clockAfter: clock });
  };

  for (;;) {
    const cc = callContext();
    const call = callPlay(rng, cc);
    const event = runCall(rng, call, { offense, defense, situation: cc.situation });

    const before = clock;
    const after = clockAfterPlay({ quarter, clock }, event);
    clock = after.clock;
    clockRunning = after.running;
    elapsed += before - clock;
    plays.push({ event, quarter, clockAfter: clock });

    // --- resolve the play; return if the drive is over ---
    if (event.kind === "field_goal") {
      if (event.made) {
        points[off]! += 3;
        return finish("field_goal", { kind: "kickoff", kickingTeam: off });
      }
      return finish("missed_field_goal", { kind: "scrimmage", team: def, yardline: event.nextYardline! });
    }

    if (event.kind === "punt") {
      if (event.touchdown) {
        touchdown(defense, offense);
        return finish("punt_return_touchdown", { kind: "kickoff", kickingTeam: def });
      }
      return finish("punt", { kind: "scrimmage", team: def, yardline: event.nextYardline });
    }

    let firstDown = false;
    if (event.kind === "kneel") {
      yardline += event.yardsGained;
      distance -= event.yardsGained;
    } else if (event.kind === "run" || event.kind === "pass") {
      if (event.turnover) {
        if (event.turnover.touchdown) {
          touchdown(defense, offense);
          return finish("defensive_touchdown", { kind: "kickoff", kickingTeam: def });
        }
        return finish("turnover", { kind: "scrimmage", team: def, yardline: event.turnover.endYardline });
      }
      if (event.touchdown) {
        touchdown(offense, defense);
        return finish("touchdown", { kind: "kickoff", kickingTeam: off });
      }
      if (event.safety) {
        points[def]! += 2;
        return finish("safety", { kind: "free_kick", kickingTeam: off });
      }
      yardline = event.endYardline;
      firstDown = event.firstDown;
      distance = firstDown ? Math.min(10, 100 - yardline) : Math.min(distance - event.yardsGained, 100 - yardline);
    }

    if (firstDown) {
      down = 1;
    } else if (down === 4) {
      return finish("turnover_on_downs", { kind: "scrimmage", team: def, yardline: 100 - yardline });
    } else {
      down = (down + 1) as Situation["down"];
    }

    // --- between plays: timeout, or the clock runs to the next snap ---
    if (clockRunning) {
      const next = callContext();
      const caller = timeoutCaller(next);
      if (caller) {
        const team = caller === "offense" ? off : def;
        timeouts[team]! -= 1;
        clockRunning = false;
        plays.push({
          event: { kind: "timeout", offense: off, defense: def, start: next.situation, duration: 0, team, remaining: timeouts[team]! },
          quarter,
          clockAfter: clock,
        });
      } else {
        const pace = call === "kneel" ? "milk" : paceFor(next);
        let seconds = runoffSeconds(rng, pace);
        // Out of timeouts at the end of a half: rush to the line and spike with time to spare.
        if (pace === "hurry" && timeouts[off] === 0 && halfSecondsLeft(next.situation) <= 60 && clock > 2) {
          seconds = Math.min(rng.int(5, 8), clock - 2);
        }
        const ran = runClock({ quarter, clock }, seconds);
        elapsed += clock - ran.clock;
        clock = ran.clock;
        clockRunning = ran.running;
      }
    }

    // --- clock expiry ---
    if (clock === 0) {
      if (quarter === 1 || quarter === 3) {
        quarter += 1;
        clock = QUARTER_SECONDS;
        clockRunning = false;
      } else {
        return finish(quarter === 2 ? "end_of_half" : "end_of_game", { kind: "none" });
      }
    }
  }
}

function runCall(rng: Rng, call: PlayCall, ctx: PlayContext): PlayEvent {
  const base = { offense: ctx.offense.abbr, defense: ctx.defense.abbr, start: { ...ctx.situation } };
  switch (call) {
    case "run":
      return simulateRun(rng, ctx);
    case "pass":
      return simulatePass(rng, ctx);
    case "punt":
      return simulatePunt(rng, ctx);
    case "field_goal":
      return simulateFieldGoal(rng, ctx);
    case "kneel":
      return { ...base, kind: "kneel", qb: starters(ctx.offense, "QB")[0]!.id, yardsGained: ctx.situation.yardline > 1 ? -1 : 0, duration: 2 };
    case "spike":
      return { ...base, kind: "spike", qb: starters(ctx.offense, "QB")[0]!.id, duration: 1 };
  }
}

/** Extra point or two-point try by `team` after its touchdown. */
export function simulateConversion(
  rng: Rng,
  team: Team,
  other: Team,
  quarter: number,
  clock: number,
  marginAfterTd: number,
): ConversionEvent {
  const base = { kind: "conversion" as const, offense: team.abbr, defense: other.abbr, team: team.abbr, duration: 0 };
  if (goForTwo(quarter, marginAfterTd)) {
    const start: Situation = { quarter, clock, down: 1, distance: 2, yardline: 98 };
    const ctx: PlayContext = { offense: team, defense: other, situation: start };
    const play = rng.chance(0.6) ? simulatePass(rng, ctx) : simulateRun(rng, ctx);
    return { ...base, start, method: "two_point", success: play.touchdown, kicker: null, play };
  }
  const kicker = kickerOf(team);
  const start: Situation = { quarter, clock, down: 1, distance: 15, yardline: 85 };
  const success = !rng.chance(0.01) && rng.chance(fieldGoalProbability(kicker, 33));
  return { ...base, start, method: "kick", success, kicker: kicker.id, play: null };
}
