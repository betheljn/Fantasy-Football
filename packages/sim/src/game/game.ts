import { InjuryTracker, type Injury } from "./injuries.ts";
import type { Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import type { PlayEvent } from "../play/events.ts";
import { simulateKickoff } from "../play/kickoff.ts";
import { QUARTER_SECONDS, TIMEOUTS_PER_HALF } from "../drive/clock.ts";
import { checkAnswer, driveSteps, simulateConversion, tryAnswer, tryPrompt, type CoachCall, type DriveResult, type NextPossession, type SnapPrompt } from "../drive/drive.ts";
import { pointsForEvent } from "../play/scoring.ts";

export const OVERTIME_SECONDS = 10 * 60;
export const OVERTIME_TIMEOUTS = 2;

/** One entry in the game's event log, in order. */
export interface GamePlay {
  seq: number;
  event: PlayEvent;
  /** Quarter the play happened in (5+ = overtime) and game clock after it. */
  quarter: number;
  clockAfter: number;
  /** Score after the play, keyed by team abbr. */
  score: Record<string, number>;
  /** Players hurt on the play. */
  injuries?: Injury[];
}

/** A drive without its plays; `plays` indexes into GameResult.plays. */
export type DriveSummary = Omit<DriveResult, "plays"> & { plays: { from: number; to: number } };

export interface GameResult {
  seed: string;
  home: string;
  away: string;
  /** Team that received the opening kickoff. */
  openingReceiver: string;
  plays: GamePlay[];
  drives: DriveSummary[];
  score: Record<string, number>;
  /** Points per period (index 0 = Q1; index 4+ = overtime). */
  periodScores: Record<string, number[]>;
  overtime: boolean;
  /** Null on a tie. */
  winner: string | null;
  /** Period and game clock when the game ended (clock > 0 only for an overtime score). */
  final: { quarter: number; clock: number };
  /** Everyone hurt in the game, in order. */
  injuries: Injury[];
  /** A coached game: the team a person coached and every answer, in order (null = took the coaches' call). */
  coached?: { team: string; calls: Array<CoachCall | null> };
}

export interface GameOptions {
  /** No home-field advantage (e.g. a championship at a neutral venue). */
  neutralSite?: boolean;
  /** Playoff rules: no ties; a tied overtime continues into another period. */
  playoff?: boolean;
  /** A team whose calls a person makes (see gameSteps). */
  coach?: string;
  /** The coached team's answers, in order, to replay a coached game (missing ones take the coaches' call). */
  calls?: ReadonlyArray<CoachCall | null>;
}

/**
 * Simulate a full game. Deterministic: the same teams and seed always
 * produce the same GameResult (and, for a coached game, the same calls).
 */
export function simulateGame(home: Team, away: Team, seed: number | string, options: GameOptions = {}): GameResult {
  const steps = gameSteps(home, away, seed, options);
  let i = 0;
  let r = steps.next();
  while (!r.done) r = steps.next(options.calls?.[i++] ?? undefined);
  return r.value;
}

/** A pause in a coached game: the snap, and which of the game's drives it's in. */
export type GamePrompt = SnapPrompt & { drive: number };

/** A coached game in progress: the call it's waiting on, or the finished result. */
export interface CoachedGame {
  /** The snap waiting on a call (null once the game is over). */
  prompt: GamePrompt | null;
  result: GameResult | null;
  /** Answers so far (null = took the coaches' call): with the seed, everything needed to pick the game up again. */
  calls: Array<CoachCall | null>;
  /** Answer the waiting prompt (nothing = take the coaches' call). */
  answer(call?: CoachCall): void;
  /** Hand the rest of this drive to the offensive coordinator: his calls until the next drive (or the end). */
  autoDrive(): void;
}

/** Start (or pick up, given the answers so far) a game that `coach` calls. */
export function startCoachedGame(home: Team, away: Team, seed: number | string, coach: string, options: Omit<GameOptions, "coach" | "calls"> = {}, calls: ReadonlyArray<CoachCall | null> = []): CoachedGame {
  const steps = gameSteps(home, away, seed, { ...options, coach });
  const game: CoachedGame = {
    prompt: null,
    result: null,
    calls: [],
    answer(call) {
      if (!game.prompt) throw new Error("The game is over");
      // A bad answer is turned away before it reaches the game, which carries on waiting.
      checkAnswer(game.prompt, call);
      game.calls.push(call ?? null);
      advance(steps.next(call));
    },
    autoDrive() {
      const drive = game.prompt?.drive;
      while (game.prompt && game.prompt.drive === drive) game.answer();
    },
  };
  const advance = (r: IteratorResult<GamePrompt, GameResult>) => {
    game.prompt = r.done ? null : r.value;
    game.result = r.done ? r.value : null;
  };
  advance(steps.next());
  for (const c of calls) {
    if (!game.prompt) break;
    game.answer(c ?? undefined);
  }
  return game;
}

/**
 * A game, pausing before each snap of the coached team on offense
 * (options.coach) for a call. With nobody coached it never pauses.
 */
export function* gameSteps(home: Team, away: Team, seed: number | string, options: GameOptions = {}): Generator<GamePrompt, GameResult, CoachCall | undefined> {

  const rng = new Rng(seed);
  const answers: Array<CoachCall | null> = [];
  const injuries = new InjuryTracker(String(seed), { [home.abbr]: home, [away.abbr]: away });
  // The teams as they stand now (injured players leave the field).
  const teams = injuries.teams;
  const other = (abbr: string) => teams[abbr === home.abbr ? away.abbr : home.abbr]!;

  const score: Record<string, number> = { [home.abbr]: 0, [away.abbr]: 0 };
  const periodScores: Record<string, number[]> = { [home.abbr]: [0, 0, 0, 0], [away.abbr]: [0, 0, 0, 0] };
  let timeouts: Record<string, number> = { [home.abbr]: TIMEOUTS_PER_HALF, [away.abbr]: TIMEOUTS_PER_HALF };
  const plays: GamePlay[] = [];
  const drives: DriveSummary[] = [];

  let quarter = 1;
  let clock = QUARTER_SECONDS;
  const openingReceiver = rng.chance(0.5) ? home.abbr : away.abbr;
  let pending: NextPossession = { kind: "kickoff", kickingTeam: other(openingReceiver).abbr };
  const otPossessed = new Set<string>();

  const record = (event: PlayEvent, q: number, clockAfter: number, hurt?: Injury[]) => {
    for (const [team, pts] of Object.entries(pointsForEvent(event))) {
      score[team]! += pts;
      periodScores[team]![q - 1]! += pts;
    }
    plays.push({ seq: plays.length, event, quarter: q, clockAfter, score: { ...score }, ...(hurt && hurt.length > 0 ? { injuries: hurt } : {}) });
  };

  const margin = (team: string) => score[team]! - score[other(team).abbr]!;

  /**
   * Overtime ends once someone leads and the trailing team has already had
   * its possession.
   */
  const overtimeDecided = () => {
    if (quarter < 5 || score[home.abbr] === score[away.abbr]) return false;
    const trailing = score[home.abbr]! < score[away.abbr]! ? home.abbr : away.abbr;
    return otPossessed.has(trailing);
  };

  for (;;) {
    // --- end of a period ---
    if (clock === 0) {
      if (quarter === 1 || quarter === 3) {
        quarter++;
        clock = QUARTER_SECONDS;
      } else if (quarter === 2) {
        // Halftime: timeouts reset, the opening kicker receives.
        quarter = 3;
        clock = QUARTER_SECONDS;
        timeouts = { [home.abbr]: TIMEOUTS_PER_HALF, [away.abbr]: TIMEOUTS_PER_HALF };
        pending = { kind: "kickoff", kickingTeam: openingReceiver };
      } else if (score[home.abbr] === score[away.abbr] && (quarter === 4 || (quarter >= 5 && options.playoff))) {
        // Overtime; in the playoffs, another period after a tied one.
        const firstPeriod = quarter === 4;
        quarter++;
        clock = OVERTIME_SECONDS;
        timeouts = { [home.abbr]: OVERTIME_TIMEOUTS, [away.abbr]: OVERTIME_TIMEOUTS };
        periodScores[home.abbr]!.push(0);
        periodScores[away.abbr]!.push(0);
        // A team still owed its overtime possession receives; otherwise a coin toss.
        const owed = [home.abbr, away.abbr].filter((t) => !otPossessed.has(t));
        const receiver = !firstPeriod && owed.length === 1 ? owed[0]! : rng.chance(0.5) ? home.abbr : away.abbr;
        pending = { kind: "kickoff", kickingTeam: other(receiver).abbr };
      } else {
        break; // end of regulation with a winner, or end of overtime
      }
    }

    // --- kickoffs and free kicks ---
    if (pending.kind === "kickoff" || pending.kind === "free_kick") {
      const kicking: Team = teams[pending.kickingTeam]!;
      const receiving = other(kicking.abbr);
      const lateDeficit = -margin(kicking.abbr);
      const onside =
        pending.kind === "kickoff" &&
        quarter >= 4 &&
        lateDeficit > 0 &&
        (clock <= 150 || (clock <= 300 && lateDeficit > 8));
      const ko = simulateKickoff(rng, { kicking, receiving, quarter, clock, onside, freeKick: pending.kind === "free_kick" });
      clock = Math.max(0, clock - ko.duration);
      record(ko, quarter, clock, injuries.check(ko));

      if (ko.touchdown) {
        let two: boolean | undefined;
        if (options.coach === receiving.abbr) {
          const answer = yield { ...tryPrompt(receiving, kicking.abbr, quarter, clock, margin(receiving.abbr), timeouts), drive: drives.length };
          answers.push(answer ?? null);
          two = tryAnswer(answer);
        }
        const conv = simulateConversion(rng, receiving, kicking, quarter, clock, margin(receiving.abbr), two);
        record(conv, quarter, clock);
        pending = { kind: "kickoff", kickingTeam: receiving.abbr };
        if (quarter >= 5) otPossessed.add(receiving.abbr); // a return TD counts as a possession
      } else if (ko.recoveredByKickingTeam) {
        pending = { kind: "scrimmage", team: kicking.abbr, yardline: ko.nextYardline };
      } else {
        pending = { kind: "scrimmage", team: receiving.abbr, yardline: ko.nextYardline };
      }
      if (overtimeDecided()) break;
      continue;
    }

    if (pending.kind === "none") {
      clock = 0; // the drive ran out the half/game
      continue;
    }

    // --- a possession ---
    const offense = teams[pending.team]!;
    const defense = other(offense.abbr);
    if (quarter >= 5) otPossessed.add(offense.abbr);
    const steps = driveSteps(rng, {
      offense,
      defense,
      quarter,
      clock,
      yardline: pending.yardline,
      score: { ...score },
      timeouts,
      ...(options.neutralSite ? {} : { homeTeam: home.abbr }),
      injuries,
      ...(options.coach ? { coach: options.coach } : {}),
    });
    let step = steps.next();
    while (!step.done) {
      const answer = yield { ...step.value, drive: drives.length };
      answers.push(answer ?? null);
      step = steps.next(answer);
    }
    const drive = step.value;
    const from = plays.length;
    for (const p of drive.plays) record(p.event, p.quarter, p.clockAfter, p.injuries);
    const { plays: _drivePlays, ...summary } = drive;
    drives.push({ ...summary, plays: { from, to: plays.length } });

    timeouts = drive.timeouts;
    quarter = drive.end.quarter;
    clock = drive.end.clock;
    pending = drive.next;
    if (overtimeDecided()) break;
  }

  const diff = score[home.abbr]! - score[away.abbr]!;
  return {
    seed: String(seed),
    home: home.abbr,
    away: away.abbr,
    openingReceiver,
    plays,
    drives,
    score,
    periodScores,
    overtime: quarter >= 5,
    winner: diff === 0 ? null : diff > 0 ? home.abbr : away.abbr,
    final: { quarter, clock },
    injuries: injuries.all,
    ...(options.coach ? { coached: { team: options.coach, calls: answers } } : {}),
  };
}
