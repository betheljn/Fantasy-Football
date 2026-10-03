// A news story card: kind, teams, headline, body, and a link to the player it's
// about. The lead story wears its team's colors across the top.
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { Story } from "@dynasty/sim";
import { teamColor } from "../field/colors";
import type { Theme } from "../theme";
import { Card, Pill, Swatch } from "./ui";

const KIND_LABEL: Record<Story["kind"], string> = {
  upset: "Upset",
  clash: "Top 10",
  thriller: "Thriller",
  blowout: "Rout",
  performance: "Big game",
  streak: "Streak",
  rankings: "Rankings",
  injury: "Injury",
  trade: "Trade",
  mvp: "MVP race",
  recap: "Your game",
  preview: "Up next",
  rivalry: "Rivalry",
  spring: "Spring",
  lockerroom: "Locker room",
  milestone: "Milestone",
};

const KIND_TONE: Partial<Record<Story["kind"], "accent" | "bad" | "gold">> = { milestone: "gold", upset: "bad", injury: "bad", mvp: "gold", rivalry: "gold", recap: "accent", preview: "accent" };

export function StoryCard({ s, lead, mine, theme: t }: { s: Story; lead?: boolean; mine?: boolean; theme: Theme }) {
  const router = useRouter();
  const player = s.players[0];
  const band = s.teams[0];
  return (
    <Card style={[{ overflow: "hidden" }, mine ? { borderColor: t.accent, borderWidth: 1 } : null, lead && band ? { paddingTop: 16 } : null]}>
      {lead && band ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: teamColor(band) }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {s.teams.slice(0, 2).map((abbr) => (
          <Swatch key={abbr} abbr={abbr} size={22} />
        ))}
        <Pill label={KIND_LABEL[s.kind]} tone={KIND_TONE[s.kind] ?? "muted"} />
      </View>
      <Text style={{ color: t.text, fontWeight: "800", fontSize: lead ? 20 : 16, lineHeight: lead ? 25 : 21 }}>{s.headline}</Text>
      <Text style={{ color: t.muted, marginTop: 4, lineHeight: 20 }}>{s.body}</Text>
      {player ? (
        <Pressable onPress={() => router.push(`/player/${player}`)} accessibilityRole="link" style={{ marginTop: 8 }}>
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: "700" }}>Player card ›</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
