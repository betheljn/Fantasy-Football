// Top-down 2D field drawn with Skia, portrait: the field's long axis runs up
// the screen (field x = -10..110 from bottom to top), sidelines left and right,
// with a broadcast look: painted end zones and midfield, players in uniform
// with numbers and shadows, a football that turns and arcs, and the play's
// moment (a tackle burst, a banner, touchdown confetti) when it's over.
// A camera follows the ball. Players and ball are driven by a shared `time`
// value on the UI thread; this component never decides anything about the play.
import { Canvas, Circle, Group, Line, Oval, Rect, vec } from "@shopify/react-native-skia";
import { useMemo, type ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import { FIELD_WIDTH, HASHES } from "@dynasty/sim";
import type { PreparedActor, PreparedPlay } from "../game/playback";
import { sampleAt } from "./sample";

export interface TeamColors {
  fill: string;
  ring: string;
}

export interface EndZone {
  abbr: string;
  /** Painted in the end zone ("KESTRELS"). */
  name: string;
  color: string;
  trim: string;
}

interface Props {
  play: PreparedPlay;
  time: SharedValue<number>;
  width: number;
  height: number;
  offense: TeamColors;
  defense: TeamColors;
  /** End zones: the team defending each end (left end = field x < 0). */
  endZones: { left: EndZone; right: EndZone };
  /** The home team, painted at midfield. */
  midfield: { abbr: string; color: string; trim: string };
  /** Each team's colors, for the play's banner and confetti. */
  colorsOf: (abbr: string) => { primary: string; trim: string; onPrimary: string };
}

const GRASS = "#2f7d3b";
const GRASS_ALT = "#28703a";
const SIDELINE = "#245f31";
const LINE = "rgba(255,255,255,0.88)";
const LOS = "#3b82f6";
const FIRST_DOWN = "#facc15";
const GOALPOST = "#f5d90a";
/** Yards of sideline shown beyond each edge of the field. */
const MARGIN = 2.5;

export function FieldView({ play, time, width, height, offense, defense, endZones, midfield, colorsOf }: Props) {
  const scale = width / (FIELD_WIDTH + MARGIN * 2); // px per yard
  const halfView = height / 2 / scale;
  const ball = play.ball;
  const dir = play.direction;

  // Camera: centre a little ahead of the ball, never past the back of an end zone.
  const camera = useDerivedValue(() => {
    const bx = sampleAt(ball.t, ball.x, time.value);
    const c = bx + 6 * dir;
    return Math.max(-12 + halfView, Math.min(112 - halfView, c));
  });
  // Field x -> screen y is  height/2 - (x - camera) * scale.
  const transform = useDerivedValue(() => [{ translateY: height / 2 + camera.value * scale }]);
  const overlayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: height / 2 + camera.value * scale }] }));

  const Y = (x: number) => -x * scale; // inside the camera group
  const X = (y: number) => (y + MARGIN) * scale;
  const fieldW = FIELD_WIDTH * scale;

  const art = useMemo(() => {
    const out: ReactElement[] = [];
    // Mowing stripes every 5 yards, sidelines, and the white border.
    for (let x = 0; x < 100; x += 10) out.push(<Rect key={`s${x}`} x={X(0)} y={Y(x + 5)} width={fieldW} height={5 * scale} color={GRASS_ALT} />);
    for (let x = 0; x <= 100; x += 5) out.push(<Line key={`l${x}`} p1={vec(X(0), Y(x))} p2={vec(X(FIELD_WIDTH), Y(x))} color={LINE} strokeWidth={x % 50 === 0 ? 2.5 : x % 10 === 0 ? 1.6 : 1} />);
    for (let x = 1; x < 100; x++) {
      if (x % 5 === 0) continue;
      for (const hy of [HASHES.left, HASHES.right, 0.6, FIELD_WIDTH - 0.6]) {
        out.push(<Line key={`h${x}-${hy}`} p1={vec(X(hy) - 3, Y(x))} p2={vec(X(hy) + 3, Y(x))} color={LINE} strokeWidth={1} />);
      }
    }
    return out;
  }, [scale, fieldW]); // eslint-disable-line react-hooks/exhaustive-deps

  const numbers = [];
  for (let x = 10; x <= 90; x += 10) {
    const label = String(x <= 50 ? x : 100 - x);
    for (const side of [0, 1]) {
      numbers.push(
        <Text
          key={`n${x}-${side}`}
          style={[styles.yardNumber, { top: Y(x) - 10, left: side === 0 ? X(10) - 16 : X(FIELD_WIDTH - 10) - 16, transform: [{ rotate: side === 0 ? "90deg" : "-90deg" }] }]}
        >
          {label}
        </Text>,
      );
    }
  }

  const goalpost = (x: number) => (
    <Group key={`gp${x}`}>
      <Line p1={vec(X(FIELD_WIDTH / 2 - 3.1), Y(x))} p2={vec(X(FIELD_WIDTH / 2 + 3.1), Y(x))} color={GOALPOST} strokeWidth={3} />
      <Circle cx={X(FIELD_WIDTH / 2)} cy={Y(x)} r={2.5} color={GOALPOST} />
    </Group>
  );

  const banner = play.outcome.banner;
  const bannerColors = banner ? colorsOf(banner.team) : null;

  return (
    <View style={[styles.frame, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group transform={transform}>
          <Rect x={0} y={Y(112)} width={width} height={124 * scale} color={SIDELINE} />
          <Rect x={X(0)} y={Y(110)} width={fieldW} height={120 * scale} color={GRASS} />
          {art}
          {/* End zones in the defending team's colors, with a trim line at the back. */}
          <Rect x={X(0)} y={Y(0)} width={fieldW} height={10 * scale} color={endZones.left.color} />
          <Rect x={X(0)} y={Y(-10) - 3} width={fieldW} height={3} color={endZones.left.trim} />
          <Rect x={X(0)} y={Y(110)} width={fieldW} height={10 * scale} color={endZones.right.color} />
          <Rect x={X(0)} y={Y(110)} width={fieldW} height={3} color={endZones.right.trim} />
          <Rect x={X(0)} y={Y(110)} width={fieldW} height={120 * scale} color={LINE} style="stroke" strokeWidth={2.5} />
          {goalpost(-10)}
          {goalpost(110)}
          {/* The home team's badge at midfield. */}
          <Circle cx={X(FIELD_WIDTH / 2)} cy={Y(50)} r={4 * scale} color={midfield.color} opacity={0.38} />
          <Circle cx={X(FIELD_WIDTH / 2)} cy={Y(50)} r={4 * scale} color={midfield.trim} style="stroke" strokeWidth={2} opacity={0.5} />
          {/* Line of scrimmage and line to gain, with a soft glow. */}
          <Line p1={vec(X(0), Y(play.lineOfScrimmage))} p2={vec(X(FIELD_WIDTH), Y(play.lineOfScrimmage))} color={LOS} strokeWidth={9} opacity={0.25} />
          <Line p1={vec(X(0), Y(play.lineOfScrimmage))} p2={vec(X(FIELD_WIDTH), Y(play.lineOfScrimmage))} color={LOS} strokeWidth={3} />
          {play.firstDownLine !== null && play.firstDownLine > 0 && play.firstDownLine < 100 ? (
            <Group>
              <Line p1={vec(X(0), Y(play.firstDownLine))} p2={vec(X(FIELD_WIDTH), Y(play.firstDownLine))} color={FIRST_DOWN} strokeWidth={9} opacity={0.25} />
              <Line p1={vec(X(0), Y(play.firstDownLine))} p2={vec(X(FIELD_WIDTH), Y(play.firstDownLine))} color={FIRST_DOWN} strokeWidth={3} />
            </Group>
          ) : null}
          {play.outcome.tackled ? <TackleBurst play={play} time={time} scale={scale} X={X} /> : null}
          {play.actors.map((a) => (
            <Player key={a.id} actor={a} play={play} time={time} scale={scale} colors={a.side === "offense" ? offense : defense} />
          ))}
          <Ball play={play} time={time} scale={scale} />
        </Group>
      </Canvas>
      <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }, overlayStyle]}>
        {numbers}
        <Text style={[styles.endZoneText, { top: Y(-5) - 15, left: X(0), width: fieldW, color: readable(endZones.left.color) }]}>{endZones.left.name}</Text>
        <Text style={[styles.endZoneText, { top: Y(105) - 15, left: X(0), width: fieldW, color: readable(endZones.right.color), transform: [{ rotate: "180deg" }] }]}>
          {endZones.right.name}
        </Text>
        <Text style={[styles.midfieldText, { top: Y(50) - 11, left: X(FIELD_WIDTH / 2) - 30 }]}>{midfield.abbr}</Text>
        {play.actors.map((a) => (
          <JerseyNumber key={a.id} actor={a} time={time} scale={scale} color={a.side === "offense" ? offense : defense} />
        ))}
      </Animated.View>
      {play.outcome.touchdown && bannerColors ? <Confetti time={time} end={play.duration} width={width} height={height} colors={[bannerColors.primary, bannerColors.trim, "#ffffff"]} /> : null}
      {banner && bannerColors ? <Banner time={time} end={play.duration} text={banner.text} abbr={banner.team} colors={bannerColors} /> : null}
    </View>
  );
}

