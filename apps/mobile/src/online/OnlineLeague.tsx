// One online league. In the lobby: the invite code, who's in, and claiming a
// state (the commissioner starts the season). Then each week: ready up (or the
// deadline plays it), the commissioner can push it through, and the scores.
// Everything is decided on the server; this asks and shows. Used by the
// league's own screen and, once the league is open in the app, by the hub.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, Card, Chips, LogoBadge, SectionTitle, Swatch } from "../components/ui";
import { designedColors } from "../field/colors";
import { useDynasty, useLeagueMaybe } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";
import { SKILL_GROUPS, regions } from "@dynasty/sim";
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
  // Back from setting up your team: show it straight away.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
      <ChatLink me={me} theme={t} />
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
/** A team's badge as the lobby knows it (its friend's look, if set up). */
function TeamLook({ x, size }: { x: OnlineTeam; size: number }) {
  const c = x.colors ?? designedColors(x.abbr);
  return <LogoBadge logo={x.logo} primary={c.primary} trim={c.trim} size={size} label={x.name} />;
}

const record = (x: OnlineTeam) => `${x.wins}-${x.losses}${x.ties ? `-${x.ties}` : ""}`;

function Lobby({ league, me, self, busy, act, theme: t }: Props) {
  const router = useRouter();
  const waiting = league.members.filter((m) => !m.team);
  const mine = self?.team ? league.teams.find((x) => x.abbr === self.team) : undefined;
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
            {m.team ? <TeamLook x={league.teams.find((x) => x.abbr === m.team)!} size={24} /> : <View style={{ width: 24 }} />}
            <Text style={{ color: t.text, flex: 1, fontWeight: m.id === me.memberId ? "800" : "400" }}>
              {m.displayName}
              {m.isCommissioner ? <Text style={{ color: t.muted }}> · commissioner</Text> : null}
            </Text>
            <Text style={{ color: m.team ? t.text : t.muted }}>
              {m.team ? teamName(league, m.team) : "choosing…"}
              {m.team && m.setUp ? <Text style={{ color: t.muted, fontSize: 12 }}> · set up</Text> : null}
            </Text>
          </View>
        ))}
        {self?.isCommissioner ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <Button label="Start the season" primary disabled={busy || waiting.length > 0} onPress={() => act(() => api.start(me.id, me.token))} />
            {waiting.length > 0 ? <Text style={{ color: t.muted, fontSize: 12 }}>Waiting on a program from {waiting.map((m) => m.displayName).join(", ")}.</Text> : null}
          </View>
        ) : (
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 8 }}>The commissioner starts the season once everyone has a program.</Text>
        )}
      </Card>

      {mine ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle>Make it yours</SectionTitle>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TeamLook x={mine} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{mine.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                {self?.setUp ? `${mine.tag} · head coach ${mine.coach}` : "Name the team, pick its logo and colors, and build your head coach. Or keep it as it is."}
              </Text>
            </View>
          </View>
          <Button label={self?.setUp ? "Change my team" : "Make it yours"} primary={!self?.setUp} disabled={busy} onPress={() => router.push(`/online/setup/${me.id}`)} />
          {self?.setUp ? (
            <Text onPress={() => act(() => api.setup(me.id, me.token, null))} accessibilityRole="button" style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>
              Undo: keep the team as generated
            </Text>
          ) : null}
        </Card>
      ) : null}

      {self?.isCommissioner && league.members.some((m) => m.program) ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle>Regions</SectionTitle>
          <Text style={{ color: t.muted, fontSize: 12 }}>Each program&apos;s region was drawn at random. As commissioner you can move any of them before the start (a region holds five).</Text>
          {league.members
            .filter((m) => m.program)
            .map((m) => (
              <View key={m.id} style={{ gap: 4 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>
                  {m.displayName} <Text style={{ color: t.muted, fontWeight: "400" }}>· {m.program!.region ?? "no room"}</Text>
                </Text>
                <Chips options={regions().map((r) => ({ key: r.name, label: r.name }))} value={m.program!.region ?? ""} onChange={(r) => act(() => api.region(me.id, me.token, m.id, r))} />
              </View>
            ))}
        </Card>
      ) : null}

      <Card style={{ gap: 8 }}>
        <SectionTitle>Your program</SectionTitle>
        {self?.program ? (
          <>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>{self.program.region ? `${self.program.region} region` : "No region has room"}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>Built around {self.program.groups.map((g) => SKILL_GROUPS[g].label.toLowerCase()).join(", ")}. Your region was drawn at random; the commissioner can move it.</Text>
            <Button label="Change skill groups" disabled={busy} onPress={() => router.push(`/online/program/${me.id}`)} />
          </>
        ) : (
          <>
            <Text style={{ color: t.muted }}>Pick the three skill groups you want to build around. Your region is drawn at random.</Text>
            <Button label="Build your program" primary disabled={busy} onPress={() => router.push(`/online/program/${me.id}`)} />
          </>
        )}
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
        <Text style={{ color: league.paused ? t.score : t.muted, fontWeight: league.paused ? "700" : "400" }}>{league.paused ? "Paused by the commissioner: nothing plays until it's picked back up." : untilLabel(league.deadline, now)}</Text>
        <Button
          label={self?.ready ? "Ready ✓ (tap to undo)" : "I'm ready"}
          primary={!self?.ready}
          disabled={busy}
          onPress={() => act(() => api.ready(me.id, me.token, !self?.ready))}
        />
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {ready} of {league.members.filter((m) => !m.away).length} ready: {league.members.map((m) => `${m.displayName}${m.away ? " (with the AI)" : m.ready ? " ✓" : ""}`).join(", ")}.{" "}
          {league.next?.kind === "offseason" && league.next.stage !== "open"
            ? `Calls in from: ${league.madeCall.length ? league.madeCall.map((abbr) => memberName(league, league.teams.find((x) => x.abbr === abbr)?.claimedBy ?? null) ?? abbr).join(", ") : "nobody yet"}. Anyone without a call when the stage closes is left to the AI.`
            : "Anyone not ready when the week is played has the AI handle their injured reserve and signings."}
        </Text>
        {self?.isCommissioner ? <Button label={busy ? "Playing…" : "Play it now (commissioner)"} small disabled={busy} onPress={() => act(() => api.advance(me.id, me.token))} /> : null}
      </Card>

      {self?.isCommissioner ? <CommissionerTools league={league} me={me} busy={busy} act={act} theme={t} /> : null}

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

/** The league's chat, one tap from its page. */
function ChatLink({ me, theme: t }: { me: MyLeague; theme: Theme }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/chat?league=${me.id}`)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card }}>
      <Text style={{ color: t.text, fontWeight: "800", flex: 1 }}>League chat</Text>
      <Text style={{ color: t.accent, fontWeight: "700" }}>Open ›</Text>
    </Pressable>
  );
}

/** The commissioner's tools: pause, more time this week, and each friend's team (to the AI and back, or out of the league). */
function CommissionerTools({ league, me, busy, act, theme: t }: { league: OnlineLeague; me: MyLeague; busy: boolean; act: Props["act"]; theme: Theme }) {
  const [armed, setArmed] = useState<string | null>(null);
  // Each tool runs on the server, then the league is fetched again.
  const run = (action: Parameters<typeof api.commissioner>[2]) =>
    act(async () => {
      await api.commissioner(me.id, me.token, action);
      return api.league(me.id, me.token);
    });
  return (
    <Card style={{ gap: 10 }}>
      <SectionTitle>Commissioner</SectionTitle>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button label={league.paused ? "Pick it back up" : "Pause the league"} small disabled={busy} onPress={() => run({ action: league.paused ? "resume" : "pause" })} />
        {!league.paused && league.deadline ? (
          <>
            <Button label="+6 hours" small disabled={busy} onPress={() => run({ action: "extend", hours: 6 })} />
            <Button label="+1 day" small disabled={busy} onPress={() => run({ action: "extend", hours: 24 })} />
          </>
        ) : null}
      </View>
      {league.members
        .filter((m) => m.id !== me.memberId)
        .map((m) => (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: t.text, flex: 1 }}>
              {m.displayName}
              {m.away ? <Text style={{ color: t.muted }}> · with the AI</Text> : null}
            </Text>
            <Text onPress={() => !busy && run({ action: m.away ? "back" : "away", memberId: m.id })} accessibilityRole="button" style={{ color: t.accent, fontWeight: "700" }}>
              {m.away ? "Give it back" : "Hand to the AI"}
            </Text>
            <Text
              onPress={() => (busy ? null : armed === m.id ? (setArmed(null), run({ action: "remove", memberId: m.id })) : setArmed(m.id))}
              accessibilityRole="button"
              style={{ color: armed === m.id ? t.score : t.muted, fontWeight: armed === m.id ? "800" : "600" }}
            >
              {armed === m.id ? "Tap again to remove" : "Remove"}
            </Text>
          </View>
        ))}
      <Text style={{ color: t.muted, fontSize: 12 }}>Everything here is posted to the league chat. A team handed to the AI has its calls made for it, and nobody waits on it to ready up.</Text>
    </Card>
  );
}
