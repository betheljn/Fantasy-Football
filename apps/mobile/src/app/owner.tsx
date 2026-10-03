// Your job: who you answer to (the board, or an owner with goals), their
// trust, the fans' mood, what's expected this season, and past reviews.
import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { OWNER_GOALS, teamOwner } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague, type LeagueData } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

export default function OwnerScreen() {
  const t = useTheme();
  const data = useLeague();
  const d = useDynasty();
  const reviews = [...(d.save?.office?.reviews ?? [])].reverse();
  return (
    <>
      <Stack.Screen options={{ title: "Owner and fans" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <OwnerCard data={data} />
        {reviews.length > 1 ? (
          <Card>
            <SectionTitle>Past reviews</SectionTitle>
            {reviews.slice(1).map((r) => (
              <Text key={r.season} style={{ color: t.text, paddingVertical: 2 }}>
                {r.season}: grade {r.grade}. <Text style={{ color: t.muted }}>{r.verdict}</Text>
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

function OwnerCard({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const office = d.save?.office;
  if (!office) return null;
  const owner = teamOwner(data.league.seed, data.userTeam);
  const last = office.reviews.at(-1);
  return (
    <Card>
      <SectionTitle>{office.role === "owner" ? "The board" : `Your owner: ${owner.name}`}</SectionTitle>
      {office.role === "gm" ? (
        <>
          <Text style={{ color: t.text }}>
            Wants: <Text style={{ fontWeight: "700" }}>{OWNER_GOALS[owner.goal].name}</Text> ({OWNER_GOALS[owner.goal].wants}).
          </Text>
          <Meter label="Owner's trust" value={office.trust} warn={office.trust < 35} theme={t} />
        </>
      ) : (
        <Text style={{ color: t.muted }}>You own the team. The board grades each season; nobody can fire you.</Text>
      )}
      <Meter label="Fan mood" value={office.fanMood} warn={office.fanMood < 35} theme={t} />
      {office.expectedWins !== undefined ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Expected this season: about {Math.round(office.expectedWins)} wins.</Text> : null}
      {last ? (
        <Text style={{ color: t.muted, fontSize: 13, marginTop: 6 }}>
          {last.season}: grade {last.grade}. {last.verdict}
        </Text>
      ) : null}
    </Card>
  );
}

function Meter({ label, value, warn, theme: t }: { label: string; value: number; warn: boolean; theme: Theme }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={{ flex: 1, color: t.muted, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: warn ? t.score : t.text, fontWeight: "700", fontSize: 12 }}>{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, marginTop: 3, overflow: "hidden" }}>
        <View style={{ width: `${value}%`, height: 6, backgroundColor: warn ? t.score : t.accent }} />
      </View>
    </View>
  );
}