/** Light text on dark colors, dark text on light ones. */
function readable(hex: string): string {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
  return lum > 0.55 ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.92)";
}

/**
 * A player: shadow, a chip in the uniform, a facemask notch toward where he's
 * heading, and a gold ring while he has the ball.
 */
function Player({ actor, play, time, scale, colors }: { actor: PreparedActor; play: PreparedPlay; time: SharedValue<number>; scale: number; colors: TeamColors }) {
  const tr = actor.track;
  const b = play.ball;
  const r = Math.max(5.5, 1.2 * scale);
  const cx = useDerivedValue(() => (sampleAt(tr.t, tr.y, time.value) + MARGIN) * scale);
  const cy = useDerivedValue(() => -sampleAt(tr.t, tr.x, time.value) * scale);
  // Heading from where he'll be a moment from now (or where he came from at the end).
  const heading = useDerivedValue(() => {
    const t = time.value;
    const dx = sampleAt(tr.t, tr.y, t + 0.15) - sampleAt(tr.t, tr.y, t - 0.15);
    const dy = -(sampleAt(tr.t, tr.x, t + 0.15) - sampleAt(tr.t, tr.x, t - 0.15));
    return Math.abs(dx) + Math.abs(dy) < 0.01 ? (actor.side === "offense" ? -Math.PI / 2 * play.direction : Math.PI / 2 * play.direction) : Math.atan2(dy, dx);
  });
  const nx = useDerivedValue(() => cx.value + Math.cos(heading.value) * r * 0.78);
  const ny = useDerivedValue(() => cy.value + Math.sin(heading.value) * r * 0.78);
  // Carrying the ball: the ball is on the ground and right on top of him.
  const carrying = useDerivedValue(() => {
    const t = time.value;
    if (sampleAt(b.t, b.z, t) > 1.2) return 0;
    const dx = sampleAt(b.t, b.x, t) - sampleAt(tr.t, tr.x, t);
    const dy = sampleAt(b.t, b.y, t) - sampleAt(tr.t, tr.y, t);
    return dx * dx + dy * dy < 1.4 ? 1 : 0;
  });
  const sx = useDerivedValue(() => cx.value + r * 0.28);
  const sy = useDerivedValue(() => cy.value + r * 0.32);
  return (
    <Group>
      <Circle cx={sx} cy={sy} r={r} color="rgba(0,0,0,0.32)" />
      <Circle cx={cx} cy={cy} r={r + 3.5} color="#f5c542" opacity={carrying} />
      <Circle cx={cx} cy={cy} r={r} color={colors.fill} />
      <Circle cx={cx} cy={cy} r={r} color={colors.ring} style="stroke" strokeWidth={2} />
      <Circle cx={nx} cy={ny} r={Math.max(1.6, r * 0.28)} color={colors.ring} />
    </Group>
  );
}

