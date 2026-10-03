// The Hall of Fame: every inductee, this year's ballot (cast your vote; it's
// counted with the media's when the season ends), and last year's results.
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { HOF_RULES, hofBallot, type HofCandidate } from "@dynasty/sim";
import { Card, SectionTitle, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

export default function HallOfFameScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, schedule } = useLeague();
  const dynasty = d.save!.dynasty;
  const [view, setView] = useState<"ballot" | "hall">("ballot");
  const ballot = useMemo(() => hofBallot(dynasty, schedule.season), [dynasty, schedule.season]);
  const mine = d.save?.hofVote ?? [];
  const members = [...(dynasty.hallOfFame ?? [])].reverse();
  const last = dynasty.hofVotes?.at(-1);
  const st = (abbr: string) => league.teams[abbr]?.state ?? abbr;

  return (
    <>
      <Stack.Screen options={{ title: "Hall of Fame" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(
            [
              ["ballot", `${schedule.season} ballot`],
              ["hall", `The Hall (${members.length})`],
            ] as const
          ).map(([key, label]) => (
            <Pressable key={key} onPress={() => setView(key)} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: view === key ? t.accent : t.card, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: view === key ? t.onAccent : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {view === "ballot" ? (
          <>
            <Card>
              <Text style={{ color: t.text }}>
                Vote for up to {HOF_RULES.votesPerBallot}. Your ballot counts alongside {HOF_RULES.voters} media voters when the season ends; {Math.round(HOF_RULES.induct * 100)}% gets a player in (at most {HOF_RULES.maxClass} a year).
              </Text>
              <Text style={{ color: t.muted, marginTop: 4 }}>
                Your votes: {mine.length} of {HOF_RULES.votesPerBallot}
              </Text>
            </Card>
            {ballot.length === 0 ? (
              <Text style={{ color: t.muted }}>No one is eligible yet. Careers count from your dynasty's first season, and players have to sit out a season after they retire: the first class takes a few years.</Text>
            ) : null}
            {ballot.map((c) => (
              <Candidate key={c.id} c={c} on={mine.includes(c.id)} onPress={() => d.toggleHofVote(c.id)} st={st} theme={t} />
            ))}
            {last && last.results.length > 0 ? (
              <Card>
                <SectionTitle>{last.season} vote</SectionTitle>
                {last.results.slice(0, 8).map((r) => (
                  <Text key={r.candidate.id} style={{ color: r.inducted ? t.accent : t.text, paddingVertical: 2, fontWeight: r.inducted ? "800" : "400" }}>
                    {Math.round(r.pct * 100)}% · {r.candidate.position} {r.candidate.name}
                    {r.inducted ? " · inducted" : ""}
                  </Text>
                ))}
              </Card>
            ) : null}
          </>
        ) : (
          <>
            {members.length === 0 ? <Text style={{ color: t.muted }}>The Hall is waiting for its first class.</Text> : null}
            {members.map((m) => (
              <Card key={m.id} style={{ borderColor: "#f5b83d", borderWidth: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: "#f5b83d", fontWeight: "900", fontSize: 11, letterSpacing: 0.5 }}>CLASS OF {m.season}</Text>
                  <Text style={{ flex: 1, textAlign: "right", color: t.muted, fontSize: 12 }}>{Math.round(m.pct * 100)}% of ballots</Text>
                </View>
                <Text style={{ color: t.text, fontWeight: "800", fontSize: 17, marginTop: 4 }}>
                  {m.position} {m.name}
                </Text>
                <Text style={{ color: t.muted, marginTop: 2 }}>{m.line}</Text>
                {m.awards.length ? <Text style={{ color: t.muted, marginTop: 2 }}>{m.awards.join(" · ")}</Text> : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <Swatch abbr={m.team} />
                  <Text style={{ color: t.text, fontSize: 13 }}>
                    {st(m.team)} retired #{m.jersey ?? "?"}
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Candidate({ c, on, onPress, st, theme: t }: { c: HofCandidate; on: boolean; onPress: () => void; st: (a: string) => string; theme: Theme }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Card style={on ? { borderColor: t.accent, borderWidth: 2 } : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ width: 20, color: on ? t.accent : t.muted, fontWeight: "900" }}>{on ? "✓" : "○"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800" }}>
              {c.position} {c.name}
            </Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>{c.line}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {c.teams.map(st).join(", ")} · last played {c.lastSeason}
              {c.awards.length ? ` · ${c.awards.join(", ")}` : ""}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
