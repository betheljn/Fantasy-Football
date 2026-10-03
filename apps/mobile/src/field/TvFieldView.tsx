// The TV angle: the same play drawn in perspective from a camera behind the
// offense (so the offense always attacks up the screen), raised above the
// field and following the ball. Players stand up as figures in their uniforms,
// the ball arcs in real height over its shadow, and the play's moment (banner,
// confetti) is shared with the top-down view. Everything is projected on the
// UI thread from the sim's animation data; nothing here decides the play.
import { Circle, Canvas, Group, Oval, Path, Rect, RoundedRect, Skia, type SkPath } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { FIELD_WIDTH, HASHES } from "@dynasty/sim";
import type { PreparedActor, PreparedPlay } from "../game/playback";
import { Banner, Confetti, type EndZone, type TeamColors } from "./FieldView";
import { sampleAt } from "./sample";

interface Props {
  play: PreparedPlay;
  time: SharedValue<number>;
  width: number;
  height: number;
  offense: TeamColors;
  defense: TeamColors;
  endZones: { left: EndZone; right: EndZone };
  colorsOf: (abbr: string) => { primary: string; trim: string; onPrimary: string };
}

const STANDS = "#151b22";
const SIDELINE = "#245f31";
const GRASS = "#2f7d3b";
const GRASS_ALT = "#28703a";
const LINE = "rgba(255,255,255,0.85)";
const LOS = "#3b82f6";
const FIRST_DOWN = "#facc15";

/** Camera: yards behind the spot it looks at, yards above the field, and how far ahead of the ball it looks. */
const BACK = 24;
const RAISE = 18;
const LEAD = 3;
/** Nothing closer than this (yards in front of the camera) is drawn. */
const NEAR = 4;

interface Cam {
  /** Field x of the camera, and the way the offense attacks (+1 toward 110). */
  x: number;
  dir: number;
  focal: number;
  horizon: number;
  mid: number;
}

/** Field point (x along the field, y across it, z up, in yards) to the screen; d is depth in front of the camera. */
function project(cam: Cam, x: number, y: number, z: number): { sx: number; sy: number; d: number } {
  "worklet";
  const d = (x - cam.x) * cam.dir;
  const u = (y - FIELD_WIDTH / 2) * cam.dir;
  const dd = Math.max(d, 0.001);
  return { sx: cam.mid + (cam.focal * u) / dd, sy: cam.horizon + (cam.focal * (RAISE - z)) / dd, d };
}

/** A straight line on the ground, cut where it passes behind the near plane. */
function groundLine(path: SkPath, cam: Cam, x1: number, y1: number, x2: number, y2: number) {
  "worklet";
  let a = (x1 - cam.x) * cam.dir;
  let b = (x2 - cam.x) * cam.dir;
  if (a < NEAR && b < NEAR) return;
  if (a < NEAR || b < NEAR) {
    const t = (NEAR - a) / (b - a);
    const cx = x1 + (x2 - x1) * t;
    const cy = y1 + (y2 - y1) * t;
    if (a < NEAR) {
      x1 = cx;
      y1 = cy;
      a = NEAR;
    } else {
      x2 = cx;
      y2 = cy;
      b = NEAR;
    }
  }
  const p = project(cam, x1, y1, 0);
  const q = project(cam, x2, y2, 0);
  path.moveTo(p.sx, p.sy);
  path.lineTo(q.sx, q.sy);
}

/** A rectangle on the ground (x0..x1 along the field, the full width across), cut at the near plane. */
function groundBand(path: SkPath, cam: Cam, x0: number, x1: number, y0 = 0, y1 = FIELD_WIDTH) {
  "worklet";
  const near = cam.x + NEAR * cam.dir;
  // Keep only the part in front of the camera.
  let lo = Math.min(x0, x1);
  let hi = Math.max(x0, x1);
  if (cam.dir > 0) lo = Math.max(lo, near);
  else hi = Math.min(hi, near);
  if (lo >= hi) return;
  const a = project(cam, lo, y0, 0);
  const b = project(cam, lo, y1, 0);
  const c = project(cam, hi, y1, 0);
  const d = project(cam, hi, y0, 0);
  path.moveTo(a.sx, a.sy);
  path.lineTo(b.sx, b.sy);
  path.lineTo(c.sx, c.sy);
  path.lineTo(d.sx, d.sy);
  path.close();
}

