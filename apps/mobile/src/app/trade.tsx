// Trades: pick a team, choose players from each roster (player-for-player),
// check the cap, ask what they'd want, and offer the deal. Their GM decides
// with his own read of the players; the sim checks every rule.
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  POSITIONS,
  TRADE_DEADLINE_WEEK,
  allTeams,
  capHit,
  capSpace,
  checkTrade,
  formatMoney,
  formatRecord,
  playerOverall,
  salaryCap,
  suggestTrade,
  teamName,
  yearsLeft,
  type Player,
  type Position,
  type Team,
  type TradeProposal,
} from "@dynasty/sim";
import { Card, LinkRow, SectionTitle, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

export default function TradeScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, weeksPlayed, records } = useLeague();
  const [partner, setPartner] = useState<string | null>(null);

  if (!d.canTrade) {
    return (
      <>
        <Stack.Screen options={{ title: "Trades" }} />
        <View style={{ padding: 16 }}>
          <Text style={{ color: t.muted }}>The trade deadline (after week {TRADE_DEADLINE_WEEK}) has passed. Trading opens again next season.</Text>
        </View>
      </>
    );
  }
  if (partner) return <Deal partner={partner} onBack={() => setPartner(null)} />;

  const teams = allTeams(league).filter((x) => x.abbr !== userTeam).sort((a, b) => teamName(a).localeCompare(teamName(b)));
  return (
    <>
      <Stack.Screen options={{ title: "Trades" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text style={{ color: t.muted, marginBottom: 4 }}>
          Pick a team to trade with. Trades are player-for-player, and both teams have to stay under the cap. Deadline: after week {TRADE_DEADLINE_WEEK} ({TRADE_DEADLINE_WEEK - weeksPlayed} week{TRADE_DEADLINE_WEEK - weeksPlayed === 1 ? "" : "s"} left).
        </Text>
        {teams.map((team) => {
          const rec = records.get(team.abbr);
          return (
            <Card key={team.abbr} style={{ paddingVertical: 2 }}>
              <LinkRow label={`Trade with ${teamName(team)}`} onPress={() => setPartner(team.abbr)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Swatch abbr={team.abbr} size={12} />
                  <Text style={{ flex: 1, color: t.text, fontWeight: "600" }}>{teamName(team)}</Text>
                  <Text style={{ color: t.muted, fontVariant: ["tabular-nums"] }}>{rec ? formatRecord(rec) : ""}</Text>
                </View>
              </LinkRow>
            </Card>
          );
        })}
      </ScrollView>
    </>
  );
}

function Deal({ partner, onBack }: { partner: string; onBack: () => void }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { league, userTeam } = useLeague();
  const season = league.season;
  const me = league.teams[userTeam]!;
  const them = league.teams[partner]!;
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [pos, setPos] = useState<Position | "All">("All");
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);

  const proposal: TradeProposal = { from: userTeam, to: partner, give, get };
  const problems = give.length > 0 && get.length > 0 ? checkTrade(league, season, proposal) : [];
  const cap = salaryCap(league.seed, season);
  const hit = (p: Player) => (p.contract ? capHit(p.contract, season) : 0);
  const sum = (team: Team, ids: string[]) => ids.reduce((s, id) => s + hit(team.roster.find((p) => p.id === id)!), 0);
  const room = capSpace(me, cap, season);
  // Arriving homegrown deals lose their credit, so they can cost a bit more with you.
  const incoming = get.reduce((s, id) => {
    const p = them.roster.find((x) => x.id === id)!;
    return s + (p.contract ? capHit(p.contract.homegrown && p.contract.draftedBy !== userTeam ? { ...p.contract, homegrown: false } : p.contract, season) : 0);
  }, 0);
  const roomAfter = room + sum(me, give) - incoming;

  const toggle = (list: string[], set: (x: string[]) => void, id: string) => {
    setMessage(null);
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };
  const ask = () => {
    const s = suggestTrade(league, season, userTeam, partner, get);
    if (s) {
      setGive([...s.give]);
      setMessage({ text: "Their GM would do it for this.", good: true });
    } else setMessage({ text: get.length > 2 ? "Ask about one or two of their players at a time." : "Nothing on your roster gets this done.", good: false });
  };
  const offer = () => {
    const r = d.proposeTrade(proposal);
    if (r.made) {
      setMessage({ text: `Done! ${them.abbr} accepted. Your depth chart has the new players slotted in by rating.`, good: true });
      setGive([]);
      setGet([]);
    } else if (r.problems.length > 0) setMessage({ text: r.problems.join(" "), good: false });
    else if (r.verdict) {
      const close = r.verdict.short < Math.max(2_000, Math.abs(r.verdict.valueOut) * 0.15);
      setMessage({ text: close ? "Close. They want a little more." : "Not interested. They want a lot more for that.", good: false });
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: `Trade with ${them.abbr}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Pressable onPress={onBack} accessibilityRole="link">
          <Text style={{ color: t.accent }}>‹ Pick another team</Text>
        </Pressable>
        <Card>
          <SectionTitle>The deal</SectionTitle>
          <Side label={`You send (${give.length})`} team={me} ids={give} theme={t} />
          <Side label={`You get (${get.length})`} team={them} ids={get} theme={t} />
          <Row label="Your cap room now" value={formatMoney(room)} theme={t} />
          <Row label="After the trade" value={formatMoney(roomAfter)} theme={t} bad={roomAfter < 0} />
          {give.length !== get.length && give.length + get.length > 0 ? <Text style={{ color: t.muted, marginTop: 6 }}>Player-for-player: pick the same number on each side.</Text> : null}
          {problems.map((p) => (
            <Text key={p} style={{ color: t.score, marginTop: 6 }}>
              {p}
            </Text>
          ))}
          {message ? <Text style={{ color: message.good ? t.accent : t.score, fontWeight: "700", marginTop: 8 }}>{message.text}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Btn label="What would they want?" onPress={ask} disabled={get.length === 0} theme={t} />
            <Btn label="Offer trade" onPress={offer} disabled={give.length === 0 || give.length !== get.length || problems.length > 0} theme={t} primary />
          </View>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(["All", ...POSITIONS] as const).map((p) => (
            <Pressable key={p} onPress={() => setPos(p)} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: "center", backgroundColor: pos === p ? t.accent : t.card, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: pos === p ? t.onAccent : t.text, fontWeight: "700", fontSize: 12 }}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Roster title={`${teamName(them)}: tap to ask for`} team={them} season={season} pos={pos} chosen={get} onToggle={(id) => toggle(get, setGet, id)} onOpen={(id) => router.push(`/player/${id}`)} theme={t} />
        <Roster title="Your roster: tap to send" team={me} season={season} pos={pos} chosen={give} onToggle={(id) => toggle(give, setGive, id)} onOpen={(id) => router.push(`/player/${id}`)} theme={t} />
      </ScrollView>
    </>
  );
}

function Side({ label, team, ids, theme: t }: { label: string; team: Team; ids: string[]; theme: Theme }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 2 }}>{label}</Text>
      {ids.length === 0 ? <Text style={{ color: t.muted }}>Nobody yet</Text> : null}
      {ids.map((id) => {
        const p = team.roster.find((x) => x.id === id)!;
        return (
          <Text key={id} style={{ color: t.text }}>
            {p.position} {p.firstName} {p.lastName} · {playerOverall(p)} · age {p.age}
          </Text>
        );
      })}
    </View>
  );
}

function Row({ label, value, theme: t, bad }: { label: string; value: string; theme: Theme; bad?: boolean }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 2 }}>
      <Text style={{ flex: 1, color: t.muted }}>{label}</Text>
      <Text style={{ color: bad ? t.score : t.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function Roster(props: { title: string; team: Team; season: number; pos: Position | "All"; chosen: string[]; onToggle: (id: string) => void; onOpen: (id: string) => void; theme: Theme }) {
  const { title, team, season, pos, chosen, onToggle, onOpen, theme: t } = props;
  const rows = useMemo(
    () =>
      team.roster
        .filter((p) => pos === "All" || p.position === pos)
        .map((p) => ({ p, ovr: playerOverall(p) }))
        .sort((a, b) => b.ovr - a.ovr),
    [team, pos],
  );
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {rows.map(({ p, ovr }) => {
        const on = chosen.includes(p.id);
        const c = p.contract;
        return (
          <Pressable key={p.id} onPress={() => onToggle(p.id)} onLongPress={() => onOpen(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6, backgroundColor: on ? t.bg : "transparent", borderWidth: on ? 1 : 0, borderColor: t.accent }}>
            <Text style={{ width: 16, color: on ? t.accent : t.muted, fontWeight: "800" }}>{on ? "✓" : ""}</Text>
            <Text style={{ width: 26, color: t.muted }}>{p.position}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: on ? "700" : "500" }} numberOfLines={1}>
                {p.firstName} {p.lastName}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                age {p.age} · {c ? `${formatMoney(capHit(c, season))} · ${yearsLeft(c, season)} yr${yearsLeft(c, season) === 1 ? "" : "s"} left` : "no contract"}
                {c?.homegrown && c.draftedBy === team.abbr ? " · homegrown" : ""}
              </Text>
            </View>
            <Text style={{ width: 26, textAlign: "right", color: t.text, fontWeight: "800" }}>{ovr}</Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

function Btn({ label, onPress, disabled, primary, theme: t }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; theme: Theme }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 14, height: 40, borderRadius: 10, justifyContent: "center", backgroundColor: primary ? t.accent : t.card, borderWidth: primary ? 0 : 1, borderColor: t.border, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      <Text style={{ color: primary ? t.onAccent : t.text, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
