// Coach your own game: the field plays out each snap, then the call bar
// asks for the next call (offense, defense, a timeout, or the try after a
// touchdown). The coaches' call is always picked to start, so one tap runs
// it; change the play, personnel or coverage first if you like. In the play
// duel (rules 4) the call bar is a call sheet: a card per concept, and after
// each snap the reveal of both calls. The sim decides every outcome; this
// screen only passes your calls in.
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
  COVERAGES,
  DEFENSE_CONCEPTS,
  DEFENSE_CONCEPT_INFO,
  OFFENSE_CONCEPTS,
  OFFENSE_CONCEPT_INFO,
  revealCall,
  filmStudy,
  type DefenseConcept,
  type OffenseConcept,
  formatClock,
  formatDownDistance,
  halfSecondsLeft,
  lookupFor,
  pregameEdge,
  winChances,
  type CoachCall,
  type CoachedGame,
  type Coverage,
  type DefensePackage,
  type GamePrompt,
  type OffenseSet,
  type Personnel,
  type PlayCall,
  type Team,
} from "@dynasty/sim";
import { Chips } from "../components/ui";
import { FieldView } from "../field/FieldView";
import { TvFieldView } from "../field/TvFieldView";
import { teamColors, uniform } from "../field/colors";
import { usePlayback } from "../field/usePlayback";
import { prepareGame, type PreparedPlay } from "../game/playback";
import { useTheme, type Theme } from "../theme";
import { Scoreboard, WinBar } from "./game/parts";

const PLAY_NAMES: Record<PlayCall, string> = { run: "Run", pass: "Pass", punt: "Punt", field_goal: "Field goal", kneel: "Kneel", spike: "Spike" };
const PERSONNEL_NAMES: Record<Personnel, string> = { "10": "4 WR", "11": "3 WR", "12": "2 TE", "13": "3 TE", "21": "2 RB" };
const SET_NAMES: Record<OffenseSet, string> = { shotgun: "Gun", under_center: "Under center" };
const PACKAGE_NAMES: Record<DefensePackage, string> = { base: "Base", nickel: "Nickel", dime: "Dime", goal_line: "Goal line" };
const BLITZ_NAMES = ["No blitz", "+1 rusher", "+2 rushers"];

interface Props {
  game: CoachedGame;
  home: Team;
  away: Team;
  /** "Week 5". */
  title: string;
  /** Called after each call (to save the calls so far now and then). */
  onCall: () => void;
  /** At the final whistle. */
  finish: { label: string; onPress: () => void };
  /** Your team (default: the coached team). In a duel you may be either side. */
  team?: string;
  /** A duel: the game isn't over, the next call is your friend's ("Waiting on Sam's call"). */
  waiting?: string | null;
  /** A duel, while waiting: the snap at hand. */
  waitingAt?: { situation: GamePrompt["situation"]; offense: string; defense: string } | null;
  /** A duel: hand your calls to your coaches (the server does it). */
  onHand?: (until: "drive" | "half" | "game") => void;
}

