// Picks: over/unders on this week's featured games, for points. Build a slate
// of 2-6 picks; every pick has to hit, and more picks pay more. Lines come from
// simulating each game many times, so they're as fair as the sim.
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SLATE_PAYOUT, SLATE_RULES, bookmaker, houseGreeting, houseOnResult, houseOnSlate, houseRecord, propLabel, sideLabel, slatePayout, slateProblems, type GameLines, type PickSide, type Prop, type SettledSlate, type SlatePick } from "@dynasty/sim";
import { Card, SectionTitle, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

export default function PicksScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { weeksPlayed, schedule, userTeam, league } = useLeague();
  const bm = bookmaker(league.seed);
  const [chosen, setChosen] = useState<SlatePick[]>([]);
  const [stake, setStake] = useState("50");
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const week = weeksPlayed + 1;
  const open = week <= schedule.weeks;

  // Work out the board when the screen opens (it takes a few seconds on a phone).
  useEffect(() => {
    if (open && (!d.board || d.boardNeedsOwn)) d.loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, week, d.board === null, d.boardNeedsOwn]);

  const toggle = (prop: Prop, side: PickSide) => {
    setMessage(null);
    setChosen((c) => {
      const same = c.find((p) => p.prop.id === prop.id);
      if (same?.side === side) return c.filter((p) => p.prop.id !== prop.id);
      return [...c.filter((p) => p.prop.id !== prop.id), { prop, side }];
    });
  };
  const amount = Number.parseInt(stake, 10) || 0;
  const problems = chosen.length > 0 ? slateProblems(chosen, amount, d.picks.balance) : [];
  const place = () => {
    const p = d.placeSlate(chosen, amount);
    if (p.length > 0) setMessage({ text: p.join(" "), good: false });
    else {
      setMessage({ text: `Slate placed: ${chosen.length} picks for ${amount} points. It pays ${slatePayout(chosen.length, amount).toLocaleString()} if every pick hits.`, good: true });
      setChosen([]);
    }
  };
  const mine = d.picks.open.filter((s) => s.week === week);
  const recent = [...d.picks.history].reverse().slice(0, 10);

  return (
    <>
      <Stack.Screen options={{ title: "Picks" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <HouseCard theme={t} />

        <Card>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={{ flex: 1, color: t.text, fontSize: 20, fontWeight: "800" }}>{d.picks.balance.toLocaleString()} points</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>no cash value</Text>
          </View>
          <Text style={{ color: t.muted, marginTop: 4 }}>
            Pick {SLATE_RULES.minPicks}-{SLATE_RULES.maxPicks} overs or unders; every pick has to hit. Pays {Object.entries(SLATE_PAYOUT).map(([n, x]) => `${n} for ${x}x`).join(", ")}.
          </Text>
        </Card>

        {chosen.length > 0 ? (
          <Card>
            <SectionTitle>Your slate ({chosen.length})</SectionTitle>
            {chosen.map((p) => (
              <Text key={p.prop.id} style={{ color: t.text, paddingVertical: 2 }}>
                {pickText(p, d.board)}
              </Text>
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <Text style={{ color: t.muted }}>Points</Text>
              <TextInput value={stake} onChangeText={setStake} keyboardType="number-pad" accessibilityLabel="Points to play" style={{ width: 80, height: 36, borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingHorizontal: 8, color: t.text }} />
              <Text style={{ color: t.muted, flex: 1 }}>{SLATE_PAYOUT[chosen.length] ? `pays ${slatePayout(chosen.length, amount).toLocaleString()}` : ""}</Text>
            </View>
            {problems.map((p) => (
              <Text key={p} style={{ color: t.score, marginTop: 4 }}>
                {p}
              </Text>
            ))}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Btn label="Place slate" onPress={place} disabled={problems.length > 0} primary theme={t} />
              <Btn label="Clear" onPress={() => setChosen([])} theme={t} />
            </View>
          </Card>
        ) : null}
        {message ? <Text style={{ color: message.good ? t.accent : t.score, fontWeight: "700" }}>{message.text}</Text> : null}

        {mine.length > 0 ? (
          <Card>
            <SectionTitle>Riding on week {week}</SectionTitle>
            {mine.map((s) => (
              <View key={s.id} style={{ paddingVertical: 3 }}>
                <Text style={{ color: t.text }}>
                  {s.picks.length} picks for {s.stake} → {slatePayout(s.picks.length, s.stake).toLocaleString()} if all hit
                </Text>
                <Text style={{ color: t.muted, fontSize: 12, fontStyle: "italic" }}>
                  {bm.nickname}: "{houseOnSlate(bm, s)}"
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {!open ? <Text style={{ color: t.muted }}>The board is closed for the season. Picks are back next season.</Text> : null}
        {open && !d.board ? (
          <Card>
            <SectionTitle>Week {week} board</SectionTitle>
            <Text style={{ color: t.muted }}>Setting the lines: simulating this week's featured games…</Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, marginTop: 8, overflow: "hidden" }}>
              <View style={{ width: `${Math.round((d.boardProgress ?? 0) * 100)}%`, height: 6, backgroundColor: t.accent }} />
            </View>
          </Card>
        ) : null}
        {d.boardNeedsOwn ? <Text style={{ color: t.muted }}>Setting the lines for your game again (your depth chart changed)…</Text> : null}
        {d.board?.map((g) => <GameBoard key={g.game.id} lines={g} own={g.game.home === userTeam || g.game.away === userTeam} chosen={chosen} onPick={toggle} theme={t} />)}

        {recent.length > 0 ? (
          <Card>
            <SectionTitle>Results</SectionTitle>
            {recent.map((s) => (
              <Result key={s.id} s={s} quip={houseOnResult(bm, s)} theme={t} />
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

/** "Over · Total points 44.5", or "NY +2.5" for a spread. */
function pickText(p: SlatePick, board: GameLines[] | null): string {
  const g = board?.find((x) => x.game.id === p.prop.game)?.game;
  const [home, away] = g ? [g.home, g.away] : ["home", "away"];
  if (p.prop.kind === "spread") return `${sideLabel(p.prop, p.side, home, away)} (${away} at ${home})`;
  return `${p.side === "over" ? "Over" : "Under"} · ${propLabel(p.prop, home, away)}`;
}

function GameBoard({ lines, own, chosen, onPick, theme: t }: { lines: GameLines; own: boolean; chosen: SlatePick[]; onPick: (p: Prop, s: PickSide) => void; theme: Theme }) {
  const { game } = lines;
  return (
    <Card style={own ? { borderColor: t.accent, borderWidth: 1 } : undefined}>
      {own ? (
        <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12, marginBottom: 4 }}>YOUR GAME · overs on your own players only (your depth chart locks once you pick)</Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Swatch abbr={game.away} />
        <Text style={{ color: t.text, fontWeight: "800" }}>{game.away}</Text>
        <Text style={{ color: t.muted }}>at</Text>
        <Swatch abbr={game.home} />
        <Text style={{ color: t.text, fontWeight: "800" }}>{game.home}</Text>
      </View>
      {lines.props.map((p) => {
        const side = chosen.find((c) => c.prop.id === p.id)?.side;
        return (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
            <Text style={{ flex: 1, color: t.text, fontSize: 13 }}>{p.kind === "spread" ? "Spread" : propLabel(p, game.home, game.away)}</Text>
            <Side label={sideLabel(p, "over", game.home, game.away)} on={side === "over"} onPress={() => onPick(p, "over")} theme={t} />
            {own ? null : <Side label={sideLabel(p, "under", game.home, game.away)} on={side === "under"} onPress={() => onPick(p, "under")} theme={t} />}
          </View>
        );
      })}
    </Card>
  );
}

function Side({ label, on, onPress, theme: t }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 10, height: 30, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : "transparent" }}>
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

/** The bookmaker: who they are, this week's opener (or last week's verdict), and your record against the house. */
function HouseCard({ theme: t }: { theme: Theme }) {
  const d = useDynasty();
  const { league, weeksPlayed, schedule } = useLeague();
  const bm = bookmaker(league.seed);
  const season = schedule.season;
  const record = houseRecord(d.picks.history, season);
  const all = houseRecord(d.picks.history);
  const last = d.picks.history.at(-1);
  const fresh = last && last.season === season && last.week === weeksPlayed;
  const line = fresh ? houseOnResult(bm, last) : d.board ? houseGreeting(bm, league.seed, season, weeksPlayed + 1, d.board) : bm.bio;
  const initials = bm.name.split(" ").map((w) => w[0]).join("");
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.text, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.bg, fontWeight: "900" }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "800" }}>
            {bm.name} <Text style={{ color: t.muted, fontWeight: "400" }}>"{bm.nickname}"</Text>
          </Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>The house</Text>
        </View>
      </View>
      <Text style={{ color: t.text, marginTop: 8, fontStyle: "italic" }}>"{line}"</Text>
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>
        You vs the house this season: {record.won}-{record.lost}, {record.net >= 0 ? "+" : ""}
        {record.net.toLocaleString()} pts{all.won + all.lost > record.won + record.lost ? ` · all time ${all.won}-${all.lost}, ${all.net >= 0 ? "+" : ""}${all.net.toLocaleString()}` : ""}
      </Text>
    </Card>
  );
}

function Result({ s, quip, theme: t }: { s: SettledSlate; quip: string; theme: Theme }) {
  return (
    <View style={{ paddingVertical: 6 }}>
      <Text style={{ color: s.won ? t.accent : t.text, fontWeight: "700" }}>
        Week {s.week}: {s.won ? `won ${s.payout.toLocaleString()}` : `lost ${s.stake}`} ({s.picks.filter((p) => p.hit).length} of {s.picks.length} hit)
      </Text>
      <Text style={{ color: t.muted, fontSize: 12, fontStyle: "italic" }}>"{quip}"</Text>
      {s.picks.map((p) => (
        <Text key={p.prop.id} style={{ color: t.muted, fontSize: 12 }}>
          {p.hit ? "✓" : "✗"} {p.side === "over" ? "Over" : "Under"} {p.prop.kind === "player" ? `${p.prop.name} ${p.prop.line}` : p.prop.kind === "total" ? `total ${p.prop.line}` : `home margin ${p.prop.line}`}: {p.value}
        </Text>
      ))}
    </View>
  );
}

function Btn({ label, onPress, disabled, primary, theme: t }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; theme: Theme }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ paddingHorizontal: 14, height: 40, borderRadius: 10, justifyContent: "center", backgroundColor: primary ? t.accent : t.card, borderWidth: primary ? 0 : 1, borderColor: t.border, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: primary ? t.onAccent : t.text, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
