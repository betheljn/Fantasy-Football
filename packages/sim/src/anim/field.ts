// Field geometry and animation primitives shared by alignment and choreography.
//
// Coordinates are in yards, from the OFFENSE's point of view:
//   x: distance from the offense's own goal line (0) toward the goal it attacks (100).
//      End zones are -10..0 and 100..110.
//   y: distance from the sideline on the offense's left (0) to the right sideline (53.3).
// Use toFieldCoords() to place a play on the real field for whichever end a team attacks.
import type { PlayerId } from "../model/player.ts";

export const FIELD_WIDTH = 160 / 3; // 53.33 yards
export const FIELD_MIDDLE = FIELD_WIDTH / 2;
export const HASHES = { left: 23.58, middle: FIELD_MIDDLE, right: 29.75 };
export const BACK_OF_END_ZONE = 110;

/** Top speed used to make sure nobody moves faster than a player could (yards/second). */
export const MAX_PLAYER_SPEED = 9.5;

export interface Point {
  x: number;
  y: number;
}

export interface Keyframe extends Point {
  /** Seconds since the snap. */
  t: number;
  /** Ball height in yards (ball track only). */
  z?: number;
}

export type Role =
  | "QB" | "RB" | "FB" | "TE" | "WR" | "OL"
  | "DL" | "LB" | "CB" | "S"
  | "K" | "P" | "KR" | "COVER";

export interface Actor {
  id: PlayerId;
  team: string;
  role: Role;
  /** Keyframes in time order, starting at t = 0; the player holds the last position after it. */
  track: Keyframe[];
}

export interface PlayAnimation {
  /** Seconds from the snap to the end of the action. */
  duration: number;
  offense: string;
  defense: string;
  lineOfScrimmage: number;
  /** Line to gain (null on kicks and when it's goal to go). */
  firstDownLine: number | null;
  actors: Actor[];
  ball: Keyframe[];
}

export function clampToField(p: Point): Point {
  return {
    x: Math.max(100 - BACK_OF_END_ZONE + 0.5, Math.min(BACK_OF_END_ZONE - 0.5, p.x)),
    y: Math.max(0.5, Math.min(FIELD_WIDTH - 0.5, p.y)),
  };
}

/** Position on a track at time t (linear between keyframes, held before/after). */
export function sampleTrack(track: readonly Keyframe[], t: number): Keyframe {
  if (track.length === 0) throw new Error("empty track");
  if (t <= track[0]!.t) return track[0]!;
  for (let i = 1; i < track.length; i++) {
    const b = track[i]!;
    if (t <= b.t) {
      const a = track[i - 1]!;
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      const k: Keyframe = { t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      if (a.z !== undefined || b.z !== undefined) k.z = (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f;
      return k;
    }
  }
  return track[track.length - 1]!;
}

/** Everyone's position (and the ball's) at time t: what a renderer draws for one frame. */
export function positionsAt(anim: PlayAnimation, t: number): { players: Record<PlayerId, Point>; ball: Keyframe } {
  const players: Record<PlayerId, Point> = {};
  for (const a of anim.actors) {
    const k = sampleTrack(a.track, t);
    players[a.id] = { x: k.x, y: k.y };
  }
  return { players, ball: sampleTrack(anim.ball, t) };
}

/**
 * Map offense-relative coordinates onto the real field. Field x runs 0..100
 * left to right (end zones beyond), field y runs from the far sideline down.
 */
export function toFieldCoords(p: Point, attackingRight: boolean): Point {
  return attackingRight ? { x: p.x, y: p.y } : { x: 100 - p.x, y: FIELD_WIDTH - p.y };
}

/**
 * Which way a team attacks in a quarter. The opening receiver goes right in the
 * 1st and 3rd quarters and overtime; teams switch ends each quarter.
 */
export function attacksRight(openingReceiver: string, team: string, quarter: number): boolean {
  const oddQuarter = quarter % 2 === 1 || quarter >= 5;
  return (team === openingReceiver) === oddQuarter;
}

/** Incrementally builds a track, keeping every move within top speed. */
export class TrackBuilder {
  readonly track: Keyframe[];

  constructor(start: Point) {
    this.track = [{ t: 0, ...clampToField(start) }];
  }

  get last(): Keyframe {
    return this.track[this.track.length - 1]!;
  }

  /** Be at `p` at time t (callers make sure the pace is humanly possible). */
  to(t: number, p: Point): this {
    if (t <= this.last.t) return this;
    this.track.push({ t, ...clampToField(p) });
    return this;
  }

  /** Stand still until t. */
  hold(t: number): this {
    return this.to(t, this.last);
  }

  /** Head toward `p`, getting as far as top speed allows by time t. */
  toward(t: number, p: Point, speed = MAX_PLAYER_SPEED): this {
    const from = this.last;
    const dt = t - from.t;
    if (dt <= 0) return this;
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const dist = Math.hypot(dx, dy);
    const reach = speed * dt;
    const f = dist <= reach || dist === 0 ? 1 : reach / dist;
    return this.to(t, { x: from.x + dx * f, y: from.y + dy * f });
  }
}

/** Time needed to cover the distance between two points at a given speed. */
export function travelTime(a: Point, b: Point, speed = MAX_PLAYER_SPEED): number {
  return Math.hypot(b.x - a.x, b.y - a.y) / speed;
}
