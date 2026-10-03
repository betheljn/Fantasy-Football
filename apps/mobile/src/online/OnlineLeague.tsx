// One online league. In the lobby: the invite code, who's in, and claiming a
// state (the commissioner starts the season). Then each week: ready up (or the
// deadline plays it), the commissioner can push it through, and the scores.
// Everything is decided on the server; this asks and shows. Used by the
// league's own screen and, once the league is open in the app, by the hub.
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, Card, SectionTitle, Swatch } from "../components/ui";
import { useDynasty, useLeagueMaybe } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";
import { api, type AdvanceSummary, type NextStep, type OffseasonStage, type OnlineGame, type OnlineLeague, type OnlineTeam } from "./api";

/** Each offseason stage, as friends see it. */
export const STAGE_NAMES: Record<OffseasonStage, string> = {
  staff: "staff decisions",
  hire: "staff hires",
  resign: "re-signings",
  draft: "draft boards",
  freeagency: "free agency",
  cuts: "roster cuts",
};
import { forgetLeague, type MyLeague } from "./store";

const POLL_MS = 15_000;

/**
 * `inApp`: the league is open in the app's league screens (the hub): scores
 * link to box scores, and a newer save is fetched whenever the server moves on.
 */
export function OnlineLeagueView({ me, inApp = false, onLeague }: { me: MyLeague; inApp?: boolean; onLeague?: (l: OnlineLeague) => void }) {
  const t = useTheme();
  const [league, setLeague] = useState<OnlineLeague | null>(null);
  const [games, setGames] = useState<{ week: number; games: OnlineGame[] } | null>(null);
  const [last, setLast] = useState<AdvanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLeague(await api.league(me.id, me.token));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The latest week's scores, whenever a new week has been played.
  const weeksPlayed = league?.weeksPlayed ?? 0;
  const season = league?.season;
  useEffect(() => {
    if (weeksPlayed === 0) return setGames(null);
    api.games(me.id, me.token, weeksPlayed).then(setGames, () => {});
  }, [me, weeksPlayed, season]);

  /** Run a request that returns the league (and maybe what was just played). */
  const act = async (f: () => Promise<OnlineLeague | { advanced: AdvanceSummary | null; league: OnlineLeague }>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await f();
      if ("league" in r) {
        setLeague(r.league);
        if (r.advanced) setLast(r.advanced);
      } else setLeague(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // The league open in the app follows the server: a new save when it moves on.
  const d = useDynasty();
  const saveVersion = league?.saveVersion;
  useEffect(() => {
    if (inApp && saveVersion !== undefined && d.online?.id === me.id && saveVersion !== d.online.version) d.refreshOnline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inApp, saveVersion, d.online?.version]);
  useEffect(() => {
    if (league) onLeague?.(league);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league]);

  if (!league && !error) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;
  }
  if (!league) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: t.score }}>{error}</Text>
        <Button label="Try again" onPress={refresh} />
      </View>
    );
  }

  const self = league.members.find((m) => m.id === me.memberId);
  const props = { league, me, self, busy, act, theme: t };
  return (
    <View style={{ gap: 12 }}>
      {error ? <Text style={{ color: t.score, fontWeight: "600" }}>{error}</Text> : null}
      {league.phase === "lobby" ? <Lobby {...props} /> : <Season {...props} games={games} last={last} linkGames={inApp} />}
      {inApp ? null : <Forget id={league.id} theme={t} />}
    </View>
  );
}

interface Props {
  league: OnlineLeague;
  me: MyLeague;
  self: OnlineLeague["members"][number] | undefined;
  busy: boolean;
  act: (f: () => Promise<OnlineLeague | { advanced: AdvanceSummary | null; league: OnlineLeague }>) => Promise<void>;
  theme: Theme;
}

const memberName = (l: OnlineLeague, memberId: string | null) => l.members.find((m) => m.id === memberId)?.displayName;
const teamName = (l: OnlineLeague, abbr: string) => l.teams.find((x) => x.abbr === abbr)?.name ?? abbr;
const record = (x: OnlineTeam) => `${x.wins}-${x.losses}${x.ties ? `-${x.ties}` : ""}`;

