import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useLeagueMaybe } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const t = useTheme();
  // League tabs only once there's a league with your team in it.
  const ready = !!useLeagueMaybe()?.userTeam;
  const hidden = ready ? {} : { href: null };
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTitleStyle: { color: t.text },
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="standings" options={{ title: "Standings", tabBarIcon: icon("☰"), ...hidden }} />
      <Tabs.Screen name="schedule" options={{ title: "Schedule", tabBarIcon: icon("▦"), ...hidden }} />
      <Tabs.Screen name="rankings" options={{ title: "Top 25", tabBarIcon: icon("★"), ...hidden }} />
      <Tabs.Screen name="teams" options={{ title: "Teams", tabBarIcon: icon("◉"), ...hidden }} />
    </Tabs>
  );
}
