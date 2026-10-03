import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useLeagueMaybe } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
const icon =
  (name: IconName, active: IconName) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => <Ionicons name={focused ? active : name} size={22} color={color as string} />;

/**
 * Five tabs, by what you're doing: Home (this week), Team (running yours),
 * League (everyone else), Media (the talk), Office (the business and the
 * history). Only Home until there's a league with your team in it.
 */
export default function TabsLayout() {
  const t = useTheme();
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
        // A quick cross-fade between tabs.
        animation: "fade",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline", "home") }} />
      <Tabs.Screen name="team" options={{ title: "Team", tabBarIcon: icon("shirt-outline", "shirt"), ...hidden }} />
      <Tabs.Screen name="league" options={{ title: "League", tabBarIcon: icon("trophy-outline", "trophy"), ...hidden }} />
      <Tabs.Screen name="media" options={{ title: "Media", tabBarIcon: icon("newspaper-outline", "newspaper"), ...hidden }} />
      <Tabs.Screen name="office" options={{ title: "Office", tabBarIcon: icon("business-outline", "business"), ...hidden }} />
    </Tabs>
  );
}