function Lobby({ league, me, self, busy, act, theme: t }: Props) {
  const waiting = league.members.filter((m) => !m.team);
  const conferences = useMemo(() => [...new Set(league.teams.map((x) => x.conference))], [league.teams]);
  return (
    <>
      <Card>
        <SectionTitle>Invite code</SectionTitle>
        <Text selectable style={{ color: t.text, fontSize: 32, fontWeight: "900", letterSpacing: 4 }}>
          {league.inviteCode}
        </Text>
        <Text style={{ color: t.muted }}>Friends join from Online leagues with this code. Weeks are played after {league.weekHours} hours, or once everyone readies up.</Text>
      </Card>

      <Card>
        <SectionTitle>Who's in</SectionTitle>
        {league.members.map((m) => (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
            {m.team ? <Swatch abbr={m.team} size={24} /> : <View style={{ width: 24 }} />}
            <Text style={{ color: t.text, flex: 1, fontWeight: m.id === me.memberId ? "800" : "400" }}>
              {m.displayName}
              {m.isCommissioner ? <Text style={{ color: t.muted }}> · commissioner</Text> : null}
            </Text>
            <Text style={{ color: m.team ? t.text : t.muted }}>{m.team ? teamName(league, m.team) : "choosing…"}</Text>
          </View>
        ))}
        {self?.isCommissioner ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <Button label="Start the season" primary disabled={busy || waiting.length > 0} onPress={() => act(() => api.start(me.id, me.token))} />
            {waiting.length > 0 ? <Text style={{ color: t.muted, fontSize: 12 }}>Waiting on a state from {waiting.map((m) => m.displayName).join(", ")}.</Text> : null}
          </View>
        ) : (
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 8 }}>The commissioner starts the season once everyone has a state.</Text>
        )}
      </Card>

      <Card>
        <SectionTitle>{self?.team ? `You're ${teamName(league, self.team)}` : "Claim your state"}</SectionTitle>
        <Text style={{ color: t.muted, marginBottom: 6 }}>Team rating in brackets. Tap a free state to claim it{self?.team ? " instead" : ""}.</Text>
        {conferences.map((c) => (
          <View key={c} style={{ marginBottom: 8 }}>
            <Text style={{ color: t.muted, fontWeight: "700", marginBottom: 2 }}>{c}</Text>
            {league.teams
              .filter((x) => x.conference === c)
              .map((x) => {
                const mine = x.abbr === self?.team;
                const taken = !!x.claimedBy && !mine;
                return (
                  <Pressable
                    key={x.abbr}
                    disabled={busy || taken}
                    onPress={() => act(() => api.claim(me.id, me.token, mine ? null : x.abbr))}
                    accessibilityRole="button"
                    accessibilityLabel={mine ? `Give up ${x.name}` : `Claim ${x.name}`}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, opacity: taken ? 0.5 : pressed ? 0.6 : 1 })}
                  >
                    <Swatch abbr={x.abbr} size={24} />
                    <Text style={{ flex: 1, color: mine ? t.accent : t.text, fontWeight: mine ? "800" : "400" }}>
                      {x.name} <Text style={{ color: t.muted }}>({x.overall.toFixed(1)})</Text>
                    </Text>
                    <Text style={{ color: mine ? t.accent : t.muted, fontSize: 12 }}>{mine ? "yours · tap to give up" : taken ? memberName(league, x.claimedBy) : x.division}</Text>
                  </Pressable>
                );
              })}
          </View>
        ))}
      </Card>
    </>
  );
}

function stepLabel(next: NextStep | null, season: number) {
  if (!next) return "";
  if (next.kind === "week") return `${season} season · week ${next.week} next`;
  if (next.kind === "playoffs") return `${season} season · the playoffs next`;
  if (next.stage === "open") return `${season} season over · draft week (trades open)`;
  return `${season} offseason · ${STAGE_NAMES[next.stage]} due`;
}

function untilLabel(deadline: string | null, now: number) {
  if (!deadline) return "";
  const ms = Date.parse(deadline) - now;
  if (ms <= 0) return "Playing any minute now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `Plays in ${h > 0 ? `${h}h ` : ""}${m}m, or when everyone is ready`;
}

