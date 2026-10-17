// Home: your dynasty's hub. Start a dynasty, pick your team, play the season
// week by week (watch your games), the playoffs round by round, then run the
// offseason and read what happened to your team.
import { useRouter } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  teamPlace,
  PLAYOFF_ROUNDS,
  STAGE_NAMES,
  postseasonStages,
  ROUND_NAMES,
  STATES,
  OWNER_GOALS,
  springOdds,
  teamOwner,
  backLabel,
  injuryLabel,
  injuryReport,
  tradeDeadline,
  IR_MIN_WEEKS,
  type TradeRecord,
  formatRecord,
  teamName,
  mood,
  teamAppeal,
  winPct,
  allLeanings,
} from "@dynasty/sim";
import { Card, Icon, LinkRow, LogoBadge, NavGroup, NavRow, SectionTitle, Stat, StatRow, Swatch, TeamBanner, type IconName } from "../../components/ui";
import { designedColors, teamColors, teamShort } from "../../field/colors";
import { OnlineHub } from "../../online/OnlineHub";
import { OffseasonStepper, type OffseasonStepKey } from "../../components/OffseasonStepper";
import { CutsScreen } from "../../screens/CutsScreen";
import { DraftScreen } from "../../screens/DraftScreen";
import { TeamSetupScreen } from "../../screens/TeamSetupScreen";
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
    case "opening":
      return <Centered theme={t}><ActivityIndicator color={t.accent} /></Centered>;
    case "start":
      return <Saves />;
    case "online":
      return data ? <OnlineHub /> : null;
    case "building":
      return (
        <Working icon="construct-outline" title="Building your league" body="Settling fifteen years of drafts, development and retirements so every roster has a history." progress={d.progress} />
      );
    case "offseason":
      return <Working icon="sync-outline" title="Running the offseason" body="Staff moves, retirements, player development, contracts, the draft and free agency." />;
    case "choose":
      return data ? <TeamSetupScreen data={data} /> : null;
    case "fired":
      return data && d.save?.fired ? <Fired data={data} /> : null;
    case "staff":
      return d.staffSeats ? (
        <Stepped step="staff">
          <StaffScreen overview={d.staffSeats} onConfirm={d.confirmStaff} />
        </Stepped>
      ) : null;
    case "hire":
      return d.staffOpenings ? (
        <Stepped step="hire">
          <HireScreen openings={d.staffOpenings} onConfirm={d.confirmHires} />
        </Stepped>
      ) : null;
    case "resign":
      return d.contractPlan ? (
        <Stepped step="resign">
          <ResignScreen plan={d.contractPlan} onDone={d.finishOffseason} />
        </Stepped>
      ) : null;
    case "draft":
      return d.draftTurn && data ? (
        <Stepped step="draft" note={`round ${d.draftTurn.round}, pick ${d.draftTurn.overall}`}>
          <DraftScreen turn={d.draftTurn} userTeam={data.userTeam} onPick={d.draftPick} onAuto={d.autoDraft} leanings={d.scouting ? allLeanings(d.scouting) : undefined} />
        </Stepped>
      ) : null;
    case "freeagency":
      return d.freeAgencyPlan && data ? (
        <Stepped step="freeagency">
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
        </Stepped>
      ) : null;
    case "cuts":
      return d.rosterPlan ? (
        <Stepped step="cuts">
          <CutsScreen plan={d.rosterPlan} onDone={d.finishCuts} />
        </Stepped>
      ) : null;
    case "report":
      return d.save?.report ? <Report report={d.save.report} /> : null;
    default:
      return data ? <SeasonHub data={data} /> : null;
  }
}

/** An offseason screen under the stepper that shows where you are. */
function Stepped({ step, note, children }: { step: OffseasonStepKey; note?: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <OffseasonStepper step={step} note={note} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function SeasonHub({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, weeksPlayed, standings, rankings, playoffs } = data;
  const team = league.teams[userTeam]!;
  const rec = data.records.get(userTeam);
  const div = standings.find((x) => x.teams.some((r) => r.team === userTeam));
  const place = div ? div.teams.findIndex((r) => r.team === userTeam) + 1 : 0;
  const rank = rankings.find((e) => e.team === userTeam)?.rank;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Swatch abbr={userTeam} size={18} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.text }}>{teamName(team)}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {league.season} · {rec ? formatRecord(rec) : "0-0"}
            {div && weeksPlayed > 0 ? ` · ${ordinal(place)} in ${div.division}` : ""}
            {rank && rank <= 25 && weeksPlayed > 0 ? ` · No. ${rank}` : ""}
          </Text>
        </View>
      </View>

      <NextUp data={data} />
      <NeedsYou data={data} />
      <LastWeek data={data} />
    </ScrollView>
  );
}

