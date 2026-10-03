// Small shared building blocks for list-style screens.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { teamColor } from "../field/colors";
import { useTheme } from "../theme";

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

/** Team color swatch. */
export function Swatch({ abbr, size = 10 }: { abbr: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: teamColor(abbr) }} />;
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
