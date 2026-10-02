// A news story card: kind, teams, headline, body, and a link to the player it's about.
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { Story } from "@dynasty/sim";
import type { Theme } from "../theme";
import { Card, Swatch } from "./ui";

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
};

export function StoryCard({ s, lead, mine, theme: t }: { s: Story; lead?: boolean; mine?: boolean; theme: Theme }) {
  const router = useRouter();
  const player = s.players[0];
  return (
    <Card style={mine ? { borderColor: t.accent, borderWidth: 1 } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {s.teams.slice(0, 2).map((abbr) => (
          <Swatch key={abbr} abbr={abbr} />
        ))}
        <Text style={{ color: t.accent, fontWeight: "800", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{KIND_LABEL[s.kind]}</Text>
      </View>
      <Text style={{ color: t.text, fontWeight: "800", fontSize: lead ? 19 : 15 }}>{s.headline}</Text>
      <Text style={{ color: t.muted, marginTop: 4, lineHeight: 19 }}>{s.body}</Text>
      {player ? (
        <Pressable onPress={() => router.push(`/player/${player}`)} accessibilityRole="link" style={{ marginTop: 6 }}>
          <Text style={{ color: t.accent, fontSize: 12, fontWeight: "700" }}>Player card ›</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
