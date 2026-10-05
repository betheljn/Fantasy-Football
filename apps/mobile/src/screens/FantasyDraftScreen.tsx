// The fantasy draft on the clock: the board (everyone left, by draft value),
// players needed (your roster's grades as it fills in), and the picks so
// far. Your picks are saved as you make them; opening the draft again
// replays them (the same picks give the same draft) and you carry on.
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import {
  FANTASY_ROUNDS,
  POSITIONS,
  allTeams,
  fantasyDraftOrder,
  fantasyDraftSteps,
  fantasyValue,
  playerOverall,
  rosterNorms,
  rosterReport,
  type FantasyDraftResult,
  type FantasyTurn,
  type League,
  type Player,
  type PlayerId,
  type Position,
} from "@dynasty/sim";
import { RosterGrades } from "../components/RosterGrades";
import { Button, Card, Chips, SectionTitle, Segmented, StickyFooter, Swatch } from "../components/ui";
import { teamShort } from "../field/colors";
import { useTheme } from "../theme";

type Tab = "board" | "needs" | "picks";
type Step = IteratorResult<FantasyTurn, FantasyDraftResult>;
const BOARD_ROWS = 150;

export function FantasyDraftScreen({ league, team, rounds, slot, picks, onPicks, onDone }: { league: League; team: string; rounds: number; slot: number; picks: readonly PlayerId[]; onPicks: (picks: PlayerId[]) => void; onDone: (drafted: League) => void }) {
  const t = useTheme();
  const steps = useRef<Generator<FantasyTurn, FantasyDraftResult, PlayerId> | null>(null);
  const mine = useRef<PlayerId[]>([...picks]);
  const [turn, setTurn] = useState<FantasyTurn | null>(null);
  const [result, setResult] = useState<FantasyDraftResult | null>(null);
  const [busy, setBusy] = useState<string | null>("Setting up the draft board");
  const [tab, setTab] = useState<Tab>("board");
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [selected, setSelected] = useState<PlayerId | null>(null);

  const norms = useMemo(() => rosterNorms(league), [league]);
  const order = useMemo(() => fantasyDraftOrder(league, { team, slot }), [league, team, slot]);
  /** Every player in the pool, and the team each came from. */
  const lookup = useMemo(() => {
    const players = new Map<PlayerId, Player>();
    const from = new Map<PlayerId, string>();
    for (const tm of allTeams(league)) for (const p of tm.roster) (players.set(p.id, p), from.set(p.id, tm.abbr));
    for (const p of league.freeAgents ?? []) players.set(p.id, p);
    return { players, from };
  }, [league]);

  const show = (r: Step) => {
    setSelected(null);
    if (r.done) setResult(r.value);
    else setTurn(r.value);
    setBusy(null);
  };

  // Start the draft, replaying any picks already made.
  useEffect(() => {
    const timer = setTimeout(() => {
      const start = () => fantasyDraftSteps(league, { humans: { [team]: rounds }, order });
      let gen = start();
      let r: Step = gen.next();
      try {
        for (const id of mine.current) {
          if (r.done) break;
          r = gen.next(id);
        }
      } catch {
        // Saved picks that no longer fit (shouldn't happen): start the draft over.
        mine.current = [];
        onPicks([]);
        gen = start();
        r = gen.next();
      }
      steps.current = gen;
      show(r);
    }, 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = (id: PlayerId) => {
    if (!steps.current || !turn) return;
    mine.current = [...mine.current, id];
    onPicks(mine.current);
    const last = turn.round >= rounds;
    setBusy(last ? "The AI is drafting the rest of the league (and your last rounds)" : "Other teams are picking");
    setTimeout(() => show(steps.current!.next(id)), last ? 50 : 0);
  };

  const report = useMemo(() => (turn ? rosterReport(turn.roster, norms) : null), [turn, norms]);
  const board = useMemo(() => {
    if (!turn) return [];
    const list = pos === "ALL" ? turn.available : turn.available.filter((p) => p.position === pos);
    return list.slice(0, BOARD_ROWS);
  }, [turn, pos]);

  if (busy) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
        <ActivityIndicator color={t.accent} />
        <Text style={{ color: t.muted, textAlign: "center" }}>{busy}…</Text>
      </View>
    );
  }

  if (result) return <DraftDone result={result} team={team} rounds={rounds} lookup={lookup} onDone={onDone} />;
  if (!turn || !report) return null;

  const chosen = selected ? turn.available.find((p) => p.id === selected) ?? null : null;
  const suggestion = turn.available.find((p) => p.id === turn.suggestion)!;
  const label = (p: Player) => `${p.position} ${p.firstName} ${p.lastName}`;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Swatch abbr={team} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>
              Round {turn.round} of {FANTASY_ROUNDS} · pick #{turn.overall}
            </Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {turn.round < rounds ? `You're on the clock. ${rounds - turn.round} more round${rounds - turn.round === 1 ? "" : "s"} after this, then the AI picks for you.` : "Your last pick; the AI drafts the rest of your roster."}
            </Text>
          </View>
        </View>
        <Segmented
          options={[
            { key: "board", label: "Board" },
            { key: "needs", label: `Needs${report.needs.length ? ` (${Math.min(report.needs.length, 9)})` : ""}` },
            { key: "picks", label: "Picks" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "board" ? <Chips options={[{ key: "ALL", label: "All" }, ...POSITIONS.map((p) => ({ key: p, label: `${p}${report.needs.slice(0, 4).includes(p) ? " •" : ""}` }))]} value={pos} onChange={setPos} /> : null}
      </View>

      {tab === "board" ? (
        <FlatList
          data={board}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          initialNumToRender={20}
          ListHeaderComponent={
            !turn.allowed.includes(pos as Position) && pos !== "ALL" ? <Text style={{ color: t.warn, fontSize: 12, marginBottom: 6 }}>{`You can't take another ${pos} now.`}</Text> : null
          }
          renderItem={({ item: p }) => {
            const ok = turn.allowed.includes(p.position);
            const on = p.id === selected;
            const from = lookup.from.get(p.id);
            return (
              <Pressable
                onPress={ok ? () => setSelected(on ? null : p.id) : undefined}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !ok }}
                accessibilityLabel={`${label(p)}, overall ${playerOverall(p)}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, backgroundColor: on ? t.card : "transparent", borderWidth: on ? 1 : 0, borderColor: t.accent, opacity: ok ? 1 : 0.4 }}
              >
                <Text style={{ width: 28, color: t.muted, fontWeight: "700" }}>{p.position}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>
                    {p.firstName} {p.lastName}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    age {p.age} · potential {p.potential}
                    {from ? ` · was ${teamShort(from)}` : " · free agent"}
                    {p.id === turn.suggestion ? " · AI's pick" : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: t.text, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{playerOverall(p)}</Text>
                  <Text style={{ color: t.muted, fontSize: 10 }}>value {fantasyValue(p).toFixed(0)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      ) : tab === "needs" ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
          <RosterGrades report={report} drafting />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12 }}>
          <Card>
            <SectionTitle>Your picks</SectionTitle>
            {turn.roster.length === 0 ? <Text style={{ color: t.muted }}>None yet.</Text> : null}
            {turn.roster.map((p, i) => (
              <Text key={p.id} style={{ color: t.text, paddingVertical: 2 }}>
                {`R${i + 1}  ${label(p)}  ${playerOverall(p)}`}
              </Text>
            ))}
          </Card>
          <Card>
            <SectionTitle>Latest picks</SectionTitle>
            {[...turn.picks]
              .slice(-40)
              .reverse()
              .map((pk) => {
                const p = lookup.players.get(pk.player)!;
                return (
                  <Text key={pk.overall} style={{ color: pk.team === team ? t.accent : t.text, paddingVertical: 2, fontSize: 13 }}>
                    {`#${pk.overall}  ${teamShort(pk.team)}  ${label(p)}  ${playerOverall(p)}`}
                  </Text>
                );
              })}
          </Card>
        </ScrollView>
      )}

      <StickyFooter note={chosen ? undefined : `AI's pick: ${label(suggestion)} (${playerOverall(suggestion)})`}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Auto pick" onPress={() => draft(turn.suggestion)} />
          </View>
          <View style={{ flex: 2 }}>
            <Button label={chosen ? `Draft ${chosen.lastName} (${chosen.position})` : "Pick a player"} onPress={() => chosen && draft(chosen.id)} primary disabled={!chosen} />
          </View>
        </View>
      </StickyFooter>
    </View>
  );
}