/** The one thing to do next: this week's game, the next playoff round, or the offseason. */
function NextUp({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { league, schedule, userTeam, weeksPlayed, playoffs, playoffRoundsShown, rankings } = data;
  const nextWeek = weeksPlayed + 1;
  const upcoming = schedule.games.find((g) => g.week === nextWeek && (g.home === userTeam || g.away === userTeam));
  const rankOf = (abbr: string) => rankings.find((e) => e.team === abbr)?.rank;

  if (d.phase === "simming") {
    return (
      <Card style={{ gap: 8 }}>
        <SectionTitle>Simulating</SectionTitle>
        <Bar value={d.progress} theme={t} />
      </Card>
    );
  }
  if (d.phase === "playoffs") {
    const stage = postseasonStages(league)[playoffRoundsShown]!;
    return (
      <Card style={{ gap: 10, borderColor: t.accent, borderWidth: 1.5 }}>
        <SectionTitle>{stage === "titles" ? "Postseason" : "Playoffs"}</SectionTitle>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{STAGE_NAMES[stage]}</Text>
        {stage === "titles" ? <Text style={{ color: t.muted }}>Each division&apos;s top two play for the title and its automatic bid; then the field of 16 is set.</Text> : null}
        <Button label={stage === "titles" ? "Play championship week" : `Play the ${STAGE_NAMES[stage]}`} onPress={d.playPlayoffRound} theme={t} primary />
        <PlayoffDetails data={data} />
      </Card>
    );
  }
  if (d.phase === "complete" && playoffs) {
    const champ = playoffs.champion;
    return (
      <Card style={{ gap: 8, borderColor: "#f5b83d", borderWidth: 1.5 }}>
        <SectionTitle>{league.season} champions</SectionTitle>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Swatch abbr={champ} size={22} />
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: t.text }}>{teamName(league.teams[champ]!)}</Text>
        </View>
        <Text style={{ color: t.muted }}>{champ === userTeam ? "That's you. Champions!" : `They beat ${teamName(league.teams[playoffs.runnerUp]!)} in the final.`}</Text>
        <Button label="Start the offseason" onPress={d.startOffseason} theme={t} primary />
        <PlayoffDetails data={data} folded />
      </Card>
    );
  }
  if (d.phase !== "season") return null;

  const side = (abbr: string) => {
    const r = data.records.get(abbr);
    const n = rankOf(abbr);
    return (
      <View style={{ flex: 1, alignItems: "center", gap: 4 }}>
        <Swatch abbr={abbr} size={40} />
        <Text style={{ color: t.text, fontWeight: abbr === userTeam ? "800" : "600", fontSize: 15, textAlign: "center" }} numberOfLines={1}>
          {n && n <= 25 && weeksPlayed > 0 ? <Text style={{ color: t.muted, fontSize: 12 }}>{n} </Text> : null}
          {league.teams[abbr]!.nickname}
        </Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {teamPlace(league.teams[abbr]!)} · {r ? formatRecord(r) : "0-0"}
        </Text>
      </View>
    );
  };
  return (
    <Card style={{ gap: 12, borderColor: t.accent, borderWidth: 1.5 }}>
      <SectionTitle>
        Week {nextWeek} of {schedule.weeks}
      </SectionTitle>
      {upcoming ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {side(upcoming.away)}
          <Text style={{ color: t.muted, fontWeight: "700", paddingHorizontal: 6 }}>at</Text>
          {side(upcoming.home)}
        </View>
      ) : (
        <Text style={{ color: t.text, fontSize: 17, fontWeight: "700" }}>Bye week: your team rests.</Text>
      )}
      {upcoming ? (
        <Button label={d.coaching?.game === upcoming.id ? "Keep coaching your game" : "Coach your game"} onPress={() => router.push(`/coach/${upcoming.id}`)} theme={t} primary />
      ) : (
        <Button label={`Sim week ${nextWeek}`} onPress={() => d.playWeek()} theme={t} primary />
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {upcoming ? (
          <View style={{ flex: 1 }}>
            <Button label="Watch" onPress={() => router.push(`/game/${upcoming.id}`)} theme={t} small />
          </View>
        ) : null}
        {upcoming ? (
          <View style={{ flex: 1 }}>
            <Button label={`Sim week ${nextWeek}`} onPress={() => d.playWeek()} theme={t} small />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button label="To playoffs" onPress={d.playRegularSeason} theme={t} small />
        </View>
      </View>
      {upcoming && d.coaching?.game === upcoming.id ? (
        <Text style={{ color: t.muted, fontSize: 12 }}>Simming the week keeps your calls so far; your coaches finish the game.</Text>
      ) : null}
    </Card>
  );
}

/** Everything waiting on you, in one list (or "all caught up"). */
function NeedsYou({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { league, userTeam, weeksPlayed } = data;
  const team = league.teams[userTeam]!;
  const items: Array<{ key: string; icon: IconName; title: string; detail: string; go: string }> = [];
  const office = d.save?.office;
  if (d.press && office?.press[d.press.week] === undefined) {
    items.push({ key: "press", icon: "mic-outline", title: "Press conference", detail: `"${d.press.question}"`, go: "/press" });
  }
  if (d.canMakeMoves) {
    const long = team.roster.filter((p) => (p.injury?.weeks ?? 0) >= IR_MIN_WEEKS);
    if (long.length) items.push({ key: "ir", icon: "medkit-outline", title: `${long.length} could go on injured reserve`, detail: long.map((p) => `${p.position} ${p.lastName}`).join(", "), go: "/injuries" });
    if (team.roster.length < 72) items.push({ key: "sign", icon: "person-add-outline", title: `${72 - team.roster.length} open roster spot${team.roster.length === 71 ? "" : "s"}`, detail: "Sign a free agent", go: "/freeagents" });
  }
  if (d.phase === "season" && d.scouting && d.scoutPlan.length === 0) {
    items.push({ key: "scout", icon: "search-outline", title: "Scouting points to assign", detail: `${SCOUT_POINTS} this week; your scouts choose if you don't`, go: "/scouting" });
  }
  if (d.canTrade && d.tradeWindow?.week !== 0 && tradeDeadline(data.league) - weeksPlayed === 1) {
    items.push({ key: "deadline", icon: "swap-horizontal-outline", title: "Last week to trade", detail: `Trading closes after week ${tradeDeadline(data.league)}`, go: "/trade" });
  }
  if (d.canTrade && d.tradeWindow?.week === 0) {
    items.push({ key: "draftweek", icon: "swap-horizontal-outline", title: "Draft week: trades are open", detail: "Deal players and picks before the offseason", go: "/trade" });
  }
  if (office?.role === "gm" && office.trust < 35) {
    items.push({ key: "owner", icon: "warning-outline", title: "Your owner is losing patience", detail: `Trust ${office.trust}. Win, or say the right things.`, go: "/owner" });
  }
  return (
    <NavGroup title={items.length ? `Needs you · ${items.length}` : "Needs you"}>
      {items.length === 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
          <Icon name="checkmark-circle-outline" color={t.accent} />
          <Text style={{ color: t.muted }}>You're all caught up.</Text>
        </View>
      ) : (
        items.map((x, i) => <NavRow key={x.key} icon={x.icon} title={x.title} detail={x.detail} onPress={() => router.push(x.go as never)} last={i === items.length - 1} />)
      )}
    </NavGroup>
  );
}

/** Your last game and the week's biggest stories. */
function LastWeek({ data }: { data: LeagueData }) {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { results, userTeam } = data;
  const last = [...results].reverse().find((r) => r.home === userTeam || r.away === userTeam);
  const news = d.save?.news ?? [];
  const week = news.length ? Math.max(...news.map((s) => s.week)) : 0;
  const top = news
    .filter((s) => s.week === week && !s.local)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3);
  if (!last && top.length === 0) return null;
  return (
    <NavGroup title={week > data.schedule.weeks ? (STAGE_NAMES[postseasonStages(data.league)[week - data.schedule.weeks - 1] ?? "championship"]) : week ? `Week ${week}` : "Last week"}>
      {last ? <NavRow icon="play-circle-outline" title={resultLine(last, userTeam)} detail="Watch the replay" onPress={() => router.push(`/game/${last.id}`)} last={top.length === 0} /> : null}
      {top.map((s, i) => (
        <NavRow key={s.id} icon="newspaper-outline" title={s.headline} onPress={() => router.push("/news")} last={i === top.length - 1} />
      ))}
    </NavGroup>
  );
}

/** Pick the spring champion before it's played: odds from each spring team's strength. */
function SpringPick({ season }: { season: number }) {
  const t = useTheme();
  const d = useDynasty();
  const data = useLeagueMaybe();
  const [stake, setStake] = useState(50);
  const [message, setMessage] = useState<string | null>(null);
  const odds = useMemo(() => (data ? springOdds(data.league, season).sort((a, b) => a.payout - b.payout) : []), [data, season]);
  const bet = (d.save?.picks?.springBets ?? []).find((b) => b.season === season);
  if (bet) return <Text style={{ color: t.text, marginTop: 8 }}>Your spring pick: the {bet.name}, {bet.stake} points at {bet.payout}x.</Text>;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: t.text, fontWeight: "700" }}>Pick the spring champion ({d.picks.balance.toLocaleString()} points)</Text>
      <View style={{ flexDirection: "row", gap: 6, marginVertical: 6 }}>
        {[25, 50, 100].map((n) => (
          <Pressable key={n} onPress={() => setStake(n)} accessibilityRole="button" style={{ paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: "center", borderWidth: 1, borderColor: stake === n ? t.accent : t.border }}>
            <Text style={{ color: stake === n ? t.accent : t.muted, fontWeight: "700", fontSize: 12 }}>{n} pts</Text>
          </Pressable>
        ))}
      </View>
      {odds.map((o) => (
        <Pressable key={o.abbr} onPress={() => setMessage(d.betSpring(o.abbr, o.name, stake, o.payout).join(" ") || null)} accessibilityRole="button" style={{ flexDirection: "row", paddingVertical: 4 }}>
          <Text style={{ flex: 1, color: t.text }}>{o.name}</Text>
          <Text style={{ color: t.accent, fontWeight: "700" }}>{o.payout}x</Text>
        </Pressable>
      ))}
      {message ? <Text style={{ color: t.score }}>{message}</Text> : null}
    </View>
  );
}

