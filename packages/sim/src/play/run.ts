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

/** Rushing yards per extra blocker (or per extra defender in the box, if negative). */
export const RUN_NUMBERS_EDGE = 0.3;
/** Mean rushing yards before any matchup edges. */
const RUN_BASE = 3.65;

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
  const blockers = runBlockers(o);
  const box = boxDefenders(d);
  const block = avg(blockers, (p) => p.ratings.runBlock);
  const stop = avg(box, (p) => (p.position === "DL" ? p.ratings.runStop : (p.ratings.runStop + p.ratings.tackling) / 2));
  const numbers = blockers.length - box.length;
  const line = (block - stop) / 15 + RUN_NUMBERS_EDGE * numbers + HOME_FIELD.runLine * (ctx.homeField ?? 0);
  const r = rusher.ratings;
  const runner = edge((r.elusiveness + r.breakTackle + r.speed + r.awareness) / 4);
  // A run blitz is boom-or-bust: more stuffs, but more runs that get to the second level untouched.
  const runBlitz = d.blitzers.length > 0;

  let yards = Math.max(-5, rng.normal(RUN_BASE + 1.0 * line + 0.8 * runner - (runBlitz ? 0.3 : 0), runBlitz ? 3.8 : 3.2));
  const breakaway = clamp(0.035 + 0.02 * edge(r.speed) + 0.015 * line + (runBlitz ? 0.015 : 0), 0.01, 0.12);
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
