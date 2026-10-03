import { useColorScheme } from "react-native";

const light = {
  bg: "#f4f5f2",
  card: "#ffffff",
  text: "#15181c",
  muted: "#626a73",
  border: "#dde1e4",
  accent: "#1f7a4d",
  onAccent: "#ffffff",
  score: "#b3261e",
  scoreBg: "#fdecea",
  gold: "#b7860b",
  good: "#1f7a4d",
  warn: "#b25e09",
};
const dark: typeof light = {
  bg: "#0f1214",
  card: "#181c20",
  text: "#eef1f3",
  muted: "#98a2ab",
  border: "#2a3036",
  accent: "#4cc38a",
  onAccent: "#07140d",
  score: "#ff8a80",
  scoreBg: "#3a1f1d",
  gold: "#f5b83d",
  good: "#4cc38a",
  warn: "#f0a35a",
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

/** Spacing, corner and type scales: every screen uses these, so they all line up. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
export const typo = { title: 22, heading: 17, body: 15, small: 13, tiny: 11 } as const;