function DraftDone({ result, team, rounds, lookup, onDone }: { result: FantasyDraftResult; team: string; rounds: number; lookup: { players: Map<PlayerId, Player> }; onDone: (drafted: League) => void }) {
  const t = useTheme();
  // Graded against the league as it was just drafted.
  const report = useMemo(() => rosterReport(result.league.teams[team]!.roster, rosterNorms(result.league)), [result, team]);
  const minePicks = result.picks.filter((p) => p.team === team);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Draft complete</Text>
        <Text style={{ color: t.muted }}>{`You made ${Math.min(rounds, minePicks.length)} picks; the AI made the other ${Math.max(0, minePicks.length - rounds)}. Every contract has been rewritten to fit the cap.`}</Text>
        <RosterGrades report={report} />
        <Card>
          <SectionTitle>Your draft</SectionTitle>
          {minePicks.map((pk) => {
            const p = lookup.players.get(pk.player)!;
            return (
              <Text key={pk.overall} style={{ color: pk.auto ? t.muted : t.text, paddingVertical: 2, fontSize: 13 }}>
                {`R${pk.round} #${pk.overall}  ${p.position} ${p.firstName} ${p.lastName}  ${playerOverall(p)}${pk.auto ? "  (AI)" : ""}`}
              </Text>
            );
          })}
        </Card>
      </ScrollView>
      <StickyFooter>
        <Button label="Start the season" onPress={() => onDone(result.league)} primary />
      </StickyFooter>
    </View>
  );
}
