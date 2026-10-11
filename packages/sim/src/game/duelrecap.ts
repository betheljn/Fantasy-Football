// The play duel after the fact: each snap's calls revealed (who won the call
// and why), and a game's recap for one team: calls won and lost on each side
// of the ball, how the plays went when the call was won or lost, which
// concepts worked, and whether the other side caught on to its favourites.
import type { PlayEvent, ScrimmagePlayEvent, Situation } from "../play/events.ts";
import { isNullified } from "../play/penalties.ts";
import {
  conceptMatchup,
  DEFENSE_CONCEPT_INFO,
  DEFENSE_CONCEPTS,
  OFFENSE_CONCEPT_INFO,
  OFFENSE_CONCEPTS,
  type DefenseConcept,
  type OffenseConcept,
} from "../play/concepts.ts";
import type { GameResult } from "./game.ts";

export type CallWinner = "offense" | "defense" | "even";

/** One snap's calls, shown after the play. */
export interface CallReveal {
  offense: OffenseConcept;
  defense: DefenseConcept;
  /** The offense's edge from the matchup, -2 to +2. */
  edge: number;
  winner: CallWinner;
  why: string | null;
  /** E.g. "Inside run vs Run blitz: the defense won the call. The run blitz shot the gap the run was going to." */
  text: string;
}

/** The calls on a run or pass (rules 4 and later), revealed; null for anything else. */
export function revealCall(e: PlayEvent): CallReveal | null {
  if ((e.kind !== "run" && e.kind !== "pass") || !e.calls) return null;
  const { offense, defense } = e.calls;
  const { edge, why } = conceptMatchup(offense, defense);
  const winner: CallWinner = edge > 0 ? "offense" : edge < 0 ? "defense" : "even";
  const head = `${OFFENSE_CONCEPT_INFO[offense].label} vs ${DEFENSE_CONCEPT_INFO[defense].label}`;
  const verdict = winner === "even" ? "an even call" : `the ${winner} won the call${Math.abs(edge) >= 2 ? " outright" : ""}`;
  return { offense, defense, edge, winner, why, text: `${head}: ${verdict}.${why ? ` ${why}` : ""}` };
}

/** Did the play do its job? Half the distance on first down, 70% on second, all of it on third and fourth. */
export function playSucceeded(e: ScrimmagePlayEvent): boolean {
  if (e.turnover) return false;
  if (e.touchdown || e.firstDown) return true;
  const need = e.start.down === 1 ? 0.5 : e.start.down === 2 ? 0.7 : 1;
  return e.yardsGained >= need * e.start.distance;
}

export interface DuelLine {
  plays: number;
  yards: number;
  successes: number;
}

/** One concept's day. */
export interface ConceptLine extends DuelLine {
  concept: OffenseConcept | DefenseConcept;
  label: string;
  /** Calls it won and lost (from the team's side). */
  won: number;
  lost: number;
}

/** One side of the ball, from the team's point of view (on defense, "won" is the defense winning the call). */
export interface DuelSide {
  snaps: number;
  won: number;
  lost: number;
  even: number;
  /** The offense's plays (yards gained, successes), split by how the call went for the team. */
  byCall: Record<"won" | "lost" | "even", DuelLine>;
  /** The team's calls, most used first. */
  concepts: ConceptLine[];
}

/** A play worth pointing at. */
export interface DuelMoment {
  /** Index into the game's plays. */
  seq: number;
  situation: Situation;
  reveal: CallReveal;
  yards: number;
  /** E.g. "3rd & 6: Play action vs Run blitz, 34 yards". */
  text: string;
}

export interface DuelRecap {
  team: string;
  opponent: string;
  offense: DuelSide;
  defense: DuelSide;
  /** Whether each side caught on to the other's favourite call (lines for the recap). */
  reads: string[];
  /** The team's best call won and worst call lost, on either side of the ball. */
  best: DuelMoment | null;
  worst: DuelMoment | null;
  headline: string;
}

const emptyLine = (): DuelLine => ({ plays: 0, yards: 0, successes: 0 });
const emptySide = (): DuelSide => ({ snaps: 0, won: 0, lost: 0, even: 0, byCall: { won: emptyLine(), lost: emptyLine(), even: emptyLine() }, concepts: [] });

/** The defensive calls that beat `c`. */
const countersTo = (c: OffenseConcept) => DEFENSE_CONCEPTS.filter((d) => conceptMatchup(c, d).edge < 0);
/** The offensive calls that beat `d`. */
const answersTo = (d: DefenseConcept) => OFFENSE_CONCEPTS.filter((c) => conceptMatchup(c, d).edge > 0);
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);
const downText = (s: Situation) => `${["1st", "2nd", "3rd", "4th"][s.down - 1]} & ${100 - s.yardline <= s.distance ? "goal" : s.distance}`;

