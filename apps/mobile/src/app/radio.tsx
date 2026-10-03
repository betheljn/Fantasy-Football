// The weekly radio show: the script, each host's picks for the week, and
// their records. The show is written off the week's picks board, so it's
// worked out the first time you tune in.
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { radioCast, sideLabel, tailRecord, PROP_STAT_NAMES, type HostRole, type HostPick } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

const ROLE: Record<HostRole, string> = { numbers: "The numbers", hottake: "The hot take", veteran: "The former player" };

export default function RadioScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, weeksPlayed, schedule, userTeam } = useLeague();
  const cast = radioCast(league.seed);
  const week = weeksPlayed + 1;
  const radio = d.save?.radio;
  const show = radio?.shows.find((x) => x.season === schedule.season && x.week === week) ?? null;
  const live = week <= schedule.weeks;

  useEffect(() => {
    if (live && !show && !d.board) d.loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, week, !!show, !!d.board]);

  const color = (role: HostRole) => (role === "numbers" ? "#5aa9e6" : role === "hottake" ? "#f2545b" : "#e0a458");
  const nameOf = (role: HostRole) => cast.hosts.find((h) => h.role === role)!.name;
  const games = new Map((d.board ?? []).map((g) => [g.game.id, g.game]));
  const tails = tailRecord(d.picks.history);
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: cast.show }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card>
          <SectionTitle>On the air</SectionTitle>
          {cast.hosts.map((h) => {
            const rec = radio?.records[h.role] ?? { won: 0, lost: 0 };
            return (
              <View key={h.role} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color(h.role) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>{h.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{ROLE[h.role]}: {h.tagline}</Text>
                </View>
                <Text style={{ color: t.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {rec.won}-{rec.lost}
                </Text>
              </View>
            );
          })}
        </Card>

        {!live ? <Text style={{ color: t.muted }}>The show is off the air until next season.</Text> : null}
        {live && !show ? (
          <Card>
            <Text style={{ color: t.muted }}>Warming up the studio: the hosts are going over this week's lines…</Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, marginTop: 8, overflow: "hidden" }}>
              <View style={{ width: `${Math.round((d.boardProgress ?? 0) * 100)}%`, height: 6, backgroundColor: t.accent }} />
            </View>
          </Card>
        ) : null}

        {show ? (
          <>
            <Card>
              <SectionTitle>Week {show.week}</SectionTitle>
              {show.lines.map((l, i) => (
                <View key={i} style={{ paddingVertical: 5 }}>
                  <Text style={{ color: color(l.host), fontWeight: "800", fontSize: 12 }}>{nameOf(l.host).split(" ")[0]!.toUpperCase()}</Text>
                  <Text style={{ color: t.text, lineHeight: 20 }}>{l.text}</Text>
                </View>
              ))}
            </Card>
            <Card>
              <SectionTitle>This week's picks</SectionTitle>
              {cast.hosts.map((h) => (
                <View key={h.role} style={{ marginBottom: 8 }}>
                  <Text style={{ color: color(h.role), fontWeight: "800" }}>{h.name}</Text>
                  {show.picks
                    .filter((p) => p.host === h.role)
                    .map((p) => {
                      const mine = d.draft.find((x) => x.prop.id === p.prop.id);
                      const following = mine?.via?.host === h.role && !mine.via.fade;
                      const fading = mine?.via?.host === h.role && mine.via.fade;
                      const other = p.side === "over" ? "under" : "over";
                      // Your own game's player props only take overs.
                      const canFade = !(p.prop.kind === "player" && p.prop.team === userTeam);
                      return (
                        <View key={p.prop.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 }}>
                          <Text style={{ flex: 1, color: t.text, fontSize: 13 }}>{pickText(p, games.get(p.prop.game))}</Text>
                          <Chip label="Follow" on={following} onPress={() => d.toggleDraft({ prop: p.prop, side: p.side, via: { host: h.role, fade: false } })} theme={t} />
                          {canFade ? <Chip label="Fade" on={fading} onPress={() => d.toggleDraft({ prop: p.prop, side: other, via: { host: h.role, fade: true } })} theme={t} /> : null}
                        </View>
                      );
                    })}
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {d.draft.length > 0 ? (
          <Pressable onPress={() => router.push("/picks")} accessibilityRole="link">
            <Card style={{ borderColor: t.accent, borderWidth: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>
                Your slate: {d.draft.length} pick{d.draft.length === 1 ? "" : "s"} <Text style={{ color: t.accent }}>Finish it on the picks board ›</Text>
              </Text>
            </Card>
          </Pressable>
        ) : null}

        {Object.keys(tails).length > 0 ? (
          <Card>
            <SectionTitle>You and the hosts</SectionTitle>
            {cast.hosts
              .filter((h) => tails[h.role])
              .map((h) => {
                const r = tails[h.role]!;
                return (
                  <Text key={h.role} style={{ color: t.text, paddingVertical: 2 }}>
                    {h.name.split(" ")[0]}: following {r.follow[0]}-{r.follow[1]}, fading {r.fade[0]}-{r.fade[1]}
                  </Text>
                );
              })}
          </Card>
        ) : null}

        {radio && radio.last.length > 0 ? (
          <Card>
            <SectionTitle>Last week</SectionTitle>
            {radio.last.map((p) => (
              <Text key={`${p.host}-${p.prop.id}`} style={{ color: t.muted, fontSize: 12, paddingVertical: 1 }}>
                {p.hit ? "✓" : "✗"} {nameOf(p.host).split(" ")[0]}: {pickText(p, teamsOf(p.prop.game))} ({p.prop.kind === "spread" ? `margin ${p.value}` : p.value})
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

function Chip({ label, on, onPress, theme: t }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 10, height: 28, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : "transparent" }}>
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

/** Home and away from a game id ("2037-W13-NJ@CT"). */
function teamsOf(gameId: string): { home: string; away: string } | undefined {
  const m = /-([A-Z]{2})@([A-Z]{2})$/.exec(gameId);
  return m ? { away: m[1]!, home: m[2]! } : undefined;
}

function pickText(p: HostPick, game: { home: string; away: string } | undefined): string {
  const [home, away] = game ? [game.home, game.away] : ["home", "away"];
  if (p.prop.kind === "spread") return `${sideLabel(p.prop, p.side, home, away)} (${away} at ${home})`;
  if (p.prop.kind === "total") return `${p.side === "over" ? "Over" : "Under"} ${p.prop.line} points (${away} at ${home})`;
  return `${p.prop.name} ${p.side} ${p.prop.line} ${PROP_STAT_NAMES[p.prop.stat!]}`;
}
