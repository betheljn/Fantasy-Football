import type { Player } from "../model/player.ts";
import type { Rng } from "../rng.ts";
import {
  avg,
  buildTurnover,
  fumbleTurnover,
  HOME_FIELD,
  clamp,
  edge,
  exponential,
  pickDirection,
  pickTackler,
  rollFumble,
  spotBall,
  stopReasonFor,
  weightedPick,
  type PlayContext,
} from "./common.ts";
import type { IncompleteReason, PassPlayEvent } from "./events.ts";
import { assignCoverage, COVERAGES, formationInfo, formationsFor, type Coverage } from "./formation.ts";

type Band = "screen" | "short" | "intermediate" | "deep";
const BAND_NAMES: Band[] = ["screen", "short", "intermediate", "deep"];

interface BandSpec {
  air: (rng: Rng) => number;
  completion: number;
  interception: number;
}

const BANDS: Record<Band, BandSpec> = {
  screen: { air: (rng) => clamp(Math.round(rng.normal(-1, 1.5)), -5, 2), completion: 0.8, interception: 0.006 },
  short: { air: (rng) => clamp(Math.round(rng.normal(5, 2)), 1, 9), completion: 0.725, interception: 0.015 },
  intermediate: { air: (rng) => clamp(Math.round(rng.normal(13, 2.5)), 10, 19), completion: 0.57, interception: 0.028 },
  deep: { air: (rng) => clamp(Math.round(rng.normal(29, 6)), 20, 60), completion: 0.38, interception: 0.045 },
};

/**
 * How each coverage shell changes completion odds by throw depth: two-deep and
 * quarters shells take away deep balls but give up underneath; Cover 0 has no
 * deep help at all.
 */
const COVERAGE_COMPLETION: Record<Coverage, Record<Band, number>> = {
  cover_0: { screen: -0.03, short: 0, intermediate: 0.02, deep: 0.08 },
  cover_1: { screen: 0, short: -0.01, intermediate: 0, deep: 0 },
  cover_2: { screen: -0.03, short: 0.01, intermediate: 0.01, deep: -0.02 },
  cover_3: { screen: 0.01, short: 0.02, intermediate: 0, deep: -0.05 },
  cover_4: { screen: 0.02, short: 0.03, intermediate: -0.03, deep: -0.07 },
};

/** Where QBs throw against each shell (multipliers on the base depth mix). */
const COVERAGE_DEPTH: Record<Coverage, Record<Band, number>> = {
  cover_0: { screen: 1.2, short: 1.1, intermediate: 1, deep: 1.4 },
  cover_1: { screen: 1, short: 1, intermediate: 1, deep: 1.1 },
  cover_2: { screen: 1, short: 1, intermediate: 1.05, deep: 0.9 },
  cover_3: { screen: 1.1, short: 1.05, intermediate: 1, deep: 0.8 },
  cover_4: { screen: 1.1, short: 1.15, intermediate: 0.95, deep: 0.6 },
};

/** Base target share by role (WR1, WR2, ...; TE1, TE2, ...; RB1, RB2). */
const TARGET_SHARE = { WR: [0.22, 0.19, 0.15, 0.1], TE: [0.18, 0.08, 0.05], RB: [0.14, 0.06] };

/** Separation for a receiver nobody picked up (the defense sent more rushers than it could cover). */
const OPEN_SEPARATION = 1.5;

interface Route {
  receiver: Player;
  /** Defender responsible; null if the receiver is uncovered. */
  cover: Player | null;
  share: number;
  /** Separation edge: route running + speed vs coverage + speed, shaped by the scheme. */
  sep: number;
}

