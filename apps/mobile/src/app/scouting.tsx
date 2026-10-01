// Weekly scouting: put your points on the prospects you want to know better.
// Knowledge narrows the ranges on every attribute, potential and the dev trait.
import { Stack, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { createScouting, teamBoard } from "@dynasty/sim";
import { ProspectBoard } from "../components/ProspectBoard";
import { SCOUT_POINTS, useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

export default function ScoutingScreen() {
  const t = useTheme();
  const router = useRouter();
  const d = useDynasty();
  const { league, userTeam, weeksPlayed, schedule } = useLeague();
  const scouting = useMemo(() => d.scouting ?? (d.draftClass ? createScouting(league, d.draftClass) : null), [d.scouting, d.draftClass, league]);
  const board = useMemo(() => (scouting && d.draftClass ? teamBoard(scouting, d.draftClass, userTeam) : []), [scouting, d.draftClass, userTeam]);
  const planned = new Map(d.scoutPlan.map((a) => [a.prospect, a.points]));
  const used = d.scoutPlan.reduce((n, a) => n + a.points, 0);
  const seasonOver = weeksPlayed >= schedule.weeks;

  return (
    <>
      <Stack.Screen options={{ title: `${league.season + 1} draft class` }} />
      <ProspectBoard
        board={board}
        onOpen={(e) => router.push(`/prospect/${e.prospect.player.id}`)}
        header={
          <View style={{ padding: 16, gap: 4 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>
              {seasonOver ? "Scouting is done for the season" : `Week ${weeksPlayed + 1}: ${SCOUT_POINTS - used} of ${SCOUT_POINTS} points left`}
            </Text>
            <Text style={{ color: t.muted }}>
              {seasonOver
                ? "The combine measures everyone's physicals before the draft."
                : used === 0
                  ? "Put points on prospects to learn more about them. Leave them all unspent and your scouts choose for you."
                  : "Points are spent when you play the week."}
            </Text>
          </View>
        }
        action={
          seasonOver
            ? undefined
            : (e) => {
                const id = e.prospect.player.id;
                const pts = planned.get(id) ?? 0;
                return (
                  <View style={{ alignItems: "center", gap: 4 }}>
                    <Step label="+3" onPress={() => d.assignScouting(id, 3)} disabled={used >= SCOUT_POINTS} theme={t} />
                    {pts > 0 ? (
                      <Pressable onPress={() => d.assignScouting(id, -3)} accessibilityRole="button" accessibilityLabel="Remove points">
                        <Text style={{ color: t.accent, fontWeight: "800" }}>{pts} ✕</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              }
        }
      />
    </>
  );
}

function Step({ label, onPress, disabled, theme: t }: { label: string; onPress: () => void; disabled: boolean; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Add 3 scouting points"
      style={{ width: 48, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: disabled ? t.border : t.accent }}
    >
      <Text style={{ color: disabled ? t.muted : t.onAccent, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
