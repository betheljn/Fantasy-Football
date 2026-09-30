// The weekly Top 25 (computed from win pct and strength rating).
import { useRouter } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { formatRecord, teamName } from "@dynasty/sim";
import { Card, LinkRow, Swatch } from "../../components/ui";
import { useLeague } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export default function RankingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { league, rankings, weeksPlayed, schedule } = useLeague();
  const top = rankings.slice(0, 25);
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={top}
        keyExtractor={(e) => e.team}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text style={{ color: t.muted, marginBottom: 8 }}>{weeksPlayed === 0 ? "Preseason, from roster strength" : `After week ${weeksPlayed}`}</Text>
        }
        renderItem={({ item: e }) => (
          <Card style={{ marginBottom: 6, paddingVertical: 4 }}>
            <LinkRow label={`${e.rank}. ${teamName(league.teams[e.team]!)}`} onPress={() => router.push(`/team/${e.team}`)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ width: 26, textAlign: "right", fontSize: 18, fontWeight: "800", color: t.text, fontVariant: ["tabular-nums"] }}>{e.rank}</Text>
                <Swatch abbr={e.team} size={12} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>
                    {teamName(league.teams[e.team]!)}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    {formatRecord(e.record)} · strength {e.strength >= 0 ? "+" : ""}
                    {e.strength.toFixed(1)}
                  </Text>
                </View>
                <Text style={{ color: t.muted, fontVariant: ["tabular-nums"] }}>{e.score.toFixed(1)}</Text>
              </View>
            </LinkRow>
          </Card>
        )}
      />
    </View>
  );
}