export function simulatePass(rng: Rng, ctx: PlayContext): PassPlayEvent {
  const { situation: sit } = ctx;
  const f = formationsFor(ctx);
  const o = f.offense;
  const d = f.defense;
  const shell = COVERAGES[d.coverage];
  const qb = o.qb;
  const q = qb.ratings;
  const direction = pickDirection(rng);

  const base = {
    kind: "pass" as const,
    offense: ctx.offense.abbr,
    defense: ctx.defense.abbr,
    start: { ...sit },
    passer: qb.id,
    direction,
    penalty: null,
    formation: formationInfo(f),
  };

  // Protection vs the actual rushers. Extra rushers beyond four raise sacks and
  // pressure; an aware QB beats the blitz with quick throws.
  const protect = avg(o.ol, (p) => p.ratings.passBlock) * 0.85 + avg(o.rbs, (p) => p.ratings.passBlock) * 0.15;
  const rush = avg(d.dl, (p) => p.ratings.passRush) * 0.85 + (d.blitzers.length ? avg(d.blitzers, (p) => p.ratings.passRush) : avg(d.dl, (p) => p.ratings.passRush)) * 0.15;
  const line = (protect - rush) / 15;
  const extraRushers = d.rushers.length - 4;
  const hot = edge(q.awareness);
  const blitzBite = extraRushers * clamp(1 - 0.35 * hot, 0.4, 1.6);
  const extraBlockers = Math.max(0, o.tes.length - 1) + (o.rbs.length - 1);
  const home = ctx.homeField ?? 0;
  const sackRate = clamp(
    0.062 - 0.025 * line - 0.012 * hot - HOME_FIELD.sackRate * home + 0.018 * blitzBite - 0.006 * extraBlockers,
    0.02,
    0.2,
  );

  if (rng.chance(sackRate)) {
    // Unblocked blitzers get home more often than their pass-rush rating suggests.
    const sacker = weightedPick(rng, d.rushers, (p) => p.ratings.passRush * (p.position === "DL" ? 1 : 1.3));
    const spot = spotBall(sit, -Math.max(1, Math.round(rng.normal(6.5, 2.2))));
    const fumble = spot.safety ? null : rollFumble(rng, qb, sacker, d, 0.12);
    const turnover = fumble?.lost ? fumbleTurnover(rng, fumble, d.all, spot.endYardline) : null;
    return {
      ...base,
      outcome: "sack",
      target: null,
      coverage: null,
      airYards: 0,
      yardsAfterCatch: 0,
      pressured: true,
      sackedBy: sacker.id,
      incompleteReason: null,
      outOfBounds: false,
      yardsGained: spot.yardsGained,
      endYardline: spot.endYardline,
      duration: Math.round(clamp(rng.normal(4.5, 0.8), 3, 8)),
      stopReason: stopReasonFor({ ...spot, turnover, outOfBounds: false }),
      firstDown: false,
      touchdown: false,
      safety: spot.safety,
      fumble,
      turnover,
      tackler: sacker.id,
    };
  }

  const pressured = rng.chance(clamp(0.22 - 0.07 * line + 0.07 * blitzBite - 0.02 * extraBlockers, 0.08, 0.55));

  // Who is the ball going to? Target shares, tilted toward whoever is open; against
  // the blitz an aware QB finds the uncovered man.
  const assignments = assignCoverage(o, d);
  const routes: Route[] = [
    ...o.wrs.map((p, i) => route(p, assignments.get(p.id) ?? null, TARGET_SHARE.WR[i] ?? 0.05, shell.man)),
    ...o.tes.map((p, i) => route(p, assignments.get(p.id) ?? null, TARGET_SHARE.TE[i] ?? 0.04, shell.man)),
    ...o.rbs.map((p, i) => route(p, assignments.get(p.id) ?? null, TARGET_SHARE.RB[i] ?? 0.04, shell.man)),
  ];
  const r = weightedPick(rng, routes, (rt) => rt.share * Math.exp(0.3 * rt.sep) * (rt.cover ? 1 : 1 + clamp(1 + hot, 0.3, 2)));
  const t = r.receiver.ratings;
  // Uncovered receivers are still tackled by someone: the nearest underneath defender.
  const nearest = r.cover ?? pickTackler(rng, d, 5);

  const band = pickBand(rng, r.receiver, edge(q.throwPower), d.coverage, extraRushers > 0);
  const spec = BANDS[band];
  const airYards = Math.min(spec.air(rng), sit.yardline >= 100 ? 0 : 100 - sit.yardline);

  const completion = clamp(
    spec.completion +
      COVERAGE_COMPLETION[d.coverage][band] +
      0.07 * edge(q.throwAccuracy) +
      0.05 * r.sep +
      0.03 * edge(t.catching) -
      (pressured ? 0.12 : 0) +
      HOME_FIELD.completion * home,
    0.1,
    0.93,
  );
  // Deep safeties make deep balls riskier; zone defenders jump intermediate routes.
  const helpFactor = band === "deep" ? 1 + 0.25 * shell.deepSafeties : 1;
  const zoneFactor = !shell.man && band === "intermediate" ? 1.15 : 1;
  const interception = clamp(
    spec.interception * (1 - 0.35 * edge(q.throwAccuracy)) * (1 - 0.2 * r.sep) * (pressured ? 1.5 : 1) * helpFactor * zoneFactor,
    0.002,
    0.12,
  );

  const roll = rng.next();

  if (roll < interception) {
    const deepSafeties = d.s.filter((p) => !d.blitzers.includes(p));
    const picker = band === "deep" && deepSafeties.length > 0 && rng.chance(0.5) ? rng.pick(deepSafeties) : nearest;
    const turnover = buildTurnover(rng, "interception", picker, sit.yardline + airYards, 8);
    return {
      ...base,
      outcome: "interception",
      target: r.receiver.id,
      coverage: r.cover?.id ?? null,
      airYards,
      yardsAfterCatch: 0,
      pressured,
      sackedBy: null,
      incompleteReason: null,
      outOfBounds: false,
      yardsGained: 0,
      endYardline: sit.yardline,
      duration: Math.round(clamp(rng.normal(6, 1) + turnover.returnYards / 8, 3, 15)),
      stopReason: stopReasonFor({ touchdown: false, safety: false, turnover, outOfBounds: false }),
      firstDown: false,
      touchdown: false,
      safety: false,
      fumble: null,
      turnover,
      tackler: null,
    };
  }

  if (roll >= interception + completion) {
    return {
      ...base,
      outcome: "incomplete",
      target: r.receiver.id,
      coverage: r.cover?.id ?? null,
      airYards,
      yardsAfterCatch: 0,
      pressured,
      sackedBy: null,
      incompleteReason: incompleteReason(rng, r),
      outOfBounds: false,
      yardsGained: 0,
      endYardline: sit.yardline,
      duration: Math.round(clamp(rng.normal(5, 1), 3, 9)),
      stopReason: "incomplete",
      firstDown: false,
      touchdown: false,
      safety: false,
      fumble: null,
      turnover: null,
      tackler: null,
    };
  }

  // Completion: add yards after the catch, with the odd broken tackle for a big gain.
  // No deep help (Cover 0) or an uncovered receiver means more room to run.
  let yac = band === "screen" ? Math.max(0, rng.normal(5, 3)) : Math.max(0, rng.normal(3, 2));
  const openField = (shell.deepSafeties === 0 ? 0.04 : 0) + (r.cover ? 0 : 0.04) - 0.01 * shell.deepSafeties;
  const breakRate = clamp(0.045 + 0.03 * edge((t.elusiveness + t.speed) / 2) + 0.02 * r.sep + openField, 0.02, 0.2);
  if (rng.chance(breakRate)) yac += 6 + exponential(rng, 10);

  const spot = spotBall(sit, airYards + yac);
  const yardsAfterCatch = spot.yardsGained - airYards;
  const tackler = spot.touchdown ? null : rng.chance(0.6) ? nearest : pickTackler(rng, d, spot.yardsGained);
  const outOfBounds =
    !spot.touchdown && direction !== "middle" && r.receiver.position === "WR" && rng.chance(0.22);
  const fumble = spot.touchdown ? null : rollFumble(rng, r.receiver, tackler, d, 0.006);
  const turnover = fumble?.lost ? fumbleTurnover(rng, fumble, d.all, spot.endYardline) : null;

  return {
    ...base,
    outcome: "complete",
    target: r.receiver.id,
    coverage: r.cover?.id ?? null,
    airYards,
    yardsAfterCatch,
    pressured,
    sackedBy: null,
    incompleteReason: null,
    outOfBounds,
    yardsGained: spot.yardsGained,
    endYardline: spot.endYardline,
    duration: Math.round(clamp(rng.normal(6, 1) + Math.max(0, spot.yardsGained) / 12, 3, 15)),
    stopReason: stopReasonFor({ ...spot, turnover, outOfBounds }),
    firstDown: spot.firstDown && !turnover,
    touchdown: spot.touchdown,
    safety: spot.safety,
    fumble,
    turnover,
    tackler: tackler?.id ?? null,
  };
}

