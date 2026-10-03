// All 50 teams, by conference and division.
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { formatRecord, teamName } from "@dynasty/sim";
import { Card, LinkRow, SectionTitle, Swatch } from "../../components/ui";
import { useLeague } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export function TeamsSection() {
  const t = useTheme();
  const router = useRouter();
  const { league, standings } = useLeague();
  const record = new Map(standings.flatMap((d) => d.teams.map((rt) => [rt.team, rt.record])));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {league.conferences.map((c) => (
        <View key={c.abbr} style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.text }}>{c.name}</Text>
          {c.divisions.map((d) => (
            <Card key={d.name}>
              <SectionTitle>{d.name}</SectionTitle>
              {d.teams.map((abbr) => {
                const team = league.teams[abbr]!;
                const r = record.get(abbr);
                return (
                  <LinkRow key={abbr} label={teamName(team)} onPress={() => router.push(`/team/${abbr}`)}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Swatch abbr={abbr} size={12} />
                      <Text style={{ flex: 1, color: t.text }}>{teamName(team)}</Text>
                      <Text style={{ color: t.muted, fontVariant: ["tabular-nums"] }}>{r ? formatRecord(r) : "0-0"}</Text>
                    </View>
                  </LinkRow>
                );
              })}
            </Card>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
