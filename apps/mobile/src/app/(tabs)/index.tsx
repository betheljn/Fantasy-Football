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
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Choose your team</Text>
      <Text style={{ color: t.muted, marginBottom: 8 }}>Strongest rosters first. A weak team is a longer road — and a better story.</Text>
      {teams.map(({ team, ovr }) => (
        <Card key={team.abbr} style={{ paddingVertical: 4 }}>
          <LinkRow label={`Choose ${teamName(team)}`} onPress={() => d.chooseTeam(team.abbr)}>
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
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Button label="Team page" onPress={() => router.push(`/team/${userTeam}`)} theme={t} small />
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

      {d.phase === "season" ? <ScoutingCard data={data} /> : null}

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
  const history = d.save?.dynasty.history ?? [];
  if (history.length === 0) return null;
  return (
    <Card>
      <SectionTitle>Dynasty history</SectionTitle>
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
