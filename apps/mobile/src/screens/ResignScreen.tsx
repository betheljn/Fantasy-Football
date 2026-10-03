// Re-sign your players: every expiring deal with what he'd sign for, how he
// feels about the team and the odds he says yes. Pick who to keep within the
// budget; the offseason then runs with your choices.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { DEV_TRAIT_NAMES, formatMoney, moodLabel, playerOverall, type ContractPlan, type ResignOffer } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useTheme, type Theme } from "../theme";

export function ResignScreen({ plan, onDone, initial, confirmLabel }: { plan: ContractPlan; onDone: (keep: ReadonlySet<string>) => void; initial?: readonly string[]; confirmLabel?: string }) {
  const t = useTheme();
  // The front office's picks, cut to what fits (in the order the team handles them, as it would anyway).
  const aiPicks = useMemo(() => {
    const picks = new Set<string>();
    let spent = plan.committed;
    for (const o of plan.offers) {
      if (!o.aiWants || spent + o.capHit > plan.budget) continue;
      picks.add(o.player.id);
      spent += o.capHit;
    }
    return picks;
  }, [plan]);
  const [keep, setKeep] = useState<Set<string>>(() => (initial ? new Set(initial) : aiPicks));
  const toggle = (id: string) =>
    setKeep((k) => {
      const n = new Set(k);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Walk the list in the order the team handles it: once the budget runs out, later picks won't fit.
  let running = plan.committed;
  const fits = new Map<string, boolean>();
  for (const o of plan.offers) {
    if (!keep.has(o.player.id)) continue;
    const ok = running + o.capHit <= plan.budget;
    fits.set(o.player.id, ok);
    if (ok) running += o.capHit;
  }
  const room = plan.budget - running;
  const fitting = plan.offers.filter((o) => fits.get(o.player.id) === true);
  const overflow = keep.size - fitting.length;
  const expectedCost = fitting.reduce((s, o) => s + o.capHit * o.chance, 0);
  // The budget keeps a small cushion under the cap.
  const cushion = plan.cap + plan.rollover - plan.incentives - plan.rookieBill - plan.budget;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Re-sign your players</Text>
      <Text style={{ color: t.muted }}>
        {plan.offers.length} contracts are up. Choose who to keep. Players who aren't happy may say no — the odds are shown. The rest become free agents.
      </Text>

      <Card>
        <SectionTitle>{plan.season} cap</SectionTitle>
        <Line label="Cap" value={formatMoney(plan.cap)} theme={t} />
        {plan.rollover ? <Line label="Rollover from last year" value={`+${formatMoney(plan.rollover)}`} theme={t} /> : null}
        {plan.incentives ? <Line label="Incentives earned last year" value={`−${formatMoney(plan.incentives)}`} theme={t} /> : null}
        <Line label="Set aside for your draft picks" value={`−${formatMoney(plan.rookieBill)}`} theme={t} />
        <Line label="Already under contract" value={`−${formatMoney(plan.committed)}`} theme={t} />
        <Line label="Cushion kept under the cap" value={`−${formatMoney(cushion)}`} theme={t} />
        <Line label={`Chosen (${fitting.length}, if all say yes)`} value={`−${formatMoney(running - plan.committed)}`} theme={t} />
        <View style={{ height: 1, backgroundColor: t.border, marginVertical: 6 }} />
        <Line label="Room left" value={formatMoney(room)} theme={t} strong color={room < 0 ? t.score : t.accent} />
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Expected cost counting the odds: {formatMoney(expectedCost)}</Text>
        {overflow > 0 ? (
          <Text style={{ color: t.score, fontSize: 13, marginTop: 4, fontWeight: "700" }}>
            {overflow} of your picks won't fit and will leave. Let someone go to make room.
          </Text>
        ) : null}
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Small label="Front office picks" onPress={() => setKeep(new Set(aiPicks))} theme={t} />
        <Small label="Keep none" onPress={() => setKeep(new Set())} theme={t} />
      </View>

      {plan.offers.map((o) => (
        <OfferRow key={o.player.id} offer={o} kept={keep.has(o.player.id)} fits={fits.get(o.player.id) ?? true} onToggle={() => toggle(o.player.id)} theme={t} />
      ))}

      <Pressable
        onPress={() => onDone(keep)}
        accessibilityRole="button"
        style={({ pressed }) => ({ height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: t.onAccent, fontWeight: "800", fontSize: 16 }}>{confirmLabel ?? "Continue to the draft"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function OfferRow({ offer: o, kept, fits, onToggle, theme: t }: { offer: ResignOffer; kept: boolean; fits: boolean; onToggle: () => void; theme: Theme }) {
  const p = o.player;
  // A new deal is all future years; an option adds one year to the rookie deal.
  const years = o.kind === "option" ? 1 : o.deal.years.length;
  const avg = o.deal.years.slice(-years).reduce((s, y) => s + y.salary + y.bonus, 0) / years;
  const odds = Math.round(o.chance * 100);
  const oddsColor = o.chance >= 0.75 ? t.accent : o.chance >= 0.4 ? "#d4a017" : t.score;
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: kept }} accessibilityLabel={`Keep ${p.firstName} ${p.lastName}`}>
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "center", borderColor: kept ? t.accent : t.border, borderWidth: kept ? 1.5 : 1 }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: kept ? t.accent : t.muted, backgroundColor: kept ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {kept ? <Text style={{ color: t.onAccent, fontWeight: "900" }}>✓</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ color: t.muted, width: 26 }}>{p.position}</Text>
            <Text style={{ flex: 1, color: t.text, fontWeight: "700" }} numberOfLines={1}>
              {p.firstName} {p.lastName}
            </Text>
            <Text style={{ color: t.text, fontWeight: "800" }}>{playerOverall(p)}</Text>
          </View>
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
            age {p.age}
            {p.devTraitRevealed && p.devTrait !== "normal" ? ` · ${DEV_TRAIT_NAMES[p.devTrait]} dev` : ""}
            {o.homegrown ? " · homegrown (80% cap)" : ""}
            {o.aiWants ? "" : " · front office would let go"}
          </Text>
          <Text style={{ color: t.text, fontSize: 13, marginTop: 4 }}>
            {o.kind === "option" ? `5th-year option: ${formatMoney(o.capHit)} for ${o.deal.years.at(-1)!.season}` : `${years} yr${years === 1 ? "" : "s"}, ${formatMoney(avg)}/yr · ${formatMoney(o.capHit)} next season`}
          </Text>
          <Text style={{ fontSize: 12, marginTop: 2, color: oddsColor }}>
            {o.kind === "option" ? "Can't refuse" : `${moodLabel(o.mood)} (${o.mood}) · ${odds}% to accept`}
          </Text>
          {kept && !fits ? <Text style={{ fontSize: 12, marginTop: 2, color: t.score, fontWeight: "700" }}>Won't fit under the cap</Text> : null}
        </View>
      </Card>
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
