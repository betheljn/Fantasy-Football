import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LeagueProvider } from "../league/LeagueProvider";
import { useTheme } from "../theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <LeagueProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.text,
          headerTitleStyle: { color: t.text },
          contentStyle: { backgroundColor: t.bg },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </LeagueProvider>
  );
}
