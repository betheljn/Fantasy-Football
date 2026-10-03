// Around the league: every trade this season, injuries that made news, and
// injured-reserve moves and signings, newest first.
import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { injuryLabel, type TradeRecord } from "@dynasty/sim";
import { Card, Segmented } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";

const SECTIONS = [
  { key: "trades", label: "Trades" },
  { key: "injuries", label: "Injuries" },
  { key: "moves", label: "Signings and IR" },
] as const;

export default function TransactionsScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { userTeam } = useLeague();
  const [section, setSection] = useState<(typeof SECTIONS)[number]["key"]>("trades");
  const trades = [...(d.save?.trades ?? [])].reverse();
  const injuries = [...(d.save?.injuryNews ?? [])].reverse();
  const moves = [...(d.save?.moves ?? [])].reverse();
  const empty = (text: string) => <Text style={{ color: t.muted }}>{text}</Text>;
  const row = (key: string, week: string, text: string, mine: boolean) => (
    <View key={key} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
      <Text style={{ width: 52, color: t.muted, fontSize: 12 }}>{week}</Text>
      <Text style={{ flex: 1, color: mine ? t.text : t.muted, fontWeight: mine ? "700" : "400", fontSize: 13 }}>{text}</Text>
    </View>
  );
  return (
    <>
      <Stack.Screen options={{ title: "Transactions" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Segmented options={SECTIONS} value={section} onChange={setSection} />
        <Card>
          {section === "trades"
            ? trades.length
              ? trades.map((tr, i) => row(`t${i}`, tr.week === 0 ? "Draft wk" : `Wk ${tr.week}`, tradeLine(tr), tr.teams.includes(userTeam)))
              : empty("No trades yet this season.")
            : section === "injuries"
              ? injuries.length
                ? injuries.map((n) => row(`i${n.player}${n.week}`, `Wk ${n.week}`, `${n.team} ${n.starter ? "starting " : ""}${n.position} ${n.name}: ${injuryLabel(n)}`, n.team === userTeam))
                : empty("No injuries have made news yet.")
              : moves.length
                ? moves.map((m, i) => row(`m${i}`, `Wk ${m.week}`, `${m.team} ${m.kind === "signed" ? "signs" : "puts on injured reserve"} ${m.position} ${m.name} (${m.overall})`, m.team === userTeam))
                : empty("No signings or injured-reserve moves yet.")}
        </Card>
      </ScrollView>
    </>
  );
}

/** "MI gets WR J. Smith (72), 2037 Rd 3; OH gets CB K. Lee (68)" (plus who was released). */
function tradeLine(tr: TradeRecord): string {
  const side = (gets: string, from: string) => {
    const items = [
      ...tr.players.filter((p) => p.from === from).map((p) => `${p.position} ${p.name} (${p.overall})`),
      ...(tr.picks ?? []).filter((p) => p.from === from).map((p) => `${p.draft} Rd ${p.round}${p.original !== from ? ` (${p.original})` : ""}`),
    ];
    return `${gets} gets ${items.join(", ")}`;
  };
  const released = (tr.released ?? []).map((r) => `${r.team} releases ${r.position} ${r.name}`);
  return [`${side(tr.teams[0], tr.teams[1])}; ${side(tr.teams[1], tr.teams[0])}`, ...released].join("; ");
}