/** The jersey number on top of the chip (text lives in the overlay, kept in step on the UI thread). */
function JerseyNumber({ actor, time, scale, color }: { actor: PreparedActor; time: SharedValue<number>; scale: number; color: TeamColors }) {
  const tr = actor.track;
  const size = Math.max(7, Math.round(1.15 * scale));
  const px = useDerivedValue(() => (sampleAt(tr.t, tr.y, time.value) + MARGIN) * scale - 12);
  const py = useDerivedValue(() => -sampleAt(tr.t, tr.x, time.value) * scale - size * 0.62);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: px.value }, { translateY: py.value }] }));
  // Linemen go without numbers (as on a broadcast), so the line doesn't turn into a pile of digits.
  if (!actor.jersey || actor.role === "OL" || actor.role === "DL") return null;
  return <Animated.Text style={[styles.jersey, { fontSize: size, color: textOn(color.fill) }, style]}>{actor.jersey}</Animated.Text>;
}

function textOn(fill: string): string {
  return fill.toLowerCase() === "#ffffff" ? "#111111" : readable(fill).startsWith("rgba(0") ? "#111111" : "#ffffff";
}

/** A football: an oval turned the way it's travelling, rising off its shadow in the air. */
function Ball({ play, time, scale }: { play: PreparedPlay; time: SharedValue<number>; scale: number }) {
  const b = play.ball;
  const gx = useDerivedValue(() => (sampleAt(b.t, b.y, time.value) + MARGIN) * scale);
  const gy = useDerivedValue(() => -sampleAt(b.t, b.x, time.value) * scale);
  const z = useDerivedValue(() => sampleAt(b.t, b.z, time.value));
  const angle = useDerivedValue(() => {
    const t = time.value;
    const dx = sampleAt(b.t, b.y, t + 0.1) - sampleAt(b.t, b.y, t - 0.1);
    const dy = -(sampleAt(b.t, b.x, t + 0.1) - sampleAt(b.t, b.x, t - 0.1));
    return Math.abs(dx) + Math.abs(dy) < 0.005 ? -Math.PI / 2 : Math.atan2(dy, dx);
  });
  const len = Math.max(6, 0.9 * scale);
  const transform = useDerivedValue(() => {
    const grow = 1 + z.value / 12;
    return [{ translateX: gx.value }, { translateY: gy.value - z.value * scale * 0.4 }, { rotate: angle.value }, { scale: grow }];
  });
  const shadow = useDerivedValue(() => [{ translateX: gx.value }, { translateY: gy.value }, { rotate: angle.value }]);
  const shadowOpacity = useDerivedValue(() => Math.max(0.12, 0.38 - z.value * 0.02));
  return (
    <Group>
      <Group transform={shadow}>
        <Oval x={-len / 2} y={-len * 0.3} width={len} height={len * 0.6} color="#000000" opacity={shadowOpacity} />
      </Group>
      <Group transform={transform}>
        <Oval x={-len / 2} y={-len * 0.31} width={len} height={len * 0.62} color="#7a3f17" />
        <Oval x={-len / 2} y={-len * 0.31} width={len} height={len * 0.62} color="#3d1f0b" style="stroke" strokeWidth={1} />
        <Line p1={vec(-len * 0.18, 0)} p2={vec(len * 0.18, 0)} color="#f5ecd8" strokeWidth={1.2} />
      </Group>
    </Group>
  );
}