export function TvFieldView({ play, time, width, height, offense, defense, endZones, colorsOf }: Props) {
  const ball = play.ball;
  const dir = play.direction;
  const focal = (width * 0.95 * BACK) / FIELD_WIDTH;
  const horizon = height * 0.12;

  const cam = useDerivedValue<Cam>(() => {
    const bx = sampleAt(ball.t, ball.x, time.value);
    const fx = Math.max(-5, Math.min(105, bx + LEAD * dir));
    return { x: fx - BACK * dir, dir, focal, horizon, mid: width / 2 };
  });

  // The field, rebuilt each frame as the camera moves.
  const field = useDerivedValue(() => {
    const p = Skia.Path.Make();
    groundBand(p, cam.value, -10, 110);
    return p;
  });
  const stripes = useDerivedValue(() => {
    const p = Skia.Path.Make();
    for (let x = 0; x < 100; x += 10) groundBand(p, cam.value, x + 5, x + 10);
    return p;
  });
  const lines = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const c = cam.value;
    for (let x = 0; x <= 100; x += 5) groundLine(p, c, x, 0, x, FIELD_WIDTH);
    groundLine(p, c, -10, 0, 110, 0);
    groundLine(p, c, -10, FIELD_WIDTH, 110, FIELD_WIDTH);
    groundLine(p, c, -10, 0, -10, FIELD_WIDTH);
    groundLine(p, c, 110, 0, 110, FIELD_WIDTH);
    return p;
  });
  const hashes = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const c = cam.value;
    for (let x = 1; x < 100; x++) {
      if (x % 5 === 0) continue;
      for (const hy of [HASHES.left, HASHES.right]) groundLine(p, c, x, hy - 0.6, x, hy + 0.6);
    }
    return p;
  });
  const leftZone = useDerivedValue(() => {
    const p = Skia.Path.Make();
    groundBand(p, cam.value, -10, 0);
    return p;
  });
  const rightZone = useDerivedValue(() => {
    const p = Skia.Path.Make();
    groundBand(p, cam.value, 100, 110);
    return p;
  });
  const los = useDerivedValue(() => {
    const p = Skia.Path.Make();
    groundLine(p, cam.value, play.lineOfScrimmage, 0, play.lineOfScrimmage, FIELD_WIDTH);
    return p;
  });
  const firstDown = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const fd = play.firstDownLine;
    if (fd !== null && fd > 0 && fd < 100) groundLine(p, cam.value, fd, 0, fd, FIELD_WIDTH);
    return p;
  });

  // Far players first, so nearer ones stand in front (ordered by where they line up).
  const actors = useMemo(
    () => [...play.actors].sort((a, b) => ((b.track.x[0] ?? 0) - (a.track.x[0] ?? 0)) * dir),
    [play.actors, dir],
  );

  const banner = play.outcome.banner;
  const bannerColors = banner ? colorsOf(banner.team) : null;

  return (
    <View style={[styles.frame, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height} color={SIDELINE} />
        <Rect x={0} y={0} width={width} height={horizon + 2} color={STANDS} />
        <Path path={field} color={GRASS} />
        <Path path={stripes} color={GRASS_ALT} />
        <Path path={leftZone} color={endZones.left.color} />
        <Path path={rightZone} color={endZones.right.color} />
        <Path path={lines} color={LINE} style="stroke" strokeWidth={1.5} />
        <Path path={hashes} color={LINE} style="stroke" strokeWidth={1} />
        <Path path={los} color={LOS} style="stroke" strokeWidth={6} opacity={0.3} />
        <Path path={los} color={LOS} style="stroke" strokeWidth={2.5} />
        <Path path={firstDown} color={FIRST_DOWN} style="stroke" strokeWidth={6} opacity={0.3} />
        <Path path={firstDown} color={FIRST_DOWN} style="stroke" strokeWidth={2.5} />
        {actors.map((a) => (
          <Figure key={a.id} actor={a} cam={cam} time={time} colors={a.side === "offense" ? offense : defense} play={play} />
        ))}
        <TvBall play={play} cam={cam} time={time} />
      </Canvas>
      {play.outcome.touchdown && bannerColors ? <Confetti time={time} end={play.duration} width={width} height={height} colors={[bannerColors.primary, bannerColors.trim, "#ffffff"]} /> : null}
      {banner && bannerColors ? <Banner time={time} end={play.duration} text={banner.text} abbr={banner.team} colors={bannerColors} /> : null}
    </View>
  );
}

