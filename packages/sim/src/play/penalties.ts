// Penalties: when they happen, who commits them, and how they're enforced.
//
// Pre-snap fouls replace the play entirely (a PenaltyEvent). Live-ball fouls
// are attached to the play that happened; the fouled team then accepts or
// declines. An accepted live-ball foul either wipes out the play ("no play")
// or, for personal fouls after the play, is added on to its result.
import type { Player } from "../model/player.ts";
import type { Rng } from "../rng.ts";
import { avg, clamp, edge, weightedPick, type PlayContext } from "./common.ts";
import type { Penalty, PenaltyEvent, PenaltyResult, PenaltyType, ScrimmagePlayEvent, Situation } from "./events.ts";
import { formationsFor, receivers } from "./formation.ts";

type Side = "offense" | "defense";

interface PenaltySpec {
  label: string;
  side: Side;
  /** Yards walked off; "spot" = enforced where the foul happened (DPI). */
  yards: number | "spot";
  automaticFirstDown: boolean;
  /** Personal foul after the play: result stands, yards added from the end of the play. */
  afterPlay: boolean;
}

export const PENALTIES: Record<PenaltyType, PenaltySpec> = {
  false_start: { label: "False start", side: "offense", yards: 5, automaticFirstDown: false, afterPlay: false },
  delay_of_game: { label: "Delay of game", side: "offense", yards: 5, automaticFirstDown: false, afterPlay: false },
  offside: { label: "Offside", side: "defense", yards: 5, automaticFirstDown: false, afterPlay: false },
  offensive_holding: { label: "Offensive holding", side: "offense", yards: 10, automaticFirstDown: false, afterPlay: false },
  defensive_holding: { label: "Defensive holding", side: "defense", yards: 5, automaticFirstDown: true, afterPlay: false },
  offensive_pass_interference: { label: "Offensive pass interference", side: "offense", yards: 10, automaticFirstDown: false, afterPlay: false },
  defensive_pass_interference: { label: "Defensive pass interference", side: "defense", yards: "spot", automaticFirstDown: true, afterPlay: false },
  roughing_the_passer: { label: "Roughing the passer", side: "defense", yards: 15, automaticFirstDown: true, afterPlay: true },
  face_mask: { label: "Face mask", side: "defense", yards: 15, automaticFirstDown: true, afterPlay: true },
  unnecessary_roughness: { label: "Unnecessary roughness", side: "defense", yards: 15, automaticFirstDown: true, afterPlay: true },
};

/** Base rates. Pre-snap rates are per snap; live-ball rates are per eligible play. */
export const PENALTY_RATES = {
  falseStart: 0.018,
  delayOfGame: 0.004,
  offside: 0.011,
  offensiveHolding: 0.024,
  defensiveHolding: 0.012,
  /** Per incompletion/interception (roughly 1% of all attempts). */
  defensivePassInterference: 0.028,
  offensivePassInterference: 0.004,
  roughingThePasser: 0.004,
  faceMask: 0.003,
  unnecessaryRoughness: 0.004,
};

/** Road teams false start more (crowd noise); home teams less. */
const FALSE_START_CROWD = { home: 0.8, away: 1.3 };

/**
 * Enforce `yards` against `side` from `from` (default: the line of scrimmage),
 * applying half-the-distance to the goal. The line to gain doesn't move.
 */
export function enforce(
  sit: Situation,
  side: Side,
  yards: number,
  opts: { from?: number; automaticFirstDown?: boolean } = {},
): { result: PenaltyResult; yards: number } {
  const lineToGain = Math.min(100, sit.yardline + sit.distance);
  const from = opts.from ?? sit.yardline;
  const room = side === "offense" ? from : 100 - from;
  const moved = yards * 2 > room ? Math.floor(room / 2) : yards;
  const yardline = clamp(side === "offense" ? from - moved : from + moved, 1, 99);
  const firstDown = side === "defense" && (!!opts.automaticFirstDown || yardline >= lineToGain);
  const result: PenaltyResult = firstDown
    ? { yardline, down: 1, distance: Math.min(10, 100 - yardline), firstDown: true }
    : { yardline, down: sit.down, distance: lineToGain - yardline, firstDown: false };
  return { result, yards: Math.abs(yardline - from) };
}

