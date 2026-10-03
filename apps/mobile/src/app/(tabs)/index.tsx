// Home: your dynasty's hub. Start a dynasty, pick your team, play the season
// week by week (watch your games), the playoffs round by round, then run the
// offseason and read what happened to your team.
import { useRouter } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  PLAYOFF_ROUNDS,
  ROUND_NAMES,
  STATES,
  OWNER_GOALS,
  teamOwner,
  backLabel,
  injuryLabel,
  injuryReport,
  TRADE_DEADLINE_WEEK,
  type TradeRecord,
  allTeams,
  formatMoney,
  formatRecord,
  payroll,
  salaryCap,
  staffOverall,
  teamName,
  mood,
  teamAppeal,
  teamRatings,
  winPct,
} from "@dynasty/sim";
import { Card, LinkRow, SectionTitle, Swatch } from "../../components/ui";
import { CutsScreen } from "../../screens/CutsScreen";
import { DraftScreen } from "../../screens/DraftScreen";
import { FreeAgencyScreen } from "../../screens/FreeAgencyScreen";
import { ResignScreen } from "../../screens/ResignScreen";
import { HireScreen, StaffScreen } from "../../screens/StaffScreen";
import type { OffseasonReport, ReportPlayer } from "../../dynasty/report";
import { SCOUT_POINTS, useDynasty, useLeagueMaybe, type LeagueData } from "../../league/LeagueProvider";
import { useTheme, type Theme } from "../../theme";

export default function Home() {
  const t = useTheme();
  const d = useDynasty();
  const data = useLeagueMaybe();

  switch (d.phase) {
    case "loading":
      return <Centered theme={t}><ActivityIndicator color={t.accent} /></Centered>;
    case "start":
      return <Saves />;
    case "building":
      return (
        <Centered theme={t}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: t.text }}>Building your league</Text>
          <Text style={{ color: t.muted, marginVertical: 8, textAlign: "center", maxWidth: 300 }}>
            Settling fifteen years of drafts, development and retirements so every roster has a history.
          </Text>
          <Bar value={d.progress} theme={t} />
        </Centered>
      );
    case "offseason":
      return (
        <Centered theme={t}>
          <ActivityIndicator color={t.accent} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: t.text, marginTop: 12 }}>Running the offseason</Text>
          <Text style={{ color: t.muted, marginTop: 8, textAlign: "center", maxWidth: 300 }}>
            Staff moves, retirements, player development, contracts, the draft and free agency.
          </Text>
        </Centered>
      );
    case "choose":
      return data ? <ChooseTeam data={data} /> : null;
    case "fired":
      return data && d.save?.fired ? <Fired data={data} /> : null;
    case "staff":
      return d.staffSeats ? <StaffScreen overview={d.staffSeats} onConfirm={d.confirmStaff} /> : null;
    case "hire":
      return d.staffOpenings ? <HireScreen openings={d.staffOpenings} onConfirm={d.confirmHires} /> : null;
    case "resign":
      return d.contractPlan ? <ResignScreen plan={d.contractPlan} onDone={d.finishOffseason} /> : null;
    case "draft":
      return d.draftTurn && data ? <DraftScreen turn={d.draftTurn} userTeam={data.userTeam} onPick={d.draftPick} onAuto={d.autoDraft} /> : null;
    case "freeagency":
      return d.freeAgencyPlan && data ? (
        <FreeAgencyScreen
          plan={d.freeAgencyPlan}
          offers={d.offers}
          setOffer={d.setOffer}
          onOpen={d.openFreeAgency}
          frontOffice={d.frontOffice}
          setFrontOffice={d.setFrontOffice}
          moodAt={(l, annual) => {
            const rec = data.records.get(data.userTeam);
            const appeal = teamAppeal(data.league.teams[data.userTeam]!, l.player, rec ? winPct(rec) : 0.5);
            return mood(l.player, appeal, annual / l.market);
          }}
        />
      ) : null;
    case "cuts":
      return d.rosterPlan ? <CutsScreen plan={d.rosterPlan} onDone={d.finishCuts} /> : null;
    case "report":
      return d.save?.report ? <Report report={d.save.report} /> : null;
    default:
      return data ? <SeasonHub data={data} /> : null;
  }
}

