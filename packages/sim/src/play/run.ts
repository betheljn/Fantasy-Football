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
import { defensePersonnel, offensePersonnel } from "./personnel.ts";

/** Share of designed runs by ball carrier. */
const CARRY_SHARE = { rb1: 0.76, rb2: 0.2, qb: 0.04 };

export function simulateRun(rng: Rng, ctx: PlayContext): RunPlayEvent {
  const { situation: sit } = ctx;
  const o = offensePersonnel(ctx.offense);
  const d = defensePersonnel(ctx.defense);

  const [rb1, rb2] = o.rbs;
  const carriers: Array<[Player, number]> = [[o.qb, CARRY_SHARE.qb]];
  if (rb1) carriers.push([rb1, CARRY_SHARE.rb1]);
  if (rb2) carriers.push([rb2, CARRY_SHARE.rb2]);
  const rusher = weightedPick(rng, carriers, ([, w]) => w)[0];
  const direction = pickDirection(rng);

  // Line battle: blockers vs run stoppers, then the runner's own ability.
  const block = avg(o.ol, (p) => p.ratings.runBlock) * 0.85 + o.te.ratings.runBlock * 0.15;
  const stop =
    avg(d.dl, (p) => p.ratings.runStop) * 0.55 +
    avg(d.lb, (p) => (p.ratings.runStop + p.ratings.tackling) / 2) * 0.45;
  const line = (block - stop) / 15 + HOME_FIELD.runLine * (ctx.homeField ?? 0);
  const r = rusher.ratings;
  const runner = edge((r.elusiveness + r.breakTackle + r.speed + r.awareness) / 4);

  let yards = Math.max(-5, rng.normal(3.25 + 1.0 * line + 0.8 * runner, 3.2));
  const breakaway = clamp(0.035 + 0.02 * edge(r.speed) + 0.015 * line, 0.01, 0.1);
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
    outOfBounds,
  };
}
