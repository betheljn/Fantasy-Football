// The spring season: the players who don't dress on game day, pooled into ten
// regional teams. Standings, the final, the MVP, and the breakouts who come
// back better (yours are highlighted: worth a look on your depth chart).
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SPRING_RULES, type SpringSeason } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

export default function SpringScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { userTeam, league } = useLeague();
  const springs = d.save?.dynasty.springs ?? [];
  const spring = springs.at(-1);

  if (!spring) {
    return (
      <>
        <Stack.Screen options={{ title: "Spring season" }} />
        <View style={{ padding: 16 }}>
          <Text style={{ color: t.muted }}>The spring season is played after each offseason, before the new season starts.</Text>
        </View>
      </>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: `${spring.season} spring season` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Champion s={spring} theme={t} />
        <Breakouts s={spring} userTeam={userTeam} state={(a) => league.teams[a]?.state ?? a} theme={t} />
        <Standings s={spring} theme={t} />
        <Card>
          <SectionTitle>Results</SectionTitle>
          {spring.games.map((g) => {
            const name = (abbr: string) => spring.teams.find((x) => x.abbr === abbr)?.name.split(" ")[0] ?? abbr;
            const final = g === spring.games.at(-1);
            return (
              <Text key={g.id} style={{ color: final ? t.accent : t.text, fontWeight: final ? "800" : "400", paddingVertical: 1, fontSize: 13 }}>
                {final ? "Final" : `Wk ${g.week}`} · {name(g.away)} {g.awayScore}, {name(g.home)} {g.homeScore}
                {g.overtime ? " (OT)" : ""}
              </Text>
            );
          })}
        </Card>
      </ScrollView>
    </>
  );
}

function Champion({ s, theme: t }: { s: SpringSeason; theme: Theme }) {
  const champ = s.teams.find((x) => x.abbr === s.champion)!;
  const runner = s.teams.find((x) => x.abbr === s.runnerUp)!;
  const fin = s.games.at(-1)!;
  return (
    <Card style={{ borderColor: "#f5b83d", borderWidth: 1 }}>
      <SectionTitle>Spring champions</SectionTitle>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{champ.name}</Text>
      <Text style={{ color: t.muted }}>
        Beat the {runner.name} {Math.max(fin.homeScore, fin.awayScore)}-{Math.min(fin.homeScore, fin.awayScore)} in the final.
      </Text>
      {s.mvp ? (
        <Text style={{ color: t.text, marginTop: 6 }}>
          Spring MVP: <Text style={{ fontWeight: "800" }}>{s.mvp.position} {s.mvp.name}</Text> ({s.mvp.team}): {s.mvp.line}
        </Text>
      ) : null}
    </Card>
  );
}

function Breakouts({ s, userTeam, state, theme: t }: { s: SpringSeason; userTeam: string; state: (abbr: string) => string; theme: Theme }) {
  const router = useRouter();
  const yours = s.breakouts.filter((b) => b.team === userTeam);
  return (
    <Card>
      <SectionTitle>Breakouts</SectionTitle>
      <Text style={{ color: t.muted, marginBottom: 6 }}>
        The spring's standouts come back better (+{SPRING_RULES.growth} on each key rating). AI teams move them up their depth charts; yours are your call.
      </Text>
      {s.breakouts.map((b) => {
        const mine = b.team === userTeam;
        return (
          <Pressable key={b.player} onPress={() => router.push(`/player/${b.player}`)} accessibilityRole="link" style={{ paddingVertical: 4 }}>
            <Text style={{ color: mine ? t.accent : t.text, fontWeight: mine ? "800" : "600" }}>
              {b.position} {b.name} <Text style={{ color: t.muted, fontWeight: "400" }}>({state(b.team)})</Text> {b.before} → {b.after}
            </Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{b.line}</Text>
          </Pressable>
        );
      })}
      {yours.length > 0 ? (
        <Pressable onPress={() => router.push("/depth")} accessibilityRole="link" style={{ marginTop: 6 }}>
          <Text style={{ color: t.accent, fontWeight: "700" }}>
            {yours.length} of yours broke out: check your depth chart ›
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

function Standings({ s, theme: t }: { s: SpringSeason; theme: Theme }) {
  const confs = [...new Set(s.teams.map((x) => x.conference))];
  return (
    <Card>
      <SectionTitle>Standings</SectionTitle>
      {confs.map((c) => (
        <View key={c} style={{ marginBottom: 6 }}>
          <Text style={{ color: t.muted, fontWeight: "700", marginBottom: 2 }}>{c}</Text>
          {s.teams
            .filter((x) => x.conference === c)
            .sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2))
            .map((x) => (
              <View key={x.abbr} style={{ flexDirection: "row", paddingVertical: 1 }}>
                <Text style={{ flex: 1, color: x.abbr === s.champion ? t.accent : t.text }}>{x.name}</Text>
                <Text style={{ color: t.text, fontVariant: ["tabular-nums"] }}>
                  {x.wins}-{x.losses}
                  {x.ties ? `-${x.ties}` : ""}
                </Text>
              </View>
            ))}
        </View>
      ))}
    </Card>
  );
}
