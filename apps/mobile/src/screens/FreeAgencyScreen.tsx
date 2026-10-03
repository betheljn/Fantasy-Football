// Free agency: the market after the draft. Make offers (money and years) to
// the players you want; when it opens, each player signs wherever he'd be
// happiest - the money matters, but so do winning, playing time, the coach
// and home. Other teams bid too; you only see how many are interested.
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import {
  POSITIONS,
  PRIORITY_NAMES,
  capHit,
  formatMoney,
  moodLabel,
  persona,
  playerOverall,
  topPriorities,
  veteranContract,
  type FreeAgencyPlan,
  type FreeAgentListing,
  type FreeAgentOffer,
  type Position,
} from "@dynasty/sim";
import { Card } from "../components/ui";
import { useTheme, type Theme } from "../theme";

interface Props {
  plan: FreeAgencyPlan;
  offers: ReadonlyMap<string, FreeAgentOffer>;
  setOffer: (player: string, offer: FreeAgentOffer | null) => void;
  /** How a player would feel about your team at a given offer (0-100). */
  moodAt: (listing: FreeAgentListing, annual: number) => number;
  onOpen: () => void;
  frontOffice: boolean;
  setFrontOffice: (on: boolean) => void;
  /** Online: the button's words (your offers go in; free agency opens when the stage closes). */
  confirmLabel?: string;
}

export function FreeAgencyScreen({ plan, offers, setOffer, moodAt, onOpen, frontOffice, setFrontOffice, confirmLabel }: Props) {
  const t = useTheme();
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [editing, setEditing] = useState<string | null>(null);
  const hit = (l: FreeAgentListing, o: FreeAgentOffer) => capHit(veteranContract(l.player, plan.cap, { kind: "veteran", signed: plan.season, years: o.years, annual: o.annual }), plan.season);
  // Players sign best first, so walk the market in that order: offers that no longer fit are skipped.
  let room = plan.room;
  const fits = new Map<string, boolean>();
  for (const l of plan.pool) {
    const o = offers.get(l.player.id);
    if (!o) continue;
    const h = hit(l, o);
    fits.set(l.player.id, h <= room);
    if (h <= room) room -= h;
  }
  const rows = useMemo(() => (pos === "ALL" ? plan.pool : plan.pool.filter((l) => l.player.position === pos)), [plan, pos]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(l) => l.player.id}
      initialNumToRender={15}
      contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={
        <View>
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Free agency</Text>
            <Text style={{ color: t.muted }}>
              {plan.pool.length} players on the market. Make offers to the ones you want — each signs where he'd be happiest, so money isn't everything.
            </Text>
            <Card>
              <Line label="Cap room (keeping enough to fill the roster)" value={formatMoney(plan.room)} theme={t} />
              <Line label={`Your offers (${offers.size}, if they all sign)`} value={`−${formatMoney(plan.room - room)}`} theme={t} />
              <Line label="Room left" value={formatMoney(room)} theme={t} strong />
              <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Roster now: {plan.rosterSize} (you'll cut down to 72 after free agency)</Text>
            </Card>
            <Pressable
              onPress={() => setFrontOffice(!frontOffice)}
              accessibilityRole="switch"
              accessibilityState={{ checked: frontOffice }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View style={{ width: 42, height: 24, borderRadius: 12, padding: 2, backgroundColor: frontOffice ? t.accent : t.border, alignItems: frontOffice ? "flex-end" : "flex-start" }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
              </View>
              <Text style={{ flex: 1, color: t.text }}>
                Let my front office bid on everyone else{" "}
                <Text style={{ color: t.muted }}>(your offers always come first)</Text>
              </Text>
            </Pressable>
            <Pressable
              onPress={onOpen}
              accessibilityRole="button"
              style={({ pressed }) => ({ height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: t.onAccent, fontWeight: "800", fontSize: 16 }}>{confirmLabel ?? (offers.size > 0 ? `Open free agency (${offers.size} offer${offers.size === 1 ? "" : "s"})` : "Open free agency (no offers)")}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 50 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: "center" }}>
            {(["ALL", ...POSITIONS] as const).map((p) => (
              <Pressable key={p} onPress={() => setPos(p)} accessibilityRole="button" accessibilityState={{ selected: pos === p }} style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: pos === p ? t.accent : t.card, borderWidth: 1, borderColor: pos === p ? t.accent : t.border }}>
                <Text style={{ color: pos === p ? t.onAccent : t.text, fontWeight: "600", fontSize: 13 }}>{p === "ALL" ? "All" : p}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item: l }) => (
        <Listing
          listing={l}
          offer={offers.get(l.player.id)}
          fits={fits.get(l.player.id) ?? true}
          open={editing === l.player.id}
          onToggle={() => setEditing((e) => (e === l.player.id ? null : l.player.id))}
          setOffer={(o) => setOffer(l.player.id, o)}
          moodAt={(annual) => moodAt(l, annual)}
          minimum={plan.minimum}
          theme={t}
        />
      )}
    />
  );
}