/** Accepted and the play didn't count. */
export function isNullified(e: ScrimmagePlayEvent): boolean {
  return !!e.penalty?.accepted && !e.penalty.playStands;
}

function lowRatingPick(rng: Rng, players: readonly Player[], rating: (p: Player) => number): Player {
  return weightedPick(rng, players, (p) => Math.max(5, 105 - rating(p)));
}

/** Roll for a pre-snap foul before a run/pass/kick. Null if the snap is clean. */
export function rollPreSnapPenalty(rng: Rng, ctx: PlayContext): PenaltyEvent | null {
  const { offense: o, defense: d } = formationsFor(ctx);
  const home = ctx.homeField ?? 0;
  const crowd = home > 0 ? FALSE_START_CROWD.home : home < 0 ? FALSE_START_CROWD.away : 1;
  const disciplineO = clamp(1 - 0.3 * edge(avg(o.ol, (p) => p.ratings.awareness)), 0.6, 1.5);
  const disciplineD = clamp(1 - 0.3 * edge(avg(d.dl, (p) => p.ratings.awareness)), 0.6, 1.5);

  const candidates: Array<[PenaltyType, number, () => Player | null]> = [
    ["false_start", PENALTY_RATES.falseStart * crowd * disciplineO, () => lowRatingPick(rng, [...o.ol, ...o.tes], (p) => p.ratings.awareness)],
    ["delay_of_game", PENALTY_RATES.delayOfGame, () => null],
    ["offside", PENALTY_RATES.offside * disciplineD, () => lowRatingPick(rng, [...d.dl, ...d.lb], (p) => p.ratings.awareness)],
  ];
  const picked = rollOne(rng, candidates);
  if (!picked) return null;
  const [type, player] = picked;
  const spec = PENALTIES[type];
  const { result, yards } = enforce(ctx.situation, spec.side, spec.yards as number, { automaticFirstDown: spec.automaticFirstDown });
  return {
    kind: "penalty",
    offense: ctx.offense.abbr,
    defense: ctx.defense.abbr,
    start: { ...ctx.situation },
    duration: 0,
    penalty: {
      type,
      team: spec.side === "offense" ? ctx.offense.abbr : ctx.defense.abbr,
      player: player?.id ?? null,
      accepted: true,
      yards,
      playStands: false,
      result,
    },
  };
}

/**
 * Roll for a live-ball foul on a run or pass that just happened, and decide
 * whether it's accepted. Returns the event with `penalty` set (or unchanged).
 */
