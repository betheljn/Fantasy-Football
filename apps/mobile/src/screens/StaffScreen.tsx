// The offseason opens with your staff: fire who you want gone (their deals are
// paid out from the staff budget), renew or let go of expiring deals, then hire
// for any open seats from the coaches and executives available.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { STAFF_ROLE_NAMES, formatMoney, type StaffOpening, type StaffSeat, type StaffSlot } from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { useTheme, type Theme } from "../theme";

const REASON: Record<string, string> = { fired: "fired", retired: "retired", "contract expired": "deal ended", "hired away": "hired away" };

export function StaffScreen(props: {
  overview: { budget: number; committed: number; seats: StaffSeat[] };
  onConfirm: (fire: ReadonlySet<StaffSlot>, renew: ReadonlySet<StaffSlot>) => void;
  /** Online: your earlier call, and the button's words. */
  initial?: { fire: readonly StaffSlot[]; renew: readonly StaffSlot[] };
  confirmLabel?: string;
}) {
  const t = useTheme();
  const { overview } = props;
  const [fire, setFire] = useState<Set<StaffSlot>>(() => new Set(props.initial?.fire ?? []));
  // Expiring deals are renewed unless you say otherwise.
  const [renew, setRenew] = useState<Set<StaffSlot>>(() => new Set(props.initial?.renew ?? overview.seats.filter((x) => x.expiring).map((x) => x.slot)));
  // Each button sets its choice (tapping the one already picked changes nothing).
  const choose = (setter: (f: (s: Set<StaffSlot>) => Set<StaffSlot>) => void, slot: StaffSlot, on: boolean) =>
    setter((set) => {
      const n = new Set(set);
      if (on) n.add(slot);
      else n.delete(slot);
      return n;
    });
  // Next season: a fired coach's salary still counts (as his buyout); a renewal costs its new ask; open seats need a hire.
  const renewing = overview.seats.filter((x) => x.expiring && renew.has(x.slot)).reduce((s, x) => s + x.renewAsk, 0);
  const committed = overview.committed + renewing;
  const open = overview.seats.filter((x) => fire.has(x.slot) || (x.expiring && !renew.has(x.slot))).length;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Your staff</Text>
      <Text style={{ color: t.muted }}>Keep, renew or replace your coaches and front office. Firing someone pays out the rest of his deal.</Text>
      <Card>
        <SectionTitle>Staff budget</SectionTitle>
        <Line label="Budget" value={formatMoney(overview.budget)} theme={t} />
        <Line label="Committed next season (incl. buyouts)" value={`−${formatMoney(committed)}`} theme={t} />
        <Line label={open ? `Left for ${open} new hire${open === 1 ? "" : "s"}` : "Left over"} value={formatMoney(overview.budget - committed)} theme={t} strong />
      </Card>
      {overview.seats.map((x) => {
        const m = x.member;
        const firing = fire.has(x.slot);
        const letting = x.expiring && !renew.has(x.slot);
        return (
          <Card key={x.slot} style={{ borderColor: firing || letting ? t.score : t.border }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700" }}>{STAFF_ROLE_NAMES[m.role].toUpperCase()}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "700" }}>
                {m.firstName} {m.lastName}
              </Text>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{x.overall}</Text>
            </View>
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
              age {m.age} · {m.experience} yrs experience
              {m.contract ? ` · ${formatMoney(m.contract.salary)}/yr through ${m.contract.through}` : ""}
              {x.mayRetire ? " · may retire" : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {x.expiring ? (
                <>
                  <Choice label={`Renew (${formatMoney(x.renewAsk)}/yr)`} on={!letting} onPress={() => choose(setRenew, x.slot, true)} theme={t} />
                  <Choice label="Let go" on={letting} danger onPress={() => choose(setRenew, x.slot, false)} theme={t} />
                </>
              ) : (
                <>
                  <Choice label="Keep" on={!firing} onPress={() => choose(setFire, x.slot, false)} theme={t} />
                  <Choice label={`Fire (${formatMoney(x.buyout)} buyout)`} on={firing} danger onPress={() => choose(setFire, x.slot, true)} theme={t} />
                </>
              )}
            </View>
          </Card>
        );
      })}
      <Primary label={props.confirmLabel ?? (open > 0 ? `Continue to hiring (${open} open)` : "Continue")} onPress={() => props.onConfirm(fire, renew)} theme={t} />
    </ScrollView>
  );
}

export function HireScreen(props: {
  openings: { budget: number; committed: number; openings: StaffOpening[] };
  onConfirm: (picks: ReadonlyMap<StaffSlot, string>) => void;
  initial?: ReadonlyArray<readonly [StaffSlot, string]>;
  confirmLabel?: string;
}) {
  const t = useTheme();
  const { openings } = props;
  const [picks, setPicks] = useState<Map<StaffSlot, string>>(() => new Map(props.initial ?? []));
  const spent = openings.openings.reduce((s, o) => s + (o.candidates.find((c) => c.member.id === picks.get(o.slot))?.ask ?? 0), 0);
  const room = openings.budget - openings.committed - spent;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Hiring</Text>
      <Text style={{ color: t.muted }}>Pick someone for each open seat, or leave it to your front office. You hire before the other teams, so nobody can take your choice.</Text>
      <Card>
        <Line label="Staff budget" value={formatMoney(openings.budget)} theme={t} />
        <Line label="Committed (incl. buyouts)" value={`−${formatMoney(openings.committed)}`} theme={t} />
        <Line label="Your picks" value={`−${formatMoney(spent)}`} theme={t} />
        <Line label="Room left" value={formatMoney(room)} theme={t} strong color={room < 0 ? t.score : t.accent} />
      </Card>
      {openings.openings.map((o) => (
        <Opening
          key={o.slot}
          opening={o}
          picked={picks.get(o.slot)}
          room={room}
          onPick={(id) =>
            setPicks((p) => {
              const n = new Map(p);
              if (id) n.set(o.slot, id);
              else n.delete(o.slot);
              return n;
            })
          }
          theme={t}
        />
      ))}
      <Primary label={props.confirmLabel ?? "Hire and continue"} onPress={() => props.onConfirm(picks)} theme={t} />
    </ScrollView>
  );
}

