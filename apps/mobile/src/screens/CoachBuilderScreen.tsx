// Build your head coach (the step after making the team yours): name and age,
// offensive- or defensive-minded or a leader of men, schemes, tendencies, and
// ratings from a fixed budget. The sim checks it (coachBuildProblem) and puts
// the coach in charge (installHeadCoach).
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  COACH_AGE,
  COACH_BUDGET,
  COACH_RATING_NAMES,
  COACH_STYLES,
  DEFENSIVE_SCHEMES,
  OFFENSIVE_SCHEMES,
  SCHEME_DESCRIPTIONS,
  coachBuildCost,
  coachBuildProblem,
  coachPointsSpent,
  coachRatingKeys,
  defaultCoachBuild,
  formatMoney,
  type CoachBuild,
  type CoachRatingKey,
  type CoachStyle,
  type League,
} from "@dynasty/sim";
import { Button, Card, Chips, Field, Icon, SectionTitle, Segmented, StickyFooter } from "../components/ui";
import { useTheme } from "../theme";

const AGGRESSION = [
  { key: 30, label: "Safe" },
  { key: 50, label: "Normal" },
  { key: 70, label: "Bold" },
  { key: 88, label: "Gambler" },
] as const;

const TEMPO = [
  { key: 30, label: "Grind it out" },
  { key: 45, label: "Normal" },
  { key: 70, label: "Up-tempo" },
] as const;