/**
 * Man coverage magnifies individual matchups; zone flattens them (and leaves
 * soft spots underneath). An uncovered receiver is wide open.
 */
function route(receiver: Player, cover: Player | null, share: number, man: boolean): Route {
  if (!cover) return { receiver, cover, share, sep: OPEN_SEPARATION };
  const rr = receiver.ratings;
  const cr = cover.ratings;
  const raw = (rr.routeRunning * 0.6 + rr.speed * 0.4 - (cr.coverage * 0.6 + cr.speed * 0.4)) / 15;
  return { receiver, cover, share, sep: man ? raw * 1.15 : raw * 0.7 + 0.1 };
}

function pickBand(rng: Rng, receiver: Player, armEdge: number, coverage: Coverage, blitz: boolean): Band {
  const shape = COVERAGE_DEPTH[coverage];
  // Against the blitz the ball comes out quickly.
  const quick: Record<Band, number> = blitz ? { screen: 1.3, short: 1.15, intermediate: 0.95, deep: 0.8 } : { screen: 1, short: 1, intermediate: 1, deep: 1 };
  let weights: Record<Band, number>;
  if (receiver.position === "RB") {
    weights = { screen: 0.45, short: 0.5, intermediate: 0.05, deep: 0 };
  } else {
    const deep = clamp(0.12 + 0.03 * armEdge, 0.05, 0.2);
    weights = { screen: 0.06, short: 0.54 - (deep - 0.12), intermediate: 0.28, deep };
  }
  return weightedPick(rng, BAND_NAMES, (b) => weights[b] * shape[b] * quick[b]);
}

function incompleteReason(rng: Rng, r: Route): IncompleteReason {
  const drop = clamp(0.15 - 0.1 * edge(r.receiver.ratings.catching), 0.05, 0.3);
  // Nobody to break it up: it's either dropped or off target.
  if (!r.cover) return rng.chance(clamp(drop * 2, 0.1, 0.6)) ? "dropped" : "overthrown";
  const defended = clamp(0.35 - 0.15 * r.sep, 0.15, 0.6);
  const roll = rng.next();
  return roll < drop ? "dropped" : roll < drop + defended ? "defended" : "overthrown";
}