export function CoachView({ game, home, away, title, onCall, finish, team, waiting, waitingAt, onHand }: Props) {
  const t = useTheme();
  const s = styles(t);
  // The game object changes in place; this counts the calls so the screen redraws.
  const [, setTick] = useState(0);
  const [camera, setCamera] = useState<"top" | "tv">("top");
  const who = useMemo(() => lookupFor(home, away), [home, away]);
  const cache = useRef(new Map<number, PreparedPlay | null>());
  const sofar = game.sofar;
  const plays = useMemo(() => prepareGame(sofar, who, cache.current), [sofar, who]);
  const edge = useMemo(() => pregameEdge(home, away), [home, away]);
  // Mid-game, the latest play looks on to the coming snap (who has the ball, and where).
  const prompt = game.prompt;
  const wp = useMemo(() => {
    if (!prompt) return waitingAt ? winChances(sofar, edge, { team: waitingAt.offense, yardline: waitingAt.situation.yardline }) : winChances(sofar, edge);
    const last = sofar.plays.at(-1)?.event;
    const next =
      prompt.kind === "offense" || prompt.kind === "defense"
        ? { team: offenseOf(prompt), yardline: prompt.situation.yardline }
        : prompt.kind === "try"
          ? { team: prompt.team, yardline: 25 }
          : { team: last?.offense ?? prompt.team, yardline: prompt.situation.yardline };
    return winChances(sofar, edge, next);
  }, [sofar, edge, prompt, waitingAt]);
  const pb = usePlayback(plays, true);
  const play = pb.play;
  const over = !game.prompt && !waiting;
  // The field may still be catching up to the game: show the score as of the play on it.
  const caughtUp = !play || (pb.pos === plays.length - 1 && pb.done);
  const revealed = !play ? -1 : caughtUp ? sofar.plays.length - 1 : pb.done ? play.index : play.index - 1;
  const score = revealed < 0 ? { [home.abbr]: 0, [away.abbr]: 0 } : sofar.plays[revealed]!.score;
  const chance = revealed < 0 ? wp.pregame : (wp.after[revealed] ?? wp.pregame);

  const answer = (call?: CoachCall) => {
    game.answer(call);
    setTick((n) => n + 1);
    onCall();
  };
  const hand = (what: "drive" | "half" | "game") => {
    if (onHand) return onHand(what);
    if (what === "drive") game.autoDrive();
    else if (what === "half") game.autoHalf();
    else while (game.prompt) game.answer();
    setTick((n) => n + 1);
    onCall();
  };

  const { width: winW, height: winH } = useWindowDimensions();
  const fieldW = Math.min(winW - 32, 480);
  const fieldH = Math.round(Math.max(170, Math.min(fieldW * 0.9, winH * 0.26)));
  const endZone = (abbr: string) => {
    const team = abbr === home.abbr ? home : away;
    const c = teamColors(abbr);
    return { abbr, name: team.nickname.toUpperCase(), color: c.primary, trim: c.trim };
  };
  const leftOwner = play ? (play.direction === 1 ? play.offense : play.defense) : home.abbr;
  const rightOwner = play ? (play.direction === 1 ? play.defense : play.offense) : away.abbr;
  const p = game.prompt;

  return (
    <View style={s.screen}>
      <Scoreboard
        game={sofar}
        score={over && caughtUp ? game.result!.score : score}
        possession={over && caughtUp ? null : caughtUp && p ? offenseOf(p) : caughtUp && waitingAt ? waitingAt.offense : (play?.offense ?? null)}
        status={over && caughtUp ? `Final${game.result!.overtime ? " OT" : ""}` : caughtUp && p ? clockLine(p) : caughtUp && waitingAt ? clockOf(waitingAt.situation) : play ? play.clock : title}
        sub={over && caughtUp ? title : caughtUp && p ? downLine(p) : caughtUp && waitingAt ? formatDownDistance(waitingAt.situation, waitingAt.offense, waitingAt.defense) : play?.situation || " "}
      />
      <WinBar game={sofar} home={chance} />

      <View style={s.fieldWrap}>
        {play ? (
          camera === "tv" ? (
            <TvFieldView
              play={play}
              time={pb.time}
              width={fieldW}
              height={fieldH}
              offense={uniform(play.offense, play.offense === home.abbr)}
              defense={uniform(play.defense, play.defense === home.abbr)}
              endZones={{ left: endZone(leftOwner), right: endZone(rightOwner) }}
              colorsOf={teamColors}
            />
          ) : (
            <FieldView
              play={play}
              time={pb.time}
              width={fieldW}
              height={fieldH}
              offense={uniform(play.offense, play.offense === home.abbr)}
              defense={uniform(play.defense, play.defense === home.abbr)}
              endZones={{ left: endZone(leftOwner), right: endZone(rightOwner) }}
              midfield={{ abbr: home.abbr, color: teamColors(home.abbr).primary, trim: teamColors(home.abbr).trim }}
              colorsOf={teamColors}
            />
          )
        ) : (
          <View style={[s.kickoff, { width: fieldW, height: fieldH }]}>
            <Text style={s.kickoffText}>Kickoff. Your first call is below.</Text>
          </View>
        )}
      </View>

      <Text style={s.caption} numberOfLines={2}>
        {play ? (pb.done ? play.caption : "…") : ""}
      </Text>
      {play && pb.done ? <Reveal event={sofar.plays[play.index]?.event} team={team ?? coachedTeam(game)} theme={t} /> : null}

      <View style={s.controls}>
        <Small label={`${pb.speed}×`} onPress={pb.cycleSpeed} theme={t} />
        <Small label={camera === "tv" ? "Top view" : "TV view"} onPress={() => setCamera(camera === "tv" ? "top" : "tv")} theme={t} />
      </View>

      <ScrollView style={s.bar} contentContainerStyle={{ padding: 12, gap: 10 }}>
        {waiting && caughtUp ? (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 16 }}>
            <Text style={s.head}>{waiting}</Text>
            <Text style={s.coach}>Neither of you sees the other's call until the snap.</Text>
            {onHand ? <Small label="Coaches: the rest of the game" onPress={() => hand("game")} theme={t} /> : null}
          </View>
        ) : (p || waiting) && !caughtUp ? (
          // The next call waits for the field, so it doesn't give the play away.
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
            <Text style={s.coach}>The play's on…</Text>
            <Small label="Skip to the next call" onPress={pb.toEnd} theme={t} />
          </View>
        ) : p ? (
          <>
            <FilmLines prompt={p} home={home} away={away} theme={t} />
            <CallBar key={`${p.sofar.plays.length}:${game.calls.length}`} prompt={p} onAnswer={answer} theme={t} />
            <View style={s.handoff}>
              <Small label="Coaches: this drive" onPress={() => hand("drive")} theme={t} />
              <Small label="This half" onPress={() => hand("half")} theme={t} />
              <Small label="Finish it" onPress={() => hand("game")} theme={t} />
            </View>
          </>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={s.final}>
              {caughtUp ? `Final: ${away.abbr} ${game.result!.score[away.abbr]}, ${home.abbr} ${game.result!.score[home.abbr]}` : "That's the game. Watch it play out, or skip ahead."}
            </Text>
            {!caughtUp ? (
              <View style={{ alignItems: "center" }}>
                <Small label="Skip to the final" onPress={pb.toEnd} theme={t} />
              </View>
            ) : null}
            <Big label={finish.label} onPress={finish.onPress} theme={t} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Film study (the owner's analytics upgrade): one line with the best read
 * (this game's film once there is some, else their playbook); tap for all of it.
 */
function FilmLines({ prompt: p, home, away, theme: t }: { prompt: GamePrompt; home: Team; away: Team; theme: Theme }) {
  const [open, setOpen] = useState(false);
  if ((p.kind !== "offense" && p.kind !== "defense") || !duelOn(p)) return null;
  const you = p.team === home.abbr ? home : away;
  const them = p.team === home.abbr ? away : home;
  const look = p.kind === "offense" ? { personnel: p.formation.personnel, set: p.formation.set } : p.offense;
  const f = filmStudy(you.upgrades?.analytics ?? 0, you, them, p.kind, p.situation, look, p.sofar.plays);
  if (!f) return null;
  const line = (xs: ReadonlyArray<{ label: string; share: number }>) => xs.slice(0, 3).map((x) => `${x.label} ${Math.round(x.share * 100)}%`).join(", ");
  const lines = [
    `Their playbook: ${line(f.playbook)}`,
    ...(f.film ? [f.film.snaps ? `This game (${f.film.snaps}): ${line(f.film.calls)}` : "This game: nothing on film here yet"] : []),
    ...(f.self?.snaps ? [`You, as they see you: ${line(f.self.calls)}`] : []),
  ];
  const best = f.film?.snaps ? lines[1]! : lines[0]!;
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={`Film study, ${f.situation}`} accessibilityHint={open ? "Show less" : "Show all of the film"} style={{ paddingVertical: 2 }}>
      <Text style={{ color: t.text, fontSize: 12 }} numberOfLines={open ? undefined : 1}>
        <Text style={{ color: t.accent, fontWeight: "800" }}>{`Film · ${f.situation}: `}</Text>
        {open ? lines.join("\n") : best}
        {!open && lines.length > 1 ? <Text style={{ color: t.muted }}> ▸</Text> : null}
      </Text>
    </Pressable>
  );
}

/** The team being coached. */
function coachedTeam(game: CoachedGame): string {
  return game.prompt?.team ?? game.result?.coached?.team ?? game.sofar.coached?.team ?? "";
}

/** After the snap: both calls, and whether yours won. */
function Reveal({ event, team, theme: t }: { event: GamePrompt["sofar"]["plays"][number]["event"] | undefined; team: string; theme: Theme }) {
  const r = event ? revealCall(event) : null;
  if (!r || !event) return null;
  const onOffense = event.offense === team;
  const mine = onOffense ? OFFENSE_CONCEPT_INFO[r.offense].label : DEFENSE_CONCEPT_INFO[r.defense].label;
  const theirs = onOffense ? DEFENSE_CONCEPT_INFO[r.defense].label : OFFENSE_CONCEPT_INFO[r.offense].label;
  const won = r.winner === "even" ? null : (r.winner === "offense") === onOffense;
  const color = won === null ? t.muted : won ? "#2e9d57" : "#d1453b";
  return (
    <View style={{ marginHorizontal: 16, marginTop: 4, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: color }} accessibilityLabel={`Your call ${mine}, theirs ${theirs}`}>
      <Text style={{ color: t.text, fontSize: 13 }}>
        <Text style={{ fontWeight: "800" }}>{mine}</Text>
        <Text style={{ color: t.muted }}> vs their </Text>
        <Text style={{ fontWeight: "800" }}>{theirs}</Text>
        <Text style={{ color, fontWeight: "800" }}>{won === null ? " · even call" : won ? " · you won the call" : " · they won the call"}</Text>
      </Text>
      {r.why ? <Text style={{ color: t.muted, fontSize: 12 }}>{r.why}</Text> : null}
    </View>
  );
}

/** "Q2 4:12" for a pause. */
function clockLine(p: GamePrompt): string {
  return clockOf(p.situation);
}

function clockOf(s: GamePrompt["situation"]): string {
  return `${s.quarter <= 4 ? `Q${s.quarter}` : "OT"} ${formatClock(s.clock)}`;
}

/** Who has the ball at a pause. */
function offenseOf(p: GamePrompt): string {
  return p.kind === "defense" ? p.opponent : p.team;
}

/** "3rd & 4 at IL 35" for a snap; the try or the clock otherwise. */
function downLine(p: GamePrompt): string {
  if (p.kind === "offense") return formatDownDistance(p.situation, p.team, p.opponent);
  if (p.kind === "defense") return formatDownDistance(p.situation, p.opponent, p.team);
  return p.kind === "try" ? "The try" : "Clock running";
}

/** The call waiting on you, with the coaches' call picked to start. */
function CallBar({ prompt: p, onAnswer, theme: t }: { prompt: GamePrompt; onAnswer: (call?: CoachCall) => void; theme: Theme }) {
  const s = styles(t);
  const where = `${clockLine(p)} · ${p.kind === "defense" ? formatDownDistance(p.situation, p.opponent, p.team) : p.kind === "offense" ? formatDownDistance(p.situation, p.team, p.opponent) : ""}`;
  if (p.kind === "offense") return <OffenseBar prompt={p} where={where} onAnswer={onAnswer} theme={t} />;
  if (p.kind === "defense") return <DefenseBar prompt={p} where={where} onAnswer={onAnswer} theme={t} />;
  if (p.kind === "timeout") {
    const left = halfSecondsLeft(p.situation);
    return (
      <View style={{ gap: 8 }}>
        <Text style={s.head}>
          Clock's running, {formatClock(left)} left in the {p.situation.quarter <= 2 ? "half" : "game"}. You have {p.timeouts.own} timeout{p.timeouts.own === 1 ? "" : "s"}.
        </Text>
        <Text style={s.coach}>Head coach: {p.suggestion ? "take one" : "let it run"}</Text>
        <View style={s.row}>
          <Choice label="Timeout" on={p.suggestion} onPress={() => onAnswer({ timeout: true })} theme={t} />
          <Choice label="Let it run" on={!p.suggestion} onPress={() => onAnswer({ timeout: false })} theme={t} />
        </View>
      </View>
    );
  }
  const lead = p.margin === 0 ? "tied" : `${p.margin > 0 ? "up" : "down"} ${Math.abs(p.margin)}`;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.head}>Touchdown! You're {lead}. The try:</Text>
      <Text style={s.coach}>Head coach: {p.suggestion === "two_point" ? "go for two" : "kick it"}</Text>
      <View style={s.row}>
        <Choice label="Kick it" on={p.suggestion === "kick"} onPress={() => onAnswer({ try: "kick" })} theme={t} />
        <Choice label="Go for two" on={p.suggestion === "two_point"} onPress={() => onAnswer({ try: "two_point" })} theme={t} />
      </View>
    </View>
  );
}

const duelOn = (p: GamePrompt) => (p.sofar.rules ?? 1) >= 4;

function OffenseBar(props: { prompt: Extract<GamePrompt, { kind: "offense" }>; where: string; onAnswer: (call?: CoachCall) => void; theme: Theme }) {
  return duelOn(props.prompt) ? <OffenseSheet {...props} /> : <OffenseChips {...props} />;
}

/** The play duel on offense: a card per concept (the coaches' pick marked), the other calls beside them. */
function OffenseSheet({ prompt: p, where, onAnswer, theme: t }: { prompt: Extract<GamePrompt, { kind: "offense" }>; where: string; onAnswer: (call?: CoachCall) => void; theme: Theme }) {
  const s = styles(t);
  const scrimmageCall = (c: PlayCall) => c === "run" || c === "pass";
  // The coaches' pick: their concept for the run or pass they'd call, else their call (a punt, a kick).
  const coaches: OffenseConcept | PlayCall = scrimmageCall(p.suggestion) && p.concepts ? p.concepts[p.suggestion as "run" | "pass"] : p.suggestion;
  const [pick, setPick] = useState<OffenseConcept | PlayCall>(coaches);
  const [personnel, setPersonnel] = useState<Personnel>(p.formation.personnel);
  const [set, setSet] = useState<OffenseSet>(p.formation.set);
  const late = halfSecondsLeft(p.situation) <= 120;
  const others = p.options.filter((o) => !scrimmageCall(o) && (o === p.suggestion || o === "punt" || o === "field_goal" || late));
  const concept = (OFFENSE_CONCEPTS as readonly string[]).includes(pick) ? (pick as OffenseConcept) : null;
  const call: PlayCall = concept ? OFFENSE_CONCEPT_INFO[concept].kind : (pick as PlayCall);
  const same = pick === coaches && personnel === p.formation.personnel && set === p.formation.set;
  const name = (x: OffenseConcept | PlayCall) => ((OFFENSE_CONCEPTS as readonly string[]).includes(x) ? OFFENSE_CONCEPT_INFO[x as OffenseConcept].label : PLAY_NAMES[x as PlayCall]);
  const label = `${same ? "Snap it" : "Call it"}: ${name(pick)}${concept ? ` · ${PERSONNEL_NAMES[personnel]} ${SET_NAMES[set].toLowerCase()}` : ""}`;
  const kinds: Array<["run" | "pass", string]> = [["run", "Runs"], ["pass", "Passes"]];
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.head}>{where}</Text>
      <Text style={s.coach}>
        Coaches (●): {name(coaches)}
        {scrimmageCall(p.suggestion) ? ` from ${PERSONNEL_NAMES[p.formation.personnel]}, ${SET_NAMES[p.formation.set].toLowerCase()}` : ""}
      </Text>
      {kinds.map(([kind, title]) => (
        <View key={kind} style={{ gap: 6 }}>
          <Text style={s.section}>{title}</Text>
          <View style={s.cards}>
            {OFFENSE_CONCEPTS.filter((c) => OFFENSE_CONCEPT_INFO[c].kind === kind).map((c) => (
              <ConceptCard key={c} label={OFFENSE_CONCEPT_INFO[c].label} on={pick === c} coaches={coaches === c} onPress={() => setPick(c)} theme={t} />
            ))}
          </View>
        </View>
      ))}
      {concept ? <Text style={s.coach}>{`${OFFENSE_CONCEPT_INFO[concept].label}: ${OFFENSE_CONCEPT_INFO[concept].note.toLowerCase()}.`}</Text> : null}
      {others.length ? <Chips options={others.map((o) => ({ key: o, label: PLAY_NAMES[o] }))} value={pick as PlayCall} onChange={setPick} /> : null}
      <Big label={label} onPress={() => onAnswer(same ? undefined : { call, ...(concept ? { concept, personnel, set } : {}) })} theme={t} />
      {concept ? (
        <>
          <Text style={s.section}>Formation (they see it, not the call)</Text>
          <Chips options={p.personnelOptions.map((o) => ({ key: o, label: PERSONNEL_NAMES[o] }))} value={personnel} onChange={setPersonnel} />
          <Chips options={(["shotgun", "under_center"] as const).map((o) => ({ key: o, label: SET_NAMES[o] }))} value={set} onChange={setSet} />
        </>
      ) : null}
    </View>
  );
}