/** A player standing on the field: shadow, body in the uniform, helmet; smaller the farther away. */
function Figure({ actor, cam, time, colors, play }: { actor: PreparedActor; cam: SharedValue<Cam>; time: SharedValue<number>; colors: TeamColors; play: PreparedPlay }) {
  const tr = actor.track;
  const b = play.ball;
  const g = useDerivedValue(() => {
    const t = time.value;
    const x = sampleAt(tr.t, tr.x, t);
    const y = sampleAt(tr.t, tr.y, t);
    const foot = project(cam.value, x, y, 0);
    const head = project(cam.value, x, y, 2.3);
    // Carrying the ball: on the ground and right on him.
    const bz = sampleAt(b.t, b.z, t);
    const dx = sampleAt(b.t, b.x, t) - x;
    const dy = sampleAt(b.t, b.y, t) - y;
    const carrying = bz < 1.2 && dx * dx + dy * dy < 1.4;
    return { fx: foot.sx, fy: foot.sy, hy: head.sy, w: (cam.value.focal * 1.1) / Math.max(foot.d, 0.01), visible: foot.d > NEAR, carrying };
  });
  const shadow = useDerivedValue(() => ({ x: g.value.fx - g.value.w * 0.7, y: g.value.fy - g.value.w * 0.2, width: g.value.w * 1.4, height: g.value.w * 0.4 }));
  const body = useDerivedValue(() => {
    const h = g.value.fy - g.value.hy;
    return Skia.RRectXY(Skia.XYWHRect(g.value.fx - g.value.w / 2, g.value.hy + h * 0.18, g.value.w, h * 0.82), g.value.w * 0.35, g.value.w * 0.35);
  });
  const helmetR = useDerivedValue(() => g.value.w * 0.42);
  const helmetX = useDerivedValue(() => g.value.fx);
  const helmetY = useDerivedValue(() => g.value.hy + g.value.w * 0.3);
  const opacity = useDerivedValue(() => (g.value.visible ? 1 : 0));
  const glow = useDerivedValue(() => (g.value.visible && g.value.carrying ? 0.9 : 0));
  const glowRect = useDerivedValue(() => ({ x: g.value.fx - g.value.w, y: g.value.fy - g.value.w * 0.35, width: g.value.w * 2, height: g.value.w * 0.7 }));
  return (
    <Group opacity={opacity}>
      <Oval rect={glowRect} color="#f5c542" opacity={glow} />
      <Oval rect={shadow} color="rgba(0,0,0,0.35)" />
      <RoundedRect rect={body} color={colors.fill} />
      <RoundedRect rect={body} color={colors.ring} style="stroke" strokeWidth={1.5} />
      <Circle cx={helmetX} cy={helmetY} r={helmetR} color={colors.ring === "#ffffff" ? colors.fill : colors.ring} />
    </Group>
  );
}

/** The football in the air over its shadow. */
function TvBall({ play, cam, time }: { play: PreparedPlay; cam: SharedValue<Cam>; time: SharedValue<number> }) {
  const b = play.ball;
  const g = useDerivedValue(() => {
    const t = time.value;
    const x = sampleAt(b.t, b.x, t);
    const y = sampleAt(b.t, b.y, t);
    const z = sampleAt(b.t, b.z, t);
    const ground = project(cam.value, x, y, 0);
    // Carried balls ride at about waist height.
    const air = project(cam.value, x, y, Math.max(z, 1.1));
    const s = (cam.value.focal * 0.75) / Math.max(ground.d, 0.01);
    return { gx: ground.sx, gy: ground.sy, ax: air.sx, ay: air.sy, s, visible: ground.d > NEAR };
  });
  const shadow = useDerivedValue(() => ({ x: g.value.gx - g.value.s * 0.5, y: g.value.gy - g.value.s * 0.15, width: g.value.s, height: g.value.s * 0.3 }));
  const ballRect = useDerivedValue(() => ({ x: g.value.ax - g.value.s * 0.5, y: g.value.ay - g.value.s * 0.3, width: g.value.s, height: g.value.s * 0.6 }));
  const opacity = useDerivedValue(() => (g.value.visible ? 1 : 0));
  return (
    <Group opacity={opacity}>
      <Oval rect={shadow} color="rgba(0,0,0,0.3)" />
      <Oval rect={ballRect} color="#7a3f17" />
      <Oval rect={ballRect} color="#3d1f0b" style="stroke" strokeWidth={1} />
    </Group>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 10, backgroundColor: STANDS },
});
