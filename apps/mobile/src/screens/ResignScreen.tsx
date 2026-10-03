// Re-sign your players: every expiring deal with what he'd sign for, how he
// feels about the team and the odds he says yes. Pick who to keep within the
// budget; the offseason then runs with your choices.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { DEV_TRAIT_NAMES, RESIGN_OFFERS, fillReserve, formatMoney, moodLabel, playerOverall, resignFits, termsAt, type ContractPlan, type ExtensionOffer, type ResignOffer } from "@dynasty/sim";
import { Card, SectionTitle, StickyFooter } from "../components/ui";
import { useTheme, type Theme } from "../theme";

export function ResignScreen({
  plan,
  onDone,
  initial,
  initialOffers,
  confirmLabel,
}: {
  plan: ContractPlan;
  /** Who to keep, and counteroffers (share of his ask) for any you didn't offer his ask. */
  onDone: (keep: ReadonlySet<string>, offers: ReadonlyMap<string, number>) => void;
  initial?: readonly string[];
  initialOffers?: ReadonlyArray<readonly [string, number]>;
  confirmLabel?: string;
}) {
  const t = useTheme();
  // The front office's picks, cut to what fits (in the order the team handles them, as it would anyway):
  // the re-signings it wants, then every extension that still fits.
  const aiPicks = useMemo(() => {
    const fit = resignFits(plan, new Set([...plan.offers.filter((o) => o.aiWants).map((o) => o.player.id), ...plan.extensions.map((x) => x.player.id)]));
    return new Set([...fit].filter(([, ok]) => ok).map(([id]) => id));
  }, [plan]);
  const [keep, setKeep] = useState<Set<string>>(() => (initial ? new Set(initial) : aiPicks));
  const [offers, setOffers] = useState<Map<string, number>>(() => new Map(initialOffers ?? []));
  const offerShare = (id: string, share: number) =>
    setOffers((m) => {
      const n = new Map(m);
      if (share === 1) n.delete(id);
      else n.set(id, share);
      return n;
    });
  const toggle = (id: string) =>
    setKeep((k) => {
      const n = new Set(k);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Walk the list in the order the team handles it (as the sim does): once the budget runs out, later picks won't fit.
  const fits = resignFits(plan, keep, offers);
  const fitting = plan.offers.filter((o) => fits.get(o.player.id) === true);
  const running = plan.committed + fitting.reduce((s, o) => s + termsAt(o, offers.get(o.player.id)).capHit, 0);
  const extending = plan.extensions.filter((x) => fits.get(x.player.id) === true);
  const extensionCost = extending.reduce((s, x) => s + x.extra + x.accelerated, 0);
  const reserve = fillReserve(plan, fitting.length);
  const room = plan.budget - running - extensionCost - reserve;
  const overflow = [...fits.values()].filter((ok) => !ok).length;
  const expectedCost = fitting.reduce((s, o) => {
    const t = termsAt(o, offers.get(o.player.id));
    return s + t.capHit * t.chance;
  }, 0);
  // The budget keeps a small cushion under the cap.
  const cushion = plan.cap + plan.rollover - plan.incentives - plan.rookieBill - plan.budget;

  return (
    <View style={{ flex: 1 }}>
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
          {extending.length ? <Line label={`Extensions (${extending.length})`} value={`−${formatMoney(extensionCost)}`} theme={t} /> : null}
          {reserve > 0 ? <Line label={`Kept to fill ${plan.openSpots - fitting.length} open spot${plan.openSpots - fitting.length === 1 ? "" : "s"} at the minimum`} value={`−${formatMoney(reserve)}`} theme={t} /> : null}
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
          <OfferRow
            key={o.player.id}
            offer={o}
            kept={keep.has(o.player.id)}
            fits={fits.get(o.player.id) ?? true}
            share={offers.get(o.player.id) ?? 1}
            onShare={(x) => offerShare(o.player.id, x)}
            onToggle={() => toggle(o.player.id)}
            theme={t}
          />
        ))}

        {plan.extensions.length ? (
          <View style={{ gap: 12, marginTop: 8 }}>
            <View>
              <SectionTitle>Early extensions</SectionTitle>
              <Text style={{ color: t.muted }}>
                Young stars with a year left, and anyone underpaid who wants a new deal. Extend now and the new deal replaces the old one (any unpaid bonus comes due next season). Wait and a young star plays it out; a holdout sits out the first games of the season.
              </Text>
            </View>
            {plan.extensions.map((x) => (
              <ExtensionRow key={x.player.id} offer={x} on={keep.has(x.player.id)} fits={fits.get(x.player.id) ?? true} onToggle={() => toggle(x.player.id)} theme={t} />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <StickyFooter note={`Keeping ${fitting.length}${extending.length ? ` · extending ${extending.length}` : ""} · ${overflow ? `${overflow} won't fit` : `${formatMoney(room)} room left`}`}>
        <Pressable
          onPress={() => onDone(keep, new Map([...offers].filter(([id]) => keep.has(id))))}
          accessibilityRole="button"
          style={({ pressed }) => ({ height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: t.onAccent, fontWeight: "800", fontSize: 16 }}>{confirmLabel ?? "Continue to the draft"}</Text>
        </Pressable>
      </StickyFooter>
    </View>
  );
}

const SHARE_LABEL = (x: number) => (x === 1 ? "His ask" : `${x > 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 100)}%`);

function OfferRow({
  offer: o,
  kept,
  fits,
  share,
  onShare,
  onToggle,
  theme: t,
}: {
  offer: ResignOffer;
  kept: boolean;
  fits: boolean;
  share: number;
  onShare: (share: number) => void;
  onToggle: () => void;
  theme: Theme;
}) {
  const p = o.player;
  const terms = termsAt(o, share);
  // A new deal is all future years; an option adds one year to the rookie deal.
  const years = o.kind === "option" ? 1 : terms.deal.years.length;
  const avg = terms.deal.years.slice(-years).reduce((s, y) => s + y.salary + y.bonus, 0) / years;
  const odds = Math.round(terms.chance * 100);
  const oddsColor = terms.chance >= 0.75 ? t.accent : terms.chance >= 0.4 ? "#d4a017" : t.score;
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
            {o.kind === "option" ? `5th-year option: ${formatMoney(o.capHit)} for ${o.deal.years.at(-1)!.season}` : `${years} yr${years === 1 ? "" : "s"}, ${formatMoney(avg)}/yr · ${formatMoney(terms.capHit)} next season`}
          </Text>
          <Text style={{ fontSize: 12, marginTop: 2, color: oddsColor }}>
            {o.kind === "option" ? "Can't refuse" : `${moodLabel(o.mood)} (${o.mood}) · ${odds}% to accept`}
          </Text>
          {kept && !fits ? <Text style={{ fontSize: 12, marginTop: 2, color: t.score, fontWeight: "700" }}>Won't fit under the cap</Text> : null}
          {kept && o.kind === "re-sign" ? (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {RESIGN_OFFERS.map((x) => {
                const on = x === share;
                return (
                  <Pressable
                    key={x}
                    onPress={() => onShare(x)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Offer ${SHARE_LABEL(x)}`}
                    style={{ paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: "center", borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : t.card }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: on ? t.onAccent : t.text }}>
                      {SHARE_LABEL(x)} · {Math.round(termsAt(o, x).chance * 100)}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function ExtensionRow({ offer: x, on, fits, onToggle, theme: t }: { offer: ExtensionOffer; on: boolean; fits: boolean; onToggle: () => void; theme: Theme }) {
  const p = x.player;
  const years = x.deal.years.length;
  const avg = x.deal.years.reduce((s, y) => s + y.salary + y.bonus, 0) / years;
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Extend ${p.firstName} ${p.lastName}`}>
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "center", borderColor: on ? t.accent : t.border, borderWidth: on ? 1.5 : 1 }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: on ? t.accent : t.muted, backgroundColor: on ? t.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {on ? <Text style={{ color: t.onAccent, fontWeight: "900" }}>✓</Text> : null}
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
            {x.homegrown ? " · homegrown (80% cap)" : ""}
            {` · now ${formatMoney(x.capHit - x.extra)} for ${x.deal.years[0]!.season}`}
          </Text>
          <Text style={{ color: t.text, fontSize: 13, marginTop: 4 }}>
            {years} yr{years === 1 ? "" : "s"} from {x.deal.years[0]!.season}, {formatMoney(avg)}/yr · {formatMoney(x.capHit)} next season
          </Text>
          <Text style={{ fontSize: 12, marginTop: 2, color: t.muted }}>
            Cap next season: {x.extra + x.accelerated >= 0 ? "+" : ""}
            {formatMoney(x.extra + x.accelerated)}
            {x.accelerated > 0 ? ` (incl. ${formatMoney(x.accelerated)} old bonus)` : ""}
          </Text>
          {x.holdout ? (
            <Text style={{ fontSize: 12, marginTop: 2, color: on && fits ? t.muted : t.score, fontWeight: "700" }}>
              {on && fits ? `Wants a new deal (would have held out ${x.holdout} games)` : `Holds out the first ${x.holdout} games without a new deal`}
            </Text>
          ) : null}
          {on && !fits ? <Text style={{ fontSize: 12, marginTop: 2, color: t.score, fontWeight: "700" }}>Won't fit under the cap</Text> : null}
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
