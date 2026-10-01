// A scouting report: what YOUR scouts know about a prospect. Every attribute is
// a range that narrows as you scout him; the combine measures physicals exactly.
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { DEV_TRAIT_NAMES, RATING_INFO, RATING_KEYS, createScouting, formatRange, scoutingReport, type RatingGroup, type RangeEstimate } from "@dynasty/sim";
import { Card, SectionTitle } from "../../components/ui";
import { useDynasty, useLeague } from "../../league/LeagueProvider";
import { useTheme, type Theme } from "../../theme";

const GROUPS: RatingGroup[] = ["Physical", "Mental", "Passing", "Ball Carrier", "Receiving", "Blocking", "Defense", "Special Teams"];

export default function ProspectScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const d = useDynasty();
  const { league, userTeam } = useLeague();
  const scouting = useMemo(() => d.scouting ?? (d.draftClass ? createScouting(league, d.draftClass) : null), [d.scouting, d.draftClass, league]);
  const prospect = d.draftClass?.prospects.find((p) => p.player.id === id);
  if (!prospect || !scouting) return <Text style={{ padding: 16, color: t.text }}>Unknown prospect.</Text>;
  const r = scoutingReport(scouting, userTeam, prospect);
  const p = prospect.player;

  return (
    <>
      <Stack.Screen options={{ title: `${p.firstName} ${p.lastName}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.text }}>
            {p.firstName} {p.lastName}
          </Text>
          <Text style={{ color: t.muted }}>
            {p.position}
            {p.archetype ? ` · ${p.archetype}` : ""} · age {p.age} · consensus No. {prospect.boardRank}
          </Text>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
            <Big label="Overall" range={r.overall} theme={t} />
            <Big label="Potential" range={r.potential} theme={t} />
            <View>
              <Text style={{ color: t.muted, fontSize: 12 }}>Development</Text>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>{r.devTrait ? DEV_TRAIT_NAMES[r.devTrait] : "?"}</Text>
            </View>
          </View>
          <Text style={{ color: t.muted, marginTop: 8 }}>
            Your scouts know him {Math.round(r.knowledge * 100)}%. Ranges narrow as you scout; * = measured exactly.
          </Text>
        </Card>
        {GROUPS.map((g) => {
          const keys = RATING_KEYS.filter((k) => RATING_INFO[k].group === g);
          return (
            <Card key={g}>
              <SectionTitle>{g}</SectionTitle>
              {keys.map((k) => (
                <RangeBar key={k} name={RATING_INFO[k].name} range={r.attributes[k]} theme={t} />
              ))}
            </Card>
          );
        })}
      </ScrollView>
    </>
  );
}

function Big({ label, range, theme: t }: { label: string; range: RangeEstimate; theme: Theme }) {
  return (
    <View>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>{formatRange(range)}</Text>
    </View>
  );
}

/** The range as a band on a 0-99 bar. */
function RangeBar({ name, range, theme: t }: { name: string; range: RangeEstimate; theme: Theme }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
      <Text style={{ width: 140, color: t.muted }} numberOfLines={1}>
        {name}
      </Text>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.border }}>
        <View style={{ position: "absolute", left: `${range.low}%`, width: `${Math.max(1.5, range.high - range.low)}%`, height: 6, borderRadius: 3, backgroundColor: range.exact ? t.accent : "#d4a017" }} />
      </View>
      <Text style={{ width: 54, textAlign: "right", color: t.text, fontVariant: ["tabular-nums"] }}>{formatRange(range)}</Text>
    </View>
  );
}
