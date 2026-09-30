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
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
