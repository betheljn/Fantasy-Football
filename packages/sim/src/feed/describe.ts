// Turns structured play events into play-by-play text. The sim never produces
// text itself; this is one consumer of the event data (the renderer is another).
import { displayName, type Player, type PlayerId } from "../model/player.ts";
import type { KickoffEvent, PlayEvent, PuntEvent, ScrimmagePlayEvent, Situation } from "../play/events.ts";

export type PlayerLookup = (id: PlayerId) => Player;

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "IN 25" / "WV 40" / "50" — field position named by the side of the field. */
export function formatSpot(yardline: number, offense: string, defense: string): string {
  if (yardline === 50) return "50";
  return yardline < 50 ? `${offense} ${yardline}` : `${defense} ${100 - yardline}`;
}

/** "3rd & 7 at WV 42" / "1st & Goal at IN 4". */
export function formatDownDistance(sit: Situation, offense: string, defense: string): string {
  const toGo = sit.distance >= 100 - sit.yardline ? "Goal" : String(sit.distance);
  return `${ORDINAL[sit.down]} & ${toGo} at ${formatSpot(sit.yardline, offense, defense)}`;
}

export function formatSituation(sit: Situation, offense: string, defense: string): string {
  return `Q${sit.quarter} ${formatClock(sit.clock)} ${formatDownDistance(sit, offense, defense)}`;
}

function yardsText(y: number): string {
  if (y === 0) return "no gain";
  if (y < 0) return `a loss of ${-y}`;
  return `${y} yard${y === 1 ? "" : "s"}`;
}

export function describePlay(e: PlayEvent, who: PlayerLookup): string {
  const n = (id: PlayerId | null) => (id ? displayName(who(id)) : "?");
  switch (e.kind) {
    case "field_goal":
      return `${n(e.kicker)} ${e.distance}-yard field goal ${e.made ? "is GOOD" : e.blocked ? "is BLOCKED" : "is NO GOOD"}.`;
    case "punt": {
      if (e.blocked) {
        const b = `${n(e.punter)} punt BLOCKED by ${n(e.blockedBy)}`;
        if (e.safety) return `${b}, covered in the end zone by ${e.offense}, SAFETY (${e.defense}).`;
        if (e.touchdown) return `${b}, recovered by ${e.defense}${e.returnYards > 0 ? ` and returned ${e.returnYards} yards` : " in the end zone"}, TOUCHDOWN ${e.defense}.`;
        return `${b}, recovered by ${e.defense}${e.returnYards > 0 ? ` and returned ${e.returnYards} yards` : ""}.`;
      }
      const lands = `${n(e.punter)} punts ${e.grossYards} yards`;
      if (e.touchback) return `${lands}, touchback.`;
      if (e.muffed) return `${lands}, MUFFED by ${n(e.returner)}, recovered by ${e.recoveredByKickingTeam ? e.offense : e.defense}.`;
      if (e.fairCatch) return `${lands}, fair catch by ${n(e.returner)}.`;
      return `${lands}, ${returnText(e, n)}.`;
    }
    case "kickoff": {
      const kick = `${n(e.kicker)} ${e.onside ? "onside kick" : e.freeKick ? "free kick" : "kicks off"}`;
      if (e.onside) return `${kick}, recovered by ${e.recoveredByKickingTeam ? e.offense : e.defense}.`;
      if (e.touchback) return `${kick}, touchback.`;
      return `${kick}, ${returnText(e, n)}.`;
    }
    case "kneel":
      return `${n(e.qb)} kneels.`;
    case "spike":
      return `${n(e.qb)} spikes the ball to stop the clock.`;
    case "timeout":
      return `Timeout ${e.team} (${e.remaining} left).`;
    case "conversion":
      if (e.method === "kick") return `${n(e.kicker)} extra point ${e.success ? "is GOOD" : "is NO GOOD"}.`;
      return (
        `Two-point try: ${describeScrimmage(e.play!, who).replace(/, TOUCHDOWN \w+/, "").replace(/\.$/, "")} — ` +
        (e.success ? "GOOD." : e.defensiveReturn ? `FAILS, returned for a DEFENSIVE TWO-POINT CONVERSION (${e.defense}).` : "FAILS.")
      );
    default:
      return describeScrimmage(e, who);
  }
}

