// Free agents during the season: the players nobody signed in the offseason.
// Sign one for the rest of the season (a one-year deal at half his market
// value) when you have a roster spot and the cap room.
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  GAME_MIN,
  POSITIONS,
  ROSTER_MAX,
  capHit,
  capSpace,
  formatMoney,
  inSeasonContract,
  playerOverall,
  salaryCap,
  type Position,
} from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";

export default function FreeAgentsScreen() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { league, userTeam } = useLeague();
  const [pos, setPos] = useState<Position | "All">("All");
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const team = league.teams[userTeam]!;
  const season = league.season;
  const room = capSpace(team, salaryCap(league.seed, season), season);
  const full = team.roster.length >= ROSTER_MAX;
  // Healthy players at each position, against what a game needs.
  const healthy = (p: Position) => team.roster.filter((x) => x.position === p && !(x.injury && x.injury.weeks > 0)).length;
  const hurt = (p: Position) => team.roster.some((x) => x.position === p && x.injury && x.injury.weeks > 0);
  const thin = POSITIONS.filter((p) => hurt(p) && healthy(p) <= GAME_MIN[p]);

  const rows = useMemo(
    () =>
      (league.freeAgents ?? [])
        .filter((p) => pos === "All" || p.position === pos)
        .map((p) => ({ p, ovr: playerOverall(p), cost: capHit(inSeasonContract(p, league, season), season) }))
        .sort((a, b) => b.ovr - a.ovr),
    [league, pos, season],
  );

  const sign = (id: string, name: string) => {
    const problems = d.signFreeAgent(id);
    setMessage(problems.length > 0 ? { text: problems.join(" "), good: false } : { text: `Signed ${name} for the rest of the season.`, good: true });
  };

  return (
    <>
      <Stack.Screen options={{ title: "Free agents" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card>
          <SectionTitle>Your roster</SectionTitle>
          <Text style={{ color: t.text }}>
            {team.roster.length} of {ROSTER_MAX} · cap room {formatMoney(room)}
          </Text>
          {thin.length > 0 ? <Text style={{ color: t.score, marginTop: 4 }}>Thin with injuries at {thin.join(", ")}.</Text> : null}
          {full ? (
            <Pressable onPress={() => router.push("/injuries")} accessibilityRole="link">
              <Text style={{ color: t.muted, marginTop: 4 }}>
                Your roster is full. Put a player out {""}
                <Text style={{ color: t.accent, fontWeight: "700" }}>4+ weeks on injured reserve ›</Text>
              </Text>
            </Pressable>
          ) : null}
          {!d.canMakeMoves ? <Text style={{ color: t.muted, marginTop: 4 }}>Signings are open during the regular season.</Text> : null}
          {message ? <Text style={{ color: message.good ? t.accent : t.score, fontWeight: "700", marginTop: 6 }}>{message.text}</Text> : null}
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(["All", ...POSITIONS] as const).map((p) => (
            <Pressable key={p} onPress={() => setPos(p)} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: "center", backgroundColor: pos === p ? t.accent : t.card, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: pos === p ? t.onAccent : t.text, fontWeight: "700", fontSize: 12 }}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Card>
          <SectionTitle>Available ({rows.length})</SectionTitle>
          {rows.length === 0 ? <Text style={{ color: t.muted }}>Nobody left at this position.</Text> : null}
          {rows.map(({ p, ovr, cost }) => {
            const blocked = !d.canMakeMoves || full || cost > room;
            return (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
                <Text style={{ width: 28, color: t.muted }}>{p.position}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>
                    {p.firstName} {p.lastName}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    age {p.age} · {p.archetype} · {formatMoney(cost)} for the season
                  </Text>
                </View>
                <Text style={{ width: 26, textAlign: "right", color: t.text, fontWeight: "800" }}>{ovr}</Text>
                <Pressable onPress={() => sign(p.id, `${p.firstName} ${p.lastName}`)} disabled={blocked} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 32, borderRadius: 8, justifyContent: "center", backgroundColor: t.accent, opacity: blocked ? 0.35 : 1 }}>
                  <Text style={{ color: t.onAccent, fontWeight: "800", fontSize: 13 }}>Sign</Text>
                </Pressable>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </>
  );
}
