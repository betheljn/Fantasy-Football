import type { Player } from "../model/player.ts";
import type { Rng } from "../rng.ts";
import {
  avg,
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
import type { RunPlayEvent } from "./events.ts";
import { boxDefenders, formationInfo, formationsFor, runBlockers } from "./formation.ts";
import { runDefense } from "../model/ratings.ts";

/** Rushing yards per extra blocker (or per extra defender in the box, if negative). */
export const RUN_NUMBERS_EDGE = 0.3;
/** Mean rushing yards before any matchup edges. */
const RUN_BASE = 3.8;

export function simulateRun(rng: Rng, ctx: PlayContext): RunPlayEvent {
  const { situation: sit } = ctx;
  const f = formationsFor(ctx);
  const o = f.offense;
  const d = f.defense;

  // Tailback, fullback (21 personnel), or a designed QB run (more for mobile QBs).
  const qbShare = clamp(0.05 + 0.03 * edge(o.qb.ratings.speed), 0.02, 0.12);
  const [tailback, fullback] = o.rbs;
  const carriers: Array<[Player, number]> = [
    [tailback!, fullback ? 0.82 : 1],
    [o.qb, qbShare],
  ];
  if (fullback) carriers.push([fullback, 0.14]);
  const rusher = weightedPick(rng, carriers, ([, w]) => w)[0];
  const direction = pickDirection(rng);

  // Line battle: the blockers vs the defenders in the box. Quality is the average of
  // everyone involved; how many there are on each side is the separate numbers edge.
  // Blockers lean on power against strong fronts and finesse against quick ones;
  // a fullback's job is lead blocking.
  const blockers = runBlockers(o);
  const box = boxDefenders(d);
  const powerFront = clamp(0.5 + (avg(d.dl, (p) => p.ratings.strength) - avg(d.dl, (p) => p.ratings.agility)) / 60, 0.3, 0.7);
  const blockQuality = (p: Player) =>
    p.position === "RB" ? p.ratings.leadBlock : p.ratings.runBlockPower * powerFront + p.ratings.runBlockFinesse * (1 - powerFront);
  const block = avg(blockers, blockQuality);
  const stop = avg(box, (p) => runDefense(p.ratings));
  const numbers = blockers.length - box.length;
  const line = (block - stop) / 15 + RUN_NUMBERS_EDGE * numbers + HOME_FIELD.runLine * (ctx.homeField ?? 0);

  // The runner: vision finds the hole, moves and power win yards after contact, burst breaks it open.
  const r = rusher.ratings;
  const vision = edge(r.ballCarrierVision);
  const wiggle = edge((r.elusiveness + r.jukeMove + r.spinMove) / 3);
  const power = edge((r.breakTackle + r.trucking + r.stiffArm) / 3);
  const burst = edge((r.speed + r.acceleration) / 2);
  const runner = 0.35 * vision + 0.25 * wiggle + 0.25 * power + 0.15 * burst;
  // A run blitz is boom-or-bust: more stuffs, but more runs that get to the second level untouched.
  const runBlitz = d.blitzers.length > 0;
  // Big plays: burst and moves, springing blocks, against the defense's pursuit.
  const springs = edge(avg(o.ol, (p) => p.ratings.impactBlocking));
  const chase = edge(avg(d.all, (p) => p.ratings.pursuit));

  let yards = Math.max(-5, rng.normal(RUN_BASE + 1.0 * line + 0.9 * runner - (runBlitz ? 0.3 : 0), runBlitz ? 3.8 : 3.2));
  const breakaway = clamp(
    0.035 + 0.02 * burst + 0.01 * wiggle + 0.015 * line + 0.008 * springs - 0.01 * chase + (runBlitz ? 0.015 : 0),
    0.01,
    0.12,
  );
  if (rng.chance(breakaway)) yards += 10 + exponential(rng, 14);

  const spot = spotBall(sit, yards);
  const tackler = spot.touchdown ? null : pickTackler(rng, d, spot.yardsGained);
  const outOfBounds = !spot.touchdown && direction !== "middle" && spot.yardsGained > 2 && rng.chance(0.18);

  const fumble = spot.touchdown || spot.safety ? null : rollFumble(rng, rusher, tackler, d, 0.011);
  const turnover = fumble?.lost ? fumbleTurnover(rng, fumble, d.all, spot.endYardline) : null;

  return {
    kind: "run",
    offense: ctx.offense.abbr,
    defense: ctx.defense.abbr,
    start: { ...sit },
    rusher: rusher.id,
    formation: formationInfo(f),
    direction,
    yardsGained: spot.yardsGained,
    endYardline: spot.endYardline,
    duration: Math.round(clamp(rng.normal(5, 1) + Math.max(0, spot.yardsGained) / 10, 3, 15)),
    stopReason: stopReasonFor({ ...spot, turnover, outOfBounds }),
    firstDown: spot.firstDown && !turnover,
    touchdown: spot.touchdown,
    safety: spot.safety,
    fumble,
    turnover,
    tackler: tackler?.id ?? null,
    penalty: null,
    outOfBounds,
  };
}
