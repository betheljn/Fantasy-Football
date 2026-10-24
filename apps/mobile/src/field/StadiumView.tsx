// Your stadium from the air, drawn from its design: the bowl in your colors
// (deeper the more it holds; tight to the field and steeper with steep
// stands), the field (striped grass or turf with its seams), the roof (a dome
// with its ribs, or a retractable roof's panels, open or closed), the video
// boards over the end zones, and the name on the front.
import { Canvas, Group, Line, Oval, Rect, RoundedRect, vec } from "@shopify/react-native-skia";
import { StyleSheet, Text, View } from "react-native";
import { roofOf, standsOf, surfaceOf, videoBoardOf, type Stadium } from "@dynasty/sim";
import { useTheme } from "../theme";

interface Props {
  stadium: Stadium;
  colors: { primary: string; trim: string };
  width: number;
  /** Show a retractable roof closed. */
  closed?: boolean;
}

const GRASS = "#2f7d3b";
const GRASS_ALT = "#2a7236";
const TURF = "#2c8a44";
const CONCRETE = "#3b3f46";

export function StadiumView({ stadium, colors, width, closed }: Props) {
  const t = useTheme();
  const height = Math.round(width * 0.66);
  const roof = roofOf(stadium);
  const steep = standsOf(stadium) === "steep";
  const turf = surfaceOf(stadium) === "turf";
  const boards = videoBoardOf(stadium);
  // The bowl: the more seats, the deeper the stands; steep stands crowd the field.
  const depth = Math.max(0.16, Math.min(0.3, 0.12 + (stadium.capacity - 40_000) / 300_000));
  const gap = steep ? 0.02 : 0.06;
  const cx = width / 2;
  const cy = height / 2;
  const outer = { w: width * 0.96, h: height * 0.92 };
  const fieldW = width * (0.96 - 2 * depth - 2 * gap);
  const fieldH = fieldW * 0.48;
  const fx = cx - fieldW / 2;
  const fy = cy - fieldH / 2;
  const tiers = steep ? 4 : 3;
  const ring = (k: number) => {
    // Tier k of the stands, from the outside in.
    const w = outer.w - (outer.w - fieldW - 2 * gap * width) * (k / tiers);
    const h = outer.h - (outer.h - fieldH - 2 * gap * width) * (k / tiers);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };
  const stripes = Array.from({ length: 10 }, (_, i) => i);
  return (
    <View style={{ width, height: height + 18 }} accessibilityRole="image" accessibilityLabel={`${stadium.name} from the air`}>
      <Canvas style={{ width, height }}>
        {/* The concourse and the stands, tier by tier (darker toward the field). */}
        <Oval x={cx - outer.w / 2 - 4} y={cy - outer.h / 2 - 4} width={outer.w + 8} height={outer.h + 8} color={CONCRETE} />
        {Array.from({ length: tiers }, (_, k) => {
          const r = ring(k);
          return <Oval key={k} x={r.x} y={r.y} width={r.w} height={r.h} color={k % 2 === 0 ? colors.primary : colors.trim} opacity={1 - k * 0.12} />;
        })}
        {/* The field and its surround. */}
        <RoundedRect x={fx - gap * width * 0.6} y={fy - gap * width * 0.6} width={fieldW + gap * width * 1.2} height={fieldH + gap * width * 1.2} r={8} color={turf ? "#1f6b35" : "#245f31"} />
        {turf ? (
          <Group>
            <Rect x={fx} y={fy} width={fieldW} height={fieldH} color={TURF} />
            {/* Turf seams. */}
            <Line p1={vec(fx, cy)} p2={vec(fx + fieldW, cy)} color="rgba(255,255,255,0.12)" strokeWidth={1} />
          </Group>
        ) : (
          <Group>
            {stripes.map((i) => (
              <Rect key={i} x={fx + (fieldW / 10) * i} y={fy} width={fieldW / 10} height={fieldH} color={i % 2 ? GRASS : GRASS_ALT} />
            ))}
          </Group>
        )}
        {/* End zones and the yard lines. */}
        <Rect x={fx} y={fy} width={fieldW * 0.08} height={fieldH} color={colors.primary} opacity={0.85} />
        <Rect x={fx + fieldW * 0.92} y={fy} width={fieldW * 0.08} height={fieldH} color={colors.primary} opacity={0.85} />
        {stripes.slice(1).map((i) => (
          <Line key={i} p1={vec(fx + fieldW * 0.08 + fieldW * 0.084 * i, fy)} p2={vec(fx + fieldW * 0.08 + fieldW * 0.084 * i, fy + fieldH)} color="rgba(255,255,255,0.55)" strokeWidth={1} />
        ))}
        <Rect x={fx} y={fy} width={fieldW} height={fieldH} color="rgba(255,255,255,0.8)" style="stroke" strokeWidth={1.5} />
        {/* Video boards over each end zone, wider with every level. */}
        {boards > 0
          ? [-1, 1].map((side) => (
              <RoundedRect key={side} x={cx + side * (fieldW / 2 + gap * width * 0.9) - (side > 0 ? 0 : 8)} y={cy - (fieldH * (0.25 + 0.12 * boards)) / 2} width={8} height={fieldH * (0.25 + 0.12 * boards)} r={2} color="#0d1117" />
            ))
          : null}
        {/* The roof. */}
        {roof === "dome" ? (
          <Group>
            <Oval x={cx - outer.w / 2} y={cy - outer.h / 2} width={outer.w} height={outer.h} color="rgba(235,240,245,0.78)" />
            {[0.25, 0.5, 0.75].map((f) => {
              // Each rib runs edge to edge of the dome (shorter away from the middle).
              const dx = outer.w * (f - 0.5);
              const half = (outer.h / 2) * Math.sqrt(1 - (dx / (outer.w / 2)) ** 2) - 6;
              return <Line key={f} p1={vec(cx + dx, cy - half)} p2={vec(cx + dx, cy + half)} color="rgba(120,130,140,0.6)" strokeWidth={1.5} />;
            })}
            <Line p1={vec(cx - outer.w / 2 + 6, cy)} p2={vec(cx + outer.w / 2 - 6, cy)} color="rgba(120,130,140,0.6)" strokeWidth={1.5} />
          </Group>
        ) : roof === "retractable" ? (
          // Two panels over the ends; closed, they meet over midfield.
          [-1, 1].map((side) => {
            const w = closed ? outer.w / 2 : outer.w * 0.22;
            const x = side < 0 ? cx - outer.w / 2 : cx + outer.w / 2 - w;
            return (
              <Group key={side}>
                <RoundedRect x={x} y={cy - outer.h * 0.42} width={w} height={outer.h * 0.84} r={10} color="rgba(225,232,240,0.85)" />
                <Line p1={vec(x + 4, cy)} p2={vec(x + w - 4, cy)} color="rgba(120,130,140,0.6)" strokeWidth={1.5} />
              </Group>
            );
          })
        ) : null}
      </Canvas>
      <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
        {stadium.name.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The name under the bowl.
  name: { height: 18, lineHeight: 18, textAlign: "center", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
});
