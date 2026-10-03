// A team's trophy room: championships, division crowns, awards, Coach of the
// Year, rivalry trophies with the series records, best finishes, and moments.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { rivalries, rivalryGames, seriesLine, teamName, trophyRoom } from "@dynasty/sim";
import { Card, SectionTitle, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

const RARITY_COLOR = { common: "#9aa5b1", rare: "#4f9cf9", epic: "#b06ef7", legendary: "#f5b83d" } as const;

export default function TrophyRoomScreen() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { team: param } = useLocalSearchParams<{ team?: string }>();
  const { league, userTeam, results, schedule } = useLeague();
  const abbr = param && league.teams[param] ? param : userTeam;
  const dynasty = d.save!.dynasty;
  const room = useMemo(() => {
    // This season's rivalry games count too.
    const games = [...(dynasty.rivalryGames ?? []), ...rivalryGames(rivalries(league.seed), results, schedule.season)];
    // And this season's moments so far.
    const withSeason = { ...dynasty, moments: [...(dynasty.moments ?? []), ...(d.save?.collection?.moments ?? [])] };
    return trophyRoom(withSeason, abbr, games);
  }, [dynasty, abbr, league.seed, results, schedule.season, d.save?.collection]);
  const st = (x: string) => league.teams[x]?.state ?? x;
  const seasons = dynasty.history.length;

  return (
    <>
      <Stack.Screen options={{ title: "Trophy room" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Swatch abbr={abbr} size={18} />
            <Text style={{ flex: 1, color: t.text, fontSize: 20, fontWeight: "800" }}>{teamName(league.teams[abbr]!)}</Text>
          </View>
          <Text style={{ color: t.muted, marginTop: 4 }}>
            {seasons === 0 ? "Year one: the trophy case is waiting." : `${seasons} season${seasons === 1 ? "" : "s"} in the books.`}
          </Text>
        </Card>

        <Banner label="Championships" years={room.titles} color="#f5b83d" empty="No titles yet." theme={t} />
        {room.runnerUps.length ? <Banner label="Runner-up" years={room.runnerUps} color="#c0c7d0" empty="" theme={t} /> : null}
        <Banner label="Division titles" years={room.divisionTitles} color={t.accent} empty="No division titles yet." theme={t} />

        <Card>
          <SectionTitle>Rivalry trophies</SectionTitle>
          {room.rivalries.map((r) => {
            const other = r.rivalry.teams[0] === abbr ? r.rivalry.teams[1] : r.rivalry.teams[0];
            const held = r.holder === abbr;
            return (
              <View key={r.rivalry.id} style={{ paddingVertical: 6 }}>
                <Text style={{ color: held ? t.accent : t.text, fontWeight: "800", textTransform: "capitalize" }}>
                  {held ? "🏆 " : ""}
                  {r.rivalry.trophy.replace(/^the /, "")}
                  <Text style={{ color: t.muted, fontWeight: "400", textTransform: "none" }}> vs {st(other)}</Text>
                </Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>
                  {r.holder ? `${held ? "In your case" : `Held by ${st(r.holder)}`}. ` : "Not yet won. "}
                  {seriesLine(r, st)}
                  {r.streak && r.streak.n >= 2 ? ` ${st(r.streak.team)} has won ${r.streak.n} straight.` : ""}
                </Text>
              </View>
            );
          })}
        </Card>

        <Card>
          <SectionTitle>Awards</SectionTitle>
          {room.awards.length + room.coachOfTheYear.length === 0 ? <Text style={{ color: t.muted }}>None yet.</Text> : null}
          {room.awards.map((a) => (
            <Text key={`${a.season}-${a.award}`} style={{ color: t.text, paddingVertical: 2 }}>
              {a.season} · {a.award}: <Text style={{ fontWeight: "700" }}>{a.name}</Text> ({a.position})
            </Text>
          ))}
          {room.coachOfTheYear.map((c) => (
            <Text key={`coy-${c.season}`} style={{ color: t.text, paddingVertical: 2 }}>
              {c.season} · Coach of the Year: <Text style={{ fontWeight: "700" }}>{c.name}</Text>
            </Text>
          ))}
        </Card>

        <Card>
          <SectionTitle>Best finishes</SectionTitle>
          {room.top25.length === 0 ? <Text style={{ color: t.muted }}>No Top 25 finishes yet.</Text> : null}
          {room.top25.slice(0, 8).map((f) => (
            <Text key={f.season} style={{ color: t.text, paddingVertical: 2 }}>
              {f.season}: No. {f.rank} ({f.record})
            </Text>
          ))}
        </Card>

        <Pressable onPress={() => router.push("/moments")} accessibilityRole="link">
          <Card>
            <SectionTitle>Moments</SectionTitle>
            <View style={{ flexDirection: "row", gap: 14 }}>
              {(["legendary", "epic", "rare", "common"] as const).map((r) => (
                <Text key={r} style={{ color: RARITY_COLOR[r], fontWeight: "800" }}>
                  {room.moments[r]} <Text style={{ color: t.muted, fontWeight: "400", textTransform: "capitalize" }}>{r}</Text>
                </Text>
              ))}
            </View>
            <Text style={{ color: t.accent, marginTop: 6, fontWeight: "700" }}>See the collection ›</Text>
          </Card>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Banner({ label, years, color, empty, theme: t }: { label: string; years: number[]; color: string; empty: string; theme: Theme }) {
  return (
    <Card>
      <SectionTitle>{label}</SectionTitle>
      {years.length === 0 ? <Text style={{ color: t.muted }}>{empty}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {years.map((y) => (
          <View key={y} style={{ width: 54, paddingVertical: 10, borderRadius: 4, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, backgroundColor: color, alignItems: "center" }}>
            <Text style={{ color: "#111", fontWeight: "900" }}>{y}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
