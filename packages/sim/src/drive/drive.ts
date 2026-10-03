import type { Injury, InjuryTracker } from "../game/injuries.ts";
import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import type { PlayContext } from "../play/common.ts";
import { assessLiveBallPenalty, isNullified, rollPreSnapPenalty } from "../play/penalties.ts";
import { pointsForEvent } from "../play/scoring.ts";
import type { ConversionEvent, PlayEvent, Situation } from "../play/events.ts";
import { fieldGoalDistance, fieldGoalProbability, kickerOf, simulateFieldGoal, simulatePunt } from "../play/kicking.ts";
import { simulatePass } from "../play/pass.ts";
import { simulateRun } from "../play/run.ts";
import { QUARTER_SECONDS, clockAfterPlay, runClock, runoffSeconds } from "./clock.ts";
import { chooseDefense, chooseOffense } from "./scheme.ts";
import type { OffenseFormation } from "../play/formation.ts";
import { clockMistakeChance } from "../play/coaching.ts";
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
  /** Players hurt on the play. */
  injuries?: Injury[];
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
  /** Home team abbr, for home-field advantage; omit at a neutral site. */
  homeTeam?: string;
  /** Checks each play for injuries; the hurt leave the field for the next snap. */
  injuries?: InjuryTracker;
  /** A team whose calls are made by a person: the drive pauses before each of its snaps on offense. */
  coach?: string;
}

/** A coached team's turn to call a play: the situation, what its coaches would call, and what it may call. */
export interface SnapPrompt {
  kind: "offense";
  team: string;
  opponent: string;
  situation: Situation;
  /** Coached team's score minus the opponent's. */
  margin: number;
  clockRunning: boolean;
  timeouts: { own: number; opponent: number };
  /** The personnel and alignment the offense has lined up in. */
  formation: OffenseFormation;
  /** What the coaching staff would call (answering nothing takes it). */
  suggestion: PlayCall;
  options: PlayCall[];
}

/** A person's answer to a prompt. */
export interface CoachCall {
  call: PlayCall;
}

/** Longest field goal anyone may try (yards). */
export const MAX_FIELD_GOAL = 70;

