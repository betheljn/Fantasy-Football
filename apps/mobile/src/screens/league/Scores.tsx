// Schedule by week: results (tap to watch) and upcoming games.
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Card, Chips, Swatch } from "../../components/ui";
import { useLeague } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export function ScoresSection() {
  const t = useTheme();
  const router = useRouter();
  const { schedule, results, weeksPlayed, league, userTeam } = useLeague();
  // Open on the latest week played (or week 1 before any).
  const [week, setWeek] = useState(() => Math.max(1, weeksPlayed));
  const byId = useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);
  const games = schedule.games.filter((g) => g.week === week);
  const byes = Object.entries(schedule.byes).filter(([, w]) => w.includes(week)).map(([team]) => team);
  const weeks = Array.from({ length: schedule.weeks }, (_, i) => i + 1);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <Chips options={weeks.map((w) => ({ key: w, label: `Wk ${w}` }))} value={week} onChange={setWeek} />
      </View>
      <FlatList
        data={games}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        ListFooterComponent={byes.length ? <Text style={{ color: t.muted, marginTop: 8 }}>Bye: {byes.join(", ")}</Text> : null}
        renderItem={({ item: g }) => {
          const r = byId.get(g.id);
          // A loser's line is quieter, so the winner stands out at a glance.
          const side = (abbr: string, pts: number | undefined) => {
            const lost = !!r && r.winner !== null && r.winner !== abbr;
            const team = league.teams[abbr]!;
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Swatch abbr={abbr} size={24} />
                <Text style={{ flex: 1, color: lost ? t.muted : t.text, fontWeight: abbr === userTeam ? "800" : r?.winner === abbr ? "700" : "500" }} numberOfLines={1}>
                  {team.state} <Text style={{ fontWeight: "400" }}>{team.nickname}</Text>
                </Text>
                <Text style={{ color: lost ? t.muted : t.text, fontSize: 18, fontWeight: r?.winner === abbr ? "900" : "500", fontVariant: ["tabular-nums"] }}>{pts ?? ""}</Text>
              </View>
            );
          };
          return (
            <Pressable disabled={!r} onPress={() => router.push(`/game/${g.id}`)} accessibilityRole="button" accessibilityLabel={`${g.away} at ${g.home}${r ? ", watch" : ""}`}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, borderColor: g.home === userTeam || g.away === userTeam ? t.accent : t.border }}>
                <View style={{ flex: 1, gap: 4 }}>
                  {side(g.away, r?.awayScore)}
                  {side(g.home, r?.homeScore)}
                </View>
                <View style={{ width: 74, alignItems: "flex-end", gap: 2 }}>
                  <Text style={{ color: r ? t.text : t.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>{r ? `Final${r.overtime ? " OT" : ""}` : g.kind === "division" ? "Division" : g.kind === "conference" ? "Conf." : "Non-conf."}</Text>
                  {r ? <Text style={{ color: t.accent, fontSize: 12, fontWeight: "700" }}>Watch ›</Text> : null}
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