function OffenseChips({ prompt: p, where, onAnswer, theme: t }: { prompt: Extract<GamePrompt, { kind: "offense" }>; where: string; onAnswer: (call?: CoachCall) => void; theme: Theme }) {
  const s = styles(t);
  const [call, setCall] = useState<PlayCall>(p.suggestion);
  const [personnel, setPersonnel] = useState<Personnel>(p.formation.personnel);
  const [set, setSet] = useState<OffenseSet>(p.formation.set);
  // Kneels and spikes only matter late in a half (or when the coaches want one).
  const late = halfSecondsLeft(p.situation) <= 120;
  const plays = p.options.filter((o) => (o !== "kneel" && o !== "spike") || late || o === p.suggestion);
  const scrimmage = call === "run" || call === "pass";
  const same = call === p.suggestion && personnel === p.formation.personnel && set === p.formation.set;
  const label = `${same ? "Snap it" : "Call it"}: ${PLAY_NAMES[call]}${scrimmage ? ` · ${PERSONNEL_NAMES[personnel]} ${SET_NAMES[set].toLowerCase()}` : ""}`;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.head}>{where}</Text>
      <Text style={s.coach}>
        Coaches: {PLAY_NAMES[p.suggestion]} from {PERSONNEL_NAMES[p.formation.personnel]}, {SET_NAMES[p.formation.set].toLowerCase()}
      </Text>
      <Chips options={plays.map((o) => ({ key: o, label: PLAY_NAMES[o] }))} value={call} onChange={setCall} />
      {scrimmage ? (
        <>
          <Chips options={p.personnelOptions.map((o) => ({ key: o, label: PERSONNEL_NAMES[o] }))} value={personnel} onChange={setPersonnel} />
          <Chips options={(["shotgun", "under_center"] as const).map((o) => ({ key: o, label: SET_NAMES[o] }))} value={set} onChange={setSet} />
        </>
      ) : null}
      <Big label={label} onPress={() => onAnswer(same ? undefined : { call, ...(scrimmage ? { personnel, set } : {}) })} theme={t} />
    </View>
  );
}

