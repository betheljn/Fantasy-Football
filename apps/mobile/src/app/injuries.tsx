// The injury report: your injured players and when they're back, injury news
// from around the league this season, and every team's injured list.
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { IR_MIN_WEEKS, ROSTER_MAX, allTeams, backLabel, formatMoney, injuryLabel, injuryReport, playerOverall, teamName, type InjuryNews, type InjuryReportEntry } from "@dynasty/sim";
import { Button, Card, EmptyState, LinkRow, Pill, SectionTitle, Segmented, Swatch } from "../components/ui";
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
  const reserve = league.teams[userTeam]!.reserve ?? [];
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const moves = [...(d.save?.moves ?? [])].reverse();

  return (
    <>
      <Stack.Screen options={{ title: "Injury report" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Segmented
          options={[
            { key: "mine", label: `Yours (${mine.length})` },
            { key: "news", label: "League news" },
            { key: "all", label: `All (${report.length})` },
          ]}
          value={view}
          onChange={setView}
        />
        {seasonOver ? <Text style={{ color: t.muted }}>As the regular season ended. Everyone is healthy again by the offseason.</Text> : null}

        {view === "mine" ? (
          <>
            <Card>
              <SectionTitle>{teamName(league.teams[userTeam]!)}</SectionTitle>
              {mine.length === 0 ? <EmptyState icon="fitness-outline" title="Everyone's healthy" body="Nobody hurt. Enjoy it." /> : null}
              {mine.map((e) => (
                <View key={e.player.id}>
                  <ReportRow e={e} theme={t} />
                  {d.canMakeMoves && e.injury.weeks >= IR_MIN_WEEKS ? (
                    <View style={{ marginLeft: 36, marginBottom: 8, alignSelf: "flex-start" }}>
                      <Button small label="Place on injured reserve" onPress={() => setMessage(d.placeOnIR(e.player.id).join(" ") || `${e.player.firstName} ${e.player.lastName} is on injured reserve for the season.`)} />
                    </View>
                  ) : null}
                </View>
              ))}
              {message ? <Text style={{ color: t.text, fontWeight: "700", marginTop: 6 }}>{message}</Text> : null}
              <Text style={{ color: t.muted, fontSize: 12, marginTop: 8 }}>
                Roster {league.teams[userTeam]!.roster.length} of {ROSTER_MAX}. Players out {IR_MIN_WEEKS}+ weeks can go on injured reserve to free a spot for a free agent.
              </Text>
              {d.canMakeMoves ? (
                <Pressable onPress={() => router.push("/freeagents")} accessibilityRole="button" style={{ marginTop: 8 }}>
                  <Text style={{ color: t.accent, fontWeight: "700" }}>Free agents ›</Text>
                </Pressable>
              ) : null}
            </Card>
            {reserve.length > 0 ? (
              <Card>
                <SectionTitle>Injured reserve</SectionTitle>
                {reserve.map((p) => (
                  <View key={p.id} style={{ flexDirection: "row", gap: 8, paddingVertical: 3 }}>
                    <Text style={{ width: 28, color: t.muted }}>{p.position}</Text>
                    <Text style={{ flex: 1, color: t.text }}>
                      {p.firstName} {p.lastName} <Text style={{ color: t.muted, fontSize: 12 }}>{p.injury?.type}</Text>
                    </Text>
                    <Text style={{ color: t.muted, fontSize: 12 }}>Back next season</Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}

        {view === "news" && moves.length > 0 ? (
          <Card>
            <SectionTitle>Signings and injured reserve</SectionTitle>
            {moves.slice(0, 30).map((m, i) => (
              <View key={`${m.player}-${i}`} style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                <Text style={{ width: 40, color: t.muted, fontSize: 12 }}>Wk {m.week}</Text>
                <Swatch abbr={m.team} size={20} />
                <Text style={{ flex: 1, color: m.team === userTeam ? t.text : t.muted, fontSize: 13, fontWeight: m.team === userTeam ? "700" : "400" }}>
                  {m.team} {m.kind === "signed" ? `signs ${m.position} ${m.name} (${m.overall}) for ${formatMoney(m.salary ?? 0)}` : `puts ${m.position} ${m.name} (${m.overall}) on injured reserve`}
                </Text>
              </View>
            ))}
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
                    <Swatch abbr={team.abbr} size={26} />
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
        <Pill label={backLabel(e.returnWeek, schedule.weeks)} tone={e.returnWeek === null ? "bad" : "muted"} />
        <Text style={{ width: 26, textAlign: "right", color: t.text, fontWeight: "800" }}>{playerOverall(e.player)}</Text>
      </View>
    </LinkRow>
  );
}

function NewsRow({ n, mine, theme: t }: { n: InjuryNews; mine: boolean; theme: Theme }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, paddingVertical: 5, alignItems: "flex-start" }}>
      <Text style={{ width: 40, color: t.muted, fontSize: 12 }}>Wk {n.week}</Text>
      <Swatch abbr={n.team} size={20} />
      <Text style={{ flex: 1, color: mine ? t.text : t.muted, fontWeight: mine ? "700" : "400", fontSize: 13 }}>
        {n.team} {n.starter ? "starting " : ""}
        {n.position} {n.name} ({n.overall}): {injuryLabel(n)}
      </Text>
    </View>
  );
}
