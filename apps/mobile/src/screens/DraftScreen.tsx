// Draft day: you're on the clock. Pick from your own board (your scouts'
// estimates, not the truth); the other 49 teams pick from theirs.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { DRAFT_ROUNDS, type DraftTurn } from "@dynasty/sim";
import { ProspectBoard } from "../components/ProspectBoard";
import { Card, SectionTitle } from "../components/ui";
import { useTheme } from "../theme";

export function DraftScreen({ turn, userTeam, onPick, onAuto }: { turn: DraftTurn; userTeam: string; onPick: (id: string) => void; onAuto: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const [armed, setArmed] = useState<string | null>(null);
  const recent = turn.picks.slice(-5).reverse();
  const mine = turn.picks.filter((p) => p.team === userTeam);

  return (
    <ProspectBoard
      board={turn.board}
      onOpen={(e) => router.push(`/prospect/${e.prospect.player.id}`)}
      header={
        <View style={{ padding: 16, gap: 12 }}>
          <Card style={{ borderColor: t.accent, borderWidth: 1.5 }}>
            <Text style={{ color: t.accent, fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 }}>You're on the clock</Text>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "800", marginTop: 2 }}>
              Round {turn.round} of {DRAFT_ROUNDS}, pick {turn.pick} (No. {turn.overall})
            </Text>
            <Text style={{ color: t.muted, marginTop: 4 }}>Tap a player twice to draft him. Your board ranks prospects by what your scouts believe.</Text>
            <Pressable onPress={onAuto} accessibilityRole="button" style={{ marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 12, height: 34, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: t.text, fontWeight: "600" }}>Auto-draft the rest (best on my board)</Text>
            </Pressable>
          </Card>
          {recent.length > 0 ? (
            <Card>
              <SectionTitle>Just picked</SectionTitle>
              {recent.map((p) => (
                <Text key={p.overall} style={{ color: p.team === userTeam ? t.text : t.muted, fontWeight: p.team === userTeam ? "700" : "400", paddingVertical: 1 }}>
                  {p.overall}. {p.team} — {p.player.position} {p.player.firstName} {p.player.lastName}
                </Text>
              ))}
            </Card>
          ) : null}
          {mine.length > 0 ? (
            <Card>
              <SectionTitle>Your class so far</SectionTitle>
              {mine.map((p) => (
                <Text key={p.overall} style={{ color: t.text, paddingVertical: 1 }}>
                  Rd {p.round} (No. {p.overall}) — {p.player.position} {p.player.firstName} {p.player.lastName}
                </Text>
              ))}
            </Card>
          ) : null}
        </View>
      }
      action={(e) => {
        const id = e.prospect.player.id;
        const on = armed === id;
        return (
          <Pressable
            onPress={() => (on ? onPick(id) : setArmed(id))}
            accessibilityRole="button"
            accessibilityLabel={on ? `Confirm drafting ${e.prospect.player.lastName}` : `Draft ${e.prospect.player.lastName}`}
            style={{ minWidth: 64, height: 34, paddingHorizontal: 10, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.accent : t.card, borderWidth: 1, borderColor: t.accent }}
          >
            <Text style={{ color: on ? t.onAccent : t.accent, fontWeight: "800" }}>{on ? "Confirm" : "Draft"}</Text>
          </Pressable>
        );
      }}
    />
  );
}
