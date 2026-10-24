// Film study (the owner's analytics upgrade): what the other side is likely
// to call here, and what it has called. Tier 1 is the scouting report (their
// playbook's leanings in this kind of situation); tier 2 adds this game's
// film (their calls so far in the same kind of situation); tier 3 adds the
// self-scout (your own calls there, which their coaches are reading too).
// Built from the plays so far (every snap carries its calls), so it shows only
// what's already happened on the field.
import { DEFENSE_CONCEPT_INFO, DEFENSE_CONCEPTS, OFFENSE_CONCEPT_INFO, OFFENSE_CONCEPTS, type DefenseConcept, type OffenseConcept } from "./concepts.ts";
import { defensePlaybook, duelBucket, offensePlaybook, type DuelBucket } from "../drive/duelcall.ts";
import type { PlayEvent, Situation } from "./events.ts";
import type { OffenseSet, Personnel } from "./formation.ts";
import type { Team } from "../model/team.ts";

export interface FilmShare {
  concept: OffenseConcept | DefenseConcept;
  label: string;
  /** 0-1. */
  share: number;
}

export interface FilmReport {
  bucket: DuelBucket;
  /** "Early downs", "3rd and long"... */
  situation: string;
  /** Tier 1: their playbook's leanings here (most likely first). */
  playbook: FilmShare[];
  /** Tier 2: their calls in this kind of situation this game (most first), and how many snaps that is. */
  film?: { snaps: number; calls: FilmShare[] };
  /** Tier 3: your own calls here this game, as they've seen them. */
  self?: { snaps: number; calls: FilmShare[] };
}

export const BUCKET_NAMES: Record<DuelBucket, string> = {
  early: "Early downs",
  short: "Short yardage",
  medium: "3rd and medium",
  long: "Long yardage",
  goal: "Red zone",
};

const shares = (concepts: ReadonlyArray<OffenseConcept | DefenseConcept>, weights: readonly number[], label: (c: never) => string): FilmShare[] => {
  const total = weights.reduce((t, w) => t + w, 0) || 1;
  return concepts
    .map((c, i) => ({ concept: c, label: label(c as never), share: weights[i]! / total }))
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share);
};
const offLabel = (c: OffenseConcept) => OFFENSE_CONCEPT_INFO[c].label;
const defLabel = (c: DefenseConcept) => DEFENSE_CONCEPT_INFO[c].label;

/** What `you` see of the other side before this snap, with `tier` levels of analytics (0: nothing). */
export function filmStudy(
  tier: number,
  you: Team,
  them: Team,
  /** You're on offense (they're calling a defense) or on defense (they're calling a play). */
  side: "offense" | "defense",
  situation: Situation,
  look: { personnel: Personnel; set: OffenseSet },
  /** The game's plays so far. */
  plays: ReadonlyArray<{ event: PlayEvent }>,
): FilmReport | null {
  if (tier <= 0) return null;
  const bucket = duelBucket(situation);
  const playbook =
    side === "offense"
      ? shares(DEFENSE_CONCEPTS, defensePlaybook(them, situation, look.personnel, false), defLabel)
      : // Their play: their run and pass playbooks, half and half (the formation leans it either way in the read).
        shares(OFFENSE_CONCEPTS, offensePlaybook(them, situation, "run", look.set).map((r, i) => (r + offensePlaybook(them, situation, "pass", look.set)[i]!) / 2), offLabel);
  const report: FilmReport = { bucket, situation: BUCKET_NAMES[bucket], playbook };
  if (tier < 2) return report;
  // This game's snaps in the same kind of situation.
  const theirs = side === "offense" ? DEFENSE_CONCEPTS.map(() => 0) : OFFENSE_CONCEPTS.map(() => 0);
  const mine = side === "offense" ? OFFENSE_CONCEPTS.map(() => 0) : DEFENSE_CONCEPTS.map(() => 0);
  let n = 0;
  for (const { event: e } of plays) {
    if ((e.kind !== "run" && e.kind !== "pass") || !e.calls || duelBucket(e.start) !== bucket) continue;
    // The same matchup as now: you on this side of the ball, them on the other.
    if ((side === "offense" ? e.offense : e.defense) !== you.abbr) continue;
    n++;
    if (side === "offense") {
      theirs[DEFENSE_CONCEPTS.indexOf(e.calls.defense)]!++;
      mine[OFFENSE_CONCEPTS.indexOf(e.calls.offense)]!++;
    } else {
      theirs[OFFENSE_CONCEPTS.indexOf(e.calls.offense)]!++;
      mine[DEFENSE_CONCEPTS.indexOf(e.calls.defense)]!++;
    }
  }
  report.film = { snaps: n, calls: side === "offense" ? shares(DEFENSE_CONCEPTS, theirs, defLabel) : shares(OFFENSE_CONCEPTS, theirs, offLabel) };
  if (tier >= 3) report.self = { snaps: n, calls: side === "offense" ? shares(OFFENSE_CONCEPTS, mine, offLabel) : shares(DEFENSE_CONCEPTS, mine, defLabel) };
  return report;
}
