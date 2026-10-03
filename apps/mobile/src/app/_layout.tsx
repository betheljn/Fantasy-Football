import { Redirect, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { LeagueProvider, useDynasty, useLeagueMaybe } from "../league/LeagueProvider";
import { useTheme } from "../theme";

export default function RootLayout() {
  return (
    <LeagueProvider>
      <Gate />
      <StatusBar style="auto" />
    </LeagueProvider>
  );
}

/**
 * League screens need a loaded dynasty: wait for the save to load, and send a
 * link to a league screen back home when there's no dynasty (yet).
 */
function Gate() {
  const t = useTheme();
  const d = useDynasty();
  const league = useLeagueMaybe();
  const path = usePathname();
  if (d.phase === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  // Online leagues live on the server, so their screens don't need a dynasty here.
  if (!league?.userTeam && path !== "/" && !path.startsWith("/online")) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        headerTitleStyle: { color: t.text },
        contentStyle: { backgroundColor: t.bg },
        headerBackButtonDisplayMode: "minimal",
        // Screens slide in from the side (the platform's own feel on iOS and Android).
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
