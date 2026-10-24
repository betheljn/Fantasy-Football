// The dynasty's history: every season's champion and where you finished.
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Card, SectionTitle, Swatch } from "../components/ui";
import { friendSeries, friendSeriesLine } from "@dynasty/sim";
import { teamShort } from "../field/colors";
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
        {d.online ? <Friends /> : null}
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


/** Online: the friends' league history: each friend's titles and record against the others, and every series. */
function Friends() {
  const t = useTheme();
  const d = useDynasty();
  const humans = Object.keys(d.online?.humans ?? {});
  const games = d.save?.friendGames ?? [];
  const history = d.save?.dynasty.history ?? [];
  if (humans.length < 2) return null;
  const rows = humans
    .map((team) => {
      const vs = humans.filter((f) => f !== team).map((f) => friendSeries(games, team, f));
      return { team, titles: history.filter((h) => h.champion === team).length, w: vs.reduce((n, s) => n + s.wins[s.teams[0]]!, 0), l: vs.reduce((n, s) => n + s.wins[s.teams[1]]!, 0), ties: vs.reduce((n, s) => n + s.ties, 0) };
    })
    .sort((a, b) => b.titles - a.titles || b.w - b.l - (a.w - a.l) || a.team.localeCompare(b.team));
  const pairs = humans.flatMap((a, i) => humans.slice(i + 1).map((b) => friendSeries(games, a, b))).filter((s) => s.games > 0);
  return (
    <Card style={{ gap: 6 }}>
      <SectionTitle>The friends</SectionTitle>
      {rows.map((r) => (
        <View key={r.team} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
          <Swatch abbr={r.team} size={22} />
          <Text style={{ flex: 1, color: t.text, fontWeight: "700" }}>{teamShort(r.team)}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{r.titles ? `${r.titles} title${r.titles === 1 ? "" : "s"} · ` : ""}vs friends</Text>
          <Text style={{ color: t.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{`${r.w}-${r.l}${r.ties ? `-${r.ties}` : ""}`}</Text>
        </View>
      ))}
      {pairs.length > 0 ? (
        <>
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 6, fontWeight: "700" }}>EVERY SERIES</Text>
          {pairs.map((s) => (
            <Text key={s.teams.join("-")} style={{ color: t.text, fontSize: 13 }}>
              {friendSeriesLine(s, teamShort)}
              {s.streak && s.streak.n >= 2 ? <Text style={{ color: t.muted }}>{` · ${teamShort(s.streak.team)} won the last ${s.streak.n}`}</Text> : null}
            </Text>
          ))}
        </>
      ) : (
        <Text style={{ color: t.muted, fontSize: 12 }}>No friends have met yet. Their games will show up here, every season.</Text>
      )}
    </Card>
  );
}