/** Where the ball carrier went down: a quick ring that grows and fades. */
function TackleBurst({ play, time, scale, X }: { play: PreparedPlay; time: SharedValue<number>; scale: number; X: (y: number) => number }) {
  const b = play.ball;
  const end = play.duration;
  const cx = X(b.y[b.y.length - 1] ?? 0);
  const cy = -(b.x[b.x.length - 1] ?? 0) * scale;
  const p = useDerivedValue(() => Math.max(0, Math.min(1, (time.value - (end - 0.25)) / 0.6)));
  const r = useDerivedValue(() => (1.2 + p.value * 3.2) * scale);
  const opacity = useDerivedValue(() => (p.value <= 0 || p.value >= 1 ? 0 : 0.85 * (1 - p.value)));
  return <Circle cx={cx} cy={cy} r={r} color="#ffffff" style="stroke" strokeWidth={3} opacity={opacity} />;
}

/** A broadcast lower-third when the play is over: FIRST DOWN, TOUCHDOWN, INTERCEPTION... */
export function Banner({ time, end, text, abbr, colors }: { time: SharedValue<number>; end: number; text: string; abbr: string; colors: { primary: string; trim: string; onPrimary: string } }) {
  const p = useDerivedValue(() => Math.max(0, Math.min(1, (time.value - end) / 0.25)));
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateX: (1 - p.value) * -40 }] }));
  const big = text === "TOUCHDOWN" || text === "PICK SIX" || text === "SCOOP AND SCORE";
  return (
    <Animated.View style={[styles.banner, { backgroundColor: colors.primary, borderLeftColor: colors.trim }, style]}>
      <Text style={[styles.bannerTeam, { color: colors.onPrimary }]}>{abbr}</Text>
      <Text style={[styles.bannerText, { color: colors.onPrimary, fontSize: big ? 20 : 15 }]}>{text}</Text>
    </Animated.View>
  );
}

