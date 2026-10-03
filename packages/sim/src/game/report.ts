// How a coach's calls went: the game replayed from its calls, each call
// matched to the play it led to, and the plays you called set against the
// ones you left to your coaches.
import type { Team } from "../model/team.ts";
import type { PlayEvent } from "../play/events.ts";
import { isNullified } from "../play/penalties.ts";
import type { CoachCall, SnapPrompt } from "../drive/drive.ts";
import { startCoachedGame, type GameOptions } from "./game.ts";

/** Scrimmage plays on one side of the ball. */
export interface PlayLine {
  plays: number;
  yards: number;
  firstDowns: number;
  touchdowns: number;
  turnovers: number;
}

export interface CoachingReport {
  team: string;
  /** Calls put to you, and how many you changed from the coaches' suggestion. */
  calls: number;
  changed: number;
  /** Your offense on the snaps you called differently, and on the ones you left to the coaches. */
  offense: { mine: PlayLine; coaches: PlayLine };
  /** The opponent's offense against the defenses you changed, and against the coordinator's. */
  defense: { mine: PlayLine; coaches: PlayLine };
  /** Fourth downs you went for when the coaches would have kicked or punted. */
  fourthDowns: { tried: number; converted: number };
  /** Two-point tries you called against the head coach's chart (and the ones he'd have called that you kicked). */
  tries: { twoPoint: number; made: number; kickedInstead: number };
  /** Timeouts you called. */
  timeouts: number;
}

const emptyLine = (): PlayLine => ({ plays: 0, yards: 0, firstDowns: 0, touchdowns: 0, turnovers: 0 });

function addPlay(line: PlayLine, e: PlayEvent) {
  if ((e.kind !== "run" && e.kind !== "pass") || isNullified(e)) return;
  line.plays++;
  line.yards += e.yardsGained;
  if (e.firstDown) line.firstDowns++;
  if (e.touchdown) line.touchdowns++;
  if (e.turnover) line.turnovers++;
}

/** Did the answer differ from what the coaches would have done? */
export function changedCall(p: SnapPrompt, a: CoachCall | null): boolean {
  if (!a) return false;
  switch (p.kind) {
    case "offense":
      return "call" in a && (a.call !== p.suggestion || (a.personnel ?? p.formation.personnel) !== p.formation.personnel || (a.set ?? p.formation.set) !== p.formation.set);
    case "defense": {
      const d = a as { package?: string; coverage?: string; blitz?: number };
      return (d.package ?? p.formation.package) !== p.formation.package || (d.coverage ?? p.formation.coverage) !== p.formation.coverage || (d.blitz ?? p.formation.blitzers.length) !== p.formation.blitzers.length;
    }
    case "timeout":
      return "timeout" in a && a.timeout !== p.suggestion;
    case "try":
      return "try" in a && a.try !== p.suggestion;
  }
}

/** Replay a coached game from its calls and report how the calls went. */
export function coachingReport(home: Team, away: Team, seed: number | string, team: string, calls: ReadonlyArray<CoachCall | null>, options: Omit<GameOptions, "coach" | "calls"> = {}): CoachingReport {
  const game = startCoachedGame(home, away, seed, team, options);
  const r: CoachingReport = {
    team,
    calls: 0,
    changed: 0,
    offense: { mine: emptyLine(), coaches: emptyLine() },
    defense: { mine: emptyLine(), coaches: emptyLine() },
    fourthDowns: { tried: 0, converted: 0 },
    tries: { twoPoint: 0, made: 0, kickedInstead: 0 },
    timeouts: 0,
  };
  for (const a of calls) {
    const p = game.prompt;
    if (!p) break;
    const before = p.sofar.plays.length;
    game.answer(a ?? undefined);
    const after = game.sofar.plays.slice(before).map((x) => x.event);
    const changed = changedCall(p, a);
    r.calls++;
    if (changed) r.changed++;
    if (p.kind === "offense") {
      const e = after.find((x) => x.offense === team && x.kind !== "penalty" && x.kind !== "timeout");
      if (!e) continue;
      addPlay(changed ? r.offense.mine : r.offense.coaches, e);
      if (changed && p.situation.down === 4 && (p.suggestion === "punt" || p.suggestion === "field_goal") && (e.kind === "run" || e.kind === "pass")) {
        r.fourthDowns.tried++;
        if (e.firstDown || e.touchdown) r.fourthDowns.converted++;
      }
    } else if (p.kind === "defense") {
      const e = after.find((x) => (x.kind === "run" || x.kind === "pass") && x.offense !== team);
      if (e) addPlay(changed ? r.defense.mine : r.defense.coaches, e);
    } else if (p.kind === "timeout") {
      // Only the ones you called yourself (not ones left to the head coach).
      if (a && "timeout" in a && a.timeout && after.some((x) => x.kind === "timeout" && x.team === team)) r.timeouts++;
    } else {
      const e = after.find((x) => x.kind === "conversion" && x.team === team);
      if (!changed || !e || e.kind !== "conversion") continue;
      if (e.method === "two_point") {
        r.tries.twoPoint++;
        if (e.success) r.tries.made++;
      } else r.tries.kickedInstead++;
    }
  }
  return r;
}
