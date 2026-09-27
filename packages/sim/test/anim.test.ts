import { describe, expect, it } from "vitest";
import {
  FIELD_WIDTH,
  MAX_PLAYER_SPEED,
  Rng,
  alignFormation,
  attacksRight,
  choreograph,
  generateTeams,
  positionsAt,
  sampleTrack,
  simulateGame,
  toFieldCoords,
  type PlayAnimation,
  type Team,
} from "../src/index.ts";

const GAMES = Array.from({ length: 25 }, (_, i) => {
  const [h, a] = generateTeams(new Rng(`anim-${i}`), 2) as [Team, Team];
  return simulateGame(h, a, i);
});
const PLAYS = GAMES.flatMap((g) => g.plays.map((p) => ({ g, p, anim: choreograph(p.event, `${g.seed}:${p.seq}`) })));
const scrimmage = PLAYS.filter(({ p }) => p.event.kind === "run" || p.event.kind === "pass");

const end = (anim: PlayAnimation, id: string) => {
  const t = anim.actors.find((a) => a.id === id)!.track;
  return t[t.length - 1]!;
};

describe("alignment", () => {
  it("lines up 22 players on the correct sides of the ball, in bounds, without overlapping", () => {
    for (const { p } of scrimmage.slice(0, 1500)) {
      if (p.event.kind !== "run" && p.event.kind !== "pass") continue;
      const los = p.event.start.yardline;
      const spots = alignFormation(p.event.formation, los, 26.7);
      expect(spots).toHaveLength(22);
      expect(new Set(spots.map((s) => s.id)).size).toBe(22);
      for (const s of spots) {
        if (s.side === "offense") expect(s.x).toBeLessThan(los);
        else if (los < 99) expect(s.x).toBeGreaterThan(los);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(FIELD_WIDTH);
      }
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y)).toBeGreaterThan(0.9);
        }
      }
    }
  });
});

describe("choreograph", () => {
  it("is deterministic", () => {
    for (const { g, p } of PLAYS.slice(0, 200)) {
      expect(choreograph(p.event, `${g.seed}:${p.seq}`)).toEqual(choreograph(p.event, `${g.seed}:${p.seq}`));
    }
  });

  it("animates every run and pass with all 22 players, and every kick", () => {
    for (const { p, anim } of PLAYS) {
      const k = p.event.kind;
      if (k === "run" || k === "pass") expect(anim!.actors).toHaveLength(22);
      if (k === "punt" || k === "kickoff" || k === "field_goal" || k === "kneel" || k === "spike") expect(anim).not.toBeNull();
      if (k === "timeout" || k === "penalty") expect(anim).toBeNull();
    }
  });

  it("tracks run forward in time and nobody moves faster than a player can", () => {
    for (const { anim } of PLAYS) {
      if (!anim) continue;
      for (const a of anim.actors) {
        expect(a.track[0]!.t).toBe(0);
        for (let i = 1; i < a.track.length; i++) {
          const [p, q] = [a.track[i - 1]!, a.track[i]!];
          expect(q.t).toBeGreaterThan(p.t);
          expect(Math.hypot(q.x - p.x, q.y - p.y) / (q.t - p.t)).toBeLessThanOrEqual(MAX_PLAYER_SPEED * 1.06);
        }
      }
    }
  });

  it("the ball carrier finishes where the play ended, with the tackler there", () => {
    for (const { p, anim } of scrimmage) {
      const e = p.event;
      if ((e.kind !== "run" && e.kind !== "pass") || e.turnover || !anim) continue;
      const carrier = e.kind === "run" ? e.rusher : e.outcome === "complete" ? e.target! : e.outcome === "sack" ? e.passer : null;
      if (!carrier) continue;
      const sack = e.kind === "pass" && e.outcome === "sack";
      const fin = sack ? sampleTrack(anim.actors.find((a) => a.id === carrier)!.track, anim.duration) : end(anim, carrier);
      if (e.touchdown) expect(fin.x).toBeGreaterThanOrEqual(100);
      else expect(Math.abs(fin.x - e.endYardline)).toBeLessThan(0.51);
      if (e.outOfBounds) expect(Math.min(fin.y, FIELD_WIDTH - fin.y)).toBeLessThan(1);
      if (e.tackler && !e.touchdown) {
        const t = end(anim, e.tackler);
        expect(Math.hypot(t.x - fin.x, t.y - fin.y)).toBeLessThan(1.5);
      }
      // The ball ends with the carrier.
      const ball = anim.ball[anim.ball.length - 1]!;
      expect(Math.hypot(ball.x - fin.x, ball.y - fin.y)).toBeLessThan(0.51);
    }
  });

  it("interceptions end with the defender where the return ended", () => {
    const picks = scrimmage.filter(({ p }) => p.event.kind === "pass" && p.event.outcome === "interception");
    expect(picks.length).toBeGreaterThan(5);
    for (const { p, anim } of picks) {
      if (p.event.kind !== "pass") continue;
      const to = p.event.turnover!;
      const fin = end(anim!, to.by);
      if (to.touchback) expect(fin.x).toBeGreaterThanOrEqual(100);
      else if (to.touchdown) expect(fin.x).toBeLessThanOrEqual(0);
      else expect(Math.abs(fin.x - (100 - to.endYardline))).toBeLessThan(0.51);
    }
  });

  it("positionsAt gives a full frame at any time", () => {
    const { anim } = scrimmage[0]!;
    for (const t of [0, anim!.duration / 2, anim!.duration, anim!.duration + 5]) {
      const frame = positionsAt(anim!, t);
      expect(Object.keys(frame.players)).toHaveLength(22);
      expect(Number.isFinite(frame.ball.x)).toBe(true);
    }
  });
});

describe("field orientation", () => {
  it("teams switch ends each quarter and mirror onto the real field", () => {
    expect(attacksRight("IN", "IN", 1)).toBe(true);
    expect(attacksRight("IN", "IN", 2)).toBe(false);
    expect(attacksRight("IN", "WV", 1)).toBe(false);
    expect(attacksRight("IN", "WV", 4)).toBe(true);
    expect(toFieldCoords({ x: 25, y: 10 }, true)).toEqual({ x: 25, y: 10 });
    const flipped = toFieldCoords({ x: 25, y: 10 }, false);
    expect(flipped.x).toBe(75);
    expect(flipped.y).toBeCloseTo(FIELD_WIDTH - 10);
  });
});
