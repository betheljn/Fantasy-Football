// Your draft board for an online league's draft: rank the prospects you want,
// best first. When the draft runs, each of your picks is the highest one on
// your board still there (or, if none are, the best left by your scouts).
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { BoardEntry } from "@dynasty/sim";
import { ProspectBoard } from "../components/ProspectBoard";
import { Button, Card, SectionTitle } from "../components/ui";
import { useTheme } from "../theme";

export function DraftBoardScreen({ board, initial, picks, onSave }: { board: BoardEntry[]; initial: readonly string[]; picks: readonly number[]; onSave: (ids: string[]) => void }) {
  const t = useTheme();
  const router = useRouter();
  const [mine, setMine] = useState<string[]>(() => [...initial]);
  const byId = useMemo(() => new Map(board.map((e) => [e.prospect.player.id, e])), [board]);
  const move = (i: number, by: number) => {
    const n = [...mine];
    const [x] = n.splice(i, 1);
    n.splice(i + by, 0, x!);
    setMine(n);
  };
  const toggle = (id: string) => setMine(mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]);

  return (
    <ProspectBoard
      board={board}
      onOpen={(e) => router.push(`/prospect/${e.prospect.player.id}`)}
      header={
        <View style={{ padding: 16, gap: 12 }}>
          <Card style={{ gap: 6 }}>
            <SectionTitle>Your draft board ({mine.length})</SectionTitle>
            <Text style={{ color: t.muted }}>
              Rank who you want, best first. Each of your picks is the highest one still there; once your board runs dry, your scouts take the best left. Below is your scouts' board: tap Add.
            </Text>
            <Text style={{ color: t.text, fontWeight: "600" }}>
              {picks.length ? `Your picks: No. ${picks.join(", ")}. Rank enough players to still find some there.` : "You have no picks in this draft."}
            </Text>
            {mine.map((id, i) => {
              const e = byId.get(id);
              if (!e) return null;
              const p = e.prospect.player;
              return (
                <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}>
                  <Text style={{ width: 24, color: t.muted, fontVariant: ["tabular-nums"] }}>{i + 1}</Text>
                  <Text style={{ flex: 1, color: t.text }}>
                    {p.position} {p.firstName} {p.lastName} <Text style={{ color: t.muted }}>(scouts' No. {e.rank})</Text>
                  </Text>
                  <Small label="▲" disabled={i === 0} onPress={() => move(i, -1)} />
                  <Small label="▼" disabled={i === mine.length - 1} onPress={() => move(i, 1)} />
                  <Small label="✕" onPress={() => toggle(id)} />
                </View>
              );
            })}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Button primary label="Submit my board" onPress={() => onSave(mine)} />
              {mine.length > 0 ? <Button label="Clear" onPress={() => setMine([])} /> : null}
            </View>
          </Card>
        </View>
      }
      action={(e) => {
        const id = e.prospect.player.id;
        const at = mine.indexOf(id);
        return <Small label={at >= 0 ? `#${at + 1}` : "Add"} on={at >= 0} onPress={() => toggle(id)} />;
      }}
    />
  );
}

function Small({ label, onPress, disabled, on }: { label: string; onPress: () => void; disabled?: boolean; on?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ minWidth: 34, height: 30, paddingHorizontal: 8, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : "transparent", opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
