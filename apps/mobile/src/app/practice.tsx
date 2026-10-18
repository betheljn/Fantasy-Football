// The week's practice: install plays for the next opponent (they're drawn up
// better in that game) and set how hard the team works. Leave it to your
// staff and they plan each week against whoever's next.
import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  DEFENSE_CONCEPTS,
  DEFENSE_CONCEPT_INFO,
  INTENSITY_NOTES,
  OFFENSE_CONCEPTS,
  OFFENSE_CONCEPT_INFO,
  PRACTICE,
  aiPracticePlan,
  type DefenseConcept,
  type Intensity,
  type OffenseConcept,
  type PracticePlan,
} from "@dynasty/sim";
import { Card, SectionTitle, Segmented } from "../components/ui";
import { teamShort } from "../field/colors";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

const label = (c: OffenseConcept | DefenseConcept) => ((OFFENSE_CONCEPTS as readonly string[]).includes(c) ? OFFENSE_CONCEPT_INFO[c as OffenseConcept].label : DEFENSE_CONCEPT_INFO[c as DefenseConcept].label);

export default function PracticeScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, schedule, weeksPlayed } = useLeague();
  const team = league.teams[userTeam]!;
  const next = schedule.games.find((g) => g.week === weeksPlayed + 1 && (g.home === userTeam || g.away === userTeam));
  const opp = next ? league.teams[next.home === userTeam ? next.away : next.home] : undefined;
  const staff = opp ? aiPracticePlan(team, opp) : null;
  const [plan, setPlan] = useState<PracticePlan>(d.practice ?? staff ?? { installs: [], intensity: "normal" });
  const [note, setNote] = useState<string | null>(null);
  const mine = !!d.practice;
  const toggle = (c: OffenseConcept | DefenseConcept) =>
    setPlan((p) => (p.installs.includes(c) ? { ...p, installs: p.installs.filter((x) => x !== c) } : p.installs.length < PRACTICE.maxInstalls ? { ...p, installs: [...p.installs, c] } : p));
  const save = (p: PracticePlan | null) => setNote(d.setPractice(p) ?? (p ? "Your plan stands every week until you change it." : "Your staff plans each week against the next opponent."));

  return (
    <>
      <Stack.Screen options={{ title: "Practice" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card style={{ gap: 6 }}>
          <SectionTitle>{opp ? `This week: ${next!.home === userTeam ? "vs" : "at"} ${teamShort(opp.abbr)}` : "No game this week"}</SectionTitle>
          <Text style={{ color: t.text }}>{mine ? "You're running practice." : "Your staff is running practice."}</Text>
          {staff ? (
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {`Staff's plan for ${teamShort(opp!.abbr)}: install ${staff.installs.map(label).join(", ")}; ${staff.intensity} week.`}
            </Text>
          ) : null}
          {d.practiceLocked ? <Text style={{ color: t.score, fontSize: 12 }}>Your game this week is under way: practice is set until it's played.</Text> : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionTitle>{`Install (${plan.installs.length} of ${PRACTICE.maxInstalls})`}</SectionTitle>
          <Text style={{ color: t.muted, fontSize: 12 }}>Installed plays are drawn up better in this week's game (less after a light week).</Text>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 12 }}>Offense</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {OFFENSE_CONCEPTS.map((c) => (
              <Tag key={c} label={OFFENSE_CONCEPT_INFO[c].label} on={plan.installs.includes(c)} onPress={() => toggle(c)} theme={t} />
            ))}
          </View>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 12 }}>Defense</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {DEFENSE_CONCEPTS.map((c) => (
              <Tag key={c} label={DEFENSE_CONCEPT_INFO[c].label} on={plan.installs.includes(c)} onPress={() => toggle(c)} theme={t} />
            ))}
          </View>
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionTitle>Intensity</SectionTitle>
          <Segmented options={(["light", "normal", "hard"] as const).map((k) => ({ key: k, label: k[0]!.toUpperCase() + k.slice(1) }))} value={plan.intensity} onChange={(k: Intensity) => setPlan((p) => ({ ...p, intensity: k }))} />
          <Text style={{ color: t.muted, fontSize: 12 }}>{INTENSITY_NOTES[plan.intensity]}.</Text>
          {team.practiceLog?.weeks ? <Text style={{ color: t.muted, fontSize: 12 }}>{`This season: ${team.practiceLog.hard} hard week${team.practiceLog.hard === 1 ? "" : "s"}, ${team.practiceLog.light} light, of ${team.practiceLog.weeks}.`}</Text> : null}
        </Card>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn label="Use my plan" primary disabled={d.practiceLocked} onPress={() => save(plan)} theme={t} />
          <Btn label="Let the staff plan" disabled={d.practiceLocked || !mine} onPress={() => (save(null), staff && setPlan(staff))} theme={t} />
        </View>
        {note ? <Text style={{ color: t.text }}>{note}</Text> : null}
      </ScrollView>
    </>
  );
}

function Tag({ label, on, onPress, theme: t }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: "center", backgroundColor: on ? t.accent : t.card, borderWidth: 1, borderColor: on ? t.accent : t.border }}>
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function Btn({ label, onPress, primary, disabled, theme: t }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; theme: Theme }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: primary && !disabled ? t.accent : t.card, borderWidth: 1, borderColor: primary && !disabled ? t.accent : t.border, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Text style={{ color: primary && !disabled ? t.onAccent : t.text, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
