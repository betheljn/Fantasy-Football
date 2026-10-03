// Standings: every division, by conference.
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { formatRecord, teamName } from "@dynasty/sim";
import { Card, LinkRow, SectionTitle, Swatch } from "../../components/ui";
import { useLeague } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export function StandingsSection() {
  const t = useTheme();
  const router = useRouter();
  const { league, standings, weeksPlayed, schedule, userTeam } = useLeague();
  const conferences = league.conferences;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {conferences.map((c) => (
          <View key={c.abbr} style={{ gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: t.text }}>{c.name}</Text>
            {standings
              .filter((d) => d.conference === c.abbr || d.conference === c.name)
              .map((d) => (
                <Card key={d.division}>
                  <SectionTitle>{d.division}</SectionTitle>
                  <View style={{ flexDirection: "row", paddingBottom: 2 }}>
                    <Text style={{ flex: 1, color: t.muted, fontSize: 12 }}>Team</Text>
                    {["W-L", "PF", "PA", "Strk"].map((h) => (
                      <Text key={h} style={{ width: h === "W-L" ? 56 : 40, textAlign: "right", color: t.muted, fontSize: 12 }}>
                        {h}
                      </Text>
                    ))}
                    <Text style={{ width: 18 }} />
                  </View>
                  {d.teams.map((rt, i) => (
                    <LinkRow key={rt.team} label={teamName(league.teams[rt.team]!)} onPress={() => router.push(`/team/${rt.team}`)}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Swatch abbr={rt.team} size={22} />
                          <Text style={{ color: rt.team === userTeam ? t.accent : t.text, fontWeight: i === 0 || rt.team === userTeam ? "700" : "400" }} numberOfLines={1}>
                            {league.teams[rt.team]!.state}
                          </Text>
                        </View>
                        <Text style={{ width: 56, textAlign: "right", color: t.text, fontVariant: ["tabular-nums"] }}>{formatRecord(rt.record)}</Text>
                        <Text style={{ width: 40, textAlign: "right", color: t.muted, fontVariant: ["tabular-nums"] }}>{rt.record.pointsFor}</Text>
                        <Text style={{ width: 40, textAlign: "right", color: t.muted, fontVariant: ["tabular-nums"] }}>{rt.record.pointsAgainst}</Text>
                        <Text style={{ width: 40, textAlign: "right", color: t.muted }}>{rt.record.streak || "–"}</Text>
                      </View>
                    </LinkRow>
                  ))}
                </Card>
              ))}
          </View>
        ))}
        {weeksPlayed === 0 ? <Text style={{ color: t.muted, textAlign: "center" }}>No games played yet.</Text> : null}
      </ScrollView>
    </View>
  );
}