function Season({ league, me, self, busy, act, theme: t, games, last, linkGames }: Props & { games: { week: number; games: OnlineGame[] } | null; last: AdvanceSummary | null; linkGames: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const friends = new Set(league.members.map((m) => m.team).filter((x): x is string => !!x));
  const yours = self?.team ? league.teams.find((x) => x.abbr === self.team) : undefined;
  // In the app, the schedule is on the phone: this week's game for your team (none on a bye).
  const onPhone = useLeagueMaybe();
  const game =
    linkGames && onPhone && yours && league.next?.kind === "week"
      ? onPhone.schedule.games.find((g) => g.week === (league.next as { week: number }).week && (g.home === yours.abbr || g.away === yours.abbr))
      : undefined;
  const ready = league.members.filter((m) => m.ready).length;
  const standings = [...league.teams].sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || a.losses - b.losses);
  // Before any games, just the friends' teams; then the top ten plus any friends below them.
  const top = league.weeksPlayed > 0 ? standings.slice(0, 10) : [];
  const shown = [...top, ...standings.filter((x) => friends.has(x.abbr) && !top.includes(x))];
  return (
    <>
      {league.champion ? (
        <Card style={{ borderColor: "#f5b83d", borderWidth: 1 }}>
          <SectionTitle>Champions</SectionTitle>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{teamName(league, league.champion)}</Text>
          {friends.has(league.champion) ? <Text style={{ color: t.accent, fontWeight: "700" }}>{memberName(league, league.teams.find((x) => x.abbr === league.champion)!.claimedBy)} won it all.</Text> : null}
        </Card>
      ) : null}

      <Card style={{ gap: 8 }}>
        <SectionTitle>{stepLabel(league.next, league.season)}</SectionTitle>
        {yours && game ? (
          // This week's game, as on a solo Home: both teams' badges and records.
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {[game.away, "at", game.home].map((x) =>
              x === "at" ? (
                <Text key="at" style={{ color: t.muted, fontWeight: "700", paddingHorizontal: 6 }}>
                  at
                </Text>
              ) : (
                <View key={x} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                  <Swatch abbr={x} size={40} />
                  <Text style={{ color: t.text, fontWeight: x === yours.abbr ? "800" : "600", fontSize: 15 }} numberOfLines={1}>
                    {teamName(league, x).split(" ").slice(-1)[0]}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{record(league.teams.find((y) => y.abbr === x)!)}</Text>
                </View>
              ),
            )}
          </View>
        ) : yours ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Swatch abbr={yours.abbr} size={24} />
            <Text style={{ color: t.text, fontSize: 17, fontWeight: "800", flex: 1 }}>{yours.name}</Text>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{record(yours)}</Text>
          </View>
        ) : null}
        <Text style={{ color: t.muted }}>{untilLabel(league.deadline, now)}</Text>
        <Button
          label={self?.ready ? "Ready ✓ (tap to undo)" : "I'm ready"}
          primary={!self?.ready}
          disabled={busy}
          onPress={() => act(() => api.ready(me.id, me.token, !self?.ready))}
        />
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {ready} of {league.members.length} ready: {league.members.map((m) => `${m.displayName}${m.ready ? " ✓" : ""}`).join(", ")}.{" "}
          {league.next?.kind === "offseason" && league.next.stage !== "open"
            ? `Calls in from: ${league.madeCall.length ? league.madeCall.map((abbr) => memberName(league, league.teams.find((x) => x.abbr === abbr)?.claimedBy ?? null) ?? abbr).join(", ") : "nobody yet"}. Anyone without a call when the stage closes is left to the AI.`
            : "Anyone not ready when the week is played has the AI handle their injured reserve and signings."}
        </Text>
        {self?.isCommissioner ? <Button label={busy ? "Playing…" : "Play it now (commissioner)"} small disabled={busy} onPress={() => act(() => api.advance(me.id, me.token))} /> : null}
      </Card>

      {last ? <JustPlayed last={last} league={league} friends={friends} theme={t} /> : null}

      {games ? (
        <Card>
          <SectionTitle>{linkGames ? `Week ${games.week}: your league's games` : `Week ${games.week} scores`}</SectionTitle>
          {[...games.games]
            // In the app, just the friends' games (the League tab has every score).
            .filter((g) => !linkGames || friends.has(g.home) || friends.has(g.away))
            .sort((a, b) => Number(friends.has(b.home) || friends.has(b.away)) - Number(friends.has(a.home) || friends.has(a.away)))
            .map((g) => {
              const ours = friends.has(g.home) || friends.has(g.away);
              const won = (abbr: string) => (g.winner === abbr ? "800" : "400");
              return (
                <Pressable
                  key={g.id}
                  disabled={!linkGames}
                  onPress={() => router.push(`/game/${g.id}`)}
                  accessibilityRole={linkGames ? "link" : undefined}
                  style={({ pressed }) => ({ flexDirection: "row", paddingVertical: 2, opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ flex: 1, color: ours ? t.accent : t.text, fontSize: 13 }}>
                    <Text style={{ fontWeight: won(g.away) }}>
                      {teamName(league, g.away)} {g.awayScore}
                    </Text>
                    {" @ "}
                    <Text style={{ fontWeight: won(g.home) }}>
                      {teamName(league, g.home)} {g.homeScore}
                    </Text>
                    {g.overtime ? " (OT)" : ""}
                  </Text>
                  {linkGames ? <Text style={{ color: t.muted }}>›</Text> : null}
                </Pressable>
              );
            })}
        </Card>
      ) : null}

      {linkGames ? null : (
      <Card>
        <SectionTitle>Standings</SectionTitle>
        {shown.map((x) => (
          <View key={x.abbr} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
            {league.weeksPlayed > 0 ? <Text style={{ width: 22, color: t.muted, fontVariant: ["tabular-nums"] }}>{standings.indexOf(x) + 1}</Text> : null}
            <Swatch abbr={x.abbr} size={24} />
            <Text style={{ flex: 1, color: friends.has(x.abbr) ? t.accent : t.text, fontWeight: friends.has(x.abbr) ? "700" : "400" }}>
              {x.name}
              {x.claimedBy ? <Text style={{ color: t.muted, fontWeight: "400" }}> · {memberName(league, x.claimedBy)}</Text> : null}
            </Text>
            <Text style={{ color: t.text, fontVariant: ["tabular-nums"] }}>{record(x)}</Text>
          </View>
        ))}
      </Card>
      )}
    </>
  );
}