/** The calls open to an offense on this snap (the coaches' suggestion is always one of them). */
export function callOptions(c: Pick<CallContext, "situation" | "clockRunning">, suggestion: PlayCall): PlayCall[] {
  const s = c.situation;
  const open: Record<PlayCall, boolean> = {
    run: true,
    pass: true,
    punt: s.down === 4,
    field_goal: fieldGoalDistance(s.yardline) <= MAX_FIELD_GOAL,
    kneel: true,
    spike: c.clockRunning && s.down < 4,
  };
  open[suggestion] = true;
  return (Object.keys(open) as PlayCall[]).filter((k) => open[k]);
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

/** A drive with no coached team: runs straight through. */
export function simulateDrive(rng: Rng, input: DriveInput): DriveResult {
  const { coach: _coach, ...uncoached } = input;
  const r = driveSteps(rng, uncoached).next();
  if (!r.done) throw new Error("An uncoached drive asked for a call");
  return r.value;
}

/**
 * A drive, pausing before each snap of the coached team (`input.coach`) on
 * offense. The coaches pick first, drawing from the same random stream as
 * always, so answering nothing (or the suggestion) plays out exactly as an
 * uncoached drive would; the same answers always give the same drive.
 */
export function* driveSteps(rng: Rng, input: DriveInput): Generator<SnapPrompt, DriveResult, CoachCall | undefined> {
  let { offense, defense } = input;
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

  const homeField = input.homeTeam === off ? 1 : input.homeTeam === def ? -1 : 0;

  /** Add an event to the drive; points always come from the event itself. */
  const record = (event: PlayEvent, clockAfter: number) => {
    const hurt = input.injuries?.check(event) ?? [];
    plays.push({ event, quarter, clockAfter, ...(hurt.length > 0 ? { injuries: hurt } : {}) });
    if (hurt.length > 0) {
      offense = input.injuries!.teams[off]!;
      defense = input.injuries!.teams[def]!;
    }
    for (const [team, pts] of Object.entries(pointsForEvent(event))) points[team]! += pts;
  };

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
    // Plays wiped out by an accepted penalty don't count as plays or yards.
    const scrimmage = plays.filter(
      (p) => SCRIMMAGE_KINDS.has(p.event.kind) && !((p.event.kind === "run" || p.event.kind === "pass") && isNullified(p.event)),
    );
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

  /** The try after a touchdown by `team` (offense or defense); the TD itself is already recorded. */
  const conversion = (team: Team, other: Team) => {
    const marginAfterTd =
      input.score[team.abbr]! + points[team.abbr]! - (input.score[other.abbr]! + points[other.abbr]!);
    record(simulateConversion(rng, team, other, quarter, clock, marginAfterTd), clock);
  };

  for (;;) {
    // Personnel comes first (it shapes the run/pass call); the defense answers what it sees.
    const offenseFormation = chooseOffense(rng, offense, callContext());
    const cc = { ...callContext(), personnel: offenseFormation.personnel, set: offenseFormation.set };
    let call = callPlay(rng, cc);
    if (input.coach === off) {
      const options = callOptions(cc, call);
      const answer = yield {
        kind: "offense",
        team: off,
        opponent: def,
        situation: { ...cc.situation },
        margin: cc.margin,
        clockRunning,
        timeouts: { own: timeouts[off]!, opponent: timeouts[def]! },
        formation: offenseFormation,
        suggestion: call,
        options,
      };
      if (answer) {
        if (!options.includes(answer.call)) throw new Error(`Can't call ${answer.call} here`);
        call = answer.call;
      }
    }
    const scrimmageCall = call === "run" || call === "pass";
    const ctx: PlayContext = {
      offense,
      defense,
      situation: cc.situation,
      homeField,
      ...(scrimmageCall ? { formations: { offense: offenseFormation, defense: chooseDefense(rng, defense, cc, offenseFormation) } } : {}),
    };

    // Pre-snap foul: no play, walk it off, snap again. The clock is left alone.
    if (call !== "kneel" && call !== "spike") {
      const foul = rollPreSnapPenalty(rng, ctx);
      if (foul) {
        record(foul, clock);
        ({ yardline, down, distance } = foul.penalty.result!);
        continue;
      }
    }

    let event = runCall(rng, call, ctx);
    if (event.kind === "run" || event.kind === "pass") event = assessLiveBallPenalty(rng, ctx, event);

    const before = clock;
    const after = clockAfterPlay({ quarter, clock }, event);
    clock = after.clock;
    clockRunning = after.running;
    elapsed += before - clock;
    record(event, clock);

    // --- resolve the play; return if the drive is over ---
    if (event.kind === "field_goal") {
      if (event.made) {
        return finish("field_goal", { kind: "kickoff", kickingTeam: off });
      }
      return finish("missed_field_goal", { kind: "scrimmage", team: def, yardline: event.nextYardline! });
    }

    if (event.kind === "punt") {
      if (event.touchdown) {
        conversion(defense, offense);
        return finish("punt_return_touchdown", { kind: "kickoff", kickingTeam: def });
      }
      if (event.safety) return finish("safety", { kind: "free_kick", kickingTeam: off });
      // A muff or return fumble recovered by the punting team: they keep it, new set of downs.
      const team = event.recoveredByKickingTeam ? off : def;
      return finish("punt", { kind: "scrimmage", team, yardline: event.nextYardline });
    }

    let firstDown = false;
    let downDecided = false;
    if ((event.kind === "run" || event.kind === "pass") && isNullified(event)) {
      // No play: the penalty sets the down, distance and spot.
      ({ yardline, down, distance } = event.penalty!.result!);
      downDecided = true;
    } else if (event.kind === "kneel") {
      yardline += event.yardsGained;
      distance -= event.yardsGained;
    } else if (event.kind === "run" || event.kind === "pass") {
      if (event.turnover) {
        if (event.turnover.touchdown) {
          conversion(defense, offense);
          return finish("defensive_touchdown", { kind: "kickoff", kickingTeam: def });
        }
        return finish("turnover", { kind: "scrimmage", team: def, yardline: event.turnover.endYardline });
      }
      if (event.touchdown) {
        conversion(offense, defense);
        return finish("touchdown", { kind: "kickoff", kickingTeam: off });
      }
      if (event.safety) {
        return finish("safety", { kind: "free_kick", kickingTeam: off });
      }
      yardline = event.endYardline;
      firstDown = event.firstDown;
      distance = firstDown ? Math.min(10, 100 - yardline) : Math.min(distance - event.yardsGained, 100 - yardline);
      // Personal foul after the play: the play counts and the yards are added on.
      if (event.penalty?.accepted) {
        ({ yardline, down, distance } = event.penalty.result!);
        downDecided = true;
      }
    }

    if (downDecided) {
      // already set by a penalty
    } else if (firstDown) {
      down = 1;
    } else if (down === 4) {
      return finish("turnover_on_downs", { kind: "scrimmage", team: def, yardline: 100 - yardline });
    } else {
      down = (down + 1) as Situation["down"];
    }

    // --- between plays: timeout, or the clock runs to the next snap ---
    if (clockRunning) {
      const next = callContext();
      let caller = timeoutCaller(next);
      // A poor clock manager sometimes lets the moment pass.
      const callerTeam = caller === "offense" ? offense : caller === "defense" ? defense : undefined;
      const miss = clockMistakeChance(callerTeam);
      if (caller && miss > 0 && rng.chance(miss)) caller = null;
      if (caller) {
        const team = caller === "offense" ? off : def;
        timeouts[team]! -= 1;
        clockRunning = false;
        record(
          { kind: "timeout", offense: off, defense: def, start: next.situation, duration: 0, team, remaining: timeouts[team]! },
          clock,
        );
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

/** Share of turnovers on a two-point try that are returned all the way. */
export const DEFENSIVE_CONVERSION_RETURN_RATE = 0.25;

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
  if (goForTwo(quarter, marginAfterTd, team.staff?.hc.aggressiveness)) {
    const start: Situation = { quarter, clock, down: 1, distance: 2, yardline: 98 };
    const ctx: PlayContext = { offense: team, defense: other, situation: start };
    const play = rng.chance(0.6) ? simulatePass(rng, ctx) : simulateRun(rng, ctx);
    // A turnover returned the length of the field scores two for the defense. With the
    // offense bunched at the goal line, the field ahead of the defender is often open.
    const defensiveReturn = !!play.turnover && (play.turnover.touchdown || rng.chance(DEFENSIVE_CONVERSION_RETURN_RATE));
    return { ...base, start, method: "two_point", success: play.touchdown, kicker: null, play, defensiveReturn };
  }
  const kicker = kickerOf(team);
  const start: Situation = { quarter, clock, down: 1, distance: 15, yardline: 85 };
  const success = !rng.chance(0.01) && rng.chance(fieldGoalProbability(kicker, 33));
  return { ...base, start, method: "kick", success, kicker: kicker.id, play: null, defensiveReturn: false };
}
