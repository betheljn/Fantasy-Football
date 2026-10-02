// A team: record and ranking, staff, cap, schedule and results, and the roster
// by position in depth-chart order.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  POSITIONS,
  STAFF_ROLE_NAMES,
  formatMoney,
  formatRecord,
  payroll,
  outLabel,
  playerOverall,
  salaryCap,
  staffOverall,
  teamName,
  type StaffMember,
} from "@dynasty/sim";
import { Card, LinkRow, SectionTitle, Swatch } from "../../components/ui";
import { useLeague } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export default function TeamScreen() {
  const t = useTheme();
  const router = useRouter();
  const { abbr } = useLocalSearchParams<{ abbr: string }>();
  const { league, schedule, results, standings, rankings, userTeam } = useLeague();
  const team = league.teams[abbr ?? ""];
  if (!team) return <Text style={{ padding: 16, color: t.text }}>Unknown team.</Text>;

  const rec = standings.flatMap((d) => d.teams).find((rt) => rt.team === team.abbr)?.record;
  const divRank = standings.find((d) => d.teams.some((rt) => rt.team === team.abbr));
  const rank = rankings.find((e) => e.team === team.abbr)?.rank;
  const cap = salaryCap(league.seed, league.season);
  const pay = payroll(team, league.season);
  const byId = new Map(results.map((r) => [r.id, r]));
  const games = schedule.games.filter((g) => g.home === team.abbr || g.away === team.abbr);
  const staff = team.staff ? ([team.staff.hc, team.staff.oc, team.staff.dc, team.staff.gm, team.staff.scout] as StaffMember[]) : [];
  const player = (id: string) => team.roster.find((p) => p.id === id)!;

  return (
    <>
      <Stack.Screen options={{ title: team.abbr }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Swatch abbr={team.abbr} size={18} />
            <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: t.text }}>{teamName(team)}</Text>
          </View>
          <Text style={{ color: t.muted, marginTop: 6 }}>
            {rec ? formatRecord(rec) : "0-0"}
            {divRank ? ` · ${ordinal(divRank.teams.findIndex((rt) => rt.team === team.abbr) + 1)} in ${divRank.division}` : ""}
            {rank && rank <= 25 ? ` · No. ${rank}` : ""}
          </Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>
            Payroll {formatMoney(pay)} of {formatMoney(cap)} cap ({((pay / cap) * 100).toFixed(0)}%)
          </Text>
          {team.abbr === userTeam ? (
            <Pressable onPress={() => router.push("/depth")} accessibilityRole="button" style={{ marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 12, height: 34, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: t.accent }}>
              <Text style={{ color: t.accent, fontWeight: "700" }}>Depth chart</Text>
            </Pressable>
          ) : null}
        </Card>

        <Card>
          <SectionTitle>Staff</SectionTitle>
          {staff.map((m) => (
            <View key={m.role} style={{ flexDirection: "row", paddingVertical: 3 }}>
              <Text style={{ width: 150, color: t.muted }}>{STAFF_ROLE_NAMES[m.role]}</Text>
              <Text style={{ flex: 1, color: t.text }}>
                {m.firstName} {m.lastName}
              </Text>
              <Text style={{ color: t.muted, fontVariant: ["tabular-nums"] }}>{staffOverall(m)}</Text>
            </View>
          ))}
        </Card>

        <Card>
          <SectionTitle>Schedule</SectionTitle>
          {games.map((g) => {
            const home = g.home === team.abbr;
            const opp = home ? g.away : g.home;
            const r = byId.get(g.id);
            const us = r ? (home ? r.homeScore : r.awayScore) : null;
            const them = r ? (home ? r.awayScore : r.homeScore) : null;
            const wl = !r ? "" : r.winner === team.abbr ? "W" : r.winner === null ? "T" : "L";
            const row = (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ width: 44, color: t.muted }}>Wk {g.week}</Text>
                <Text style={{ width: 22, color: t.muted }}>{home ? "vs" : "@"}</Text>
                <Swatch abbr={opp} />
                <Text style={{ flex: 1, color: t.text }}>{opp}</Text>
                <Text style={{ color: wl === "W" ? t.accent : wl === "L" ? t.score : t.muted, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {r ? `${wl} ${us}-${them}` : ""}
                </Text>
              </View>
            );
            return r ? (
              <LinkRow key={g.id} label={`Week ${g.week} vs ${opp}, watch`} onPress={() => router.push(`/game/${g.id}`)}>
                {row}
              </LinkRow>
            ) : (
              <View key={g.id} style={{ paddingVertical: 8, paddingRight: 26 }}>
                {row}
              </View>
            );
          })}
        </Card>

        <Card>
          <SectionTitle>Roster</SectionTitle>
          {POSITIONS.map((pos) => (
            <View key={pos} style={{ marginBottom: 8 }}>
              <Text style={{ color: t.muted, fontWeight: "700", marginTop: 4 }}>{pos}</Text>
              {team.depthChart[pos].map((id, i) => {
                const p = player(id);
                return (
                  <LinkRow key={id} label={`${p.firstName} ${p.lastName}`} onPress={() => router.push(`/player/${id}`)}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ width: 30, color: t.muted, fontVariant: ["tabular-nums"] }}>#{p.jersey}</Text>
                      <Text style={{ flex: 1, color: t.text, fontWeight: i === 0 ? "700" : "400" }} numberOfLines={1}>
                        {p.firstName} {p.lastName}
                        {p.injury ? <Text style={{ color: t.score, fontSize: 12, fontWeight: "700" }}> {outLabel(p.injury)}</Text> : null}
                      </Text>
                      <Text style={{ width: 56, color: t.muted }} numberOfLines={1}>
                        age {p.age}
                      </Text>
                      <Text style={{ width: 28, textAlign: "right", color: t.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{playerOverall(p)}</Text>
                    </View>
                  </LinkRow>
                );
              })}
            </View>
          ))}
        </Card>
      </ScrollView>
    </>
  );
}

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
