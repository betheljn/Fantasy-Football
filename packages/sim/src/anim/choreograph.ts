// Choreography: turn a play event into movement tracks for a 2D renderer.
//
// The sim has already decided what happened; this only works out where
// everyone was while it happened, consistent with the event (the ball carrier
// ends where the play ended, the tackler meets him there, a sacked QB goes down
// at the sack spot). Deterministic: the same event and seed give the same tracks.
import type { PlayerId } from "../model/player.ts";
import { Rng } from "../rng.ts";
import type { SpecialUnits, UnitMember } from "../play/special.ts";
import type {
  ConversionEvent,
  FieldGoalEvent,
  KickoffEvent,
  PassPlayEvent,
  PlayEvent,
  PuntEvent,
  RunPlayEvent,
  ScrimmagePlayEvent,
  Situation,
} from "../play/events.ts";
import { alignFormation, formationRoles, type Aligned } from "./align.ts";
import {
  FIELD_MIDDLE,
  FIELD_WIDTH,
  HASHES,
  TrackBuilder,
  clampToField,
  travelTime,
  type Actor,
  type Keyframe,
  type PlayAnimation,
  type Point,
  type Role,
} from "./field.ts";

const BALL_SPEED = 20; // yards/second on a pass
const CARRIER_SPEED = 8.5; // ball carriers in the open field
const PURSUIT_SPEED = 7;

