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
import { defensePersonnel, offensePersonnel } from "./personnel.ts";

type Band = "screen" | "short" | "intermediate" | "deep";

interface BandSpec {
  air: (rng: Rng) => number;
  completion: number;
  interception: number;
}

const BANDS: Record<Band, BandSpec> = {
  screen: { air: (rng) => clamp(Math.round(rng.normal(-1, 1.5)), -5, 2), completion: 0.8, interception: 0.006 },
  short: { air: (rng) => clamp(Math.round(rng.normal(4.5, 2)), 1, 9), completion: 0.74, interception: 0.015 },
  intermediate: { air: (rng) => clamp(Math.round(rng.normal(13, 2.5)), 10, 19), completion: 0.57, interception: 0.028 },
  deep: { air: (rng) => clamp(Math.round(rng.normal(29, 6)), 20, 60), completion: 0.38, interception: 0.045 },
};

interface Route {
  receiver: Player;
  cover: Player;
  share: number;
  /** Separation edge: route running + speed vs coverage + speed. */
  sep: number;
}

export function simulatePass(rng: Rng, ctx: PlayContext): PassPlayEvent {
  const { situation: sit } = ctx;
  const o = offensePersonnel(ctx.offense);
  const d = defensePersonnel(ctx.defense);
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
  };

  // Protection vs pass rush decides sacks and pressure.
  const rb1 = o.rbs[0]!;
  const protect = avg(o.ol, (p) => p.ratings.passBlock) * 0.85 + rb1.ratings.passBlock * 0.15;
  const rush = avg(d.dl, (p) => p.ratings.passRush) * 0.8 + avg(d.lb, (p) => p.ratings.passRush) * 0.2;
  const line = (protect - rush) / 15;
  const home = ctx.homeField ?? 0;
  const sackRate = clamp(0.065 - 0.025 * line - 0.012 * edge(q.awareness) - HOME_FIELD.sackRate * home, 0.02, 0.16);

  if (rng.chance(sackRate)) {
    const sacker = weightedPick(rng, [...d.dl, ...d.lb], (p) =>
      p.ratings.passRush * (p.position === "DL" ? 1 : 0.3),
    );
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

  const pressured = rng.chance(clamp(0.22 - 0.07 * line, 0.08, 0.4));

  // Who is the ball going to? Base target shares, tilted toward whoever is open.
  const [wr1, wr2, wr3] = o.wrs;
  const [cb1, cb2] = d.cb;
  const [s1, s2] = d.s;
  const [lb1] = d.lb;
  const routes: Route[] = [
    route(wr1!, cb1!, 0.25),
    route(wr2!, cb2!, 0.2),
    route(wr3!, s1!, 0.14),
    route(o.te, s2!, 0.18),
    route(rb1, lb1!, 0.13),
  ];
  const r = weightedPick(rng, routes, (rt) => rt.share * Math.exp(0.35 * rt.sep));
  const t = r.receiver.ratings;

  const band = pickBand(rng, r.receiver, edge(q.throwPower));
  const spec = BANDS[band];
  const airYards = Math.min(spec.air(rng), sit.yardline >= 100 ? 0 : 100 - sit.yardline);

  const completion = clamp(
    spec.completion +
      0.07 * edge(q.throwAccuracy) +
      0.05 * r.sep +
      0.03 * edge(t.catching) -
      (pressured ? 0.12 : 0) +
      HOME_FIELD.completion * home,
    0.1,
    0.93,
  );
  const interception = clamp(
    spec.interception * (1 - 0.35 * edge(q.throwAccuracy)) * (1 - 0.2 * r.sep) * (pressured ? 1.5 : 1),
    0.002,
    0.12,
  );

  const roll = rng.next();

  if (roll < interception) {
    const picker = rng.chance(0.7) ? r.cover : rng.pick(d.s);
    const turnover = buildTurnover(rng, "interception", picker, sit.yardline + airYards, 8);
    return {
      ...base,
      outcome: "interception",
      target: r.receiver.id,
      coverage: r.cover.id,
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
      coverage: r.cover.id,
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
  let yac = band === "screen" ? Math.max(0, rng.normal(5, 3)) : Math.max(0, rng.normal(3, 2));
  const breakRate = clamp(0.045 + 0.03 * edge((t.elusiveness + t.speed) / 2) + 0.02 * r.sep, 0.02, 0.14);
  if (rng.chance(breakRate)) yac += 6 + exponential(rng, 10);

  const spot = spotBall(sit, airYards + yac);
  const yardsAfterCatch = spot.yardsGained - airYards;
  const tackler = spot.touchdown ? null : rng.chance(0.6) ? r.cover : pickTackler(rng, d, spot.yardsGained);
  const outOfBounds =
    !spot.touchdown && direction !== "middle" && r.receiver.position === "WR" && rng.chance(0.22);
  const fumble = spot.touchdown ? null : rollFumble(rng, r.receiver, tackler, d, 0.006);
  const turnover = fumble?.lost ? fumbleTurnover(rng, fumble, d.all, spot.endYardline) : null;

  return {
    ...base,
    outcome: "complete",
    target: r.receiver.id,
    coverage: r.cover.id,
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

function route(receiver: Player, cover: Player, share: number): Route {
  const rr = receiver.ratings;
  const cr = cover.ratings;
  const sep = (rr.routeRunning * 0.6 + rr.speed * 0.4 - (cr.coverage * 0.6 + cr.speed * 0.4)) / 15;
  return { receiver, cover, share, sep };
}

function pickBand(rng: Rng, receiver: Player, armEdge: number): Band {
  if (receiver.position === "RB") {
    return weightedPick<Band>(rng, ["screen", "short", "intermediate"], (b) =>
      b === "screen" ? 0.45 : b === "short" ? 0.5 : 0.05,
    );
  }
  const deep = clamp(0.12 + 0.03 * armEdge, 0.05, 0.2);
  const weights: Record<Band, number> = { screen: 0.06, short: 0.54 - (deep - 0.12), intermediate: 0.28, deep };
  return weightedPick<Band>(rng, ["screen", "short", "intermediate", "deep"], (b) => weights[b]);
}

function incompleteReason(rng: Rng, r: Route): IncompleteReason {
  const drop = clamp(0.15 - 0.1 * edge(r.receiver.ratings.catching), 0.05, 0.3);
  const defended = clamp(0.35 - 0.15 * r.sep, 0.15, 0.6);
  const roll = rng.next();
  return roll < drop ? "dropped" : roll < drop + defended ? "defended" : "overthrown";
}