export function CoachBuilderScreen({ league, abbr, teamLabel, onBack, onDone, initial, doneLabel }: { league: League; abbr: string; teamLabel: string; onBack: () => void; onDone: (build: CoachBuild) => void; initial?: CoachBuild; doneLabel?: (lastName: string) => string }) {
  const t = useTheme();
  const [build, setBuild] = useState<CoachBuild>(() => initial ?? defaultCoachBuild("balanced"));
  const set = (patch: Partial<CoachBuild>) => setBuild((b) => ({ ...b, ...patch }));
  const setStyle = (style: CoachStyle) => {
    // A new style spends a different budget: start its ratings over, keep the rest.
    const fresh = defaultCoachBuild(style);
    setBuild((b) => ({ ...b, style, ratings: fresh.ratings }));
  };
  const setRating = (k: CoachRatingKey, v: number) => setBuild((b) => ({ ...b, ratings: { ...b.ratings, [k]: Math.max(COACH_BUDGET.floor, Math.min(COACH_BUDGET.max, v)) } }));

  const budget = COACH_BUDGET.points[build.style];
  const left = budget - coachPointsSpent(build);
  const problem = coachBuildProblem(build);
  const cost = coachBuildCost(league, abbr, build);
  const staff = league.teams[abbr]?.staff;
  const overBudget = cost.salary + cost.others > cost.budget;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="chevron-back" size={18} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700" }}>Team look</Text>
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Your head coach</Text>
        <Text style={{ color: t.muted }}>
          {`The ${teamLabel} start with a coach you build. Spend the points where you want the edge; the rest of the staff stays and runs your schemes.`}
        </Text>

        <Card style={{ gap: 10 }}>
          <SectionTitle>Name and age</SectionTitle>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="First name" value={build.firstName} onChangeText={(v) => set({ firstName: v })} maxLength={16} autoCorrect={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Last name" value={build.lastName} onChangeText={(v) => set({ lastName: v })} maxLength={20} autoCorrect={false} />
            </View>
          </View>
          <Stepper label="Age" note="Coaches start thinking about retirement in their mid-60s" value={build.age} min={COACH_AGE.min} max={COACH_AGE.max} step={1} onChange={(age) => set({ age })} />
        </Card>

        <Card>
          <SectionTitle>Coaching style</SectionTitle>
          {(Object.keys(COACH_STYLES) as CoachStyle[]).map((style) => {
            const on = build.style === style;
            return (
              <Pressable key={style} onPress={() => setStyle(style)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
                <Icon name={on ? "radio-button-on" : "radio-button-off"} color={on ? t.accent : t.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>
                    {COACH_STYLES[style].label} <Text style={{ color: t.muted, fontWeight: "400" }}>· {COACH_BUDGET.points[style]} points</Text>
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>{COACH_STYLES[style].note}</Text>
                </View>
              </Pressable>
            );
          })}
          {staff && build.style !== "balanced" ? (
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>
              {build.style === "offense"
                ? `Takes over play calling from OC ${staff.oc.firstName} ${staff.oc.lastName} (${staff.oc.playCalling}), who keeps coaching the passing and running game.`
                : `Takes over play calling from DC ${staff.dc.firstName} ${staff.dc.lastName} (${staff.dc.playCalling}), who keeps coaching the pass and run defense.`}
            </Text>
          ) : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionTitle>Schemes</SectionTitle>
          <Text style={{ color: t.text, fontWeight: "700" }}>Offense</Text>
          <Chips options={OFFENSIVE_SCHEMES.map((s) => ({ key: s, label: s }))} value={build.offenseScheme} onChange={(offenseScheme) => set({ offenseScheme })} />
          <Text style={{ color: t.muted, fontSize: 12 }}>{SCHEME_DESCRIPTIONS[build.offenseScheme]}</Text>
          <Text style={{ color: t.text, fontWeight: "700", marginTop: 6 }}>Defense</Text>
          <Chips options={DEFENSIVE_SCHEMES.map((s) => ({ key: s, label: s }))} value={build.defenseScheme} onChange={(defenseScheme) => set({ defenseScheme })} />
          <Text style={{ color: t.muted, fontSize: 12 }}>{SCHEME_DESCRIPTIONS[build.defenseScheme]}</Text>
        </Card>

        <Card style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <SectionTitle>Ratings</SectionTitle>
            </View>
            <Text style={{ color: left < 0 ? t.score : t.accent, fontWeight: "800" }}>
              {left} of {budget} points left
            </Text>
          </View>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            {`Each starts at ${COACH_BUDGET.floor} and tops out at ${COACH_BUDGET.max}. An average coach is about 58.`}
          </Text>
          {coachRatingKeys(build.style).map((k) => (
            <Stepper
              key={k}
              label={COACH_RATING_NAMES[k].label}
              note={COACH_RATING_NAMES[k].note}
              value={build.ratings[k]}
              min={COACH_BUDGET.floor}
              max={Math.min(COACH_BUDGET.max, build.ratings[k] + Math.max(0, left))}
              step={2}
              onChange={(v) => setRating(k, v)}
              bar
            />
          ))}
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionTitle>Tendencies</SectionTitle>
          <Text style={{ color: t.text, fontWeight: "700" }}>Fourth downs and two-point tries</Text>
          <Segmented
            options={AGGRESSION.map((a) => ({ key: String(a.key), label: a.label }))}
            value={String(AGGRESSION.reduce((best, a) => (Math.abs(a.key - build.aggressiveness) < Math.abs(best.key - build.aggressiveness) ? a : best)).key)}
            onChange={(k) => set({ aggressiveness: Number(k) })}
          />
          {build.style === "offense" ? (
            <>
              <Text style={{ color: t.text, fontWeight: "700", marginTop: 4 }}>Pace</Text>
              <Segmented
                options={TEMPO.map((a) => ({ key: String(a.key), label: a.label }))}
                value={String(TEMPO.reduce((best, a) => (Math.abs(a.key - build.tempo) < Math.abs(best.key - build.tempo) ? a : best)).key)}
                onChange={(k) => set({ tempo: Number(k) })}
              />
            </>
          ) : null}
        </Card>

        <Card>
          <SectionTitle>Contract</SectionTitle>
          <Text style={{ color: t.text }}>
            {formatMoney(cost.salary)} a year. The rest of the staff costs {formatMoney(cost.others)} of your {formatMoney(cost.budget)} staff budget.
          </Text>
          {overBudget ? <Text style={{ color: t.score, fontSize: 12, marginTop: 4 }}>That puts you over the staff budget this season.</Text> : null}
        </Card>
      </ScrollView>
      <StickyFooter note={problem ?? undefined}>
        <Button label={doneLabel ? doneLabel(build.lastName.trim() || "…") : `Hire coach ${build.lastName.trim() || "…"}: next, the draft`} onPress={() => onDone(build)} primary disabled={!!problem} />
      </StickyFooter>
    </View>
  );
}

/** A number with minus and plus buttons (and a bar for ratings). */
function Stepper({ label, note, value, min, max, step, onChange, bar }: { label: string; note?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; bar?: boolean }) {
  const t = useTheme();
  const button = (sign: -1 | 1) => {
    const disabled = sign < 0 ? value <= min : value >= max;
    return (
      <Pressable
        onPress={disabled ? undefined : () => onChange(sign < 0 ? Math.max(min, value - step) : Math.min(max, value + step))}
        accessibilityRole="button"
        accessibilityLabel={`${sign < 0 ? "Lower" : "Raise"} ${label}`}
        accessibilityState={{ disabled }}
        hitSlop={6}
        style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
      >
        <Icon name={sign < 0 ? "remove" : "add"} size={18} color={t.text} />
      </Pressable>
    );
  };
  return (
    <View style={{ paddingVertical: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text>
          {note ? <Text style={{ color: t.muted, fontSize: 12 }}>{note}</Text> : null}
        </View>
        {button(-1)}
        <Text style={{ width: 30, textAlign: "center", color: t.text, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
        {button(1)}
      </View>
      {bar ? (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, marginTop: 6, overflow: "hidden" }}>
          <View style={{ width: `${value}%`, height: 6, backgroundColor: t.accent }} />
        </View>
      ) : null}
    </View>
  );
}
