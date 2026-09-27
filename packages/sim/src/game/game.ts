import type { Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import type { PlayEvent } from "../play/events.ts";
import { simulateKickoff } from "../play/kickoff.ts";
import { QUARTER_SECONDS, TIMEOUTS_PER_HALF } from "../drive/clock.ts";
import { simulateConversion, simulateDrive, type DriveResult, type NextPossession } from "../drive/drive.ts";
import { pointsForEvent } from "./scoring.ts";

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
}

/**
 * Simulate a full game. Deterministic: the same teams and seed always
 * produce the same GameResult.
 */
export function simulateGame(home: Team, away: Team, seed: number | string): GameResult {
  const rng = new Rng(seed);
  const teams: Record<string, Team> = { [home.abbr]: home, [away.abbr]: away };
  const other = (abbr: string) => (abbr === home.abbr ? away : home);

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

  const record = (event: PlayEvent, q: number, clockAfter: number) => {
    for (const [team, pts] of Object.entries(pointsForEvent(event))) {
      score[team]! += pts;
      periodScores[team]![q - 1]! += pts;
    }
    plays.push({ seq: plays.length, event, quarter: q, clockAfter, score: { ...score } });
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
      } else if (quarter === 4 && score[home.abbr] === score[away.abbr]) {
        quarter = 5;
        clock = OVERTIME_SECONDS;
        timeouts = { [home.abbr]: OVERTIME_TIMEOUTS, [away.abbr]: OVERTIME_TIMEOUTS };
        periodScores[home.abbr]!.push(0);
        periodScores[away.abbr]!.push(0);
        const receiver = rng.chance(0.5) ? home.abbr : away.abbr;
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
      record(ko, quarter, clock);

      if (ko.touchdown) {
        const conv = simulateConversion(rng, receiving, kicking, quarter, clock, margin(receiving.abbr));
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
    const drive = simulateDrive(rng, {
      offense,
      defense,
      quarter,
      clock,
      yardline: pending.yardline,
      score: { ...score },
      timeouts,
    });
    const from = plays.length;
    for (const p of drive.plays) record(p.event, p.quarter, p.clockAfter);
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
  };
}