function describeScrimmage(e: ScrimmagePlayEvent, who: PlayerLookup): string {
  const n = (id: PlayerId | null) => (id ? displayName(who(id)) : "?");
  const parts: string[] = [];

  if (e.kind === "run") {
    parts.push(`${n(e.rusher)} runs ${e.direction} for ${yardsText(e.yardsGained)}`);
  } else {
    switch (e.outcome) {
      case "sack":
        parts.push(`${n(e.passer)} sacked by ${n(e.sackedBy)} for ${yardsText(e.yardsGained)}`);
        break;
      case "incomplete": {
        const why =
          e.incompleteReason === "dropped" ? "dropped" : e.incompleteReason === "defended" ? `broken up by ${n(e.coverage)}` : "overthrown";
        parts.push(`${n(e.passer)} pass ${deep(e.airYards)} ${e.direction} to ${n(e.target)} incomplete, ${why}`);
        if (e.pressured) parts.push("under pressure");
        break;
      }
      case "interception":
        parts.push(`${n(e.passer)} pass ${deep(e.airYards)} ${e.direction} intended for ${n(e.target)} INTERCEPTED`);
        break;
      case "complete":
        parts.push(
          `${n(e.passer)} pass ${deep(e.airYards)} ${e.direction} to ${n(e.target)} for ${yardsText(e.yardsGained)}` +
            (e.yardsAfterCatch > 0 && !e.touchdown ? ` (${e.yardsAfterCatch} after catch)` : ""),
        );
        break;
    }
  }

  if (e.tackler && !e.touchdown && !(e.kind === "pass" && e.outcome === "sack")) {
    parts.push(e.outOfBounds ? `pushed out of bounds by ${n(e.tackler)}` : `tackled by ${n(e.tackler)}`);
  } else if (e.outOfBounds) {
    parts.push("out of bounds");
  }
  if (e.fumble) {
    parts.push(
      `FUMBLE by ${n(e.fumble.by)}${e.fumble.forcedBy ? ` (forced by ${n(e.fumble.forcedBy)})` : ""}, ` +
        (e.fumble.lost ? `recovered by ${n(e.fumble.recoveredBy)} (${e.defense})` : `recovered by ${e.offense}`),
    );
  }
  if (e.turnover) {
    const t = e.turnover;
    if (e.turnover.type === "interception") parts.push(`picked off by ${n(t.by)}`);
    if (t.touchback) parts.push("touchback");
    else if (t.returnYards > 0) parts.push(`returned ${t.returnYards} yards`);
    if (t.touchdown) parts.push(`TOUCHDOWN ${e.defense}`);
  }
  if (e.touchdown) parts.push(`TOUCHDOWN ${e.offense}`);
  if (e.safety) parts.push(`SAFETY (${e.defense})`);
  if (e.firstDown) parts.push("FIRST DOWN");

  return parts.join(", ") + ".";
}

function deep(air: number): string {
  return air >= 20 ? "deep" : air <= 0 ? "behind the line" : "short";
}

/** "returned 12 yards by X, tackled by Y, FUMBLE ..." for punt and kickoff returns. */
function returnText(e: PuntEvent | KickoffEvent, n: (id: PlayerId | null) => string): string {
  let t = `returned ${e.returnYards} yards by ${n(e.returner)}`;
  if (e.touchdown) return `${t}, TOUCHDOWN ${e.defense}`;
  if (e.tackler) t += `, tackled by ${n(e.tackler)}`;
  if (e.fumble) {
    t += `, FUMBLE by ${n(e.fumble.by)}, recovered by ${n(e.fumble.recoveredBy)} (${e.fumble.lost ? e.offense : e.defense})`;
  }
  return t;
}