function ChooseTeam({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const teams = useMemo(
    () => allTeams(data.league).map((team) => ({ team, ovr: teamRatings(team).overall })).sort((a, b) => b.ovr - a.ovr),
    [data.league],
  );
  const cap = salaryCap(data.league.seed, data.league.season);
  const [role, setRole] = useState<"owner" | "gm">("owner");
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Choose your team</Text>
      <Card>
        <SectionTitle>Your role</SectionTitle>
        {(
          [
            ["owner", "Owner and GM", "Run everything. Nobody can fire you; the board and the fans grade every season."],
            ["gm", "GM for an AI owner", "The owner has a goal and a temper. Meet it and you keep the job; miss it too often and you're out."],
          ] as const
        ).map(([key, label, note]) => (
          <Pressable key={key} onPress={() => setRole(key)} accessibilityRole="radio" accessibilityState={{ selected: role === key }} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
            <Text style={{ color: role === key ? t.accent : t.muted, fontWeight: "900", width: 18 }}>{role === key ? "◉" : "○"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>{note}</Text>
            </View>
          </Pressable>
        ))}
      </Card>
      <Text style={{ color: t.muted, marginBottom: 8 }}>Strongest rosters first. A weak team is a longer road — and a better story.</Text>
      {teams.map(({ team, ovr }) => (
        <Card key={team.abbr} style={{ paddingVertical: 4 }}>
          <LinkRow label={`Choose ${teamName(team)}`} onPress={() => d.chooseTeam(team.abbr, role)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Swatch abbr={team.abbr} size={14} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{teamName(team)}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  Coach {team.staff?.hc.lastName} ({team.staff ? staffOverall(team.staff.hc) : "–"}) · payroll {formatMoney(payroll(team, data.league.season))} of {formatMoney(cap)}
                </Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: t.text, fontVariant: ["tabular-nums"] }}>{ovr.toFixed(0)}</Text>
            </View>
          </LinkRow>
        </Card>
      ))}
    </ScrollView>
  );
}

function SeasonHub({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { league, schedule, results, userTeam, weeksPlayed, standings, rankings, playoffs, playoffRoundsShown } = data;
  const team = league.teams[userTeam]!;
  const rec = data.records.get(userTeam);
  const div = standings.find((x) => x.teams.some((r) => r.team === userTeam));
  const place = div ? div.teams.findIndex((r) => r.team === userTeam) + 1 : 0;
  const rank = rankings.find((e) => e.team === userTeam)?.rank;
  const nextWeek = weeksPlayed + 1;
  const myGames = schedule.games.filter((g) => g.home === userTeam || g.away === userTeam);
  const upcoming = myGames.find((g) => g.week === nextWeek);
  const lastResult = [...results].reverse().find((r) => r.home === userTeam || r.away === userTeam);
  const simming = d.phase === "simming";

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Swatch abbr={userTeam} size={18} />
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: t.text }}>{teamName(team)}</Text>
        </View>
        <Text style={{ color: t.muted, marginTop: 6 }}>
          {league.season} season · {rec ? formatRecord(rec) : "0-0"}
          {div && weeksPlayed > 0 ? ` · ${ordinal(place)} in ${div.division}` : ""}
          {rank && rank <= 25 && weeksPlayed > 0 ? ` · No. ${rank}` : ""}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <Button label="Team page" onPress={() => router.push(`/team/${userTeam}`)} theme={t} small />
          {d.phase === "season" ? <Button label={`Picks · ${d.picks.balance.toLocaleString()} pts`} onPress={() => router.push("/picks")} theme={t} small /> : null}
          {d.phase === "season" ? <Button label="Radio" onPress={() => router.push("/radio")} theme={t} small /> : null}
          <Button label="Moments" onPress={() => router.push("/moments")} theme={t} small />
          <Button label="Business" onPress={() => router.push("/business")} theme={t} small />
        </View>
      </Card>

      {d.phase === "season" || simming ? (
        <Card>
          <SectionTitle>{simming ? "Simulating" : `Week ${nextWeek} of ${schedule.weeks}`}</SectionTitle>
          {simming ? (
            <Bar value={d.progress} theme={t} />
          ) : upcoming ? (
            <Matchup data={data} home={upcoming.home} away={upcoming.away} />
          ) : (
            <Text style={{ color: t.muted }}>Bye week.</Text>
          )}
          {!simming ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {upcoming ? <Button label="Watch your game" onPress={() => router.push(`/game/${upcoming.id}`)} theme={t} /> : null}
              <Button label={`Play week ${nextWeek}`} onPress={d.playWeek} theme={t} primary />
              <Button label="Sim to playoffs" onPress={d.playRegularSeason} theme={t} />
            </View>
          ) : null}
          {lastResult && !simming ? (
            <Pressable onPress={() => router.push(`/game/${lastResult.id}`)} accessibilityRole="link">
              <Text style={{ color: t.muted, marginTop: 12 }}>
                Last game: {resultLine(lastResult, userTeam)} <Text style={{ color: t.accent }}>Watch ›</Text>
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {d.phase === "season" && d.press ? <PressCard /> : null}

      {(d.save?.news ?? []).length > 0 && (d.phase === "season" || d.phase === "playoffs" || d.phase === "complete") ? <HeadlinesCard data={data} /> : null}

      {d.phase === "season" || d.phase === "playoffs" || d.phase === "complete" ? <OwnerCard data={data} /> : null}

      {d.phase === "season" ? <ScoutingCard data={data} /> : null}

      {d.phase === "season" || d.phase === "playoffs" || d.phase === "complete" ? <InjuriesCard data={data} /> : null}

      {d.phase === "season" || d.phase === "playoffs" || d.phase === "complete" ? <TradesCard data={data} /> : null}

      {playoffs ? <Playoffs data={data} /> : null}

      {d.phase === "playoffs" ? (
        <Button label={`Play the ${ROUND_NAMES[PLAYOFF_ROUNDS[playoffRoundsShown]!]}`} onPress={d.playPlayoffRound} theme={t} primary />
      ) : null}

      {d.phase === "complete" && playoffs ? (
        <Card>
          <SectionTitle>{league.season} champions</SectionTitle>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.text }}>{teamName(league.teams[playoffs.champion]!)}</Text>
          <Text style={{ color: t.muted, marginTop: 4 }}>
            {playoffs.champion === userTeam ? "That's you. Champions!" : `Runner-up: ${playoffs.runnerUp}.`}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Button label="Start the offseason" onPress={d.startOffseason} theme={t} primary />
          </View>
        </Card>
      ) : null}

      <History data={data} />
      <DangerZone />
    </ScrollView>
  );
}