function DefenseBar(props: { prompt: Extract<GamePrompt, { kind: "defense" }>; where: string; onAnswer: (call?: CoachCall) => void; theme: Theme }) {
  return duelOn(props.prompt) && props.prompt.concept ? <DefenseSheet {...props} /> : <DefenseChips {...props} />;
}

/** The play duel on defense: a card per concept (the coordinator's pick marked), and the package. */
function DefenseSheet({ prompt: p, where, onAnswer, theme: t }: { prompt: Extract<GamePrompt, { kind: "defense" }>; where: string; onAnswer: (call?: CoachCall) => void; theme: Theme }) {
  const s = styles(t);
  const f = p.formation;
  const coordinator = p.concept!;
  const [pick, setPick] = useState<DefenseConcept>(coordinator);
  const [pkg, setPkg] = useState<DefensePackage>(f.package);
  const same = pick === coordinator && pkg === f.package;
  const detail = (c: DefenseConcept) => {
    const info = DEFENSE_CONCEPT_INFO[c];
    return `${info.note}${info.blitz ? ` · ${BLITZ_NAMES[info.blitz]}` : ""}`;
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.head}>
        {where} · they're in {PERSONNEL_NAMES[p.offense.personnel]}, {SET_NAMES[p.offense.set].toLowerCase()}
      </Text>
      <Text style={s.coach}>Coordinator (●): {DEFENSE_CONCEPT_INFO[coordinator].label} from {PACKAGE_NAMES[f.package].toLowerCase()}</Text>
      <View style={s.cards}>
        {DEFENSE_CONCEPTS.map((c) => (
          <ConceptCard key={c} label={DEFENSE_CONCEPT_INFO[c].label} on={pick === c} coaches={coordinator === c} onPress={() => setPick(c)} theme={t} />
        ))}
      </View>
      <Text style={s.coach}>{`${DEFENSE_CONCEPT_INFO[pick].label}: ${detail(pick).charAt(0).toLowerCase()}${detail(pick).slice(1)}.`}</Text>
      <Big label={same ? `Line up: ${DEFENSE_CONCEPT_INFO[pick].label}` : `Call it: ${DEFENSE_CONCEPT_INFO[pick].label}, ${PACKAGE_NAMES[pkg].toLowerCase()}`} onPress={() => onAnswer(same ? undefined : { concept: pick, package: pkg })} theme={t} />
      <Text style={s.section}>Package</Text>
      <Chips options={p.packageOptions.map((o) => ({ key: o, label: PACKAGE_NAMES[o] }))} value={pkg} onChange={setPkg} />
    </View>
  );
}

