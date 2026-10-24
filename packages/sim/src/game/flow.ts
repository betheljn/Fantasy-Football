// The flow of a game (rules 9): halftime adjustments and momentum.
//
// Halftime: each side leans its second half against what it expects the
// other to do. On defense, a focus on stopping the run or the pass; on
// offense, a focus on attacking man coverage or zone. A focus helps against
// the calls it's aimed at and costs against the rest, measured from what's
// typical: it only pays if they really do lean that way (that's the gamble).
// What predicts a second half is mostly the score (a team behind throws, a
// team ahead runs) and a defense's coverage habits; the coaches read both. A
// person picks their own. A halftime adjuster head coach gets more out of it.
//
// Momentum: a big play (a long gain, a touchdown, a takeaway, a stop on third
// or fourth down) swings the next few snaps a little toward the side that made
// it, fading quickly. Deterministic: nothing here draws a random number.
import type { Team } from "../model/team.ts";
import { DEFENSE_CONCEPT_INFO, DEFENSE_CONCEPTS, OFFENSE_CONCEPT_INFO, OFFENSE_CONCEPTS, type DefenseConcept, type OffenseConcept } from "../play/concepts.ts";
import type { PlayEvent } from "../play/events.ts";
import { DUEL_BUCKETS, type DuelBook } from "../drive/duelcall.ts";

export type DefenseFocus = "run" | "pass" | "balanced";
export type OffenseFocus = "man" | "zone" | "balanced";

/** A side's halftime plan. */
export interface HalftimePlan {
  defense: DefenseFocus;
  offense: OffenseFocus;
}

export const FLOW = {
  /** A focus's edge against what it's aimed at (its cost against the rest balances out at the typical mix). */
  focus: 0.25,
  /** How often a second half's plays are runs, and a defense plays man, typically. */
  typicalRun: 0.42,
  typicalMan: 0.45,
  /** A halftime adjuster's head coach makes it count this much more. */
  adjuster: 1.5,
  /** The coaches expect a team behind by this much (at the half) to throw more, and one ahead to run more. */
  scriptMargin: 8,
  scriptShift: 0.07,
  /** How much of a defense's first-half man/zone habit the coaches expect to carry on. */
  manCarry: 0.5,
  /** The coaches focus once they expect the mix to be this far from typical. */
  lean: 0.05,
  /** Momentum: a big play's edge for the side that made it, and how much is left after each snap. */
  momentum: 0.08,
  fade: 0.6,
  /** A gain this long is a big play. */
  bigGain: 25,
} as const;

const IS_MAN = (c: DefenseConcept) => DEFENSE_CONCEPT_INFO[c].coverage === "cover_0" || DEFENSE_CONCEPT_INFO[c].coverage === "cover_1";
const IS_RUN = (c: OffenseConcept) => OFFENSE_CONCEPT_INFO[c].kind === "run";

/** What a side saw of the other in the first half: how often their offense ran, and their defense played man. */
export interface HalfFilm {
  /** The other offense's calls, and the share that were runs (null: none on film). */
  offenseCalls: number;
  runShare: number | null;
  /** The other defense's calls, and the share that were man coverage. */
  defenseCalls: number;
  manShare: number | null;
}

/** The first half's film on `opponent`, from the game's duel book. */
export function halfFilm(book: DuelBook | undefined, opponent: string): HalfFilm {
  let off = 0;
  let runs = 0;
  let def = 0;
  let man = 0;
  for (const b of DUEL_BUCKETS) {
    const o = book?.offense[opponent]?.[b];
    if (o) o.forEach((n, i) => ((off += n), IS_RUN(OFFENSE_CONCEPTS[i]!) && (runs += n)));
    const d = book?.defense[opponent]?.[b];
    if (d) d.forEach((n, i) => ((def += n), IS_MAN(DEFENSE_CONCEPTS[i]!) && (man += n)));
  }
  return { offenseCalls: off, runShare: off ? runs / off : null, defenseCalls: def, manShare: def ? man / def : null };
}

