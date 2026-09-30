// Top-down 2D field drawn with Skia, portrait: the field's long axis runs up
// the screen (field x = -10..110 from bottom to top), sidelines left and right.
// A camera follows the ball. Players and ball are driven by a shared `time`
// value on the UI thread; this component never decides anything about the play.
import { Canvas, Circle, Group, Line, Rect, vec } from "@shopify/react-native-skia";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import { FIELD_WIDTH, HASHES } from "@dynasty/sim";
import type { PreparedActor, PreparedPlay } from "../game/playback";
import { sampleAt } from "./sample";

export interface TeamColors {
  fill: string;
  ring: string;
}

interface Props {
  play: PreparedPlay;
  time: SharedValue<number>;
  width: number;
  height: number;
  offense: TeamColors;
  defense: TeamColors;
  /** End zone colors/labels: the team defending each end (left end = field x < 0). */
  endZones: { left: { abbr: string; color: string }; right: { abbr: string; color: string } };
}

const GRASS = "#2f7d3b";
const GRASS_ALT = "#2b7437";
const LINE = "rgba(255,255,255,0.85)";
const LOS = "#3b82f6";
const FIRST_DOWN = "#facc15";

export function FieldView({ play, time, width, height, offense, defense, endZones }: Props) {
  const scale = width / FIELD_WIDTH; // px per yard
  const halfView = height / 2 / scale;
  const ball = play.ball;
  const dir = play.direction;

  // Camera: centre a little ahead of the ball, never past the back of an end zone.
  const camera = useDerivedValue(() => {
    const bx = sampleAt(ball.t, ball.x, time.value);
    const c = bx + 6 * dir;
    return Math.max(-10 + halfView, Math.min(110 - halfView, c));
  });
  // Field x -> screen y is  height/2 - (x - camera) * scale.
  const transform = useDerivedValue(() => [{ translateY: height / 2 + camera.value * scale }]);
  const overlayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: height / 2 + camera.value * scale }] }));

  const Y = (x: number) => -x * scale; // inside the camera group
  const X = (y: number) => y * scale;

  const stripes = [];
  for (let x = 0; x < 100; x += 10) stripes.push(<Rect key={`s${x}`} x={0} y={Y(x + 5)} width={width} height={5 * scale} color={GRASS_ALT} />);
  const lines = [];
  for (let x = 0; x <= 100; x += 5) lines.push(<Line key={`l${x}`} p1={vec(0, Y(x))} p2={vec(width, Y(x))} color={LINE} strokeWidth={x % 50 === 0 ? 2 : 1} />);
  const hashes = [];
  for (let x = 1; x < 100; x++) {
    if (x % 5 === 0) continue;
    for (const hy of [HASHES.left, HASHES.right, 0.6, FIELD_WIDTH - 0.6]) {
      hashes.push(<Line key={`h${x}-${hy}`} p1={vec(X(hy) - 3, Y(x))} p2={vec(X(hy) + 3, Y(x))} color={LINE} strokeWidth={1} />);
    }
  }

  const numbers = [];
  for (let x = 10; x <= 90; x += 10) {
    const label = String(x <= 50 ? x : 100 - x);
    for (const side of [0, 1]) {
      numbers.push(
        <Text
          key={`n${x}-${side}`}
          style={[styles.yardNumber, { top: Y(x) - 9, left: side === 0 ? X(9) - 14 : X(FIELD_WIDTH - 9) - 14, transform: [{ rotate: side === 0 ? "90deg" : "-90deg" }] }]}
        >
          {label}
        </Text>,
      );
    }
  }

  return (
    <View style={[styles.frame, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group transform={transform}>
          <Rect x={0} y={Y(110)} width={width} height={120 * scale} color={GRASS} />
          {stripes}
          <Rect x={0} y={Y(0)} width={width} height={10 * scale} color={endZones.left.color} opacity={0.85} />
          <Rect x={0} y={Y(110)} width={width} height={10 * scale} color={endZones.right.color} opacity={0.85} />
          {lines}
          {hashes}
          <Line p1={vec(0, Y(play.lineOfScrimmage))} p2={vec(width, Y(play.lineOfScrimmage))} color={LOS} strokeWidth={3} />
          {play.firstDownLine !== null && play.firstDownLine > 0 && play.firstDownLine < 100 ? (
            <Line p1={vec(0, Y(play.firstDownLine))} p2={vec(width, Y(play.firstDownLine))} color={FIRST_DOWN} strokeWidth={3} />
          ) : null}
          {play.actors.map((a) => (
            <PlayerDot key={a.id} actor={a} time={time} scale={scale} colors={a.side === "offense" ? offense : defense} />
          ))}
          <Ball play={play} time={time} scale={scale} />
        </Group>
      </Canvas>
      <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }, overlayStyle]}>
        {numbers}
        <Text style={[styles.endZoneText, { top: Y(-5) - 14, width }]}>{endZones.left.abbr}</Text>
        <Text style={[styles.endZoneText, { top: Y(105) - 14, width, transform: [{ rotate: "180deg" }] }]}>{endZones.right.abbr}</Text>
      </Animated.View>
    </View>
  );
}

function PlayerDot({ actor, time, scale, colors }: { actor: PreparedActor; time: SharedValue<number>; scale: number; colors: TeamColors }) {
  const tr = actor.track;
  const cx = useDerivedValue(() => sampleAt(tr.t, tr.y, time.value) * scale);
  const cy = useDerivedValue(() => -sampleAt(tr.t, tr.x, time.value) * scale);
  const r = Math.max(4, 0.95 * scale);
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r} color={colors.fill} />
      <Circle cx={cx} cy={cy} r={r} color={colors.ring} style="stroke" strokeWidth={2} />
    </Group>
  );
}

function Ball({ play, time, scale }: { play: PreparedPlay; time: SharedValue<number>; scale: number }) {
  const b = play.ball;
  const gx = useDerivedValue(() => sampleAt(b.t, b.y, time.value) * scale);
  const gy = useDerivedValue(() => -sampleAt(b.t, b.x, time.value) * scale);
  const z = useDerivedValue(() => sampleAt(b.t, b.z, time.value));
  // In the air: the ball rises toward the viewer (drawn bigger, offset from its shadow).
  const cy = useDerivedValue(() => gy.value - z.value * scale * 0.35);
  const r = useDerivedValue(() => Math.max(2.5, 0.42 * scale) * (1 + z.value / 14));
  const shadowR = Math.max(2, 0.35 * scale);
  return (
    <Group>
      <Circle cx={gx} cy={gy} r={shadowR} color="rgba(0,0,0,0.35)" />
      <Circle cx={gx} cy={cy} r={r} color="#8b4a1c" />
      <Circle cx={gx} cy={cy} r={r} color="#f5e6d3" style="stroke" strokeWidth={1} />
    </Group>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 10, backgroundColor: GRASS },
  yardNumber: { position: "absolute", width: 28, textAlign: "center", color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: "700" },
  endZoneText: { position: "absolute", left: 0, textAlign: "center", color: "rgba(255,255,255,0.9)", fontSize: 24, fontWeight: "900", letterSpacing: 6 },
});