/** The owner (or the board): their goal, trust in you, fan mood, and last season's verdict. */
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
              <Swatch abbr={abbr} size={28} />
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

/** Your playoff run and the bracket, inside the playoff and champion cards (the bracket starts folded away once it's over). */
function PlayoffDetails({ data, folded }: { data: LeagueData; folded?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const [view, setView] = useState<"none" | "latest" | "all">(folded ? "none" : "latest");
  const { playoffs, playoffRoundsShown, userTeam } = data;
  if (!playoffs) return null;
  const made = playoffs.seeds.find((s) => s.team === userTeam);
  // Championship week first (format 2), then the rounds.
  const stages = postseasonStages(data.league);
  const titlesFirst = stages[0] === "titles";
  const titlesShown = titlesFirst && playoffRoundsShown > 0;
  const nextStage = stages[playoffRoundsShown];
  const nextRound = nextStage && nextStage !== "titles" ? nextStage : undefined;
  const played = stages.slice(0, playoffRoundsShown).filter((x): x is (typeof PLAYOFF_ROUNDS)[number] => x !== "titles");
  const myTitle = playoffs.titleGames?.find((g) => g.first === userTeam || g.second === userTeam);
  // Your next playoff game, if you're still alive and it's been set.
  const upcoming = nextRound ? playoffs.games.find((g) => g.round === nextRound && (g.summary.home === userTeam || g.summary.away === userTeam)) : undefined;
  // Your playoff games so far, and the one that ended your run (if one has).
  const mine = playoffs.games.filter((g) => played.includes(g.round) && (g.summary.home === userTeam || g.summary.away === userTeam));
  const scoreOf = (g: (typeof mine)[number], team: string) => (g.summary.home === team ? g.summary.homeScore : g.summary.awayScore);
  const lost = mine.find((g) => {
    const opp = g.summary.home === userTeam ? g.summary.away : g.summary.home;
    return scoreOf(g, opp) > scoreOf(g, userTeam);
  });
  const champion = made && !lost && mine.some((g) => g.round === PLAYOFF_ROUNDS[PLAYOFF_ROUNDS.length - 1]);
  let status = "You missed the playoffs this year.";
  if (titlesFirst && !titlesShown) status = myTitle ? `You play for the ${myTitle.division} title, ${myTitle.first === userTeam ? `at home against ${teamShort(myTitle.second)}` : `at ${teamShort(myTitle.first)}`}.` : "Championship week first: each division's top two play for the title.";
  else if (champion) status = "Champions! You won it all.";
  else if (lost) {
    const opp = lost.summary.home === userTeam ? lost.summary.away : lost.summary.home;
    status = `Out in the ${ROUND_NAMES[lost.round]}: lost ${scoreOf(lost, opp)}-${scoreOf(lost, userTeam)} to ${opp}.`;
  } else if (made) status = `You're in as the No. ${made.seed} seed (${made.bid === "division_winner" ? "division champions" : "at-large"}).`;
  // Only the latest round unless you ask for the whole bracket.
  const shown = view === "all" ? played : view === "latest" ? played.slice(-1) : [];
  const toggle =
    view === "all"
      ? { label: folded ? "Hide the bracket" : "Show the latest round only", next: folded ? ("none" as const) : ("latest" as const) }
      : view === "none" || played.length > 1
        ? { label: view === "none" ? "See the bracket" : `Show all ${played.length} rounds`, next: "all" as const }
        : null;
  return (
    <View>
      {!(folded && champion) ? <Text style={{ color: t.muted, marginBottom: 8 }}>{status}</Text> : null}
      {titlesShown && playoffs.titleGames && (view === "all" || (view === "latest" && played.length === 0)) ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: t.text, fontWeight: "700", marginBottom: 2 }}>Championship Week</Text>
          {playoffs.titleGames.map((g) => {
            const isMine = g.first === userTeam || g.second === userTeam;
            return (
              <LinkRow key={g.summary.id} label={`${g.division} title, watch`} onPress={() => router.push(`/game/${g.summary.id}`)}>
                <Text style={{ color: t.text, fontWeight: isMine ? "800" : "400", fontVariant: ["tabular-nums"] }}>
                  {g.division}: {teamShort(g.summary.away)} {g.summary.awayScore} – {teamShort(g.summary.home)} {g.summary.homeScore}
                  {g.summary.overtime ? " OT" : ""}
                </Text>
              </LinkRow>
            );
          })}
        </View>
      ) : null}
      {titlesFirst && !titlesShown && myTitle ? (
        <View style={{ marginBottom: 8 }}>
          <Button label={`Watch your ${myTitle.division} title game`} onPress={() => router.push(`/game/${myTitle.summary.id}`)} theme={t} />
        </View>
      ) : null}
      {shown.map((round) => (
        <View key={round} style={{ marginBottom: 8 }}>
          <Text style={{ color: t.text, fontWeight: "700", marginBottom: 2 }}>{ROUND_NAMES[round]}</Text>
          {playoffs.games
            .filter((g) => g.round === round)
            .map((g) => {
              const isMine = g.summary.home === userTeam || g.summary.away === userTeam;
              return (
                <LinkRow key={g.summary.id} label={`${g.summary.away} at ${g.summary.home}, watch`} onPress={() => router.push(`/game/${g.summary.id}`)}>
                  <Text style={{ color: t.text, fontWeight: isMine ? "800" : "400", fontVariant: ["tabular-nums"] }}>
                    ({g.awaySeed}) {g.summary.away} {g.summary.awayScore} – ({g.homeSeed}) {g.summary.home} {g.summary.homeScore}
                    {g.summary.overtime ? " OT" : ""}
                  </Text>
                </LinkRow>
              );
            })}
        </View>
      ))}
      {toggle && played.length > 0 ? (
        <Pressable onPress={() => setView(toggle.next)} accessibilityRole="button" style={{ paddingVertical: 6 }}>
          <Text style={{ color: t.accent, fontWeight: "700" }}>{toggle.label}</Text>
        </Pressable>
      ) : null}
      {upcoming ? (
        <View style={{ marginTop: 4 }}>
          <Button label={`Watch your ${ROUND_NAMES[upcoming.round]} game`} onPress={() => router.push(`/game/${upcoming.summary.id}`)} theme={t} />
        </View>
      ) : null}
    </View>
  );
}

