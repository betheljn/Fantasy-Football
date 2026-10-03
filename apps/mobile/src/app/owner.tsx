// Your job: who you answer to (the board, or an owner with goals), their
// trust, the fans' mood, what's expected this season, and past reviews.
import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { OWNER_GOALS, teamOwner } from "@dynasty/sim";
import { Card, Meter, SectionTitle } from "../components/ui";
import { useDynasty, useLeague, type LeagueData } from "../league/LeagueProvider";
import { useTheme } from "../theme";

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
          <Meter label="Owner's trust" value={office.trust} warn={office.trust < 35} />
        </>
      ) : (
        <Text style={{ color: t.muted }}>You own the team. The board grades each season; nobody can fire you.</Text>
      )}
      <Meter label="Fan mood" value={office.fanMood} warn={office.fanMood < 35} />
      {office.expectedWins !== undefined ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Expected this season: about {Math.round(office.expectedWins)} wins.</Text> : null}
      {last ? (
        <Text style={{ color: t.muted, fontSize: 13, marginTop: 6 }}>
          {last.season}: grade {last.grade}. {last.verdict}
        </Text>
      ) : null}
    </Card>
  );
}
