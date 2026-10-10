// The weekly Top 25 (computed from win pct and strength rating).
import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { STAGE_NAMES, formatRecord, postseasonStages, teamName } from "@dynasty/sim";
import { Card, LinkRow, Swatch } from "../../components/ui";
import { useLeague } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export function Top25Section() {
  const t = useTheme();
  const router = useRouter();
  const { league, rankings, weeksPlayed, schedule, userTeam, playoffs, playoffRoundsShown } = useLeague();
  // In the postseason (format 2) the ranking is redone after championship week and each round shown so far.
  const stage = playoffs?.titleGames && playoffRoundsShown > 0 ? postseasonStages(league)[playoffRoundsShown - 1] : undefined;
  const shown = stage === "titles" ? playoffs!.ranking : stage ? (playoffs!.roundRankings?.[stage] ?? rankings) : rankings;
  const top = shown.slice(0, 25);
  const caption = stage === "championship" ? "Final: after the championship" : stage ? `After ${STAGE_NAMES[stage].toLowerCase()}` : weeksPlayed === 0 ? "Preseason, from roster strength" : `After week ${weeksPlayed}`;
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={top}
        keyExtractor={(e) => e.team}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text style={{ color: t.muted, marginBottom: 8 }}>{caption}</Text>
        }
        renderItem={({ item: e, index }) => (
          <View style={{ backgroundColor: e.team === userTeam ? t.bg : t.card, paddingHorizontal: 12, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth, borderTopWidth: index === 0 ? StyleSheet.hairlineWidth : 0, borderTopLeftRadius: index === 0 ? 12 : 0, borderTopRightRadius: index === 0 ? 12 : 0, borderBottomLeftRadius: index === top.length - 1 ? 12 : 0, borderBottomRightRadius: index === top.length - 1 ? 12 : 0 }}>
            <LinkRow label={`${e.rank}. ${teamName(league.teams[e.team]!)}`} onPress={() => router.push(`/team/${e.team}`)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ width: 26, textAlign: "right", fontSize: 18, fontWeight: "800", color: e.rank <= 4 ? t.gold : t.text, fontVariant: ["tabular-nums"] }}>{e.rank}</Text>
                <Swatch abbr={e.team} size={30} />
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
          </View>
        )}
      />
    </View>
  );
}
