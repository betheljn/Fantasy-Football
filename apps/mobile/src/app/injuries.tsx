// The injury report: your injured players and when they're back, injury news
// from around the league this season, and every team's injured list.
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { allTeams, backLabel, injuryLabel, injuryReport, playerOverall, teamName, type InjuryNews, type InjuryReportEntry } from "@dynasty/sim";
import { Card, LinkRow, SectionTitle, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

type View_ = "mine" | "news" | "all";

export default function InjuriesScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, weeksPlayed, schedule } = useLeague();
  const [view, setView] = useState<View_>("mine");
  const report = useMemo(() => injuryReport(league, weeksPlayed), [league, weeksPlayed]);
  const mine = report.filter((e) => e.team === userTeam);
  // Newest week first; within a week, the longest absences first.
  const news = [...(d.save?.injuryNews ?? [])].sort((a, b) => b.week - a.week || b.weeks - a.weeks || b.overall - a.overall);
  const seasonOver = weeksPlayed >= schedule.weeks;

  return (
    <>
      <Stack.Screen options={{ title: "Injury report" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(
            [
              ["mine", `Your team (${mine.length})`],
              ["news", "League news"],
              ["all", `All teams (${report.length})`],
            ] as const
          ).map(([key, label]) => (
            <Pressable key={key} onPress={() => setView(key)} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: view === key ? t.accent : t.card, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: view === key ? t.onAccent : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {seasonOver ? <Text style={{ color: t.muted }}>As the regular season ended. Everyone is healthy again by the offseason.</Text> : null}

        {view === "mine" ? (
          <Card>
            <SectionTitle>{teamName(league.teams[userTeam]!)}</SectionTitle>
            {mine.length === 0 ? <Text style={{ color: t.muted }}>Nobody hurt. Enjoy it.</Text> : mine.map((e) => <ReportRow key={e.player.id} e={e} theme={t} />)}
          </Card>
        ) : null}

        {view === "news" ? (
          <Card>
            <SectionTitle>This season</SectionTitle>
            {news.length === 0 ? <Text style={{ color: t.muted }}>No major injuries yet.</Text> : null}
            {news.map((n, i) => (
              <NewsRow key={`${n.player}-${i}`} n={n} mine={n.team === userTeam} theme={t} />
            ))}
          </Card>
        ) : null}

        {view === "all"
          ? allTeams(league)
              .map((team) => ({ team, rows: report.filter((e) => e.team === team.abbr) }))
              .filter((x) => x.rows.length > 0)
              .sort((a, b) => b.rows.filter((e) => e.starter).length - a.rows.filter((e) => e.starter).length || b.rows.length - a.rows.length)
              .map(({ team, rows }) => (
                <Card key={team.abbr}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Swatch abbr={team.abbr} />
                    <Text style={{ flex: 1, color: t.text, fontWeight: "700" }}>{teamName(team)}</Text>
                    <Text style={{ color: t.muted, fontSize: 12 }}>
                      {rows.length} out{rows.some((e) => e.starter) ? ` · ${rows.filter((e) => e.starter).length} starter${rows.filter((e) => e.starter).length === 1 ? "" : "s"}` : ""}
                    </Text>
                  </View>
                  {rows.map((e) => (
                    <ReportRow key={e.player.id} e={e} theme={t} />
                  ))}
                </Card>
              ))
          : null}
      </ScrollView>
    </>
  );
}

function ReportRow({ e, theme: t }: { e: InjuryReportEntry; theme: Theme }) {
  const router = useRouter();
  const { schedule } = useLeague();
  return (
    <LinkRow label={`${e.player.firstName} ${e.player.lastName}`} onPress={() => router.push(`/player/${e.player.id}`)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ width: 28, color: t.muted }}>{e.player.position}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: e.starter ? "700" : "400" }} numberOfLines={1}>
            {e.player.firstName} {e.player.lastName}
            {e.starter ? <Text style={{ color: t.muted, fontSize: 12, fontWeight: "400" }}> · starter</Text> : null}
          </Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{e.injury.type}</Text>
        </View>
        <Text style={{ color: e.returnWeek === null ? t.score : t.text, fontSize: 12, fontWeight: "700" }}>{backLabel(e.returnWeek, schedule.weeks)}</Text>
        <Text style={{ width: 26, textAlign: "right", color: t.text, fontWeight: "800" }}>{playerOverall(e.player)}</Text>
      </View>
    </LinkRow>
  );
}

function NewsRow({ n, mine, theme: t }: { n: InjuryNews; mine: boolean; theme: Theme }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, paddingVertical: 5, alignItems: "flex-start" }}>
      <Text style={{ width: 40, color: t.muted, fontSize: 12 }}>Wk {n.week}</Text>
      <Swatch abbr={n.team} />
      <Text style={{ flex: 1, color: mine ? t.text : t.muted, fontWeight: mine ? "700" : "400", fontSize: 13 }}>
        {n.team} {n.starter ? "starting " : ""}
        {n.position} {n.name} ({n.overall}): {injuryLabel(n)}
      </Text>
    </View>
  );
}