export function assessLiveBallPenalty(rng: Rng, ctx: PlayContext, e: ScrimmagePlayEvent): ScrimmagePlayEvent {
  const { offense: o, defense: d } = formationsFor(ctx);
  const sit = ctx.situation;
  const candidates: Array<[PenaltyType, number, () => Player | null]> = [];
  const find = (id: string | null, pool: readonly Player[]) => pool.find((p) => p.id === id) ?? null;

  // Offensive holding: more likely behind a weak line.
  const isPass = e.kind === "pass";
  const block = avg(o.ol, (p) => (isPass ? p.ratings.passBlock : p.ratings.runBlock));
  candidates.push([
    "offensive_holding",
    PENALTY_RATES.offensiveHolding * clamp(1 - 0.4 * edge(block), 0.5, 1.6),
    () => lowRatingPick(rng, [...o.ol, ...o.tes], (p) => (isPass ? p.ratings.passBlock : p.ratings.runBlock)),
  ]);

  if (e.kind === "pass") {
    const cover = find(e.coverage, d.all) ?? rng.pick([...d.cb, ...d.s]);
    candidates.push(["defensive_holding", PENALTY_RATES.defensiveHolding, () => cover]);
    if (e.outcome === "incomplete" || e.outcome === "interception") {
      const depth = e.airYards >= 20 ? 2 : e.airYards <= 0 ? 0.2 : 1;
      candidates.push(["defensive_pass_interference", PENALTY_RATES.defensivePassInterference * depth, () => cover]);
    }
    if (e.outcome === "complete" || e.outcome === "incomplete") {
      const target = find(e.target, receivers(o));
      if (target) candidates.push(["offensive_pass_interference", PENALTY_RATES.offensivePassInterference, () => target]);
    }
  }

  // Personal fouls after the play only on clean plays (no score, no turnover, no fumble).
  const clean = !e.touchdown && !e.safety && !e.turnover && !e.fumble;
  if (clean && e.kind === "pass" && (e.outcome === "complete" || e.outcome === "incomplete")) {
    candidates.push([
      "roughing_the_passer",
      PENALTY_RATES.roughingThePasser * (e.pressured ? 2 : 0.6),
      () => weightedPick(rng, d.rushers, (p) => p.ratings.passRush),
    ]);
  }
  const tackler = find(e.tackler, d.all);
  if (clean && tackler && (e.kind === "run" || e.outcome === "complete")) {
    candidates.push(["face_mask", PENALTY_RATES.faceMask, () => tackler]);
    candidates.push(["unnecessary_roughness", PENALTY_RATES.unnecessaryRoughness, () => tackler]);
  }

  const picked = rollOne(rng, candidates);
  if (!picked) return e;
  const [type, player] = picked;
  const spec = PENALTIES[type];
  const team = spec.side === "offense" ? ctx.offense.abbr : ctx.defense.abbr;

  let enforced: { result: PenaltyResult; yards: number };
  if (spec.yards === "spot") {
    // DPI: ball at the spot of the foul (the 1 if in the end zone), first down.
    const spot = clamp(sit.yardline + Math.max(1, e.kind === "pass" ? e.airYards : 1), 1, 99);
    enforced = { result: { yardline: spot, down: 1, distance: Math.min(10, 100 - spot), firstDown: true }, yards: spot - sit.yardline };
  } else if (spec.afterPlay) {
    // Added on from where the play ended (or the line of scrimmage on an incompletion).
    const from = e.kind === "pass" && e.outcome === "incomplete" ? sit.yardline : e.endYardline;
    enforced = enforce(sit, spec.side, spec.yards, { from, automaticFirstDown: true });
  } else {
    enforced = enforce(sit, spec.side, spec.yards, { automaticFirstDown: spec.automaticFirstDown });
  }

  const accepted = spec.afterPlay || (spec.side === "offense" ? defenseAccepts(e, sit, enforced.yards) : offenseAccepts(e, enforced.result));
  const penalty: Penalty = {
    type,
    team,
    player: player?.id ?? null,
    accepted,
    yards: accepted ? enforced.yards : 0,
    playStands: spec.afterPlay,
    result: accepted ? enforced.result : null,
  };
  return { ...e, penalty };
}

/** Defense decides on an offensive foul: decline when the play itself was better for them. */
function defenseAccepts(e: ScrimmagePlayEvent, sit: Situation, yards: number): boolean {
  if (e.turnover || e.safety) return false;
  const converted = e.firstDown || e.touchdown;
  if (!converted && sit.down >= 3) return false; // take the 4th down / turnover on downs
  if (e.yardsGained <= -yards) return false; // e.g. a sack that lost more than the penalty
  return true;
}

/** Offense decides on a defensive foul: accept if the penalty leaves them better off. */
function offenseAccepts(e: ScrimmagePlayEvent, after: PenaltyResult): boolean {
  if (e.touchdown) return false;
  if (e.turnover || e.safety) return true;
  if (after.firstDown && !e.firstDown) return true;
  if (after.firstDown === e.firstDown) return after.yardline > e.endYardline || (!e.firstDown && after.down < Math.min(4, e.start.down + 1));
  return false;
}

/** Roll at most one foul from weighted candidates. */
function rollOne(rng: Rng, candidates: Array<[PenaltyType, number, () => Player | null]>): [PenaltyType, Player | null] | null {
  let roll = rng.next();
  for (const [type, rate, who] of candidates) {
    if (roll < rate) return [type, who()];
    roll -= rate;
  }
  return null;
}

export function penaltyLabel(type: PenaltyType): string {
  return PENALTIES[type].label;
}
