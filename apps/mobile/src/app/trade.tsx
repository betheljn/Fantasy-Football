// Trades: pick a team, choose players and draft picks from each side, see the
// cap and anyone who'd be released to make room, ask what they'd want, and
// offer the deal. Their GM decides with his own read of the players; the sim
// checks every rule. In an online league, a deal with a friend's team is sent
// to them as an offer (they answer it from Trade offers).
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  POSITIONS,
  TRADE_DEADLINE_WEEK,
  allTeams,
  capHit,
  checkTrade,
  formatMoney,
  formatRecord,
  parsePickId,
  playerOverall,
  projectedSlot,
  suggestTrade,
  teamName,
  tradablePicks,
  tradeCapRoom,
  tradeReleases,
  yearsLeft,
  type DraftPickAsset,
  type League,
  type Player,
  type Position,
  type Team,
  type TradeProposal,
  type TradeWindow,
} from "@dynasty/sim";
import { Card, LinkRow, SectionTitle, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { api } from "../online/api";
import { useTheme, type Theme } from "../theme";

export default function TradeScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, records } = useLeague();
  const [partner, setPartner] = useState<string | null>(null);
  const w = d.tradeWindow;

  if (!w) {
    return (
      <>
        <Stack.Screen options={{ title: "Trades" }} />
        <View style={{ padding: 16 }}>
          <Text style={{ color: t.muted }}>
            Trading is closed. It's open from the preseason through week {TRADE_DEADLINE_WEEK}, and again in draft week after the championship.
          </Text>
        </View>
      </>
    );
  }
  if (partner) return <Deal partner={partner} window={w} onBack={() => setPartner(null)} />;

  // Online, friends' teams come first (they answer offers themselves).
  const friend = (abbr: string) => !!d.online?.humans[abbr];
  const teams = allTeams(league)
    .filter((x) => x.abbr !== userTeam)
    .sort((a, b) => Number(friend(b.abbr)) - Number(friend(a.abbr)) || teamName(a).localeCompare(teamName(b)));
  return (
    <>
      <Stack.Screen options={{ title: w.week === 0 ? "Draft-week trades" : "Trades" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text style={{ color: t.muted, marginBottom: 4 }}>
          {w.week === 0
            ? `Draft week: trade players and picks before the offseason. Deals count against the ${w.season} cap, and players whose contracts are up can't be traded.`
            : `Trade players and draft picks. A team over 72 releases players to make room; one that's short plays short until the offseason. Deadline: after week ${TRADE_DEADLINE_WEEK}.`}
        </Text>
        <MyPicks league={league} window={w} abbr={userTeam} theme={t} />
        {teams.map((team) => {
          const rec = records.get(team.abbr);
          return (
            <Card key={team.abbr} style={{ paddingVertical: 2 }}>
              <LinkRow label={`Trade with ${teamName(team)}`} onPress={() => setPartner(team.abbr)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Swatch abbr={team.abbr} size={12} />
                  <Text style={{ flex: 1, color: t.text, fontWeight: "600" }}>
                    {teamName(team)}
                    {friend(team.abbr) ? <Text style={{ color: t.accent, fontWeight: "400" }}> · a friend's team</Text> : null}
                  </Text>
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

/** "2037 Rd 1 · ~No. 12" (plus where it came from, if it isn't your own). */
function pickLabel(league: League, w: TradeWindow, p: DraftPickAsset, owner: string): string {
  const n = Object.keys(league.teams).length;
  const slot = projectedSlot(league, w, p);
  const exact = p.draft === w.draft && !!w.order;
  return `${p.draft} Rd ${p.round}${p.original !== owner ? ` (${p.original})` : ""} · ${exact ? "" : "~"}No. ${(p.round - 1) * n + slot}`;
}

function MyPicks({ league, window: w, abbr, theme: t }: { league: League; window: TradeWindow; abbr: string; theme: Theme }) {
  const picks = tradablePicks(league, w, abbr);
  const extra = picks.filter((p) => p.original !== abbr).length;
  const missing = 14 - (picks.length - extra);
  return (
    <Card>
      <SectionTitle>Your picks</SectionTitle>
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 4 }}>
        {picks.length} picks in the next two drafts{extra ? ` · ${extra} acquired` : ""}{missing ? ` · ${missing} traded away` : ""}
      </Text>
      <Text style={{ color: t.text, fontSize: 13 }}>{picks.filter((p) => p.round <= 3).map((p) => pickLabel(league, w, p, abbr)).join("   ")}</Text>
    </Card>
  );
}

function Deal({ partner, window: w, onBack }: { partner: string; window: TradeWindow; onBack: () => void }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { league, userTeam } = useLeague();
  const me = league.teams[userTeam]!;
  const them = league.teams[partner]!;
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [givePicks, setGivePicks] = useState<string[]>([]);
  const [getPicks, setGetPicks] = useState<string[]>([]);
  const [pos, setPos] = useState<Position | "All">("All");
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);

  const proposal: TradeProposal = { from: userTeam, to: partner, give, get, givePicks, getPicks };
  const any = give.length + givePicks.length > 0 && get.length + getPicks.length > 0;
  const problems = any ? checkTrade(league, w, proposal) : [];
  const releases = any && problems.length === 0 ? tradeReleases(league, w, proposal) : [];
  const room = tradeCapRoom(league, w, proposal, userTeam);
  const capLabel = w.season === league.season ? "Your cap room" : `Your ${w.season} cap room`;
  const online = d.online;
  const friend = !!online?.humans[partner];
  const [sending, setSending] = useState(false);

  const toggle = (list: string[], set: (x: string[]) => void, id: string) => {
    setMessage(null);
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };
  const clear = () => {
    setGive([]);
    setGet([]);
    setGivePicks([]);
    setGetPicks([]);
  };
  const ask = () => {
    const s = suggestTrade(league, w, userTeam, partner, get, getPicks);
    if (s) {
      setGive([...s.give]);
      setGivePicks([...(s.givePicks ?? [])]);
      setMessage({ text: "Their GM would do it for this.", good: true });
    } else setMessage({ text: "Nothing simple on your side gets this done. Try building an offer yourself.", good: false });
  };
  const sendToFriend = async () => {
    if (!online) return;
    setSending(true);
    try {
      const r = await api.sendOffer(online.id, online.token, proposal);
      if (r.sent) {
        setMessage({ text: `Offer sent. ${them.abbr} answers it from Trade offers.`, good: true });
        clear();
      } else setMessage({ text: r.problems.join(" "), good: false });
    } catch (e) {
      setMessage({ text: (e as Error).message, good: false });
    } finally {
      setSending(false);
    }
  };
  const offer = () => {
    if (friend) return void sendToFriend();
    const r = d.proposeTrade(proposal);
    if (r.made) {
      setMessage({ text: `Done! ${them.abbr} accepted.${releases.length ? " Releases made to fit 72." : ""}`, good: true });
      clear();
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
          <SideList label={`You send`} team={me} ids={give} picks={givePicks} league={league} window={w} owner={userTeam} theme={t} />
          <SideList label={`You get`} team={them} ids={get} picks={getPicks} league={league} window={w} owner={partner} theme={t} />
          <Row label={`${capLabel} now`} value={formatMoney(room.before)} theme={t} />
          <Row label="After the trade" value={formatMoney(room.after)} theme={t} bad={room.after < 0} />
          {releases.map((r) => (
            <Text key={r.id} style={{ color: r.team === userTeam ? t.score : t.muted, marginTop: 6, fontSize: 13 }}>
              {r.team === userTeam ? "You'd release" : `${r.team} would release`} {r.position} {r.name} ({r.overall}) to fit 72
              {r.team === userTeam && r.deadThisSeason + r.deadNextSeason > 0
                ? ` · dead money ${formatMoney(r.deadThisSeason)}${r.deadNextSeason ? ` now, ${formatMoney(r.deadNextSeason)} next season` : ""}`
                : ""}
            </Text>
          ))}
          {problems.map((p) => (
            <Text key={p} style={{ color: t.score, marginTop: 6 }}>
              {p}
            </Text>
          ))}
          {message ? <Text style={{ color: message.good ? t.accent : t.score, fontWeight: "700", marginTop: 8 }}>{message.text}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {friend ? null : <Btn label="What would they want?" onPress={ask} disabled={get.length + getPicks.length === 0} theme={t} />}
            <Btn label={friend ? (sending ? "Sending…" : "Send offer") : "Offer trade"} onPress={offer} disabled={!any || problems.length > 0 || sending} theme={t} primary />
          </View>
        </Card>

        <PickChooser title={`${them.abbr} picks: tap to ask for`} league={league} window={w} owner={partner} chosen={getPicks} onToggle={(id) => toggle(getPicks, setGetPicks, id)} theme={t} />
        <PickChooser title="Your picks: tap to send" league={league} window={w} owner={userTeam} chosen={givePicks} onToggle={(id) => toggle(givePicks, setGivePicks, id)} theme={t} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(["All", ...POSITIONS] as const).map((p) => (
            <Pressable key={p} onPress={() => setPos(p)} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: "center", backgroundColor: pos === p ? t.accent : t.card, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: pos === p ? t.onAccent : t.text, fontWeight: "700", fontSize: 12 }}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Roster title={`${teamName(them)}: tap to ask for`} team={them} season={w.season} pos={pos} chosen={get} onToggle={(id) => toggle(get, setGet, id)} onOpen={(id) => router.push(`/player/${id}`)} theme={t} />
        <Roster title="Your roster: tap to send" team={me} season={w.season} pos={pos} chosen={give} onToggle={(id) => toggle(give, setGive, id)} onOpen={(id) => router.push(`/player/${id}`)} theme={t} />
      </ScrollView>
    </>
  );
}

function SideList(props: { label: string; team: Team; ids: string[]; picks: string[]; league: League; window: TradeWindow; owner: string; theme: Theme }) {
  const { label, team, ids, picks, league, window: w, owner, theme: t } = props;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 2 }}>
        {label} ({ids.length} player{ids.length === 1 ? "" : "s"}
        {picks.length ? `, ${picks.length} pick${picks.length === 1 ? "" : "s"}` : ""})
      </Text>
      {ids.length + picks.length === 0 ? <Text style={{ color: t.muted }}>Nothing yet</Text> : null}
      {ids.map((id) => {
        const p = team.roster.find((x) => x.id === id)!;
        return (
          <Text key={id} style={{ color: t.text }}>
            {p.position} {p.firstName} {p.lastName} · {playerOverall(p)} · age {p.age}
          </Text>
        );
      })}
      {picks.map((id) => {
        const p = parsePickId(id)!;
        return (
          <Text key={id} style={{ color: t.text }}>
            {pickLabel(league, w, p, owner)}
          </Text>
        );
      })}
    </View>
  );
}

function PickChooser(props: { title: string; league: League; window: TradeWindow; owner: string; chosen: string[]; onToggle: (id: string) => void; theme: Theme }) {
  const { title, league, window: w, owner, chosen, onToggle, theme: t } = props;
  const picks = tradablePicks(league, w, owner);
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {picks.length === 0 ? <Text style={{ color: t.muted }}>No picks left in the next two drafts.</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {picks.map((p) => {
          const on = chosen.includes(p.id);
          return (
            <Pressable key={p.id} onPress={() => onToggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.bg : "transparent" }}>
              <Text style={{ color: on ? t.accent : t.text, fontWeight: on ? "800" : "500", fontSize: 12 }}>
                {on ? "✓ " : ""}
                {pickLabel(league, w, p, owner)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
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
        const left = c ? yearsLeft(c, season) : 0;
        return (
          <Pressable key={p.id} onPress={() => onToggle(p.id)} onLongPress={() => onOpen(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6, backgroundColor: on ? t.bg : "transparent", borderWidth: on ? 1 : 0, borderColor: t.accent, opacity: c && left === 0 ? 0.45 : 1 }}>
            <Text style={{ width: 16, color: on ? t.accent : t.muted, fontWeight: "800" }}>{on ? "✓" : ""}</Text>
            <Text style={{ width: 26, color: t.muted }}>{p.position}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: on ? "700" : "500" }} numberOfLines={1}>
                {p.firstName} {p.lastName}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                age {p.age} · {c ? (left === 0 ? "contract up" : `${formatMoney(capHit(c, season))} · ${left} yr${left === 1 ? "" : "s"} left`) : "no contract"}
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