/** One open seat: the best ten candidates plus everyone you can afford; over-budget ones can't be picked. */
function Opening({ opening: o, picked, room, onPick, theme: t }: { opening: StaffOpening; picked: string | undefined; room: number; onPick: (id: string | null) => void; theme: Theme }) {
  // Room for this seat: what's left overall plus whatever this seat's current pick costs.
  const seatRoom = room + (o.candidates.find((c) => c.member.id === picked)?.ask ?? 0);
  const shown = o.candidates.filter((c, i) => i < 10 || c.ask <= seatRoom);
  const anyAffordable = shown.some((c) => c.ask <= seatRoom);
  return (
    <Card>
      <SectionTitle>
        {STAFF_ROLE_NAMES[o.role]}
        {o.out ? ` · replacing ${o.out} (${REASON[o.reason] ?? o.reason})` : ""}
      </SectionTitle>
      {!anyAffordable ? <Text style={{ color: t.score, marginBottom: 4 }}>No one fits the budget: your front office will find the cheapest option.</Text> : null}
      {shown.map((c) => {
        const on = picked === c.member.id;
        const affordable = c.ask <= seatRoom;
        const from = c.from === "promoted coordinator" ? `${c.currentSlot === "oc" ? "offensive" : "defensive"} coordinator at ${c.currentTeam}` : c.from;
        return (
          <Pressable
            key={c.member.id}
            onPress={() => onPick(on ? null : c.member.id)}
            disabled={!affordable && !on}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !affordable && !on }}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderColor: t.border, opacity: affordable || on ? 1 : 0.4 }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? t.accent : t.muted, alignItems: "center", justifyContent: "center" }}>
              {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "600" }}>
                {c.member.firstName} {c.member.lastName}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                age {c.member.age} · {from}
                {c.reputation >= 1 ? ` · strong record (+${c.reputation.toFixed(0)})` : c.reputation <= -1 ? " · losing record" : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: t.text, fontWeight: "800" }}>{c.overall}</Text>
              <Text style={{ color: affordable ? t.muted : t.score, fontSize: 12 }}>
                {formatMoney(c.ask)}/yr{affordable ? "" : " · over budget"}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {!picked ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>No pick: your front office will hire.</Text> : null}
    </Card>
  );
}

function Line({ label, value, theme: t, strong, color }: { label: string; value: string; theme: Theme; strong?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, gap: 8 }}>
      <Text style={{ flex: 1, color: strong ? t.text : t.muted, fontWeight: strong ? "700" : "400" }}>{label}</Text>
      <Text style={{ color: color ?? (strong ? t.accent : t.text), fontWeight: strong ? "800" : "500", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function Choice({ label, on, onPress, theme: t, danger }: { label: string; on: boolean; onPress: () => void; theme: Theme; danger?: boolean }) {
  const color = danger ? t.score : t.accent;
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ flexShrink: 1, paddingHorizontal: 10, minHeight: 34, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: on ? color : t.border, backgroundColor: on ? color : t.card }}>
      <Text style={{ color: on ? (danger ? "#fff" : t.onAccent) : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function Primary({ label, onPress, theme: t }: { label: string; onPress: () => void; theme: Theme }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: t.onAccent, fontWeight: "800", fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
