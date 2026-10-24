// Recruiting: put your weekly recruiting points on the prospects you want.
// Interest builds week by week (local prospects warm faster) and fades when
// you stop; a prospect leans to the program he's warmest on, and other teams
// shy off a player leaning elsewhere at the draft. Your plan stands week to
// week until you change it; leave it empty and your staff recruits for you.
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RECRUITING, allLeanings, createScouting, homeRegion, interestIn, isLocal, teamBoard, type BoardEntry } from "@dynasty/sim";
import { ProspectBoard } from "../components/ProspectBoard";
import { teamShort } from "../field/colors";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

/** Points moved by one tap. */
const STEP = 2;

export default function RecruitingScreen() {
  const t = useTheme();
  const router = useRouter();
  const d = useDynasty();
  const { league, userTeam, weeksPlayed, schedule } = useLeague();
  const [localOnly, setLocalOnly] = useState(false);
  const scouting = useMemo(() => d.scouting ?? (d.draftClass ? createScouting(league, d.draftClass) : null), [d.scouting, d.draftClass, league]);
  const team = league.teams[userTeam]!;
  const full = useMemo(() => (scouting && d.draftClass ? teamBoard(scouting, d.draftClass, userTeam) : []), [scouting, d.draftClass, userTeam]);
  const leanings = useMemo(() => (scouting ? allLeanings(scouting) : new Map()), [scouting]);
  const planned = new Map(d.recruitPlan.map((a) => [a.prospect, a.points]));
  const used = d.recruitPlan.reduce((n, a) => n + a.points, 0);
  const seasonOver = weeksPlayed >= schedule.weeks;
  // Your recruits first (most points first), then the board.
  const mine = full.filter((e) => planned.has(e.prospect.player.id)).sort((a, b) => planned.get(b.prospect.player.id)! - planned.get(a.prospect.player.id)!);
  const rest = full.filter((e) => !planned.has(e.prospect.player.id) && (!localOnly || isLocal(team, e.prospect)));
  const board = [...mine, ...rest];

  const note = (e: BoardEntry) => {
    if (!scouting) return null;
    const id = e.prospect.player.id;
    const interest = interestIn(scouting, userTeam, id);
    const lean = leanings.get(id);
    const local = isLocal(team, e.prospect);
    const color = lean?.team === userTeam ? "#2e9d57" : lean ? "#d1453b" : t.muted;
    return (
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: t.muted, fontSize: 12, minWidth: 110 }} numberOfLines={1}>{`Interest ${Math.round(interest)}${local ? " · local" : ""}`}</Text>
          <View style={{ flex: 1, maxWidth: 90, height: 5, borderRadius: 3, backgroundColor: t.border }}>
            <View style={{ width: `${Math.round(interest)}%`, height: 5, borderRadius: 3, backgroundColor: color === t.muted ? t.accent : color }} />
          </View>
        </View>
        <Text style={{ color, fontSize: 12, fontWeight: lean ? "700" : "400" }}>
          {lean ? (lean.team === userTeam ? "Leans to you" : `Leans to ${teamShort(lean.team)}`) : "Undecided"}
          {e.prospect.player.home ? <Text style={{ color: t.muted, fontWeight: "400" }}>{` · from ${e.prospect.player.home}`}</Text> : null}
        </Text>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Recruiting" }} />
      <ProspectBoard
        board={board}
        note={note}
        onOpen={(e) => router.push(`/prospect/${e.prospect.player.id}`)}
        header={
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>
              {seasonOver ? "Recruiting is done for the season" : `${d.recruitPoints - used} of ${d.recruitPoints} points a week left to place`}
            </Text>
            <Text style={{ color: t.muted }}>
              {seasonOver
                ? "Prospects leaning to you are likelier to fall to you in the draft."
                : used === 0
                  ? `Put points on prospects to build their interest in ${team.nickname}: ${homeRegion(team)} prospects warm ${RECRUITING.localBoost}x faster. Leave them unplaced and your staff recruits for you.`
                  : "Your plan stands every week until you change it. Every visit scouts him too; interest you stop working on fades."}
            </Text>
            <Pressable onPress={() => setLocalOnly(!localOnly)} accessibilityRole="switch" accessibilityState={{ checked: localOnly }} style={{ alignSelf: "flex-start", paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: localOnly ? t.accent : t.card, borderWidth: 1, borderColor: localOnly ? t.accent : t.border }}>
              <Text style={{ color: localOnly ? t.onAccent : t.text, fontWeight: "600", fontSize: 13 }}>{`${homeRegion(team)} only`}</Text>
            </Pressable>
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
                    <Step label={`+${STEP}`} onPress={() => d.assignRecruiting(id, STEP)} disabled={used >= d.recruitPoints} theme={t} />
                    {pts > 0 ? (
                      <Pressable onPress={() => d.assignRecruiting(id, -STEP)} accessibilityRole="button" accessibilityLabel={`Take ${STEP} points off`}>
                        <Text style={{ color: t.accent, fontWeight: "800" }}>{`${pts}/wk −`}</Text>
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
      accessibilityLabel="Add recruiting points"
      style={{ width: 48, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: disabled ? t.border : t.accent }}
    >
      <Text style={{ color: disabled ? t.muted : t.onAccent, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
