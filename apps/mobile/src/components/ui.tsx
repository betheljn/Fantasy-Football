// Small shared building blocks for list-style screens.
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
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

/** Shown while the season is still being simulated in the background. */
export function SimProgress({ weeksPlayed, weeks }: { weeksPlayed: number; weeks: number }) {
  const t = useTheme();
  if (weeksPlayed >= weeks) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border }}>
      <ActivityIndicator size="small" color={t.accent} />
      <Text style={{ color: t.muted, fontSize: 13 }}>
        Simulating the season… week {weeksPlayed} of {weeks}
      </Text>
    </View>
  );
}
