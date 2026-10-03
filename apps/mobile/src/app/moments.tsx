// The collection: every moment worth keeping since your dynasty began, rarer
// the rarer the moment, and the league's record book (which started empty in
// year one, so every record is one your league set).
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { RARITIES, RECORD_NAMES, RECORD_STATS, startCollection, type Moment, type Rarity, type RecordEntry } from "@dynasty/sim";
import { Card, SectionTitle, Segmented, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

const RARITY_COLOR: Record<Rarity, string> = { common: "#9aa5b1", rare: "#4f9cf9", epic: "#b06ef7", legendary: "#f5b83d" };
const RARITY_NAME: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

export default function MomentsScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { userTeam } = useLeague();
  const [view, setView] = useState<"yours" | "all" | "records">("yours");
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const dynasty = d.save?.dynasty;
  const current = d.save?.collection;
  const all = useMemo(() => [...(dynasty?.moments ?? []), ...(current?.moments ?? [])].reverse(), [dynasty?.moments, current?.moments]);
  const book = current?.book ?? dynasty?.recordBook ?? startCollection(undefined).book;
  const shown = all.filter((m) => (view === "all" || m.team === userTeam) && (!rarity || m.rarity === rarity));
  const counts = RARITIES.map((r) => [r, all.filter((m) => m.rarity === r && (view === "all" || m.team === userTeam)).length] as const);

  return (
    <>
      <Stack.Screen options={{ title: "Moments" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Segmented
          options={[
            { key: "yours", label: "Your team" },
            { key: "all", label: "The league" },
            { key: "records", label: "Record book" },
          ]}
          value={view}
          onChange={setView}
        />

        {view === "records" ? (
          <>
            <RecordTable title="Single game" entries={book.game} theme={t} game />
            <RecordTable title="Single season" entries={book.season} theme={t} />
            <Text style={{ color: t.muted, fontSize: 12 }}>The record book started empty when your dynasty began: every record here was set in your league.</Text>
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Pill label={`All (${counts.reduce((n, [, c]) => n + c, 0)})`} on={rarity === null} onPress={() => setRarity(null)} theme={t} />
              {counts.map(([r, n]) => (
                <Pill key={r} label={`${RARITY_NAME[r]} (${n})`} on={rarity === r} onPress={() => setRarity(r)} color={RARITY_COLOR[r]} theme={t} />
              ))}
            </ScrollView>
            {shown.length === 0 ? <Text style={{ color: t.muted }}>{view === "yours" ? "No moments for your team yet. Go make some." : "Nothing yet. Play some games."}</Text> : null}
            {shown.slice(0, 80).map((m) => (
              <MomentCard key={m.id} m={m} theme={t} />
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function MomentCard({ m, theme: t }: { m: Moment; theme: Theme }) {
  const router = useRouter();
  const color = RARITY_COLOR[m.rarity];
  // A card from a set: the rarity's color across the top, the team's badge, the year.
  return (
    <Card style={{ borderColor: color, borderWidth: m.rarity === "common" ? 1 : 2, overflow: "hidden", paddingTop: 18 }}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: color }} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Swatch abbr={m.team} size={40} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ color, fontWeight: "900", fontSize: 11, letterSpacing: 0.5 }}>{RARITY_NAME[m.rarity].toUpperCase()}</Text>
            {m.first ? <Badge label="1 of 1 · league first" color={color} /> : null}
            {m.record ? <Badge label="League record" color={color} /> : null}
            <Text style={{ color: t.muted, fontSize: 12, marginLeft: "auto" }}>
              {m.season}
              {m.week ? ` · wk ${m.week}` : " · season"}
            </Text>
          </View>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 16, marginTop: 4 }}>{m.title}</Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>{m.detail}</Text>
          {m.player ? (
            <Pressable onPress={() => router.push(`/player/${m.player}`)} accessibilityRole="link" style={{ marginTop: 6 }}>
              <Text style={{ color: t.accent, fontSize: 13, fontWeight: "700" }}>Player card ›</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: color }}>
      <Text style={{ color: "#111", fontSize: 10, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

function RecordTable({ title, entries, theme: t, game }: { title: string; entries: Partial<Record<string, RecordEntry>>; theme: Theme; game?: boolean }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {RECORD_STATS.map((stat) => {
        const r = entries[stat];
        return (
          <View key={stat} style={{ flexDirection: "row", paddingVertical: 4, gap: 8 }}>
            <Text style={{ flex: 1, color: t.muted }}>{RECORD_NAMES[stat]}</Text>
            {r ? (
              <Text style={{ color: t.text, textAlign: "right" }}>
                <Text style={{ fontWeight: "800" }}>{r.value.toLocaleString()}</Text> {r.name} ({r.team}, {r.season}
                {game && r.week ? ` wk ${r.week}` : ""})
              </Text>
            ) : (
              <Text style={{ color: t.muted }}>Not yet set</Text>
            )}
          </View>
        );
      })}
    </Card>
  );
}

function Pill({ label, on, onPress, color, theme: t }: { label: string; on: boolean; onPress: () => void; color?: string; theme: Theme }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: on ? (color ?? t.accent) : t.card, borderWidth: 1, borderColor: color ?? t.border }}>
      <Text style={{ color: on ? (color ? "#111" : t.onAccent) : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
