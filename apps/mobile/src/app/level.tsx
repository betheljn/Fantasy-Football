// You, the owner: your level and XP (this season's builds as it's played,
// and is banked when the offseason is done), where it came from, and the
// upgrades your points buy. The sim decides every number; this only shows it.
import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { UPGRADES, UPGRADE_TRACKS, XP_LABELS, ownerStanding, upgradeCost, upgradePoints, type OwnerProgress, type UpgradeTrack } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";

export default function LevelScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { userTeam, results, playoffs, league } = useLeague();
  const [note, setNote] = useState<string | null>(null);
  const progress: OwnerProgress | undefined = d.save?.dynasty.owners?.[userTeam];
  const now = ownerStanding(progress, userTeam, { results, playoffs });
  const points = upgradePoints(progress, now.seasonXp);
  const tiers = progress?.upgrades ?? {};
  const buy = (track: UpgradeTrack) => setNote(d.buyUpgrade(track) ?? `${UPGRADES[track].label} tier ${(tiers[track] ?? 0) + 1} is yours.`);
  return (
    <>
      <Stack.Screen options={{ title: "Your level" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card style={{ gap: 8 }}>
          <Text style={{ color: t.muted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Owner</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
            <Text style={{ color: t.text, fontSize: 34, fontWeight: "900" }}>Level {now.level}</Text>
            <Text style={{ color: t.muted }}>{now.xp.toLocaleString()} XP</Text>
          </View>
          {now.next ? (
            <>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: t.border, overflow: "hidden" }} accessibilityLabel={`${now.into} of ${now.next} XP to level ${now.level + 1}`}>
                <View style={{ width: `${Math.round((100 * now.into) / now.next)}%`, height: 10, backgroundColor: t.accent }} />
              </View>
              <Text style={{ color: t.muted, fontSize: 12 }}>{`${now.into.toLocaleString()} / ${now.next.toLocaleString()} to level ${now.level + 1}`}</Text>
            </>
          ) : (
            <Text style={{ color: t.muted, fontSize: 12 }}>The top level.</Text>
          )}
        </Card>

        <Card style={{ gap: 4 }}>
          <SectionTitle>{`${league.season} so far: +${now.seasonXp.toLocaleString()} XP`}</SectionTitle>
          {now.season.length ? (
            now.season.map((l) => <XpRow key={l.source} label={XP_LABELS[l.source]} count={l.count} xp={l.xp} />)
          ) : (
            <Text style={{ color: t.muted }}>Wins, calls won, titles and your players' growth all count. Play a game to get going.</Text>
          )}
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Calls you make yourself count half again. Player growth and awards are added in the offseason.</Text>
        </Card>

        <Card style={{ gap: 10 }}>
          <SectionTitle>{`Upgrades · ${points} point${points === 1 ? "" : "s"} to spend`}</SectionTitle>
          <Text style={{ color: t.muted, fontSize: 12 }}>A point for every level. Tier n of a track costs n points. Upgrades work off the field: they never change a play.</Text>
          {UPGRADE_TRACKS.map((track) => {
            const info = UPGRADES[track];
            const have = tiers[track] ?? 0;
            const next = have + 1;
            const maxed = next > info.tiers.length;
            const cost = upgradeCost(next);
            const afford = !maxed && points >= cost;
            return (
              <View key={track} style={{ gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: t.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: t.text, fontWeight: "800", flex: 1 }}>{info.label}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{`Tier ${have} of ${info.tiers.length}`}</Text>
                </View>
                {/* Every tier, the ones you have marked. */}
                {info.tiers.map((desc, i) => (
                  <Text key={desc} style={{ color: i < have ? t.text : t.muted, fontSize: 12 }}>
                    {i < have ? "● " : "○ "}
                    {desc}
                  </Text>
                ))}
                {maxed ? null : (
                  <Pressable
                    onPress={() => buy(track)}
                    disabled={!afford}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !afford }}
                    style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: 2, paddingHorizontal: 12, height: 34, borderRadius: 8, justifyContent: "center", backgroundColor: afford ? t.accent : t.card, borderWidth: 1, borderColor: afford ? t.accent : t.border, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text style={{ color: afford ? t.onAccent : t.muted, fontWeight: "800", fontSize: 13 }}>{`Buy tier ${next} · ${cost} point${cost === 1 ? "" : "s"}`}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {note ? <Text style={{ color: t.text, fontSize: 13 }}>{note}</Text> : null}
        </Card>

        {progress?.seasons.length ? (
          <Card style={{ gap: 4 }}>
            <SectionTitle>Past seasons</SectionTitle>
            {[...progress.seasons].reverse().map((s) => (
              <Text key={s.season} style={{ color: t.text }}>
                {s.season}: <Text style={{ fontWeight: "800" }}>+{s.xp.toLocaleString()} XP</Text>
                <Text style={{ color: t.muted }}>{` · ${s.lines.map((l) => `${XP_LABELS[l.source].toLowerCase()} ${l.xp}`).join(", ")}`}</Text>
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

function XpRow({ label, count, xp }: { label: string; count: number; xp: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", paddingVertical: 2 }}>
      <Text style={{ color: t.text, flex: 1 }}>{label}</Text>
      <Text style={{ color: t.muted, width: 56, textAlign: "right" }}>{count}</Text>
      <Text style={{ color: t.text, fontWeight: "700", width: 72, textAlign: "right" }}>+{xp.toLocaleString()}</Text>
    </View>
  );
}