/** The start screen: your save slots, and starting a new dynasty in a free one. */
function Saves() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const [armed, setArmed] = useState<number | null>(null);
  const stateName = (abbr: string) => STATES.find(([, a]) => a === abbr)?.[0] ?? abbr;
  return (
    <Centered theme={t}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon name="american-football" size={38} color={t.onAccent} />
      </View>
      <Text style={{ fontSize: 30, fontWeight: "900", color: t.text }}>Football Dynasty</Text>
      <Text style={{ color: t.muted, textAlign: "center", marginVertical: 12, maxWidth: 320 }}>
        Ten regions, each with its own kind of talent. Build a program in yours, play the seasons, build a dynasty.
      </Text>
      <View style={{ width: "100%", maxWidth: 360, gap: 8, marginBottom: 16 }}>
        {d.slots.map((s) => (
          <Card key={s.slot} style={{ paddingVertical: 4 }}>
            <LinkRow label={`Continue save ${s.slot}`} onPress={() => d.openSlot(s.slot)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {s.team && s.logo ? (
                  <LogoBadge logo={s.logo} primary={(s.colors ?? designedColors(s.team)).primary} trim={(s.colors ?? designedColors(s.team)).trim} size={38} />
                ) : s.team ? (
                  <Swatch abbr={s.team} size={38} />
                ) : (
                  <Icon name="add-circle-outline" size={38} color={t.muted} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>{s.team ? (s.name ?? stateName(s.team)) : "New league"}</Text>
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
      <View style={{ width: "100%", maxWidth: 360, gap: 10 }}>
        {d.canStartNew ? (
          <Button label="New dynasty" onPress={d.newDynasty} theme={t} primary />
        ) : (
          <Text style={{ color: t.muted, textAlign: "center" }}>All save slots are full. Delete one to start another dynasty.</Text>
        )}
        <Button label="Online leagues with friends" onPress={() => router.push("/online")} theme={t} />
      </View>
    </Centered>
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
      {data ? (
        <TeamBanner abbr={data.userTeam} title={`${report.season} in review`} subtitle={`Champion: ${report.champion}, over ${report.runnerUp}`}>
          <StatRow>
            <Stat label="Record" value={report.record} onDark={teamColors(data.userTeam).onPrimary} />
            <Stat label="Final rank" value={report.rank ? `No. ${report.rank}` : "-"} onDark={teamColors(data.userTeam).onPrimary} />
            <Stat label="Grade" value={d.save?.office?.reviews.find((x) => x.season === report.season)?.grade ?? "-"} onDark={teamColors(data.userTeam).onPrimary} />
          </StatRow>
        </TeamBanner>
      ) : (
        <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>{report.season} offseason</Text>
      )}
      {(() => {
        const r = d.save?.office?.reviews.find((x) => x.season === report.season);
        return r ? (
          <Card>
            <SectionTitle>Season grade: {r.grade}</SectionTitle>
            {r.fired ? (
              <>
                <Text style={{ color: t.text }}>
                  Fired by {(data?.league.teams[r.team ?? ""] ? teamPlace(data.league.teams[r.team ?? ""]!) : "your old team")} after the season. {r.verdict}
                </Text>
                <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
                  A fresh start in {data?.league.teams[data.userTeam] ? teamPlace(data.league.teams[data.userTeam]!) : ""}: your new owner's trust starts at {d.save?.office?.trust}.
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
                  ({Math.round(m.pct * 100)}%) · #{m.jersey ?? "?"} retired by {teamShort(m.team)}
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
                {(() => {
                  const bet = (d.save?.picks?.springBets ?? []).find((b) => b.season === next);
                  return bet ? (
                    <Text style={{ color: bet.won ? t.accent : t.muted, marginTop: 4 }}>
                      Your pick, the {bet.name}: {bet.won ? `won ${Math.round(bet.stake * bet.payout).toLocaleString()} points!` : `lost ${bet.stake} points.`}
                    </Text>
                  ) : null;
                })()}
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
                <SpringPick season={next} />
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

/** A long job in progress: what's happening, and how far along when we know. */
function Working({ icon, title, body, progress }: { icon: IconName; title: string; body: string; progress?: number }) {
  const t = useTheme();
  return (
    <Centered theme={t}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Icon name={icon} size={30} color={t.accent} />
      </View>
      <Text style={{ fontSize: 19, fontWeight: "800", color: t.text }}>{title}</Text>
      <Text style={{ color: t.muted, marginTop: 8, marginBottom: 12, textAlign: "center", maxWidth: 300 }}>{body}</Text>
      {progress === undefined ? <ActivityIndicator color={t.accent} /> : <Bar value={progress} theme={t} />}
      {progress !== undefined ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>{Math.round(progress * 100)}%</Text> : null}
    </Centered>
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