/** The owner (or the board): their goal, trust in you, fan mood, and last season's verdict. */
function OwnerCard({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const office = d.save?.office;
  if (!office) return null;
  const owner = teamOwner(data.league.seed, data.userTeam);
  const last = office.reviews.at(-1);
  return (
    <Card>
      <SectionTitle>{office.role === "owner" ? "The board" : `Your owner: ${owner.name}`}</SectionTitle>
      {office.role === "gm" ? (
        <>
          <Text style={{ color: t.text }}>
            Wants: <Text style={{ fontWeight: "700" }}>{OWNER_GOALS[owner.goal].name}</Text> ({OWNER_GOALS[owner.goal].wants}).
          </Text>
          <Meter label="Owner's trust" value={office.trust} warn={office.trust < 35} theme={t} />
        </>
      ) : (
        <Text style={{ color: t.muted }}>You own the team. The board grades each season; nobody can fire you.</Text>
      )}
      <Meter label="Fan mood" value={office.fanMood} warn={office.fanMood < 35} theme={t} />
      {office.expectedWins !== undefined ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Expected this season: about {Math.round(office.expectedWins)} wins.</Text> : null}
      {last ? (
        <Text style={{ color: t.muted, fontSize: 13, marginTop: 6 }}>
          {last.season}: grade {last.grade}. {last.verdict}
        </Text>
      ) : null}
    </Card>
  );
}

function Meter({ label, value, warn, theme: t }: { label: string; value: number; warn: boolean; theme: Theme }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={{ flex: 1, color: t.muted, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: warn ? t.score : t.text, fontWeight: "700", fontSize: 12 }}>{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, marginTop: 3, overflow: "hidden" }}>
        <View style={{ width: `${value}%`, height: 6, backgroundColor: warn ? t.score : t.accent }} />
      </View>
    </View>
  );
}

