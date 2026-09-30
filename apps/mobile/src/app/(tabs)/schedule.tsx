// Schedule by week: results (tap to watch) and upcoming games.
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { Card, Swatch } from "../../components/ui";
import { useLeague } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export default function ScheduleScreen() {
  const t = useTheme();
  const router = useRouter();
  const { schedule, results, weeksPlayed } = useLeague();
  const [week, setWeek] = useState(1);
  const byId = useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);
  const games = schedule.games.filter((g) => g.week === week);
  const byes = Object.entries(schedule.byes).filter(([, w]) => w.includes(week)).map(([team]) => team);
  const weeks = Array.from({ length: schedule.weeks }, (_, i) => i + 1);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, height: 58 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: "center" }}>
        {weeks.map((w) => (
          <Pressable
            key={w}
            onPress={() => setWeek(w)}
            accessibilityRole="button"
            accessibilityState={{ selected: w === week }}
            style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: "center", backgroundColor: w === week ? t.accent : t.card, borderWidth: 1, borderColor: w === week ? t.accent : t.border }}
          >
            <Text style={{ color: w === week ? t.onAccent : t.text, fontWeight: "600" }}>Wk {w}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={games}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        ListFooterComponent={byes.length ? <Text style={{ color: t.muted, marginTop: 8 }}>Bye: {byes.join(", ")}</Text> : null}
        renderItem={({ item: g }) => {
          const r = byId.get(g.id);
          const side = (abbr: string, pts: number | undefined) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Swatch abbr={abbr} />
              <Text style={{ flex: 1, color: t.text, fontWeight: r?.winner === abbr ? "800" : "400" }}>{abbr}</Text>
              <Text style={{ color: t.text, fontWeight: r?.winner === abbr ? "800" : "400", fontVariant: ["tabular-nums"] }}>{pts ?? ""}</Text>
            </View>
          );
          return (
            <Pressable disabled={!r} onPress={() => router.push(`/game/${g.id}`)} accessibilityRole="button" accessibilityLabel={`${g.away} at ${g.home}${r ? ", watch" : ""}`}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  {side(g.away, r?.awayScore)}
                  {side(g.home, r?.homeScore)}
                </View>
                <Text style={{ width: 64, textAlign: "right", color: r ? t.accent : t.muted, fontSize: 12, fontWeight: "600" }}>
                  {r ? `Final${r.overtime ? "/OT" : ""}\nWatch ›` : g.kind === "division" ? "Division" : g.kind === "conference" ? "Conference" : "Non-conf."}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