/** How the play duel went for `team` in a game (null if the game had no calls: older rules). */
export function duelRecap(game: GameResult, team: string): DuelRecap | null {
  const opponent = game.home === team ? game.away : game.home;
  const sides = { offense: emptySide(), defense: emptySide() };
  const concepts = { offense: new Map<string, ConceptLine>(), defense: new Map<string, ConceptLine>() };
  // Snaps by half, for the reads: [first half, second half and overtime].
  const snaps: Array<{ e: ScrimmagePlayEvent; r: CallReveal; half: 0 | 1; seq: number }> = [];
  let best: DuelMoment | null = null;
  let worst: DuelMoment | null = null;
  let bestGain = 0;
  let worstGain = 0;

  for (const [seq, p] of game.plays.entries()) {
    const e = p.event;
    if ((e.kind !== "run" && e.kind !== "pass") || isNullified(e)) continue;
    const r = revealCall(e);
    if (!r) continue;
    const mine = e.offense === team;
    if (!mine && e.defense !== team) continue;
    const side = mine ? sides.offense : sides.defense;
    snaps.push({ e, r, half: p.quarter <= 2 ? 0 : 1, seq });
    // From the team's side: on defense, the defense winning the call is a win.
    const outcome = r.winner === "even" ? "even" : (r.winner === "offense") === mine ? "won" : "lost";
    side.snaps++;
    side[outcome]++;
    const ok = playSucceeded(e);
    const line = side.byCall[outcome];
    line.plays++;
    line.yards += e.yardsGained;
    if (ok) line.successes++;

    const concept = mine ? r.offense : r.defense;
    const map = mine ? concepts.offense : concepts.defense;
    let c = map.get(concept);
    if (!c) {
      c = { concept, label: mine ? OFFENSE_CONCEPT_INFO[r.offense].label : DEFENSE_CONCEPT_INFO[r.defense].label, plays: 0, yards: 0, successes: 0, won: 0, lost: 0 };
      map.set(concept, c);
    }
    c.plays++;
    c.yards += e.yardsGained;
    if (ok) c.successes++;
    if (outcome === "won") c.won++;
    if (outcome === "lost") c.lost++;

    // A moment's size from the team's side: yards gained on offense, yards held (and takeaways) on defense.
    const gain = (mine ? 1 : -1) * e.yardsGained + (e.turnover ? (mine ? -25 : 25) : 0) + (e.touchdown ? (mine ? 10 : -10) : 0);
    const moment = (): DuelMoment => ({
      seq,
      situation: e.start,
      reveal: r,
      yards: e.yardsGained,
      text: `${mine ? "" : "On defense, "}${downText(e.start)}: ${mine ? "your " : "their "}${OFFENSE_CONCEPT_INFO[r.offense].label} vs ${mine ? "their " : "your "}${DEFENSE_CONCEPT_INFO[r.defense].label}, ${e.turnover ? (e.turnover.type === "interception" ? "intercepted" : "fumble lost") : e.touchdown ? `${e.yardsGained}-yard touchdown` : `${e.yardsGained} yard${Math.abs(e.yardsGained) === 1 ? "" : "s"}`}`,
    });
    if (outcome === "won" && (!best || gain > bestGain)) [best, bestGain] = [moment(), gain];
    if (outcome === "lost" && (!worst || gain < worstGain)) [worst, worstGain] = [moment(), gain];
  }
  if (!snaps.length) return null;

  const byUse = (m: Map<string, ConceptLine>) => [...m.values()].sort((a, b) => b.plays - a.plays || a.label.localeCompare(b.label));
  sides.offense.concepts = byUse(concepts.offense);
  sides.defense.concepts = byUse(concepts.defense);

  // Did they catch on? The other side's answer to the team's favourite call, first half against second.
  const reads: string[] = [];
  const share = (pred: (s: (typeof snaps)[number]) => boolean, half: 0 | 1, mine: boolean) => {
    const pool = snaps.filter((s) => s.half === half && (s.e.offense === team) === mine);
    return { n: pool.length, pct: pct(pool.filter(pred).length, pool.length) };
  };
  const fav = sides.offense.concepts[0];
  if (fav && fav.plays >= 8) {
    const beats = countersTo(fav.concept as OffenseConcept);
    const [a, b] = [0, 1].map((h) => share((x) => beats.includes(x.r.defense), h as 0 | 1, true));
    const names = list(beats.map((d) => DEFENSE_CONCEPT_INFO[d].label));
    const use = `${fav.label} was your most-called play (${pct(fav.plays, sides.offense.snaps)}% of snaps)`;
    reads.push(
      a!.n && b!.n && b!.pct - a!.pct >= 10
        ? `${use}, and they caught on: calls that beat it (${names}) on ${a!.pct}% of your snaps in the first half, ${b!.pct}% after.`
        : `${use}; they called something that beats it (${names}) on ${pct(snaps.filter((x) => x.e.offense === team && beats.includes(x.r.defense)).length, sides.offense.snaps)}% of your snaps.`,
    );
  }
  const favD = sides.defense.concepts[0];
  if (favD && favD.plays >= 8) {
    const beats = answersTo(favD.concept as DefenseConcept);
    const [a, b] = [0, 1].map((h) => share((x) => beats.includes(x.r.offense), h as 0 | 1, false));
    const names = list(beats.map((c) => OFFENSE_CONCEPT_INFO[c].label));
    const use = `${favD.label} was your most-called defense (${pct(favD.plays, sides.defense.snaps)}%)`;
    reads.push(
      a!.n && b!.n && b!.pct - a!.pct >= 10
        ? `${use}, and their offense caught on: calls that beat it (${names}) on ${a!.pct}% of their snaps in the first half, ${b!.pct}% after.`
        : `${use}; their offense called something that beats it (${names}) on ${pct(snaps.filter((x) => x.e.defense === team && beats.includes(x.r.offense)).length, sides.defense.snaps)}% of their snaps.`,
    );
  }

  const won = sides.offense.won + sides.defense.won;
  const lost = sides.offense.lost + sides.defense.lost;
  const total = sides.offense.snaps + sides.defense.snaps;
  const headline =
    won > lost * 1.25
      ? `You won the call on ${pct(won, total)}% of snaps and lost ${pct(lost, total)}%: the calls were yours.`
      : lost > won * 1.25
        ? `You lost the call on ${pct(lost, total)}% of snaps and won ${pct(won, total)}%: they were a step ahead.`
        : `An even duel: you won the call on ${pct(won, total)}% of snaps and lost ${pct(lost, total)}%.`;

  return { team, opponent, offense: sides.offense, defense: sides.defense, reads, best, worst, headline };
}