function JustPlayed({ last, league, friends, theme: t }: { last: AdvanceSummary; league: OnlineLeague; friends: Set<string>; theme: Theme }) {
  let text: string;
  if (last.kind === "week") {
    const covered = last.covered.map((abbr) => memberName(league, league.teams.find((x) => x.abbr === abbr)?.claimedBy ?? null) ?? abbr);
    text = `Week ${last.week} is in the books.${covered.length ? ` The AI covered for ${covered.join(", ")}.` : ""} Around the league: ${last.trades} trade${last.trades === 1 ? "" : "s"}, ${last.moves} roster move${last.moves === 1 ? "" : "s"}.`;
  } else if (last.kind === "playoffs") {
    text = `The ${last.season} playoffs are done: ${teamName(league, last.champion)} beat ${teamName(league, last.runnerUp)} for the title.${friends.has(last.champion) ? " A friend is the champion!" : ""}`;
  } else {
    const covered = last.covered.map((abbr) => memberName(league, league.teams.find((x) => x.abbr === abbr)?.claimedBy ?? null) ?? abbr);
    const ai = covered.length ? ` The AI made the calls for ${covered.join(", ")}.` : "";
    text =
      last.done === "open" ? "Draft week is over and the offseason is open: staff decisions first."
      : last.next ? `The ${STAGE_NAMES[last.done]} stage is closed.${ai} Next: ${STAGE_NAMES[last.next]}.`
      : `The offseason is done, and the spring season is played.${ai} On to ${last.nextSeason}.`;
  }
  return (
    <Card>
      <SectionTitle>Just played</SectionTitle>
      <Text style={{ color: t.text }}>{text}</Text>
    </Card>
  );
}

function Forget({ id, theme: t }: { id: string; theme: Theme }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  return (
    <Pressable onPress={() => (armed ? forgetLeague(id).then(() => router.back()) : setArmed(true))} accessibilityRole="button" style={{ alignSelf: "center", padding: 8 }}>
      <Text style={{ color: armed ? t.score : t.muted, fontWeight: armed ? "700" : "400", textAlign: "center" }}>
        {armed ? "Tap again to sign out for good (this phone's sign-in is the only way back in)" : "Sign this phone out of the league"}
      </Text>
    </Pressable>
  );
}
