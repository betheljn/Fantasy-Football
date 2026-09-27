// Pre-snap alignment: where all 22 players line up, from the formation recorded
// on a play event. Pure geometry; no ratings or roster needed.
import type { PlayerId } from "../model/player.ts";
import type { FormationInfo } from "../play/events.ts";
import { COVERAGES, PACKAGES, PERSONNEL } from "../play/formation.ts";
import { FIELD_WIDTH, clampToField, type Point, type Role } from "./field.ts";

export interface Aligned extends Point {
  id: PlayerId;
  role: Role;
  side: "offense" | "defense";
}

/** Split a formation's player list back into roles (lists are stored in role order). */
export function formationRoles(f: FormationInfo) {
  const o = PERSONNEL[f.offense.personnel];
  const p = f.offense.players;
  let i = 0;
  const take = (n: number) => p.slice(i, (i += n));
  const qb = take(1)[0]!;
  const rbs = take(o.rb);
  const tes = take(o.te);
  const wrs = take(o.wr);
  const ol = take(5);

  const d = PACKAGES[f.defense.package];
  const q = f.defense.players;
  let j = 0;
  const takeD = (n: number) => q.slice(j, (j += n));
  const dl = takeD(d.dl);
  const lb = takeD(d.lb);
  const cb = takeD(d.cb);
  const s = takeD(d.s);
  return { qb, rbs, tes, wrs, ol, dl, lb, cb, s };
}

/** Lateral slots for receivers split out, by how many WRs there are. */
function receiverSpots(count: number, ballY: number): Array<{ y: number; slot: boolean }> {
  const wideLeft = { y: 6, slot: false };
  const wideRight = { y: FIELD_WIDTH - 6, slot: false };
  const slotRight = { y: Math.min(ballY + 8, FIELD_WIDTH - 10), slot: true };
  const slotLeft = { y: Math.max(ballY - 8, 10), slot: true };
  return [wideLeft, wideRight, slotRight, slotLeft].slice(0, count);
}

/**
 * Line everyone up. `los` is the line of scrimmage (offense-relative x) and
 * `ballY` where the ball is spotted between the hashes.
 */
export function alignFormation(f: FormationInfo, los: number, ballY: number): Aligned[] {
  const r = formationRoles(f);
  const out: Aligned[] = [];
  const put = (id: PlayerId, role: Role, side: Aligned["side"], x: number, y: number) =>
    out.push({ id, role, side, ...clampToField({ x, y }) });

  // --- offense (behind the ball, x < los) ---
  [-2.6, -1.3, 0, 1.3, 2.6].forEach((dy, k) => put(r.ol[k]!, "OL", "offense", los - 0.7, ballY + dy));
  const shotgun = f.offense.set === "shotgun";
  put(r.qb, "QB", "offense", shotgun ? los - 5 : los - 1.7, ballY);
  if (r.rbs.length === 2 && shotgun) {
    // Two backs in the gun: one on each side of the quarterback.
    put(r.rbs[1]!, "FB", "offense", los - 5, ballY - 1.8);
    put(r.rbs[0]!, "RB", "offense", los - 5, ballY + 1.8);
  } else if (r.rbs.length === 2) {
    put(r.rbs[1]!, "FB", "offense", los - 4.5, ballY);
    put(r.rbs[0]!, "RB", "offense", los - 7.5, ballY);
  } else if (shotgun) {
    put(r.rbs[0]!, "RB", "offense", los - 5, ballY + 1.8);
  } else {
    put(r.rbs[0]!, "RB", "offense", los - 7, ballY);
  }
  const teSpots = [
    { x: los - 0.8, y: ballY + 4 },
    { x: los - 0.8, y: ballY - 4 },
    { x: los - 1.8, y: ballY + 5.5 },
  ];
  r.tes.forEach((id, k) => put(id, "TE", "offense", teSpots[k]!.x, teSpots[k]!.y));
  const wrSpots = receiverSpots(r.wrs.length, ballY);
  r.wrs.forEach((id, k) => put(id, "WR", "offense", wrSpots[k]!.slot ? los - 1.5 : los - 0.8, wrSpots[k]!.y));

  // --- defense (across the ball, x > los) ---
  const dlSpots = r.dl.length === 5 ? [-3.8, -1.8, 0, 1.8, 3.8] : [-3.8, -1.3, 1.3, 3.8];
  r.dl.forEach((id, k) => put(id, "DL", "defense", los + 0.8, ballY + dlSpots[k]!));

  const blitzing = new Set(f.defense.blitzers);
  const lbSpots = r.lb.length === 3 ? [-3.5, 0, 3.5] : r.lb.length === 2 ? [-2.5, 2.5] : [0];
  r.lb.forEach((id, k) => put(id, "LB", "defense", blitzing.has(id) ? los + 2.5 : los + 4.5, ballY + lbSpots[k]!));

  // Corners line up over the receivers split out, pressed in man, off in zone.
  const shell = COVERAGES[f.defense.coverage];
  const cbDepth = shell.man ? 1.5 : 6;
  r.cb.forEach((id, k) => {
    const over = wrSpots[k];
    const y = over ? over.y : ballY + (k % 2 === 0 ? -7 : 7);
    put(id, "CB", "defense", blitzing.has(id) ? los + 3 : los + (over?.slot ? cbDepth + 1 : cbDepth), y);
  });

  // Safeties: two-high, single-high with one rolled down, or both down in Cover 0.
  r.s.forEach((id, k) => {
    if (blitzing.has(id)) return put(id, "S", "defense", los + 3.5, ballY + (k === 0 ? -4.5 : 4.5));
    if (r.s.length === 1) return put(id, "S", "defense", los + 6, ballY);
    if (shell.deepSafeties === 2) return put(id, "S", "defense", los + 12, ballY + (k === 0 ? -9 : 9));
    if (shell.deepSafeties === 1) {
      return k === 0 ? put(id, "S", "defense", los + 13, FIELD_WIDTH / 2) : put(id, "S", "defense", los + 7, ballY + 4);
    }
    return put(id, "S", "defense", los + 6, ballY + (k === 0 ? -5 : 5));
  });
  return out;
}
