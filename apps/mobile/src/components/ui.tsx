// Small shared building blocks for list-style screens.
import type { ReactNode } from "react";
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
