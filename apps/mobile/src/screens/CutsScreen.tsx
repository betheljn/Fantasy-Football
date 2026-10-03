// Roster cuts: get to 72 your way. Every cut shows what it saves and what it
// leaves behind as dead money; positions can't drop below what a game-day
// roster needs. Open spots under 72 are filled with undrafted free agents.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { POSITIONS, formatMoney, type Position, type RosterPlan, type RosterPlanPlayer } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useTheme, type Theme } from "../theme";

export function CutsScreen({ plan, onDone, initial, confirmLabel }: { plan: RosterPlan; onDone: (cuts: ReadonlySet<string>) => void; initial?: readonly string[]; confirmLabel?: string }) {
  const t = useTheme();
  const [cuts, setCuts] = useState<Set<string>>(() => new Set(initial ?? plan.aiCuts));
  const toggle = (id: string) =>
    setCuts((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const byPos = useMemo(() => {
    const m = new Map<Position, RosterPlanPlayer[]>();
    for (const pos of POSITIONS) m.set(pos, plan.players.filter((p) => p.player.position === pos).sort((a, b) => b.overall - a.overall));
    return m;
  }, [plan]);
  const kept = plan.players.length - cuts.size;
  const count = (pos: Position) => byPos.get(pos)!.filter((p) => !cuts.has(p.player.id)).length;
  const short = POSITIONS.filter((pos) => count(pos) < plan.positionMin[pos]);
  const over = POSITIONS.filter((pos) => count(pos) > plan.positionMax[pos]);
  const chosen = plan.players.filter((p) => cuts.has(p.player.id));
  const savings = chosen.reduce((s, p) => s + p.savings, 0);
  const dead = chosen.reduce((s, p) => s + p.deadMoney, 0);
  // Positions left short are filled with undrafted free agents, so only too many players blocks you.
  const ok = kept <= plan.max && over.length === 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Roster cuts</Text>
      <Text style={{ color: t.muted }}>Get down to {plan.max}. Your front office's suggestions are checked; change anything you like.</Text>
      <Card>
        <Line label="Players on the roster" value={String(plan.players.length)} theme={t} />
        <Line label="Cutting" value={String(cuts.size)} theme={t} />
        <Line label="Roster after cuts" value={`${kept} / ${plan.max}`} theme={t} strong color={kept > plan.max ? t.score : t.accent} />
        <Line label="Cap saved next season" value={formatMoney(savings)} theme={t} />
        <Line label="Dead money left behind" value={formatMoney(dead)} theme={t} />
        {kept < plan.max ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>{plan.max - kept} open spot{plan.max - kept === 1 ? "" : "s"} will be filled with undrafted free agents at the minimum.</Text> : null}
        {kept > plan.max ? <Text style={{ color: t.score, fontWeight: "700", marginTop: 4 }}>Cut {kept - plan.max} more.</Text> : null}
        {short.length ? (
          <Text style={{ color: t.muted, marginTop: 4 }}>
            Short at {short.map((p) => `${p} (need ${plan.positionMin[p]})`).join(", ")}: undrafted free agents will fill those spots.
          </Text>
        ) : null}
        {over.length ? <Text style={{ color: t.score, fontWeight: "700", marginTop: 4 }}>Too many at {over.map((p) => `${p} (max ${plan.positionMax[p]})`).join(", ")}.</Text> : null}
      </Card>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Small label="Front office cuts" onPress={() => setCuts(new Set(plan.aiCuts))} theme={t} />
        <Small label="Clear" onPress={() => setCuts(new Set())} theme={t} />
      </View>

      {POSITIONS.map((pos) => (
        <Card key={pos}>
          <SectionTitle>
            {pos} · {count(pos)} (min {plan.positionMin[pos]}, max {plan.positionMax[pos]})
          </SectionTitle>
          {byPos.get(pos)!.map((p) => (
            <Row key={p.player.id} entry={p} cut={cuts.has(p.player.id)} onToggle={() => toggle(p.player.id)} theme={t} />
          ))}
        </Card>
      ))}

      <Pressable
        onPress={() => ok && onDone(cuts)}
        disabled={!ok}
        accessibilityRole="button"
        style={({ pressed }) => ({ height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: ok ? t.accent : t.border, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: ok ? t.onAccent : t.muted, fontWeight: "800", fontSize: 16 }}>{ok ? (confirmLabel ?? "Finish the offseason") : "Fix the roster to continue"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ entry: e, cut, onToggle, theme: t }: { entry: RosterPlanPlayer; cut: boolean; onToggle: () => void; theme: Theme }) {
  const p = e.player;
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: cut }} accessibilityLabel={`Cut ${p.firstName} ${p.lastName}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, opacity: cut ? 0.55 : 1 }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: cut ? t.score : t.muted, backgroundColor: cut ? t.score : "transparent", alignItems: "center", justifyContent: "center" }}>
        {cut ? <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>✕</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "600", textDecorationLine: cut ? "line-through" : "none" }} numberOfLines={1}>
          {p.firstName} {p.lastName}
          {e.rookie ? <Text style={{ color: t.accent, fontWeight: "700" }}>  rookie</Text> : null}
        </Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>
          age {p.age} · {formatMoney(e.capHit)} cap hit{e.deadMoney ? ` · ${formatMoney(e.deadMoney)} dead if cut` : ""}
        </Text>
      </View>
      <Text style={{ width: 28, textAlign: "right", color: t.text, fontWeight: "800" }}>{e.overall}</Text>
    </Pressable>
  );
}

function Line({ label, value, theme: t, strong, color }: { label: string; value: string; theme: Theme; strong?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
      <Text style={{ color: strong ? t.text : t.muted, fontWeight: strong ? "700" : "400" }}>{label}</Text>
      <Text style={{ color: color ?? t.text, fontWeight: strong ? "800" : "500", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function Small({ label, onPress, theme: t }: { label: string; onPress: () => void; theme: Theme }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 12, height: 34, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: t.border, backgroundColor: t.card, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: t.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
