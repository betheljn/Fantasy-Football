// Your depth chart: who starts and who's next at every position. Games use it
// as soon as you change it. (Regular season only: the playoffs and offseason
// work from the league as it stood.)
import { Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { BASE_STARTERS, POSITIONS, buildDepthChart, outLabel, playerOverall, type Position } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

export default function DepthChartScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam } = useLeague();
  const team = league.teams[userTeam]!;
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  const best = buildDepthChart(team.roster);
  const move = (pos: Position, i: number, delta: number) => {
    const ids = [...team.depthChart[pos]];
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    d.setDepthChart(pos, ids);
  };

  return (
    <>
      <Stack.Screen options={{ title: `${team.abbr} depth chart` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {d.depthLocked ? (
          <Text style={{ color: t.score, fontWeight: "700" }}>Locked until this week is played: you have picks riding on your own players.</Text>
        ) : !d.canEditDepthChart ? (
          <Text style={{ color: t.score, fontWeight: "700" }}>
            The depth chart can be changed during the regular season.
          </Text>
        ) : (
          <Text style={{ color: t.muted }}>Starters are highlighted. Use the arrows to move a player up or down; games use your order right away.</Text>
        )}
        {POSITIONS.map((pos) => {
          const ids = team.depthChart[pos];
          const changed = ids.join() !== best[pos].join();
          return (
            <Card key={pos}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <SectionTitle>
                    {pos} · {BASE_STARTERS[pos]} starter{BASE_STARTERS[pos] === 1 ? "" : "s"}
                  </SectionTitle>
                </View>
                {changed && d.canEditDepthChart ? (
                  <Pressable onPress={() => d.setDepthChart(pos, best[pos])} accessibilityRole="button">
                    <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Reset by rating</Text>
                  </Pressable>
                ) : null}
              </View>
              {ids.map((id, i) => {
                const p = byId.get(id)!;
                const starter = i < BASE_STARTERS[pos];
                return (
                  <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6, backgroundColor: starter ? t.bg : "transparent" }}>
                    <Text style={{ width: 22, color: t.muted, fontVariant: ["tabular-nums"] }}>{i + 1}</Text>
                    <Text style={{ flex: 1, color: t.text, fontWeight: starter ? "700" : "400" }} numberOfLines={1}>
                      {p.firstName} {p.lastName}
                      {p.injury ? <Text style={{ color: t.score, fontSize: 12, fontWeight: "700" }}> {outLabel(p.injury)}</Text> : null}
                    </Text>
                    <Text style={{ width: 26, textAlign: "right", color: t.text, fontWeight: "700" }}>{playerOverall(p)}</Text>
                    {d.canEditDepthChart ? (
                      <>
                        <Arrow label="▲" onPress={() => move(pos, i, -1)} disabled={i === 0} theme={t} />
                        <Arrow label="▼" onPress={() => move(pos, i, 1)} disabled={i === ids.length - 1} theme={t} />
                      </>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          );
        })}
      </ScrollView>
    </>
  );
}

function Arrow({ label, onPress, disabled, theme: t }: { label: string; onPress: () => void; disabled: boolean; theme: Theme }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label === "▲" ? "Move up" : "Move down"} style={{ width: 32, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.border, opacity: disabled ? 0.3 : 1 }}>
      <Text style={{ color: t.text, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
