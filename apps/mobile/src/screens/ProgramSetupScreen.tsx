// The start of a dynasty: rank the three skill groups you want to build
// around; the region whose talent core fits them best becomes your home, and
// a new program starts there (the sim decides: regionFits, createProgram).
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { REGION_CORES, SKILL_GROUPS, SKILL_GROUP_KEYS, STATES, regionFits, regions, skillChoiceProblem, type SkillGroup } from "@dynasty/sim";
import { Button, Card, Icon, SectionTitle, StickyFooter } from "../components/ui";
import { useTheme } from "../theme";

const STATE_NAME = new Map(STATES.map(([name, abbr]) => [abbr, name]));

/** Rank three skill groups: tap to add in order, tap again to take it out. */
export function SkillGroupsScreen({ initial, onDone, randomRegion }: { initial?: SkillGroup[]; onDone: (groups: SkillGroup[]) => void; randomRegion?: boolean }) {
  const t = useTheme();
  const [picked, setPicked] = useState<SkillGroup[]>(initial ?? []);
  const toggle = (g: SkillGroup) => setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : p.length < 3 ? [...p, g] : p));
  const fits = useMemo(() => (picked.length ? regionFits(picked) : []), [picked]);
  const problem = skillChoiceProblem(picked);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Build your program</Text>
        <Text style={{ color: t.muted }}>
          {randomRegion
            ? "Every region turns out its own kind of player, and yours will be drawn at random. Pick the three skill groups you most want to build around, most important first: players in them get the edge when your roster is built."
            : "Every region turns out its own kind of player. Pick the three skill groups you most want to build around, most important first: they decide which region your program calls home and the local talent that comes with it."}
        </Text>
        <Card>
          <SectionTitle>{`Your top three (${picked.length} of 3)`}</SectionTitle>
          {SKILL_GROUP_KEYS.map((g) => {
            const rank = picked.indexOf(g);
            const on = rank >= 0;
            const full = !on && picked.length >= 3;
            return (
              <Pressable
                key={g}
                onPress={() => toggle(g)}
                disabled={full}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: full }}
                accessibilityLabel={`${SKILL_GROUPS[g].label}${on ? `, choice ${rank + 1}` : ""}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, opacity: full ? 0.45 : 1 }}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {on ? <Text style={{ color: t.onAccent, fontWeight: "900" }}>{rank + 1}</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>{SKILL_GROUPS[g].label}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{SKILL_GROUPS[g].note}</Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
        {fits.length && !randomRegion ? (
          <Card>
            <SectionTitle>Best fits so far</SectionTitle>
            {fits.slice(0, 3).map((f, i) => (
              <Text key={f.region} style={{ color: i === 0 ? t.text : t.muted, fontWeight: i === 0 ? "700" : "400", paddingVertical: 2 }}>
                {`${i + 1}. ${f.region}`}
                {f.matches.length ? ` · known for ${f.matches.map((g) => SKILL_GROUPS[g].label.toLowerCase()).join(", ")}` : ""}
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
      <StickyFooter note={picked.length === 3 ? undefined : problem ?? undefined}>
        <Button label="Next: your region" onPress={() => onDone(picked)} primary disabled={!!problem} />
      </StickyFooter>
    </View>
  );
}

/** Your region: why it fits, its talent core, the states it covers. */
export function RegionScreen({ groups, region, onBack, onDone, busy, doneLabel, note }: { groups: SkillGroup[]; region?: string; onBack: () => void; onDone: () => void; busy?: boolean; doneLabel?: string; note?: string }) {
  const t = useTheme();
  const fits = regionFits(groups);
  // A region given (drawn at random, or set by the commissioner) is home; otherwise the best fit.
  const home = (region ? fits.find((f) => f.region === region) : undefined) ?? fits[0]!;
  const drawn = !!region;
  const states = regions().find((r) => r.name === home.region)!.states;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="chevron-back" size={18} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700" }}>Skill groups</Text>
        </Pressable>
        <Text style={{ color: t.muted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Your region</Text>
        <Text style={{ fontSize: 30, fontWeight: "900", color: t.text }}>{home.region}</Text>
        <Text style={{ color: t.muted }}>{states.map((s) => STATE_NAME.get(s) ?? s).join(" · ")}</Text>

        <Card>
          <SectionTitle>Why here</SectionTitle>
          <Text style={{ color: t.text }}>
            {drawn
              ? `Drawn at random. ${home.matches.length ? `It's known for ${home.matches.map((g) => SKILL_GROUPS[g].label.toLowerCase()).join(" and ")}, ${home.matches.length === 3 ? "all three of your picks" : "among your picks"}.` : "None of your picks are what it's known for, so you'll build against the grain."} Your skill groups still shape your roster: players in them get the edge when it's built.`
              : home.matches.length === 3
              ? "Your three choices are exactly what this region is known for."
              : home.matches.length
                ? `Known for ${home.matches.map((g) => SKILL_GROUPS[g].label.toLowerCase()).join(" and ")}, the closest fit for your choices.`
                : "No region is known for all of your choices; this one comes closest."}
          </Text>
        </Card>

        <Card>
          <SectionTitle>Local talent</SectionTitle>
          {REGION_CORES[home.region]!.map((g, i) => (
            <View key={g} style={{ flexDirection: "row", gap: 10, paddingVertical: 4 }}>
              <Text style={{ color: t.accent, fontWeight: "900", width: 18 }}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>
                  {SKILL_GROUPS[g].label}
                  {groups.includes(g) ? <Text style={{ color: t.accent }}> · your pick</Text> : null}
                </Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{SKILL_GROUPS[g].note}</Text>
              </View>
            </View>
          ))}
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>
            {"Great players come from everywhere, but the region's best mostly come from these groups. Your program starts with a fresh roster, mostly local talent, about as strong as the program it replaces."}
          </Text>
        </Card>

        {!drawn && fits.length > 1 ? (
          <Card>
            <SectionTitle>Next closest</SectionTitle>
            {fits.slice(1, 3).map((f) => (
              <Text key={f.region} style={{ color: t.muted, paddingVertical: 2 }}>
                {f.region}
                {f.matches.length ? ` · ${f.matches.map((g) => SKILL_GROUPS[g].label.toLowerCase()).join(", ")}` : ""}
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
      <StickyFooter note={note}>
        <Button label={busy ? "Building your program…" : (doneLabel ?? `Build my ${home.region} program`)} onPress={onDone} primary disabled={busy} />
      </StickyFooter>
    </View>
  );
}