/** One play on the call sheet (three to a row; the coaches' pick marked with a dot). */
function ConceptCard({ label, on, coaches, onPress, theme: t }: { label: string; on: boolean; coaches: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${coaches ? ", the coaches' pick" : ""}`}
      style={({ pressed }) => ({ flexBasis: "31%", flexGrow: 1, height: 44, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : t.card, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: "800", fontSize: 13, textAlign: "center" }} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      {coaches ? <View style={{ position: "absolute", top: 5, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: on ? t.onAccent : t.accent }} /> : null}
    </Pressable>
  );
}

function DefenseChips({ prompt: p, where, onAnswer, theme: t }: { prompt: Extract<GamePrompt, { kind: "defense" }>; where: string; onAnswer: (call?: CoachCall) => void; theme: Theme }) {
  const s = styles(t);
  const f = p.formation;
  const [pkg, setPkg] = useState<DefensePackage>(f.package);
  const [coverage, setCoverage] = useState<Coverage>(f.coverage);
  const [blitz, setBlitz] = useState<number>(f.blitzers.length);
  const same = pkg === f.package && coverage === f.coverage && blitz === f.blitzers.length;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.head}>
        {where} · they're in {PERSONNEL_NAMES[p.offense.personnel]}, {SET_NAMES[p.offense.set].toLowerCase()}
      </Text>
      <Text style={s.coach}>
        Coordinator: {PACKAGE_NAMES[f.package]}, {COVERAGES[f.coverage].label}
        {f.blitzers.length ? `, ${BLITZ_NAMES[f.blitzers.length]}` : ""}
      </Text>
      <Chips options={p.packageOptions.map((o) => ({ key: o, label: PACKAGE_NAMES[o] }))} value={pkg} onChange={setPkg} />
      <Chips options={p.coverageOptions.map((o) => ({ key: o, label: COVERAGES[o].label }))} value={coverage} onChange={setCoverage} />
      <Chips options={Array.from({ length: p.maxBlitz + 1 }, (_, n) => ({ key: n, label: BLITZ_NAMES[n] ?? `+${n}` }))} value={blitz} onChange={setBlitz} />
      <Big label={same ? "Line up: the coordinator's call" : `Line up: ${PACKAGE_NAMES[pkg]}, ${COVERAGES[coverage].label}${blitz ? `, ${BLITZ_NAMES[blitz]}` : ""}`} onPress={() => onAnswer(same ? undefined : { package: pkg, coverage, blitz })} theme={t} />
    </View>
  );
}

function Choice({ label, on, onPress, theme: t }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.accent : t.card, borderWidth: 1, borderColor: on ? t.accent : t.border, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

function Big({ label, onPress, theme: t }: { label: string; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: t.onAccent, fontWeight: "800", fontSize: 15, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

function Small({ label, onPress, theme: t }: { label: string; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ paddingHorizontal: 12, height: 34, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: t.border, backgroundColor: t.card, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    fieldWrap: { alignItems: "center" },
    kickoff: { borderRadius: 10, backgroundColor: "#2f7d3b", alignItems: "center", justifyContent: "center" },
    kickoffText: { color: "#fff", fontWeight: "700" },
    caption: { minHeight: 38, marginHorizontal: 16, marginTop: 6, fontSize: 13, lineHeight: 18, color: t.text },
    controls: { flexDirection: "row", justifyContent: "center", gap: 8 },
    bar: { flex: 1, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, backgroundColor: t.card },
    head: { color: t.text, fontWeight: "800", fontSize: 14 },
    coach: { color: t.muted, fontSize: 13 },
    row: { flexDirection: "row", gap: 8 },
    cards: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    section: { color: t.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    handoff: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", paddingTop: 4 },
    final: { color: t.text, fontWeight: "800", fontSize: 16, textAlign: "center" },
  });
