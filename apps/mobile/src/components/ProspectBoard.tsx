// Your big board: prospects ranked by YOUR scouts' estimates (not the truth),
// with how well you know each one. Used for weekly scouting and on draft day.
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { POSITIONS, type BoardEntry, type Position } from "@dynasty/sim";
import { useTheme, type Theme } from "../theme";

interface Props {
  board: BoardEntry[];
  /** Right-hand action for a row (scouting buttons, draft button). */
  action?: (e: BoardEntry) => ReactNode;
  onOpen?: (e: BoardEntry) => void;
  header?: ReactNode;
}

export function ProspectBoard({ board, action, onOpen, header }: Props) {
  const t = useTheme();
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const rows = useMemo(() => (pos === "ALL" ? board : board.filter((e) => e.prospect.player.position === pos)), [board, pos]);
  return (
    <FlatList
      data={rows}
      keyExtractor={(e) => e.prospect.player.id}
      initialNumToRender={20}
      contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={
        <View>
          {header}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 50 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: "center" }}>
            {(["ALL", ...POSITIONS] as const).map((p) => (
              <Chip key={p} label={p === "ALL" ? "All" : p} on={pos === p} onPress={() => setPos(p)} theme={t} />
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item: e }) => <Row entry={e} action={action?.(e)} onOpen={onOpen ? () => onOpen(e) : undefined} theme={t} />}
    />
  );
}

function Row({ entry: e, action, onOpen, theme: t }: { entry: BoardEntry; action: ReactNode; onOpen: (() => void) | undefined; theme: Theme }) {
  const p = e.prospect.player;
  const known = Math.round(e.knowledge * 100);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
      <Pressable onPress={onOpen} disabled={!onOpen} style={{ flex: 1 }} accessibilityRole="link" accessibilityLabel={`${p.firstName} ${p.lastName} scouting report`}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ width: 28, color: t.muted, fontVariant: ["tabular-nums"] }}>{e.rank}</Text>
          <Text style={{ width: 26, color: t.muted, fontWeight: "700" }}>{p.position}</Text>
          <Text style={{ flex: 1, color: t.text, fontWeight: "700" }} numberOfLines={1}>
            {p.firstName} {p.lastName}
          </Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 2, marginLeft: 36 }}>
          age {p.age}
          {p.archetype ? ` · ${p.archetype}` : ""} · consensus No. {e.prospect.boardRank}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, marginLeft: 36 }}>
          <Text style={{ color: t.text, fontSize: 13 }}>
            OVR ~{Math.round(e.overall)} · POT ~{Math.round(e.potential)}
          </Text>
          <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: t.border, maxWidth: 70 }}>
            <View style={{ width: `${known}%`, height: 5, borderRadius: 3, backgroundColor: t.accent }} />
          </View>
          <Text style={{ color: t.muted, fontSize: 12 }}>{known}% known</Text>
        </View>
      </Pressable>
      {action}
    </View>
  );
}

function Chip({ label, on, onPress, theme: t }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: on ? t.accent : t.card, borderWidth: 1, borderColor: on ? t.accent : t.border }}
    >
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