/** Touchdown: a short burst of confetti in the scoring team's colors. */
export function Confetti({ time, end, width, height, colors }: { time: SharedValue<number>; end: number; width: number; height: number; colors: string[] }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        // A fixed scatter (the same every time): no randomness on the field.
        const a = (i * 137.508) % 360;
        return { x: ((i * 61) % 100) / 100, drift: Math.cos((a * Math.PI) / 180) * 30, speed: 0.6 + ((i * 37) % 40) / 100, size: 3 + (i % 3), color: colors[i % colors.length]! };
      }),
    [colors],
  );
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      {bits.map((c, i) => (
        <ConfettiBit key={i} c={c} time={time} end={end} width={width} height={height} />
      ))}
    </View>
  );
}

function ConfettiBit({ c, time, end, width, height }: { c: { x: number; drift: number; speed: number; size: number; color: string }; time: SharedValue<number>; end: number; width: number; height: number }) {
  const since = useDerivedValue(() => time.value - end);
  const style = useAnimatedStyle(() => {
    const t = since.value;
    const on = t >= 0 && t <= 2.2;
    return {
      opacity: !on ? 0 : t > 1.6 ? (2.2 - t) / 0.6 : 1,
      transform: [{ translateX: c.x * width + c.drift * Math.max(0, t) }, { translateY: -10 + Math.max(0, t) * c.speed * height * 0.55 }, { rotate: `${Math.max(0, t) * 360 * c.speed}deg` }],
    };
  });
  return <Animated.View style={[{ position: "absolute", width: c.size, height: c.size * 1.6, backgroundColor: c.color, borderRadius: 1 }, style]} />;
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 10, backgroundColor: SIDELINE },
  yardNumber: { position: "absolute", width: 32, textAlign: "center", color: "rgba(255,255,255,0.85)", fontSize: 17, fontWeight: "800" },
  endZoneText: { position: "absolute", textAlign: "center", fontSize: 22, fontWeight: "900", letterSpacing: 5 },
  midfieldText: { position: "absolute", width: 60, textAlign: "center", fontSize: 18, fontWeight: "900", letterSpacing: 1, color: "rgba(255,255,255,0.45)" },
  jersey: { position: "absolute", left: 0, top: 0, width: 24, textAlign: "center", fontWeight: "900" },
  banner: { position: "absolute", left: 10, bottom: 12, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderLeftWidth: 5, borderRadius: 4 },
  bannerTeam: { fontWeight: "800", fontSize: 12, opacity: 0.85 },
  bannerText: { fontWeight: "900", letterSpacing: 1 },
});
