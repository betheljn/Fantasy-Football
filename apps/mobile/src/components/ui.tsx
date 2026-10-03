// Small shared building blocks for list-style screens.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { teamColor, teamColors } from "../field/colors";
import { radius, space, typo, useTheme } from "../theme";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: 12 }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 12, fontWeight: "700", color: t.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{children}</Text>;
}

/** A tappable list row with a chevron. */
export function LinkRow({ onPress, children, label }: { onPress: () => void; children: ReactNode; label: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1 }}>{children}</View>
      <Text style={{ color: t.muted, fontSize: 18, marginLeft: 8 }}>›</Text>
    </Pressable>
  );
}

/**
 * A team's mark: a dot in its color when small, and at 18 and up a badge in
 * its colors with its initials.
 */
export function Swatch({ abbr, size = 10 }: { abbr: string; size?: number }) {
  if (size < 18) return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: teamColor(abbr) }} />;
  const c = teamColors(abbr);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primary, borderWidth: Math.max(2, size / 14), borderColor: c.trim, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: c.onPrimary, fontWeight: "900", fontSize: size * 0.34, letterSpacing: 0.5 }}>{abbr}</Text>
    </View>
  );
}

export const TeamBadge = Swatch;

/**
 * A team-colored header: the team's badge, a title and a line under it, on a
 * band of its color (for team pages, player pages, game screens).
 */
export function TeamBanner({ abbr, title, subtitle, children }: { abbr: string; title: string; subtitle?: string; children?: ReactNode }) {
  const c = teamColors(abbr);
  return (
    <View style={{ backgroundColor: c.primary, borderRadius: radius.md, padding: space.lg, gap: space.md, borderBottomWidth: 4, borderBottomColor: c.trim }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Swatch abbr={abbr} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.onPrimary, fontSize: typo.title, fontWeight: "900" }}>{title}</Text>
          {subtitle ? <Text style={{ color: c.onPrimary, opacity: 0.85, fontSize: typo.small, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** A titled card, with an optional link on the right ("See all ›"). */
export function Section({ title, action, children, style }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Card style={style}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.sm }}>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: t.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="link" hitSlop={8}>
            <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>{action.label} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

/** A number with its label under it; several sit side by side in a StatRow. */
export function Stat({ label, value, tone, onDark }: { label: string; value: string; tone?: "good" | "bad" | "gold"; onDark?: string }) {
  const t = useTheme();
  const color = onDark ?? (tone === "good" ? t.good : tone === "bad" ? t.score : tone === "gold" ? t.gold : t.text);
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ color, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ color: onDark ?? t.muted, opacity: onDark ? 0.8 : 1, fontSize: typo.tiny, marginTop: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: space.sm }}>{children}</View>;
}

/** A small rounded label: a status, a tag, a count. */
export function Pill({ label, tone = "muted" }: { label: string; tone?: "accent" | "muted" | "good" | "bad" | "gold" }) {
  const t = useTheme();
  const color = tone === "accent" || tone === "good" ? t.accent : tone === "bad" ? t.score : tone === "gold" ? t.gold : t.muted;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: color, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: typo.tiny, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );
}

/** Nothing here yet: what this space is for, and what to do. */
export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", padding: space.xl, gap: space.sm }}>
      <Ionicons name={icon} size={36} color={t.muted} />
      <Text style={{ color: t.text, fontSize: typo.heading, fontWeight: "700", textAlign: "center" }}>{title}</Text>
      {body ? <Text style={{ color: t.muted, textAlign: "center", maxWidth: 300 }}>{body}</Text> : null}
      {action ? (
        <View style={{ marginTop: space.sm }}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

/** A 0-100 bar with its label and value (owner's trust, fan mood, ratings). */
export function Meter({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: space.sm }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={{ flex: 1, color: t.muted, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: warn ? t.score : t.text, fontWeight: "700", fontSize: 12 }}>{Math.round(value)}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, marginTop: 3, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: 6, backgroundColor: warn ? t.score : t.accent }} />
      </View>
    </View>
  );
}

/** A full-size or small button; primary is filled with the accent color. */
export function Button({ label, onPress, primary, small, disabled }: { label: string; onPress: () => void; primary?: boolean; small?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        paddingHorizontal: small ? 12 : 16,
        height: small ? 34 : 44,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? t.accent : t.card,
        borderWidth: primary ? 0 : 1,
        borderColor: t.border,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: primary ? t.onAccent : t.text, fontWeight: "700", fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

/** A labeled text box. */
export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        {...props}
        style={{ height: 42, borderRadius: 8, borderWidth: 1, borderColor: t.border, paddingHorizontal: 10, color: t.text, backgroundColor: t.bg, fontSize: 15 }}
      />
    </View>
  );
}

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** An icon (Ionicons), in the text color unless given one. */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

/**
 * A row that opens a screen: icon, title, a live line under it (what's new
 * there), an optional badge (something waiting), and a chevron.
 */
export function NavRow({ icon, title, detail, badge, onPress, last }: { icon: IconName; title: string; detail?: string; badge?: string; onPress: () => void; last?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={19} color={t.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{title}</Text>
        {detail ? (
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={{ minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.onAccent, fontSize: 12, fontWeight: "800" }}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={t.muted} />
    </Pressable>
  );
}

/** A group of NavRows on one card, with an optional heading. */
export function NavGroup({ title, children }: { title?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {title ? <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginLeft: 4 }}>{title}</Text> : null}
      <View style={{ backgroundColor: t.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

/** A segmented control: one of a few sections of the same screen. */
export function Segmented<K extends string>({ options, value, onChange }: { options: ReadonlyArray<{ key: K; label: string }>; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.card, borderRadius: 10, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.accent : "transparent" }}
          >
            <Text style={{ color: on ? t.onAccent : t.text, fontWeight: on ? "800" : "600", fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A scrolling row of choices (weeks, positions, seasons): one is picked. */
export function Chips<K extends string | number>({ options, value, onChange }: { options: ReadonlyArray<{ key: K; label: string }>; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: on ? t.accent : t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: on ? t.accent : t.border }}
          >
            <Text style={{ color: on ? t.onAccent : t.text, fontWeight: on ? "800" : "600", fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