/** After each game: one question from the press, three ways to answer. */
function PressCard() {
  const t = useTheme();
  const d = useDynasty();
  const p = d.press!;
  const answered = d.save?.office?.press[p.week];
  return (
    <Card>
      <SectionTitle>Press conference</SectionTitle>
      <Text style={{ color: t.text, fontWeight: "700", marginBottom: 6 }}>"{p.question}"</Text>
      {answered === undefined ? (
        p.answers.map((a, i) => (
          <Pressable key={i} onPress={() => d.answerPress(i)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: t.border, marginBottom: 6, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: t.text }}>{a.text}</Text>
          </Pressable>
        ))
      ) : (
        <>
          <Text style={{ color: t.muted }}>You said: "{p.answers[answered]!.text}"</Text>
          <Text style={{ color: t.accent, marginTop: 4 }}>{p.answers[answered]!.reaction}</Text>
        </>
      )}
    </Card>
  );
}

/** Fired: the owner's verdict, and the teams that want you. */
function Fired({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const fired = d.save!.fired!;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>You're fired.</Text>
      <Card>
        <Text style={{ color: t.text }}>{fired.verdict}</Text>
        <Text style={{ color: t.muted, marginTop: 6 }}>The phone's already ringing. These teams want a new GM:</Text>
      </Card>
      {fired.offers.map((abbr) => {
        const team = data.league.teams[abbr]!;
        const owner = teamOwner(data.league.seed, abbr);
        const rec = data.records.get(abbr);
        return (
          <Card key={abbr}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Swatch abbr={abbr} size={14} />
              <Text style={{ flex: 1, color: t.text, fontWeight: "800" }}>{teamName(team)}</Text>
              <Text style={{ color: t.muted }}>{rec ? formatRecord(rec) : ""}</Text>
            </View>
            <Text style={{ color: t.muted, marginTop: 4 }}>
              Owner {owner.name} wants: {OWNER_GOALS[owner.goal].name.toLowerCase()}. {owner.bio}
            </Text>
            <View style={{ flexDirection: "row", marginTop: 8 }}>
              <Button label="Take the job" onPress={() => d.takeJob(abbr)} theme={t} primary small />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

/** The latest week's top stories: your game first, then the biggest around the league. */
function HeadlinesCard({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const all = d.save?.news ?? [];
  const week = Math.max(...all.map((s) => s.week));
  const latest = all.filter((s) => s.week === week);
  const recap = latest.find((s) => s.kind === "recap" && s.teams.includes(data.userTeam));
  const top = latest.filter((s) => !s.local).sort((a, b) => b.importance - a.importance).slice(0, 3);
  return (
    <Card>
      <SectionTitle>Week {week} headlines</SectionTitle>
      {recap ? <Text style={{ color: t.text, fontWeight: "800", marginBottom: 6 }}>{recap.headline}</Text> : null}
      {top.map((s) => (
        <View key={s.id} style={{ flexDirection: "row", gap: 6, paddingVertical: 3 }}>
          <Text style={{ color: t.accent }}>•</Text>
          <Text style={{ flex: 1, color: t.text }}>{s.headline}</Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", marginTop: 8 }}>
        <Button label="All the news" onPress={() => router.push("/news")} theme={t} small />
      </View>
    </Card>
  );
}

function InjuriesCard({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const mine = useMemo(() => injuryReport(data.league, data.weeksPlayed, data.userTeam), [data.league, data.weeksPlayed, data.userTeam]);
  const lastWeek = (d.save?.injuryNews ?? []).filter((n) => n.week === data.weeksPlayed && n.team !== data.userTeam).slice(0, 3);
  return (
    <Card>
      <SectionTitle>Injuries</SectionTitle>
      {mine.length === 0 ? <Text style={{ color: t.muted }}>Your team is healthy.</Text> : null}
      {mine.slice(0, 5).map((e) => (
        <View key={e.player.id} style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
          <Text style={{ width: 28, color: t.muted }}>{e.player.position}</Text>
          <Text style={{ flex: 1, color: t.text, fontWeight: e.starter ? "700" : "400" }} numberOfLines={1}>
            {e.player.firstName} {e.player.lastName} <Text style={{ color: t.muted, fontWeight: "400", fontSize: 12 }}>{e.injury.type}</Text>
          </Text>
          <Text style={{ color: e.returnWeek === null ? t.score : t.muted, fontSize: 12 }}>{backLabel(e.returnWeek, data.schedule.weeks)}</Text>
        </View>
      ))}
      {mine.length > 5 ? <Text style={{ color: t.muted, fontSize: 12 }}>and {mine.length - 5} more</Text> : null}
      {lastWeek.length > 0 ? (
        <View style={{ marginTop: 8, gap: 3 }}>
          <Text style={{ color: t.text, fontWeight: "700" }}>Around the league</Text>
          {lastWeek.map((n) => (
            <Text key={n.player} style={{ color: t.muted, fontSize: 13 }}>
              {n.team} {n.starter ? "starting " : ""}
              {n.position} {n.name}: {injuryLabel(n)}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Button label="Injury report" onPress={() => router.push("/injuries")} theme={t} small />
        {d.canMakeMoves ? <Button label="Free agents" onPress={() => router.push("/freeagents")} theme={t} small /> : null}
      </View>
    </Card>
  );
}

function TradesCard({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const trades = d.save?.trades ?? [];
  const weeksLeft = TRADE_DEADLINE_WEEK - data.weeksPlayed;
  const w = d.tradeWindow;
  return (
    <Card>
      <SectionTitle>{w?.week === 0 ? "Draft-week trades" : "Trades"}</SectionTitle>
      <Text style={{ color: t.muted }}>
        {w?.week === 0
          ? `Trade players and picks before the offseason, with the draft order set. The other teams make their moves when you start the offseason.`
          : w
            ? weeksLeft === 1
              ? `Deadline: this is the last week to trade (after week ${TRADE_DEADLINE_WEEK}'s games, trading closes).`
              : `Deadline: after week ${TRADE_DEADLINE_WEEK} (${weeksLeft} weeks left).`
            : "The trade deadline has passed. Trading reopens in draft week, after the championship."}
      </Text>
      {w ? (
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <Button label="Make a trade" onPress={() => router.push("/trade")} theme={t} />
        </View>
      ) : null}
      {trades.length > 0 ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={{ color: t.text, fontWeight: "700" }}>Around the league</Text>
          {[...trades].reverse().slice(0, 5).map((tr, i) => (
            <Text key={i} style={{ color: tr.teams.includes(data.userTeam) ? t.text : t.muted, fontSize: 13 }}>
              {tr.week === 0 ? "Draft week" : `Wk ${tr.week}`} · {tradeLine(tr)}
            </Text>
          ))}
          {trades.length > 5 ? <Text style={{ color: t.muted, fontSize: 12 }}>{trades.length} trades this season.</Text> : null}
        </View>
      ) : null}
    </Card>
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

function ScoutingCard({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const used = d.scoutPlan.reduce((n, a) => n + a.points, 0);
  return (
    <Card>
      <SectionTitle>Scouting the {data.league.season + 1} class</SectionTitle>
      <Text style={{ color: t.muted }}>
        {used > 0 ? `${used} of ${SCOUT_POINTS} points assigned for week ${data.weeksPlayed + 1}.` : `${SCOUT_POINTS} points this week — your scouts will choose unless you do.`}
      </Text>
      <View style={{ marginTop: 10 }}>
        <Button label="Open the draft board" onPress={() => router.push("/scouting")} theme={t} small />
      </View>
    </Card>
  );
}

function Matchup({ data, home, away }: { data: LeagueData; home: string; away: string }) {
  const t = useTheme();
  const recs = data.records;
  const side = (abbr: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Swatch abbr={abbr} />
      <Text style={{ flex: 1, color: t.text, fontWeight: abbr === data.userTeam ? "800" : "500" }}>{teamName(data.league.teams[abbr]!)}</Text>
      <Text style={{ color: t.muted, fontVariant: ["tabular-nums"] }}>{formatRecord(recs.get(abbr)!)}</Text>
    </View>
  );
  return (
    <View style={{ gap: 6 }}>
      {side(away)}
      <Text style={{ color: t.muted, fontSize: 12 }}>at</Text>
      {side(home)}
    </View>
  );
}

function Playoffs({ data }: { data: LeagueData }) {
  const t = useTheme();
  const router = useRouter();
  const { playoffs, playoffRoundsShown, userTeam } = data;
  if (!playoffs) return null;
  const made = playoffs.seeds.find((s) => s.team === userTeam);
  const nextRound = PLAYOFF_ROUNDS[playoffRoundsShown];
  // Your next playoff game, if you're still alive and it's been set.
  const upcoming = nextRound ? playoffs.games.find((g) => g.round === nextRound && (g.summary.home === userTeam || g.summary.away === userTeam)) : undefined;
  return (
    <Card>
      <SectionTitle>Playoffs</SectionTitle>
      <Text style={{ color: t.muted, marginBottom: 8 }}>
        {made ? `You're in as the No. ${made.seed} seed (${made.bid === "division_winner" ? "division champions" : "at-large"}).` : "You missed the playoffs this year."}
      </Text>
      {PLAYOFF_ROUNDS.slice(0, playoffRoundsShown).map((round) => (
        <View key={round} style={{ marginBottom: 8 }}>
          <Text style={{ color: t.text, fontWeight: "700", marginBottom: 2 }}>{ROUND_NAMES[round]}</Text>
          {playoffs.games
            .filter((g) => g.round === round)
            .map((g) => {
              const mine = g.summary.home === userTeam || g.summary.away === userTeam;
              return (
                <LinkRow key={g.summary.id} label={`${g.summary.away} at ${g.summary.home}, watch`} onPress={() => router.push(`/game/${g.summary.id}`)}>
                  <Text style={{ color: t.text, fontWeight: mine ? "800" : "400", fontVariant: ["tabular-nums"] }}>
                    ({g.awaySeed}) {g.summary.away} {g.summary.awayScore} – ({g.homeSeed}) {g.summary.home} {g.summary.homeScore}
                    {g.summary.overtime ? " OT" : ""}
                  </Text>
                </LinkRow>
              );
            })}
        </View>
      ))}
      {upcoming ? (
        <View style={{ marginTop: 4 }}>
          <Button label={`Watch your ${ROUND_NAMES[upcoming.round]} game`} onPress={() => router.push(`/game/${upcoming.summary.id}`)} theme={t} />
        </View>
      ) : null}
    </Card>
  );
}

function History({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const history = d.save?.dynasty.history ?? [];
  if (history.length === 0) return null;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <SectionTitle>Dynasty history</SectionTitle>
        </View>
        <Pressable onPress={() => router.push("/halloffame")} accessibilityRole="link" style={{ marginRight: 12 }}>
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Hall of Fame ›</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/trophies")} accessibilityRole="link">
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Trophy room ›</Text>
        </Pressable>
      </View>
      {[...history].reverse().map((h) => {
        const mine = h.top25.find((e) => e.team === data.userTeam);
        return (
          <View key={h.season} style={{ flexDirection: "row", paddingVertical: 3 }}>
            <Text style={{ width: 48, color: t.muted }}>{h.season}</Text>
            <Text style={{ flex: 1, color: t.text }}>
              Champion {h.champion}
              {h.champion === data.userTeam ? " ★" : ""}
            </Text>
            <Text style={{ color: t.muted }}>{mine ? `you: No. ${mine.rank}` : ""}</Text>
          </View>
        );
      })}
    </Card>
  );
}

/** The start screen: your save slots, and starting a new dynasty in a free one. */
function Saves() {
  const t = useTheme();
  const d = useDynasty();
  const [armed, setArmed] = useState<number | null>(null);
  const stateName = (abbr: string) => STATES.find(([, a]) => a === abbr)?.[0] ?? abbr;
  return (
    <Centered theme={t}>
      <Text style={{ fontSize: 28, fontWeight: "900", color: t.text }}>Football Dynasty</Text>
      <Text style={{ color: t.muted, textAlign: "center", marginVertical: 12, maxWidth: 320 }}>
        Fifty teams, one per state. Pick one, play the seasons, build a dynasty.
      </Text>
      <View style={{ width: "100%", maxWidth: 360, gap: 8, marginBottom: 16 }}>
        {d.slots.map((s) => (
          <Card key={s.slot} style={{ paddingVertical: 4 }}>
            <LinkRow label={`Continue save ${s.slot}`} onPress={() => d.openSlot(s.slot)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {s.team ? <Swatch abbr={s.team} size={14} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>{s.team ? stateName(s.team) : "New league"}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    Save {s.slot} · {s.season} season · {s.stage}
                  </Text>
                </View>
              </View>
            </LinkRow>
            <Pressable onPress={() => (armed === s.slot ? (d.deleteSlot(s.slot), setArmed(null)) : setArmed(s.slot))} accessibilityRole="button" style={{ paddingBottom: 6 }}>
              <Text style={{ color: armed === s.slot ? t.score : t.muted, fontSize: 12, fontWeight: armed === s.slot ? "700" : "400" }}>
                {armed === s.slot ? "Tap again to delete this save for good" : "Delete"}
              </Text>
            </Pressable>
          </Card>
        ))}
      </View>
      {d.canStartNew ? (
        <Button label="New dynasty" onPress={d.newDynasty} theme={t} primary />
      ) : (
        <Text style={{ color: t.muted, textAlign: "center", maxWidth: 300 }}>All save slots are full. Delete one to start another dynasty.</Text>
      )}
    </Centered>
  );
}

function DangerZone() {
  const t = useTheme();
  const d = useDynasty();
  const [armed, setArmed] = useState(false);
  return (
    <View style={{ alignItems: "center", marginTop: 8, gap: 14 }}>
      <Pressable onPress={d.closeDynasty} accessibilityRole="button">
        <Text style={{ color: t.accent, fontWeight: "600" }}>Switch dynasty</Text>
      </Pressable>
      <Pressable onPress={() => (armed ? d.deleteDynasty() : setArmed(true))} accessibilityRole="button">
        <Text style={{ color: armed ? t.score : t.muted, fontWeight: armed ? "700" : "400" }}>
          {armed ? "Tap again to delete this dynasty for good" : "Delete dynasty"}
        </Text>
      </Pressable>
    </View>
  );
}

function Report({ report }: { report: OffseasonReport }) {
  const t = useTheme();
  const d = useDynasty();
  const data = useLeagueMaybe();
  const router = useRouter();
  const next = data?.league.season ?? report.season + 1;
  const section = (title: string, rows: ReportPlayer[], empty: string) => (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? <Text style={{ color: t.muted }}>{empty}</Text> : null}
      {rows.map((p) => (
        <LinkRow key={p.id} label={p.name} onPress={() => (data?.playerById.has(p.id) ? router.push(`/player/${p.id}`) : undefined)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ width: 28, color: t.muted }}>{p.position}</Text>
            <Text style={{ flex: 1, color: t.text }} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={{ width: 26, textAlign: "right", color: t.text, fontWeight: "700" }}>{p.overall}</Text>
          </View>
          <Text style={{ color: t.muted, fontSize: 12, marginLeft: 36 }}>
            age {p.age} · {p.note}
          </Text>
        </LinkRow>
      ))}
    </Card>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>{report.season} offseason</Text>
      {(() => {
        const r = d.save?.office?.reviews.find((x) => x.season === report.season);
        return r ? (
          <Card>
            <SectionTitle>Season grade: {r.grade}</SectionTitle>
            {r.fired ? (
              <>
                <Text style={{ color: t.text }}>
                  Fired by {data?.league.teams[r.team ?? ""]?.state ?? "your old team"} after the season. {r.verdict}
                </Text>
                <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
                  A fresh start in {data?.league.teams[data.userTeam]?.state}: your new owner's trust starts at {d.save?.office?.trust}.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: t.text }}>{r.verdict}</Text>
                <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
                  {d.save?.office?.role === "gm" ? `Owner's trust ${r.trustChange >= 0 ? "+" : ""}${r.trustChange}, now ${d.save.office.trust}. ` : ""}Fan mood {r.fanChange >= 0 ? "+" : ""}
                  {r.fanChange}, now {d.save?.office?.fanMood}.
                </Text>
              </>
            )}
          </Card>
        ) : null;
      })()}
      {(() => {
        const cls = (d.save?.dynasty.hallOfFame ?? []).filter((m) => m.season === report.season);
        return cls.length > 0 ? (
          <Pressable onPress={() => router.push("/halloffame")} accessibilityRole="link">
            <Card style={{ borderColor: "#f5b83d", borderWidth: 1 }}>
              <SectionTitle>Hall of Fame class of {report.season}</SectionTitle>
              {cls.map((m) => (
                <Text key={m.id} style={{ color: t.text, paddingVertical: 2 }}>
                  <Text style={{ fontWeight: "800" }}>
                    {m.position} {m.name}
                  </Text>{" "}
                  ({Math.round(m.pct * 100)}%) · #{m.jersey ?? "?"} retired by {m.team}
                </Text>
              ))}
            </Card>
          </Pressable>
        ) : null;
      })()}
      <Card>
        <SectionTitle>The season</SectionTitle>
        <Text style={{ color: t.text }}>
          Champion: {report.champion} (over {report.runnerUp})
        </Text>
        <Text style={{ color: t.muted, marginTop: 4 }}>
          Your record: {report.record}
          {report.rank ? ` · final ranking No. ${report.rank}` : ""}
        </Text>
        {report.awards.map((a) => (
          <Text key={a.award} style={{ color: t.muted, marginTop: 2 }}>
            {a.award}: {a.name} ({a.position}, {a.team})
          </Text>
        ))}
        {report.coachOfTheYear ? <Text style={{ color: t.muted, marginTop: 2 }}>Coach of the Year: {report.coachOfTheYear}</Text> : null}
      </Card>
      <Card>
        <SectionTitle>Staff</SectionTitle>
        {report.staff.length === 0 ? <Text style={{ color: t.muted }}>No changes.</Text> : report.staff.map((line) => <Text key={line} style={{ color: t.text, paddingVertical: 2 }}>{line}</Text>)}
      </Card>
      {section("Draft class", report.draft, "No picks.")}
      {section("Re-signed", report.kept, "No one re-signed.")}
      {(report.offers ?? []).length > 0 ? section("Your free-agent offers", report.offers, "") : null}
      {section("New arrivals", report.arrived, "No one new.")}
      {section("Departures", report.departed, "No one left.")}
      {(() => {
        const spring = (d.save?.dynasty.springs ?? []).find((x) => x.season === next);
        const mine = spring?.breakouts.filter((b) => b.team === data?.userTeam) ?? [];
        return (
          <Card>
            <SectionTitle>{next} spring season</SectionTitle>
            {spring ? (
              <>
                <Text style={{ color: t.text }}>
                  Champions: <Text style={{ fontWeight: "800" }}>{spring.teams.find((x) => x.abbr === spring.champion)?.name}</Text>
                  {spring.mvp ? `. MVP: ${spring.mvp.position} ${spring.mvp.name} (${spring.mvp.team}).` : "."}
                </Text>
                <Text style={{ color: mine.length ? t.accent : t.muted, marginTop: 4 }}>
                  {mine.length ? `${mine.length} of your players broke out: ${mine.map((b) => `${b.position} ${b.name} (${b.before} → ${b.after})`).join(", ")}.` : "None of your players broke out this spring."}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <Button label="The spring season" onPress={() => router.push("/spring")} theme={t} small />
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: t.muted }}>Your practice-squad players play a short spring season in ten regional teams. Standouts break out and come back better.</Text>
                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <Button label="Play the spring season" onPress={d.playSpring} theme={t} small />
                </View>
              </>
            )}
          </Card>
        );
      })()}
      <Button label={`Start the ${next} season`} onPress={d.startNextSeason} theme={t} primary />
    </ScrollView>
  );
}

function Centered({ children, theme }: { children: ReactNode; theme: Theme }) {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: theme.bg }}>{children}</View>;
}

function Bar({ value, theme }: { value: number; theme: Theme }) {
  return (
    <View style={{ alignSelf: "stretch", height: 8, borderRadius: 4, backgroundColor: theme.border, marginTop: 8, maxWidth: 320, width: "100%" }}>
      <View style={{ width: `${Math.round(value * 100)}%`, height: 8, borderRadius: 4, backgroundColor: theme.accent }} />
    </View>
  );
}

function Button({ label, onPress, theme, primary, small }: { label: string; onPress: () => void; theme: Theme; primary?: boolean; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingHorizontal: small ? 12 : 16,
        height: small ? 34 : 44,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? theme.accent : theme.card,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: primary ? theme.onAccent : theme.text, fontWeight: "700", fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

function resultLine(r: { home: string; away: string; homeScore: number; awayScore: number; winner: string | null }, me: string): string {
  const home = r.home === me;
  const us = home ? r.homeScore : r.awayScore;
  const them = home ? r.awayScore : r.homeScore;
  const opp = home ? r.away : r.home;
  const wl = r.winner === me ? "W" : r.winner === null ? "T" : "L";
  return `${wl} ${us}-${them} ${home ? "vs" : "at"} ${opp}`;
}

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
