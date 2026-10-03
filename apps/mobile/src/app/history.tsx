// The dynasty's history: every season's champion and where you finished.
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague, type LeagueData } from "../league/LeagueProvider";
import { useTheme } from "../theme";

export default function HistoryScreen() {
  const t = useTheme();
  const data = useLeague();
  const d = useDynasty();
  return (
    <>
      <Stack.Screen options={{ title: "Dynasty history" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {(d.save?.dynasty.history ?? []).length === 0 ? <Text style={{ color: t.muted }}>Your first season is still being written. Champions show up here after each one.</Text> : <History data={data} />}
      </ScrollView>
    </>
  );
}

function History({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const history = d.save?.dynasty.history ?? [];
  if (history.length === 0) return null;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <SectionTitle>Dynasty history</SectionTitle>
        </View>
        <Pressable onPress={() => router.push("/halloffame")} accessibilityRole="link" style={{ marginRight: 12 }}>
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Hall of Fame ›</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/trophies")} accessibilityRole="link">
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Trophy room ›</Text>
        </Pressable>
      </View>
      {[...history].reverse().map((h) => {
        const mine = h.top25.find((e) => e.team === data.userTeam);
        return (
          <View key={h.season} style={{ flexDirection: "row", paddingVertical: 3 }}>
            <Text style={{ width: 48, color: t.muted }}>{h.season}</Text>
            <Text style={{ flex: 1, color: t.text }}>
              Champion {h.champion}
              {h.champion === data.userTeam ? " ★" : ""}
            </Text>
            <Text style={{ color: t.muted }}>{mine ? `you: No. ${mine.rank}` : ""}</Text>
          </View>
        );
      })}
    </Card>
  );
}

