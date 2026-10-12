// Your coaches: their levels and abilities (a slot at levels 3, 6 and 9),
// picking a new ability before the season starts, and how their schemes fit
// the way you call plays (the calls you made yourself this season).
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  COACH_ABILITIES,
  COACH_ABILITY_KEYS,
  DEFENSE_CONCEPT_INFO,
  DEFENSIVE_SCHEMES,
  OFFENSE_CONCEPT_INFO,
  OFFENSIVE_SCHEMES,
  callerSchemes,
  callingStyle,
  coachLevel,
  defenseSchemeFit,
  offenseSchemeFit,
  openSlots,
  type CoachAbility,
  type CoachRole,
  type SchemeFit,
} from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";

const ROLE_NAMES: Record<CoachRole, string> = { HC: "Head coach", OC: "Offensive coordinator", DC: "Defensive coordinator" };

export default function CoachesScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, results } = useLeague();
  const [note, setNote] = useState<string | null>(null);
  const staff = league.teams[userTeam]?.staff;
  const style = useMemo(() => callingStyle(results, userTeam), [results, userTeam]);
  if (!staff) return <Text style={{ padding: 16, color: t.text }}>No coaching staff.</Text>;
  const schemes = callerSchemes(league.teams[userTeam]);
  const pick = (a: CoachAbility) => setNote(d.pickAbility(a) ?? `${COACH_ABILITIES[a].label}: done.`);
  return (
    <>
      <Stack.Screen options={{ title: "Your coaches" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {([["HC", staff.hc], ["OC", staff.oc], ["DC", staff.dc]] as const).map(([role, c]) => {
          const lvl = coachLevel(c.xp);
          const open = openSlots(c);
          const choices = COACH_ABILITY_KEYS.filter((a) => COACH_ABILITIES[a].role === role && !c.abilities?.includes(a));
          return (
            <Card key={role} style={{ gap: 6 }}>
              <Text style={{ color: t.muted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>{ROLE_NAMES[role]}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: "800", flex: 1 }}>{`${c.firstName} ${c.lastName}`}</Text>
                <Text style={{ color: t.text, fontWeight: "800" }}>Level {lvl.level}</Text>
              </View>
              {"scheme" in c ? <Text style={{ color: t.muted, fontSize: 12 }}>{c.scheme}</Text> : null}
              {lvl.next ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, overflow: "hidden" }} accessibilityLabel={`${lvl.into} of ${lvl.next} XP to level ${lvl.level + 1}`}>
                  <View style={{ width: `${Math.round((100 * lvl.into) / lvl.next)}%`, height: 6, backgroundColor: t.accent }} />
                </View>
              ) : null}
              {(c.abilities ?? []).map((a) => (
                <Text key={a} style={{ color: t.text }}>
                  <Text style={{ fontWeight: "800" }}>{COACH_ABILITIES[a].label}</Text>
                  <Text style={{ color: t.muted }}>{` · ${COACH_ABILITIES[a].note}`}</Text>
                </Text>
              ))}
              {!c.abilities?.length && open <= 0 ? <Text style={{ color: t.muted, fontSize: 12 }}>First ability at level 3.</Text> : null}
              {open > 0 ? (
                d.abilityWindow ? (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={{ color: t.accent, fontWeight: "800" }}>{`${open} new ability to pick`}</Text>
                    {choices.map((a) => (
                      <Pressable key={a} onPress={() => pick(a)} accessibilityRole="button" style={({ pressed }) => ({ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, opacity: pressed ? 0.7 : 1 })}>
                        <Text style={{ color: t.text, fontWeight: "800" }}>{COACH_ABILITIES[a].label}</Text>
                        <Text style={{ color: t.muted, fontSize: 12 }}>{COACH_ABILITIES[a].note}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: t.muted, fontSize: 12 }}>{`${open} slot open: he'll pick for himself as week 1 kicks off (new picks are made before the season starts).`}</Text>
                )
              ) : null}
            </Card>
          );
        })}
        {note ? <Text style={{ color: t.text }}>{note}</Text> : null}

        <Card style={{ gap: 6 }}>
          <SectionTitle>Philosophy fit</SectionTitle>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            A scheme is a playbook: its core calls are drawn up better, the ones it doesn't believe in worse. This is how each one fits the calls you made yourself this season.
          </Text>
          {style.offenseCalls ? (
            <>
              <Text style={{ color: t.text, fontWeight: "800", marginTop: 4 }}>Offense</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{`You called: ${top(style.offense, style.offenseCalls, (k) => OFFENSE_CONCEPT_INFO[k as keyof typeof OFFENSE_CONCEPT_INFO].label)}`}</Text>
              {OFFENSIVE_SCHEMES.map((s) => (
                <FitRow key={s} scheme={s} fit={offenseSchemeFit(s, style)!} current={s === schemes.offense} />
              ))}
            </>
          ) : (
            <Text style={{ color: t.muted }}>Call some plays yourself to see how your offensive coaches fit.</Text>
          )}
          {style.defenseCalls ? (
            <>
              <Text style={{ color: t.text, fontWeight: "800", marginTop: 4 }}>Defense</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{`You called: ${top(style.defense, style.defenseCalls, (k) => DEFENSE_CONCEPT_INFO[k as keyof typeof DEFENSE_CONCEPT_INFO].label)}`}</Text>
              {DEFENSIVE_SCHEMES.map((s) => (
                <FitRow key={s} scheme={s} fit={defenseSchemeFit(s, style)!} current={s === schemes.defense} />
              ))}
            </>
          ) : (
            <Text style={{ color: t.muted }}>Call some defenses yourself to see how your defensive coaches fit.</Text>
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const top = (counts: Partial<Record<string, number>>, total: number, label: (k: string) => string) =>
  Object.entries(counts)
    .sort((a, b) => b[1]! - a[1]!)
    .slice(0, 3)
    .map(([k, n]) => `${label(k)} ${Math.round((100 * n!) / total)}%`)
    .join(", ");

function FitRow({ scheme, fit, current }: { scheme: string; fit: SchemeFit; current: boolean }) {
  const t = useTheme();
  const color = fit.edge >= 0.04 ? "#2e9d57" : fit.edge <= -0.04 ? "#d1453b" : t.muted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2 }}>
      <Text style={{ color: t.text, flex: 1, fontWeight: current ? "800" : "400" }}>{`${scheme}${current ? " (yours)" : ""}`}</Text>
      <Text style={{ color, fontWeight: "700" }}>{fit.grade}</Text>
    </View>
  );
}