/** What the coaches expect of the other side's second half: how often they'll run, and play man. */
export function expectSecondHalf(film: HalfFilm, theirMargin: number): { run: number; man: number } {
  // The score at the half says more about a second half's run/pass mix than the first half did.
  const script = theirMargin <= -FLOW.scriptMargin ? -FLOW.scriptShift : theirMargin >= FLOW.scriptMargin ? FLOW.scriptShift : 0;
  const run = FLOW.typicalRun + script;
  const man = film.manShare === null ? FLOW.typicalMan : FLOW.typicalMan + FLOW.manCarry * (film.manShare - FLOW.typicalMan);
  return { run, man };
}

/** The coaches' halftime plan (what the AI does, and what a person is offered first). `theirMargin`: the other side's lead at the half. */
export function aiHalftime(film: HalfFilm, theirMargin = 0): HalftimePlan {
  const x = expectSecondHalf(film, theirMargin);
  return {
    defense: x.run >= FLOW.typicalRun + FLOW.lean ? "run" : x.run <= FLOW.typicalRun - FLOW.lean ? "pass" : "balanced",
    offense: x.man >= FLOW.typicalMan + FLOW.lean ? "man" : x.man <= FLOW.typicalMan - FLOW.lean ? "zone" : "balanced",
  };
}

/** A focus's edge on a snap: +focus when it's aimed right, and a cost when not that's even at the typical mix. */
function focusEdge(hit: boolean, typicalShare: number): number {
  return hit ? FLOW.focus : -FLOW.focus * (typicalShare / (1 - typicalShare));
}

const adjuster = (team: Team) => (team.staff?.hc.abilities?.includes("halftime_adjuster") ? FLOW.adjuster : 1);

/** The game's flow: the halftime plans (once made) and each side's momentum. */
export class GameFlow {
  private readonly plans = new Map<string, HalftimePlan>();
  private readonly momentum = new Map<string, number>();

  setPlan(team: string, plan: HalftimePlan): void {
    this.plans.set(team, plan);
  }

  planOf(team: string): HalftimePlan | undefined {
    return this.plans.get(team);
  }

  /** The offense's edge on this snap from the halftime plans and momentum (negative helps the defense). */
  swing(offense: Team, defense: Team, off: OffenseConcept | undefined, def: DefenseConcept | undefined): number {
    let e = 0;
    const op = this.plans.get(offense.abbr);
    if (op && def && op.offense !== "balanced") {
      const typical = op.offense === "man" ? FLOW.typicalMan : 1 - FLOW.typicalMan;
      e += focusEdge(IS_MAN(def) === (op.offense === "man"), typical) * adjuster(offense);
    }
    const dp = this.plans.get(defense.abbr);
    if (dp && off && dp.defense !== "balanced") {
      const typical = dp.defense === "run" ? FLOW.typicalRun : 1 - FLOW.typicalRun;
      e -= focusEdge(IS_RUN(off) === (dp.defense === "run"), typical) * adjuster(defense);
    }
    e += FLOW.momentum * ((this.momentum.get(offense.abbr) ?? 0) - (this.momentum.get(defense.abbr) ?? 0));
    return e;
  }

  /** A play happened: momentum fades a snap, and a big play hands it to whoever made it. */
  play(e: PlayEvent): void {
    for (const [t, m] of this.momentum) this.momentum.set(t, m * FLOW.fade);
    const swingTo = bigPlay(e);
    if (swingTo) this.momentum.set(swingTo, 1);
  }
}

/** Who a play swings momentum to, if anyone. */
export function bigPlay(e: PlayEvent): string | null {
  if (e.kind !== "run" && e.kind !== "pass") {
    if ((e.kind === "kickoff" || e.kind === "punt") && e.touchdown) return e.defense;
    return null;
  }
  if (e.turnover) return e.defense;
  if (e.touchdown) return e.offense;
  if (e.yardsGained >= FLOW.bigGain) return e.offense;
  // A stop on third or fourth down (no first down, no penalty bailing them out).
  if (e.start.down >= 3 && !e.firstDown && !e.penalty) return e.defense;
  return null;
}
