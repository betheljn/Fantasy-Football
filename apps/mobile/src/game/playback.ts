// Prepares a game's plays for the field renderer: the sim's animation data,
// moved onto the real field for whichever end the offense attacks, and flattened
// into plain arrays that animation worklets can sample on the UI thread.
import {
  attacksRight,
  choreograph,
  describeGamePlay,
  formatClock,
  formatDownDistance,
  periodLabel,
  toFieldCoords,
  type GameResult,
  type PlayerLookup,
  type Role,
} from "@dynasty/sim";

/** Keyframes as parallel arrays (field coordinates, yards). */
export interface Track {
  t: number[];
  x: number[];
  y: number[];
}

export interface PreparedActor {
  id: string;
  side: "offense" | "defense";
  role: Role;
  jersey: number;
  track: Track;
}

export interface PreparedPlay {
  /** Index into game.plays. */
  index: number;
  duration: number;
  offense: string;
  defense: string;
  /** Field x the offense is heading toward: +1 right (toward 110), -1 left. */
  direction: 1 | -1;
  lineOfScrimmage: number;
  firstDownLine: number | null;
  actors: PreparedActor[];
  ball: Track & { z: number[] };
  caption: string;
  /** "Q2 8:32" and "2nd & 6 at NJ 34" at the snap. */
  clock: string;
  situation: string;
  /** Score after the play. */
  score: Record<string, number>;
}

/** Plays that have something to animate (timeouts and pre-snap flags don't). */
export function prepareGame(game: GameResult, who: PlayerLookup): PreparedPlay[] {
  const out: PreparedPlay[] = [];
  game.plays.forEach((p, index) => {
    const e = p.event;
    const anim = choreograph(e, `${game.seed}:${p.seq}`);
    if (!anim) return;
    const right = attacksRight(game.openingReceiver, anim.offense, p.quarter);
    const field = (x: number, y: number) => toFieldCoords({ x, y }, right);
    const line = (x: number) => field(x, 0).x;
    const toTrack = (keys: readonly { t: number; x: number; y: number }[]): Track => {
      const pts = keys.map((k) => field(k.x, k.y));
      return { t: keys.map((k) => k.t), x: pts.map((q) => q.x), y: pts.map((q) => q.y) };
    };
    const jersey = new Map<string, number>();
    try {
      for (const a of anim.actors) jersey.set(a.id, who(a.id).jersey);
    } catch {
      // Unknown player (shouldn't happen): leave the number off.
    }
    out.push({
      index,
      duration: anim.duration,
      offense: anim.offense,
      defense: anim.defense,
      direction: right ? 1 : -1,
      lineOfScrimmage: line(anim.lineOfScrimmage),
      // No line to gain on kicks.
      firstDownLine: anim.firstDownLine === null || e.kind === "kickoff" || e.kind === "punt" || e.kind === "field_goal" ? null : line(anim.firstDownLine),
      actors: anim.actors.map((a) => ({
        id: a.id,
        side: a.team === anim.offense ? "offense" : "defense",
        role: a.role,
        jersey: jersey.get(a.id) ?? 0,
        track: toTrack(a.track),
      })),
      ball: { ...toTrack(anim.ball), z: anim.ball.map((k) => k.z ?? 0) },
      caption: describeGamePlay(p, who),
      clock: `${p.quarter <= 4 ? `Q${p.quarter}` : periodLabel(p.quarter)} ${formatClock(e.start.clock)}`,
      situation: e.kind === "kickoff" || e.kind === "conversion" ? "" : formatDownDistance(e.start, e.offense, e.defense),
      score: p.score,
    });
  });
  return out;
}
