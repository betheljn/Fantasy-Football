// Before the fantasy draft: how many rounds you pick yourself (the AI drafts
// the rest for you), and your first-round slot. Or no draft: keep the
// roster the team has.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { FANTASY_LENGTHS, FANTASY_ROUNDS, fantasyDraftOrder, fantasyPickTeam, rosterNorms, rosterReport, type League } from "@dynasty/sim";
import { GradeBadge } from "../components/RosterGrades";
import { Button, Card, Chips, Icon, SectionTitle, StickyFooter } from "../components/ui";
import { useTheme } from "../theme";

type Choice = { kind: "draft"; rounds: number } | { kind: "keep" };

export function DraftSetupScreen({ league, abbr, onBack, onDraft, onKeep }: { league: League; abbr: string; onBack: () => void; onDraft: (rounds: number, slot: number) => void; onKeep: () => void }) {
  const t = useTheme();
  const teams = league.conferences.flatMap((c) => c.divisions.flatMap((d) => d.teams)).length;
  const [choice, setChoice] = useState<Choice>({ kind: "draft", rounds: 25 });
  const [slot, setSlot] = useState(() => fantasyDraftOrder(league).indexOf(abbr) + 1);
  const report = useMemo(() => rosterReport(league.teams[abbr]!.roster, rosterNorms(league)), [league, abbr]);

  // Your first few picks from this slot (a snake: back to front in even rounds).
  const order = fantasyDraftOrder(league, { team: abbr, slot });
  const mine: number[] = [];
  for (let overall = 1; mine.length < 4 && overall <= teams * FANTASY_ROUNDS; overall++) if (fantasyPickTeam(order, overall).team === abbr) mine.push(overall);

  const lengths: Array<{ rounds: number; label: string; note: string }> = FANTASY_LENGTHS.map((n) => ({
    rounds: n,
    label: n === FANTASY_ROUNDS ? `All ${n} rounds` : `${n} rounds`,
    note: n === FANTASY_ROUNDS ? "Pick every player on your 72-man roster." : `Pick your first ${n} players; the AI picks the other ${FANTASY_ROUNDS - n} for you.`,
  }));

  const radio = (on: boolean, onPress: () => void, label: string, note: string) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
      <Icon name={on ? "radio-button-on" : "radio-button-off"} color={on ? t.accent : t.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>{note}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="chevron-back" size={18} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700" }}>Head coach</Text>
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Fantasy draft</Text>
        <Text style={{ color: t.muted }}>
          {"Every player in the league goes into one pool and all 50 teams draft new rosters from it, 72 rounds, snake order. Contracts are rewritten to fit the cap afterwards."}
        </Text>

        <Card>
          <SectionTitle>How much do you draft?</SectionTitle>
          {lengths.map((l) => radio(choice.kind === "draft" && choice.rounds === l.rounds, () => setChoice({ kind: "draft", rounds: l.rounds }), l.label, l.note))}
          {radio(choice.kind === "keep", () => setChoice({ kind: "keep" }), "No draft", "Keep the roster this team has; every team keeps its own.")}
        </Card>

        {choice.kind === "draft" ? (
          <Card style={{ gap: 8 }}>
            <SectionTitle>Your draft slot</SectionTitle>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => setSlot((s) => Math.max(1, s - 1))} accessibilityRole="button" accessibilityLabel="Earlier pick" hitSlop={6} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" }}>
                <Icon name="remove" />
              </Pressable>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: t.text, fontSize: 32, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{slot}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>of {teams} in round 1</Text>
              </View>
              <Pressable onPress={() => setSlot((s) => Math.min(teams, s + 1))} accessibilityRole="button" accessibilityLabel="Later pick" hitSlop={6} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" }}>
                <Icon name="add" />
              </Pressable>
            </View>
            <Chips options={[1, 5, 10, 25, 40, 50].map((n) => ({ key: n, label: `#${n}` }))} value={slot} onChange={setSlot} />
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {`Your first picks: ${mine.map((n) => `#${n}`).join(", ")}. An early slot gets the best player; a late one picks twice in a row at the turn.`}
            </Text>
          </Card>
        ) : null}

        {report.needs.length ? (
          <Card>
            <SectionTitle>Your roster needs most</SectionTitle>
            {report.positions
              .filter((p) => report.needs.slice(0, 3).includes(p.position))
              .sort((a, b) => report.needs.indexOf(a.position) - report.needs.indexOf(b.position))
              .map((p) => (
                <View key={p.position} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
                  <GradeBadge grade={p.grade} size={28} />
                  <Text style={{ flex: 1, color: t.text }}>
                    {p.position} <Text style={{ color: t.muted, fontSize: 12 }}>{p.short > 0 ? `${p.have} of ${p.target}` : `average ${p.score}`}</Text>
                  </Text>
                </View>
              ))}
          </Card>
        ) : null}
      </ScrollView>
      <StickyFooter>
        {choice.kind === "draft" ? (
          <Button label={`Start the draft at #${slot}`} onPress={() => onDraft(choice.rounds, slot)} primary />
        ) : (
          <Button label="Start the season with this roster" onPress={onKeep} primary />
        )}
      </StickyFooter>
    </View>
  );
}