function Listing(props: {
  listing: FreeAgentListing;
  offer: FreeAgentOffer | undefined;
  fits: boolean;
  open: boolean;
  onToggle: () => void;
  setOffer: (o: FreeAgentOffer | null) => void;
  moodAt: (annual: number) => number;
  minimum: number;
  theme: Theme;
}) {
  const { listing: l, offer, fits, open, onToggle, setOffer, moodAt, minimum, theme: t } = props;
  const p = l.player;
  const cares = topPriorities(persona(p)).map((k) => PRIORITY_NAMES[k]).join(", ");
  const draft = offer ?? { annual: Math.round(l.ask / 10) * 10, years: l.years };
  const m = moodAt(draft.annual);
  const step = (f: number) => setOffer({ ...draft, annual: Math.max(minimum, Math.round((draft.annual * f) / 10) * 10) });
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: t.card, borderWidth: offer ? 1.5 : 1, borderColor: offer ? t.accent : t.border }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${p.firstName} ${p.lastName}, make an offer`}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ width: 26, color: t.muted, fontWeight: "700" }}>{p.position}</Text>
          <Text style={{ flex: 1, color: t.text, fontWeight: "700" }} numberOfLines={1}>
            {p.firstName} {p.lastName}
          </Text>
          <Text style={{ color: t.text, fontWeight: "800" }}>{playerOverall(p)}</Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 2, marginLeft: 34 }}>
          age {p.age}
          {l.wouldStart ? " · would start for you" : ""}
          {l.hometown ? " · from your state" : ""} · cares about {cares}
        </Text>
        <Text style={{ color: t.text, fontSize: 13, marginTop: 4, marginLeft: 34 }}>
          Asking {formatMoney(l.ask)}/yr × {l.years} · {l.interest} team{l.interest === 1 ? "" : "s"} interested
        </Text>
        {offer ? (
          <Text style={{ color: fits ? t.accent : t.score, fontSize: 13, fontWeight: "700", marginTop: 2, marginLeft: 34 }}>
            Your offer: {formatMoney(offer.annual)}/yr × {offer.years}
            {fits ? "" : " — won't fit when his turn comes"}
          </Text>
        ) : null}
      </Pressable>
      {open ? (
        <View style={{ marginTop: 10, marginLeft: 34, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Small label="−5%" onPress={() => step(0.95)} theme={t} />
            <Text style={{ minWidth: 90, textAlign: "center", color: t.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMoney(draft.annual)}/yr</Text>
            <Small label="+5%" onPress={() => step(1.05)} theme={t} />
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((y) => (
              <Small key={y} label={`${y} yr`} on={draft.years === y} onPress={() => setOffer({ ...draft, years: y })} theme={t} />
            ))}
          </View>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            At this offer he'd feel {moodLabel(m).toLowerCase()} ({m}) about your team. Other teams' offers are hidden.
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Small label={offer ? "Update offer" : "Make offer"} onPress={() => setOffer(draft)} theme={t} primary />
            {offer ? <Small label="Withdraw" onPress={() => setOffer(null)} theme={t} /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Line({ label, value, theme: t, strong }: { label: string; value: string; theme: Theme; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, gap: 8 }}>
      <Text style={{ flex: 1, color: strong ? t.text : t.muted, fontWeight: strong ? "700" : "400" }}>{label}</Text>
      <Text style={{ color: strong ? t.accent : t.text, fontWeight: strong ? "800" : "500", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function Small({ label, onPress, theme: t, on, primary }: { label: string; onPress: () => void; theme: Theme; on?: boolean; primary?: boolean }) {
  const filled = on || primary;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={on !== undefined ? { selected: on } : {}} style={({ pressed }) => ({ paddingHorizontal: 10, height: 32, borderRadius: 8, justifyContent: "center", backgroundColor: filled ? t.accent : t.card, borderWidth: 1, borderColor: filled ? t.accent : t.border, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: filled ? t.onAccent : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