/** Build the animation for one event, or null for events with nothing to show (timeouts, pre-snap flags). */
export function choreograph(e: PlayEvent, seed: number | string): PlayAnimation | null {
  const rng = new Rng(`anim:${seed}`);
  switch (e.kind) {
    case "run":
    case "pass":
      return scrimmage(rng, e);
    case "conversion":
      return e.play ? scrimmage(rng, e.play) : e.units ? extraPoint(rng, e) : null;
    case "kneel":
    case "spike":
      return qbOnly(rng, e.kind, e.qb, e.offense, e.defense, e.start);
    case "field_goal":
      return fieldGoal(rng, e);
    case "punt":
      return punt(rng, e);
    case "kickoff":
      return kickoff(rng, e);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Scrimmage plays

interface Scene {
  e: ScrimmagePlayEvent;
  rng: Rng;
  los: number;
  ballY: number;
  aligned: Map<PlayerId, Aligned>;
  tracks: Map<PlayerId, TrackBuilder>;
  roles: ReturnType<typeof formationRoles>;
  ball: Keyframe[];
}

function scrimmage(rng: Rng, e: ScrimmagePlayEvent): PlayAnimation {
  const los = e.start.yardline;
  const ballY = rng.pick([HASHES.left, HASHES.middle, HASHES.right]);
  const aligned = new Map(alignFormation(e.formation, los, ballY).map((a) => [a.id, a]));
  const scene: Scene = {
    e,
    rng,
    los,
    ballY,
    aligned,
    tracks: new Map([...aligned.values()].map((a) => [a.id, new TrackBuilder(a)])),
    roles: formationRoles(e.formation),
    ball: [{ t: 0, x: los, y: ballY, z: 0.2 }],
  };
  // Snap: the ball goes from the center to the quarterback.
  const qb = aligned.get(scene.roles.qb)!;
  scene.ball.push({ t: e.formation.offense.set === "shotgun" ? 0.4 : 0.15, x: qb.x, y: qb.y, z: 1 });

  if (e.kind === "run") run(scene, e);
  else pass(scene, e);
  return finish(scene);
}

function track(s: Scene, id: PlayerId): TrackBuilder {
  const t = s.tracks.get(id);
  if (!t) throw new Error(`${id} is not on the field`);
  return t;
}

function start(s: Scene, id: PlayerId): Point {
  return s.aligned.get(id)!;
}

/** Where a gain ends, offense-relative. Touchdowns carry a couple of yards into the end zone. */
function endPoint(s: Scene, lateral: number): Point {
  const e = s.e;
  const x = e.touchdown ? 100 + 2 + s.rng.next() * 3 : e.endYardline;
  const y = e.outOfBounds ? (lateral < FIELD_MIDDLE ? 0.5 : FIELD_WIDTH - 0.5) : lateral;
  return clampToField({ x, y });
}

/** Ball-carrier finish: tackler meets him at the end spot; everyone else pursues. */
function finishCarry(s: Scene, carrier: PlayerId, from: Point, fromT: number, end: Point): number {
  let tEnd = Math.max(s.e.duration, fromT + travelTime(from, end, CARRIER_SPEED));
  const tackler = s.e.tackler && s.tracks.has(s.e.tackler) ? s.e.tackler : null;
  if (tackler) {
    // Make sure the tackler can physically get there.
    tEnd = Math.max(tEnd, track(s, tackler).last.t + travelTime(track(s, tackler).last, end) * 1.05);
  }
  track(s, carrier).to(tEnd, end);
  addBall(s, tEnd, end, 1);
  if (tackler) track(s, tackler).to(tEnd, { x: end.x + 0.8, y: end.y + (s.rng.next() - 0.5) });
  pursue(s, end, fromT, tEnd, [carrier, ...(tackler ? [tackler] : [])]);
  return tEnd;
}

/**
 * From `from` until `t`, defenders not already scripted pursue the ball;
 * offensive players trail the play (linemen and the QB barely move).
 */
function pursue(s: Scene, target: Point, from: number, t: number, skip: PlayerId[]): void {
  const done = new Set(skip);
  for (const [id, b] of s.tracks) {
    if (done.has(id)) continue;
    const a = s.aligned.get(id)!;
    const speed = a.side === "defense" ? PURSUIT_SPEED : a.role === "OL" || a.role === "QB" ? 1.5 : 4;
    b.hold(from).toward(t, { x: target.x + (a.side === "defense" ? 1.5 : -2), y: target.y + (s.rng.next() - 0.5) * 6 }, speed);
  }
}

function addBall(s: Scene, t: number, p: Point, z: number): void {
  const last = s.ball[s.ball.length - 1]!;
  if (t > last.t) s.ball.push({ t, x: p.x, y: p.y, z });
}

/** After the play ends, a turnover return: the new ball carrier heads the other way. */
function turnoverReturn(s: Scene, spot: Point, t: number): number {
  const to = s.e.turnover;
  if (!to || !s.tracks.has(to.by)) return t;
  const end = clampToField({ x: to.touchback ? Math.max(spot.x, 100.5) : 100 - to.endYardline - (to.touchdown ? 3 : 0), y: spot.y + s.rng.normal(0, 6) });
  const recoverer = track(s, to.by);
  const tGot = Math.max(t + 0.3, recoverer.last.t + travelTime(recoverer.last, spot) * 1.05);
  recoverer.to(tGot, spot);
  addBall(s, tGot, spot, 1);
  const tEnd = tGot + travelTime(spot, end, CARRIER_SPEED) + 0.2;
  recoverer.to(tEnd, end);
  addBall(s, tEnd, end, 1);
  pursue(s, end, tGot, tEnd, [to.by]);
  return tEnd;
}

function run(s: Scene, e: RunPlayEvent): void {
  const { rng, los, ballY, roles } = s;
  const dir = e.direction === "left" ? -1 : e.direction === "right" ? 1 : 0;
  const hole = { x: los, y: ballY + dir * (3 + rng.next() * 3) + rng.normal(0, 0.8) };
  const qb = start(s, roles.qb);

  // Handoff (or the QB keeps it).
  let tHole: number;
  if (e.rusher !== roles.qb) {
    const mesh = { x: qb.x - (e.formation.offense.set === "shotgun" ? 0 : 1.5), y: qb.y + (dir || 1) * 0.8 };
    const tMesh = Math.max(0.8, travelTime(start(s, e.rusher), mesh, 6));
    track(s, e.rusher).to(tMesh, mesh);
    track(s, roles.qb).to(tMesh, { x: qb.x - 0.5, y: qb.y }).to(tMesh + 1, { x: qb.x - 2, y: qb.y - (dir || 1) });
    addBall(s, tMesh, mesh, 1);
    tHole = tMesh + travelTime(mesh, hole, 7);
  } else {
    tHole = travelTime(qb, hole, 7) + 0.4;
  }
  track(s, e.rusher).to(tHole, hole);
  addBall(s, tHole, hole, 1);

  // Blocking up front: the line fires out, lead blockers head for the hole, receivers block downfield.
  for (const id of roles.ol) track(s, id).toward(1.2, { x: start(s, id).x + 1.5, y: start(s, id).y }, 3);
  for (const id of [...roles.tes, ...roles.rbs.filter((r) => r !== e.rusher)]) {
    track(s, id).toward(tHole, { x: hole.x + 1.5, y: hole.y + rng.normal(0, 1.5) }, 6);
  }
  for (const id of roles.wrs) track(s, id).toward(2, { x: start(s, id).x + 4, y: start(s, id).y }, 5);
  for (const id of roles.dl) track(s, id).toward(1.0, { x: los + 0.2, y: start(s, id).y + (hole.y - start(s, id).y) * 0.3 }, 3);
  for (const id of [...roles.lb, ...roles.s, ...roles.cb]) track(s, id).toward(tHole, { x: los + 2, y: hole.y }, 5);

  const end = endPoint(s, hole.y + rng.normal(0, 3));
  const tEnd = finishCarry(s, e.rusher, hole, tHole, end);
  turnoverReturn(s, end, tEnd);
}

function pass(s: Scene, e: PassPlayEvent): void {
  const { rng, los, ballY, roles } = s;
  const qb0 = start(s, roles.qb);
  const shotgun = e.formation.offense.set === "shotgun";
  const setPoint = { x: qb0.x - (shotgun ? 1.5 : 5), y: qb0.y };
  const tSet = shotgun ? 0.9 : 1.3;
  track(s, roles.qb).to(tSet, setPoint);
  addBall(s, tSet, setPoint, 1.5);

  // Protection: the line kicks back; the rush closes on the quarterback.
  for (const id of roles.ol) track(s, id).toward(1.0, { x: start(s, id).x - 1.5, y: start(s, id).y }, 3);
  const rushers = new Set(e.formation.defense.rushers);
  const blitzers = new Set(e.formation.defense.blitzers);

  if (e.outcome === "sack") {
    const sackSpot = clampToField({ x: e.endYardline, y: setPoint.y + rng.normal(0, 1.5) });
    const sacker = e.sackedBy!;
    const tSack = Math.max(2.2 + rng.next() * 1.2, track(s, sacker).last.t + travelTime(start(s, sacker), sackSpot) * 1.05, tSet + 0.3);
    track(s, roles.qb).to(tSack, sackSpot);
    track(s, sacker).to(tSack, { x: sackSpot.x + 0.7, y: sackSpot.y });
    addBall(s, tSack, sackSpot, 0.5);
    for (const id of rushers) if (id !== sacker) track(s, id).toward(tSack, sackSpot, blitzers.has(id) ? 6 : 3);
    runRoutes(s, e, tSack, null);
    pursue(s, sackSpot, tSack, tSack + 0.5, [roles.qb, sacker, ...rushers, ...roles.ol]);
    const tEnd = Math.max(e.duration, tSack + 0.5);
    track(s, roles.qb).hold(tEnd);
    turnoverReturn(s, sackSpot, tEnd);
    return;
  }

  // Throw timing depends on depth; pressure speeds it up.
  const depth = e.airYards >= 20 ? 3.1 : e.airYards >= 10 ? 2.7 : e.airYards > 0 ? 2.2 : 1.3;
  const tThrow = Math.max(tSet + 0.2, depth - (e.pressured ? 0.35 : 0) + rng.normal(0, 0.15));
  track(s, roles.qb).hold(tThrow);
  addBall(s, tThrow, setPoint, 2);
  for (const id of rushers) {
    // A pressured QB has someone in his face by the throw; otherwise the rush is held up.
    const close = e.pressured && id === [...rushers][0] ? 1 : 2.5;
    track(s, id).toward(tThrow, { x: setPoint.x + close, y: setPoint.y + (start(s, id).y - setPoint.y) * 0.3 }, blitzers.has(id) ? 6 : 3);
  }

  // Catch point: depth from the event, width from the throw direction.
  const target = e.target!;
  const tgt0 = start(s, target);
  const endZoneThrow = e.touchdown && e.airYards === 100 - los;
  const catchX = endZoneThrow ? 100 + 1 + rng.next() * 6 : los + e.airYards;
  // The break goes the way the ball was thrown, from wherever the receiver lined up.
  const breakWidth = e.airYards <= 0 ? 2 : 3 + rng.next() * 6;
  const catchY =
    e.direction === "left"
      ? tgt0.y - breakWidth
      : e.direction === "right"
        ? tgt0.y + breakWidth
        : tgt0.y + (FIELD_MIDDLE - tgt0.y) * (0.3 + rng.next() * 0.4);
  const catchPt = clampToField({ x: catchX, y: catchY });
  // The receiver's route: a stem upfield, then the break to the catch point.
  const stem = { x: Math.max(tgt0.x, los + Math.max(0, e.airYards) * 0.7), y: tgt0.y };
  const tStem = Math.max(0.5, travelTime(tgt0, stem) * 1.1);
  const tCatch = Math.max(tThrow + travelTime(setPoint, catchPt, BALL_SPEED) + 0.1, tStem + travelTime(stem, catchPt) * 1.1);
  track(s, target).to(tStem, stem).to(tCatch, catchPt);
  // Ball flight, with an arc for anything downfield.
  const arcPeak = 2 + Math.max(0, e.airYards) * 0.25;
  const mid = { x: (setPoint.x + catchPt.x) / 2, y: (setPoint.y + catchPt.y) / 2 };
  addBall(s, (tThrow + tCatch) / 2, mid, arcPeak);

  runRoutes(s, e, tCatch, target);
  // The defender on the target stays in his hip pocket.
  if (e.coverage && s.tracks.has(e.coverage)) shadow(s, e.coverage, target, 1.2);

  if (e.outcome === "incomplete") {
    const miss = e.incompleteReason === "overthrown" ? { x: catchPt.x + 4, y: catchPt.y + rng.normal(0, 2) } : catchPt;
    addBall(s, tCatch, clampToField(miss), 1);
    addBall(s, tCatch + 0.4, clampToField(miss), 0);
    pursue(s, catchPt, tCatch, tCatch + 1.2, [target, ...(e.coverage ? [e.coverage] : [])]);
    for (const b of s.tracks.values()) b.hold(Math.max(e.duration, tCatch + 1.2));
    return;
  }

  if (e.outcome === "interception") {
    const picker = e.turnover!.by;
    const tPick = Math.max(tCatch, track(s, picker).last.t + travelTime(track(s, picker).last, catchPt) * 1.05);
    track(s, picker).to(tPick, catchPt);
    addBall(s, tPick, catchPt, 1.5);
    const end = clampToField({
      x: e.turnover!.touchback ? Math.max(catchPt.x, 100.5) : 100 - e.turnover!.endYardline - (e.turnover!.touchdown ? 3 : 0),
      y: catchPt.y + rng.normal(0, 6),
    });
    const tEnd = tPick + travelTime(catchPt, end, CARRIER_SPEED) + 0.2;
    track(s, picker).to(tEnd, end);
    addBall(s, tEnd, end, 1);
    track(s, target).toward(tEnd, end, PURSUIT_SPEED);
    pursue(s, end, tPick, tEnd, [picker, target]);
    return;
  }

  // Complete: run after the catch.
  addBall(s, tCatch, catchPt, 1.2);
  const end = endPoint(s, catchPt.y + rng.normal(0, 3));
  const tEnd = finishCarry(s, target, catchPt, tCatch, end);
  turnoverReturn(s, end, tEnd);
}

/** Everyone else in the pattern runs a generic route; defenders cover them. */
function runRoutes(s: Scene, e: PassPlayEvent, until: number, target: PlayerId | null): void {
  const { rng, los, roles } = s;
  const eligible = [...roles.wrs, ...roles.tes, ...roles.rbs].filter((id) => id !== target);
  for (const id of eligible) {
    const a = start(s, id);
    const isBack = s.aligned.get(id)!.role === "RB" || s.aligned.get(id)!.role === "FB";
    const depth = isBack ? 2 + rng.next() * 4 : 5 + rng.next() * 15;
    const drift = (rng.next() - 0.5) * 12;
    track(s, id).toward(until * 0.6, { x: los + depth * 0.7, y: a.y }).toward(until, { x: los + depth, y: a.y + drift });
  }
  // Man: corners mirror their receiver. Zone: drop to landmarks. Rushers are already scripted.
  const rushing = new Set(e.formation.defense.rushers);
  const man = e.formation.defense.coverage === "cover_0" || e.formation.defense.coverage === "cover_1";
  roles.cb.forEach((id, k) => {
    if (rushing.has(id) || id === e.coverage) return;
    const wr = roles.wrs[k];
    if (man && wr && wr !== target) shadow(s, id, wr, 1.5);
    else track(s, id).toward(until, { x: los + 10, y: start(s, id).y }, 6);
  });
  for (const id of roles.lb) if (!rushing.has(id) && id !== e.coverage) track(s, id).toward(until, { x: los + 6, y: start(s, id).y }, 5);
  for (const id of roles.s) if (!rushing.has(id) && id !== e.coverage) track(s, id).toward(until, { x: start(s, id).x + 3, y: start(s, id).y }, 5);
}

/** `id` follows `leader` a step behind (downfield side), within top speed. */
function shadow(s: Scene, id: PlayerId, leader: PlayerId, gap: number): void {
  const lead = track(s, leader).track;
  const b = track(s, id);
  for (const k of lead.slice(1)) b.toward(k.t, { x: k.x + gap, y: k.y + 0.5 });
}

function finish(s: Scene): PlayAnimation {
  const e = s.e;
  const actors: Actor[] = [...s.aligned.values()].map((a) => ({
    id: a.id,
    team: a.side === "offense" ? e.offense : e.defense,
    role: a.role,
    track: s.tracks.get(a.id)!.track,
  }));
  return build(e.offense, e.defense, e.start, actors, s.ball);
}

function build(offense: string, defense: string, sit: Situation, actors: Actor[], ball: Keyframe[]): PlayAnimation {
  const duration = Math.max(...actors.map((a) => a.track[a.track.length - 1]!.t), ball[ball.length - 1]!.t);
  const goalToGo = sit.yardline + sit.distance >= 100;
  return {
    duration,
    offense,
    defense,
    lineOfScrimmage: sit.yardline,
    firstDownLine: goalToGo ? null : sit.yardline + sit.distance,
    actors,
    ball,
  };
}

// ---------------------------------------------------------------------------
// Plays without a recorded formation: just the quarterback, or the kicking unit's key players.

function qbOnly(rng: Rng, kind: "kneel" | "spike", qb: PlayerId, offense: string, defense: string, sit: Situation): PlayAnimation {
  const ballY = rng.pick([HASHES.left, HASHES.middle, HASHES.right]);
  const los = sit.yardline;
  const t = new TrackBuilder({ x: los - 1.2, y: ballY });
  const ball: Keyframe[] = [{ t: 0, x: los, y: ballY, z: 0.2 }, { t: 0.15, x: los - 1.2, y: ballY, z: 1 }];
  if (kind === "kneel") {
    t.to(1.2, { x: los - 2, y: ballY }).hold(2);
    ball.push({ t: 1.2, x: los - 2, y: ballY, z: 0.5 });
  } else {
    t.hold(1);
    ball.push({ t: 0.6, x: los - 1, y: ballY, z: 0 });
  }
  return build(offense, defense, sit, [{ id: qb, team: offense, role: "QB", track: t.track }], ball);
}

function fieldGoal(rng: Rng, e: FieldGoalEvent): PlayAnimation {
  const los = e.start.yardline;
  const ballY = rng.pick([HASHES.left, HASHES.middle, HASHES.right]);
  const hold = { x: los - 7, y: ballY };
  const kicker = new TrackBuilder({ x: hold.x - 2.5, y: ballY - 2 }).hold(0.8).to(1.3, { x: hold.x - 0.5, y: ballY - 0.3 });
  const ball: Keyframe[] = [{ t: 0, x: los, y: ballY, z: 0.2 }, { t: 0.8, ...hold, z: 0.1 }];
  if (e.blocked) {
    ball.push({ t: 1.5, x: los - 1, y: ballY, z: 1.5 }, { t: 2.2, x: los - 4, y: ballY + rng.normal(0, 3), z: 0 });
  } else {
    const wide = e.made ? rng.normal(0, 1) : (rng.next() < 0.5 ? -1 : 1) * (3.5 + rng.next() * 3);
    const posts = { x: 110, y: FIELD_MIDDLE + wide };
    const tArrive = 1.3 + travelTime(hold, posts, 25);
    ball.push({ t: (1.3 + tArrive) / 2, x: (hold.x + posts.x) / 2, y: (hold.y + posts.y) / 2, z: 9 }, { t: tArrive, ...posts, z: e.made ? 5 : 3 });
  }
  const actors: Actor[] = [{ id: e.kicker, team: e.offense, role: "K", track: kicker.track }];
  if (e.units) actors.push(...scrimmageKickUnits(rng, e.units, e.offense, e.defense, los, ballY, hold, e.blocked ? (e.blockedBy ?? null) : null, new Set([e.kicker])));
  return build(e.offense, e.defense, e.start, actors, ball);
}

/** An extra point: a short field goal from the 15, with both units. */
function extraPoint(rng: Rng, e: ConversionEvent): PlayAnimation {
  const los = e.start.yardline;
  const ballY = HASHES.middle;
  const hold = { x: los - 7, y: ballY };
  const kicker = new TrackBuilder({ x: hold.x - 2.5, y: ballY - 2 }).hold(0.8).to(1.3, { x: hold.x - 0.5, y: ballY - 0.3 });
  const ball: Keyframe[] = [{ t: 0, x: los, y: ballY, z: 0.2 }, { t: 0.8, ...hold, z: 0.1 }];
  if (e.blocked) ball.push({ t: 1.5, x: los - 1, y: ballY, z: 1.5 }, { t: 2.2, x: los - 4, y: ballY + rng.normal(0, 3), z: 0 });
  else {
    const posts = { x: 110, y: FIELD_MIDDLE + (e.success ? rng.normal(0, 1) : (rng.next() < 0.5 ? -1 : 1) * 4) };
    const tArrive = 1.3 + travelTime(hold, posts, 25);
    ball.push({ t: (1.3 + tArrive) / 2, x: (hold.x + posts.x) / 2, y: ballY, z: 8 }, { t: tArrive, ...posts, z: 5 });
  }
  const actors: Actor[] = [];
  if (e.kicker) actors.push({ id: e.kicker, team: e.offense, role: "K", track: kicker.track });
  actors.push(...scrimmageKickUnits(rng, e.units!, e.offense, e.defense, los, ballY, hold, e.blocked ? (e.blockedBy ?? null) : null, new Set(e.kicker ? [e.kicker] : [])));
  return build(e.offense, e.defense, { ...e.start, distance: 100 }, actors, ball);
}

/** Spread players across `n` spots from `lo` to `hi`. */
const spread = (i: number, n: number, lo: number, hi: number) => (n <= 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (n - 1));

/** Members of one role, in order. */
const ofRole = (members: readonly UnitMember[], ...roles: string[]) => members.filter((m) => roles.includes(m.role));

/**
 * The protection and the rush on a field goal or extra point: a wall at the
 * line, a holder and a snapper, the rush pushing in and the edges curling at
 * the kick. The blocker (if any) gets there as the ball comes off the foot.
 */
function scrimmageKickUnits(rng: Rng, u: SpecialUnits, offense: string, defense: string, los: number, ballY: number, hold: Point, blockedBy: PlayerId | null, skip: Set<PlayerId>): Actor[] {
  const actors: Actor[] = [];
  const add = (m: UnitMember, team: string, t: TrackBuilder, role: Role = m.role === "COVER" ? "COVER" : (m.role as Role)) => {
    if (skip.has(m.id)) return;
    skip.add(m.id);
    actors.push({ id: m.id, team, role, track: t.track });
  };
  // Kicking side: snapper, a wall of six, two ends, the holder.
  for (const m of ofRole(u.kicking, "LS")) add(m, offense, new TrackBuilder({ x: los - 0.4, y: ballY }).hold(0.05).to(1.4, { x: los - 1, y: ballY }).hold(2.2));
  ofRole(u.kicking, "OL").forEach((m, i) => {
    const y = ballY + [-1.3, 1.3, -2.6, 2.6, -3.9, 3.9][i % 6]! ;
    add(m, offense, new TrackBuilder({ x: los - 0.6, y }).hold(0.05).to(1.4, { x: los - 1.4, y }).hold(2.2), "OL");
  });
  ofRole(u.kicking, "TE").forEach((m, i) => {
    const y = ballY + (i % 2 ? 5.2 : -5.2);
    add(m, offense, new TrackBuilder({ x: los - 1, y }).hold(0.05).to(1.4, { x: los - 2.2, y: y + (i % 2 ? -0.8 : 0.8) }).hold(2.2), "TE");
  });
  for (const m of ofRole(u.kicking, "H")) add(m, offense, new TrackBuilder({ x: hold.x, y: hold.y + 0.6 }).hold(2.2), "H");
  for (const m of u.kicking) add(m, offense, new TrackBuilder({ x: los - 2, y: ballY + rng.normal(0, 4) }).hold(2.2), "OL");
  // Block side: five down linemen, linebackers on the edges and over the middle, corners off the edge, a safety back.
  const kickPoint = { x: hold.x + 1.2, y: ballY };
  if (blockedBy) {
    const m = u.receiving.find((x) => x.id === blockedBy);
    const start = { x: los + 0.9, y: ballY + rng.normal(0, 1.5) };
    if (m) add(m, defense, new TrackBuilder(start).hold(0.05).to(1.32, kickPoint).to(2.2, { x: kickPoint.x - 2, y: ballY + rng.normal(0, 2) }), m.role === "LB" ? "LB" : "DL");
  }
  ofRole(u.receiving, "DL").forEach((m, i, all) => {
    const y = ballY + spread(i, all.length, -3.4, 3.4);
    add(m, defense, new TrackBuilder({ x: los + 0.9, y }).hold(0.05).to(1.4, { x: los - 0.2, y }).hold(2.2), "DL");
  });
  ofRole(u.receiving, "LB").forEach((m, i) => {
    if (i === 2) {
      // The leaper over the middle.
      add(m, defense, new TrackBuilder({ x: los + 4, y: ballY }).hold(0.05).to(1.3, { x: los + 0.6, y: ballY }).hold(2.2), "LB");
      return;
    }
    const side = i % 2 ? 1 : -1;
    add(m, defense, new TrackBuilder({ x: los + 1.1, y: ballY + side * 6 }).hold(0.05).toward(1.45, { x: kickPoint.x + 1.5, y: ballY + side * 2.2 }, 7.5).hold(2.2), "LB");
  });
  ofRole(u.receiving, "CB").forEach((m, i) => {
    const side = i % 2 ? 1 : -1;
    add(m, defense, new TrackBuilder({ x: los + 1, y: ballY + side * 8.5 }).hold(0.05).toward(1.5, { x: kickPoint.x + 2, y: ballY + side * 3 }, 8).hold(2.2), "CB");
  });
  for (const m of ofRole(u.receiving, "S")) add(m, defense, new TrackBuilder({ x: los + 11, y: ballY }).hold(1).to(2.2, { x: los + 13, y: ballY }), "S");
  for (const m of u.receiving) add(m, defense, new TrackBuilder({ x: los + 2, y: ballY + rng.normal(0, 5) }).hold(2.2), "LB");
  return actors;
}

/** Punts and kickoffs share this: ball in the air, the returner, a coverage tackler. */
function kickPlay(
  rng: Rng,
  e: PuntEvent | KickoffEvent,
  kickerId: PlayerId,
  kickerRole: Role,
  kickerStart: Point,
  kickAt: Point,
  tKick: number,
  landing: Point,
  hang: number,
  units?: (plan: KickPlan) => Actor[],
): PlayAnimation {
  const actors: Actor[] = [];
  let end: Point | null = null;
  let tEndAll = tKick + hang + 0.8;
  const kicker = new TrackBuilder(kickerStart).to(tKick, kickAt);
  actors.push({ id: kickerId, team: e.offense, role: kickerRole, track: kicker.track });
  const ball: Keyframe[] = [{ t: 0, ...kickerStart, z: 0.2 }, { t: tKick, ...kickAt, z: 1 }];
  const tLand = tKick + hang;
  ball.push({ t: tKick + hang / 2, x: (kickAt.x + landing.x) / 2, y: (kickAt.y + landing.y) / 2, z: 15 }, { t: tLand, ...landing, z: 1 });

  if (e.returner && !e.touchback) {
    const r = new TrackBuilder({ x: landing.x + 3, y: landing.y + rng.normal(0, 2) }).to(tLand, landing);
    actors.push({ id: e.returner, team: e.defense, role: "KR", track: r.track });
    const recoveredByKickers = e.recoveredByKickingTeam;
    // Where the ball ends up, in the kicking team's frame.
    const endX = recoveredByKickers ? e.nextYardline : 100 - e.nextYardline;
    const endPt = clampToField({ x: e.touchdown ? -3 : endX, y: landing.y + rng.normal(0, 8) });
    const fairCatch = "fairCatch" in e && e.fairCatch;
    if (!fairCatch && !("muffed" in e && e.muffed)) {
      const tEnd = Math.max(tLand + 0.5, tLand + travelTime(landing, endPt, CARRIER_SPEED));
      end = endPt;
      tEndAll = tEnd;
      r.to(tEnd, endPt);
      ball.push({ t: tEnd, ...endPt, z: 1 });
      if (e.tackler) {
        const cover = new TrackBuilder({ x: kickAt.x + 5, y: landing.y + rng.normal(0, 10) });
        cover.to(tEnd, { x: endPt.x - 0.8, y: endPt.y });
        actors.push({ id: e.tackler, team: e.offense, role: "COVER", track: cover.track });
      }
    } else {
      r.hold(tLand + 1);
    }
  } else {
    ball.push({ t: tLand + 0.8, x: landing.x + 2, y: landing.y, z: 0 });
  }
  if (units) {
    const key = new Set(actors.map((a) => a.id));
    actors.push(...units({ landing, tKick, tLand, end, tEnd: tEndAll, skip: new Set(key) }));
    elevenEach(actors, e, key, landing, tLand);
  }
  return build(e.offense, e.defense, e.start, actors, ball);
}

/**
 * Exactly eleven a side: a tackler from outside the unit takes the place of
 * one of its coverage players, and a returner with nothing to return still
 * stands deep.
 */
function elevenEach(actors: Actor[], e: PuntEvent | KickoffEvent, key: ReadonlySet<PlayerId>, landing: Point, tLand: number) {
  for (const team of [e.offense, e.defense]) {
    let extra = actors.filter((a) => a.team === team).length - 11;
    for (let i = actors.length - 1; i >= 0 && extra > 0; i--) {
      const a = actors[i]!;
      if (a.team === team && !key.has(a.id) && a.role !== "LS") {
        actors.splice(i, 1);
        extra--;
      }
    }
  }
  const returner = e.units?.receiving.find((m) => m.role === "KR");
  if (returner && !actors.some((a) => a.id === returner.id) && actors.filter((a) => a.team === e.defense).length < 11) {
    actors.push({ id: returner.id, team: e.defense, role: "KR", track: new TrackBuilder({ x: Math.min(landing.x, 98), y: landing.y }).hold(tLand + 0.8).track });
  }
}

/** Where a kick went, for placing everyone else. */
interface KickPlan {
  landing: Point;
  tKick: number;
  tLand: number;
  /** Where the return ended (null on a touchback, fair catch or muff). */
  end: Point | null;
  tEnd: number;
  /** Players already drawn (kicker, returner, tackler). */
  skip: Set<PlayerId>;
}

/** The rest of the punt team and the return team. */
function puntUnits(rng: Rng, u: SpecialUnits, offense: string, defense: string, los: number, ballY: number) {
  return (plan: KickPlan): Actor[] => {
    const actors: Actor[] = [];
    const add = (id: PlayerId, team: string, role: Role, t: TrackBuilder) => {
      if (plan.skip.has(id)) return;
      plan.skip.add(id);
      actors.push({ id, team, role, track: t.track });
    };
    const target = plan.end ?? plan.landing;
    // Coverage converges on the ball, then the tackle.
    const cover = (t: TrackBuilder, spot: Point, release: number) => {
      t.hold(release).toward(plan.tLand, { x: plan.landing.x - 4, y: plan.landing.y + (spot.y - ballY) * 0.4 }, 8);
      t.toward(plan.tEnd, { x: target.x + 2 + rng.next() * 3, y: target.y + rng.normal(0, 4) }, 8);
      return t;
    };
    for (const m of ofRole(u.kicking, "LS")) add(m.id, offense, "LS", cover(new TrackBuilder({ x: los - 0.4, y: ballY }), { x: los, y: ballY }, 1.7));
    ofRole(u.kicking, "OL").forEach((m, i) => {
      const y = ballY + [-1.3, 1.3, -2.6, 2.6, -3.9][i % 5]!;
      add(m.id, offense, "OL", cover(new TrackBuilder({ x: los - 0.6, y }).hold(0.6).to(1.4, { x: los - 1.6, y }), { x: los, y }, 1.8));
    });
    for (const m of ofRole(u.kicking, "S")) add(m.id, offense, "S", cover(new TrackBuilder({ x: los - 5, y: ballY + 0.8 }), { x: los, y: ballY }, 2));
    ofRole(u.kicking, "COVER").forEach((m, i) => {
      // Two gunners split wide, the rest inside.
      const y = i === 0 ? 3.5 : i === 1 ? FIELD_WIDTH - 3.5 : ballY + (i % 2 ? 6 : -6);
      add(m.id, offense, "COVER", cover(new TrackBuilder({ x: los - (i < 2 ? 0.5 : 1), y }), { x: los, y }, i < 2 ? 0 : 1.2));
    });
    for (const m of u.kicking) if (m.role !== "P") add(m.id, offense, "COVER", cover(new TrackBuilder({ x: los - 1, y: ballY + rng.normal(0, 5) }), { x: los, y: ballY }, 1.5));
    // Return team: jammers on the gunners, a rush, then everyone turns to set up the return.
    const wall = (t: TrackBuilder, side: number) =>
      t.toward(plan.tLand, { x: plan.landing.x - 12 - rng.next() * 6, y: plan.landing.y + side * (3 + rng.next() * 6) }, 7).toward(plan.tEnd, { x: target.x + 3 + rng.next() * 4, y: target.y + side * (2 + rng.next() * 3) }, 7);
    ofRole(u.receiving, "CB").forEach((m, i) => {
      const y = i === 0 ? 4.5 : FIELD_WIDTH - 4.5;
      add(m.id, defense, "CB", new TrackBuilder({ x: los + 1.2, y }).toward(plan.tLand, { x: plan.landing.x - 7, y: plan.landing.y + (i ? 4 : -4) }, 8).toward(plan.tEnd, { x: target.x + 3, y: target.y + (i ? 2 : -2) }, 8));
    });
    ofRole(u.receiving, "DL").forEach((m, i, all) => {
      const y = ballY + spread(i, all.length, -3, 3);
      add(m.id, defense, "DL", wall(new TrackBuilder({ x: los + 0.9, y }).hold(0.6).to(1.6, { x: los - 1.5, y }).hold(2), i % 2 ? 1 : -1));
    });
    ofRole(u.receiving, "LB").forEach((m, i) => {
      add(m.id, defense, "LB", wall(new TrackBuilder({ x: los + 3, y: ballY + (i - 1) * 4 }).hold(0.8), i % 2 ? 1 : -1));
    });
    for (const m of u.receiving) if (m.role !== "KR") add(m.id, defense, "S", wall(new TrackBuilder({ x: los + 9, y: ballY + rng.normal(0, 4) }), rng.next() < 0.5 ? -1 : 1));
    return actors;
  };
}

/** The kickoff team in a line across the field, and the return team set deep. */
function kickoffUnits(rng: Rng, u: SpecialUnits, offense: string, defense: string, tee: Point) {
  return (plan: KickPlan): Actor[] => {
    const actors: Actor[] = [];
    const add = (id: PlayerId, team: string, role: Role, t: TrackBuilder) => {
      if (plan.skip.has(id)) return;
      plan.skip.add(id);
      actors.push({ id, team, role, track: t.track });
    };
    const target = plan.end ?? plan.landing;
    const coverage = u.kicking.filter((m) => m.role !== "K");
    coverage.forEach((m, i) => {
      // Five on each side of the kicker, evenly across.
      const half = Math.ceil(coverage.length / 2);
      const y = i < half ? spread(i, half, 4, FIELD_MIDDLE - 5) : spread(i - half, coverage.length - half, FIELD_MIDDLE + 5, FIELD_WIDTH - 4);
      const t = new TrackBuilder({ x: tee.x - 1, y }).toward(plan.tLand, { x: plan.landing.x - 6 - Math.abs(y - plan.landing.y) * 0.3, y: plan.landing.y + (y - FIELD_MIDDLE) * 0.45 }, 8.5);
      t.toward(plan.tEnd, { x: target.x + 1.5 + rng.next() * 4, y: target.y + rng.normal(0, 4) }, 8.5);
      add(m.id, offense, "COVER", t);
    });
    // Return team: a front five near midfield, a second line, the returner deep.
    const front = ofRole(u.receiving, "LB");
    const second = u.receiving.filter((m) => m.role !== "LB" && m.role !== "KR");
    const block = (t: TrackBuilder, side: number) =>
      t.toward(plan.tLand, { x: plan.landing.x - 10 - rng.next() * 6, y: plan.landing.y + side * (4 + rng.next() * 8) }, 7).toward(plan.tEnd, { x: target.x + 2 + rng.next() * 4, y: target.y + side * (1.5 + rng.next() * 3) }, 7);
    front.forEach((m, i) => add(m.id, defense, "LB", block(new TrackBuilder({ x: tee.x + 11, y: spread(i, front.length, 8, FIELD_WIDTH - 8) }), i < front.length / 2 ? -1 : 1)));
    second.forEach((m, i) => add(m.id, defense, (m.role === "WR" ? "WR" : "RB") as Role, block(new TrackBuilder({ x: Math.min(tee.x + 28, 95), y: spread(i, second.length, 12, FIELD_WIDTH - 12) }), i < second.length / 2 ? -1 : 1)));
    return actors;
  };
}

function punt(rng: Rng, e: PuntEvent): PlayAnimation {
  const los = e.start.yardline;
  const ballY = rng.pick([HASHES.left, HASHES.middle, HASHES.right]);
  const punter = { x: los - 15, y: ballY };
  if (e.blocked) {
    // The block comes as the punter swings (~1.9s); the ball squirts backward.
    const ball: Keyframe[] = [
      { t: 0, x: los, y: ballY, z: 0.2 },
      { t: 0.8, ...punter, z: 1 },
      { t: 1.9, x: punter.x + 0.5, y: ballY, z: 1 },
      { t: 2.6, x: punter.x - 3, y: ballY + rng.normal(0, 2), z: 0 },
    ];
    const p = new TrackBuilder(punter).hold(2.6);
    const actors: Actor[] = [{ id: e.punter, team: e.offense, role: "P", track: p.track }];
    if (e.blockedBy) {
      const b = new TrackBuilder({ x: los + 1, y: ballY + 2 }).to(1.9, { x: punter.x + 1, y: ballY });
      actors.push({ id: e.blockedBy, team: e.defense, role: "DL", track: b.track });
    }
    if (e.units) {
      const loose = { x: punter.x - 3, y: ballY };
      actors.push(...puntUnits(rng, e.units, e.offense, e.defense, los, ballY)({ landing: loose, tKick: 1.9, tLand: 2.4, end: null, tEnd: 2.8, skip: new Set(actors.map((a) => a.id)) }));
    }
    return build(e.offense, e.defense, e.start, actors, ball);
  }
  const landing = clampToField({ x: e.touchback ? 105 : los + e.grossYards, y: ballY + rng.normal(0, 8) });
  return kickPlay(rng, e, e.punter, "P", punter, { x: punter.x + 1, y: ballY }, 2, landing, 4 + rng.next() * 0.6, e.units ? puntUnits(rng, e.units, e.offense, e.defense, los, ballY) : undefined);
}

function kickoff(rng: Rng, e: KickoffEvent): PlayAnimation {
  const tee = { x: e.start.yardline, y: FIELD_MIDDLE };
  const runUp = { x: tee.x - 7, y: FIELD_MIDDLE - 3 };
  let landing: Point;
  if (e.onside) landing = { x: tee.x + 11, y: FIELD_MIDDLE + (rng.next() < 0.5 ? -12 : 12) };
  else if (e.touchback) landing = { x: 105, y: FIELD_MIDDLE + rng.normal(0, 6) };
  else {
    // Where the return ended, in the kicking team's frame, minus the return = where it was caught.
    const returnEnd = e.fumble?.lost ? e.nextYardline : 100 - e.nextYardline;
    landing = clampToField({ x: returnEnd + e.returnYards, y: FIELD_MIDDLE + rng.normal(0, 8) });
  }
  return kickPlay(rng, e, e.kicker, "K", runUp, tee, 1, landing, e.onside ? 1.2 : 4, e.units ? kickoffUnits(rng, e.units, e.offense, e.defense, tee) : undefined);
}
