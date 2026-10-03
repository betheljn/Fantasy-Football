// Watch a game: the scoreboard in both teams' colors, the win-chance bar, the
// 2D field, the play's result and playback controls; below it the pregame tale
// of the tape, the play-by-play (or just the big plays), the leaders and the
// box score, and at the final whistle a recap. All kept in step with the play
// on the field, so nothing ahead is given away.
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { lookupFor, pregameEdge, winChances, type GameResult, type Team } from "@dynasty/sim";
import { Segmented } from "../components/ui";
import { BoxScoreView } from "../components/BoxScoreView";
import { FieldView } from "../field/FieldView";
import { TvFieldView } from "../field/TvFieldView";
import { teamColors, uniform } from "../field/colors";
import { usePlayback } from "../field/usePlayback";
import { buildFeed, type FeedRow } from "../game/feed";
import { boxScoreAfter, lineScoreAfter, scoreAfter } from "../game/live";
import { prepareGame } from "../game/playback";
import { useTheme, type Theme } from "../theme";
import { Leaders, Pregame, Recap, Scoreboard, WinBar, type GameContext } from "./game/parts";

type Tab = "preview" | "plays" | "leaders" | "box" | "recap";

/** Watch one finished game (the sim has already decided it; this only replays it). */
export function GameView({ game, home, away, context, finish }: { game: GameResult; home: Team; away: Team; context?: GameContext; finish?: { label: string; onPress: () => void } }) {
  const theme = useTheme();
  const s = styles(theme);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("preview");
  const [bigOnly, setBigOnly] = useState(false);
  const [camera, setCamera] = useState<"top" | "tv">("top");
  const { who, feed, plays, wp } = useMemo(() => {
    const who = lookupFor(home, away);
    return { who, feed: buildFeed(game, who), plays: prepareGame(game, who), wp: winChances(game, pregameEdge(home, away, context?.neutralSite)) };
  }, [game, home, away, context?.neutralSite]);

  const pb = usePlayback(plays);
  const play = pb.play;
  const atEnd = pb.pos === plays.length - 1 && pb.done;
  // Everything up to this play in game.plays has happened (and can be shown).
  const revealed = !play ? -1 : atEnd ? game.plays.length - 1 : pb.done ? play.index : play.index - 1;

  const score = scoreAfter(game, revealed);
  const line = useMemo(() => lineScoreAfter(game, revealed), [game, revealed]);
  const box = useMemo(() => (tab === "box" || tab === "leaders" || tab === "recap" ? boxScoreAfter(game, revealed) : null), [game, revealed, tab]);
  const visibleFeed = useMemo(() => feed.filter((r) => r.index <= revealed && (!bigOnly || (r.kind === "play" && r.big))).reverse(), [feed, revealed, bigOnly]);
  const chance = revealed < 0 ? wp.pregame : wp.after[revealed]!;
  // The tabs follow the game: the preview before kickoff, the plays once it starts, the recap at the end.
  const started = revealed >= 0;
  useEffect(() => {
    if (atEnd) setTab("recap");
    else if (started && (tab === "preview" || tab === "recap")) setTab("plays");
    else if (!started && tab !== "preview") setTab("preview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atEnd, started]);

  const { width: winW, height: winH } = useWindowDimensions();
  const fieldW = Math.min(winW - 32, 480);
  const fieldH = Math.round(Math.max(200, Math.min(fieldW * 1.1, winH * 0.3)));

  const jumpTo = (index: number) => {
    const to = plays.findIndex((p) => p.index >= index);
    if (to >= 0) pb.seek(to);
  };

  const renderRow = ({ item }: { item: FeedRow }) => {
    if (item.kind === "period") return <Text style={s.period}>{item.label}</Text>;
    if (item.kind === "drive") return <Text style={s.drive}>{item.text}</Text>;
    const current = play?.index === item.index && pb.done;
    return (
      <Pressable onPress={() => jumpTo(item.index)} accessibilityRole="button" accessibilityHint="Replay this play on the field">
        <View style={[s.play, item.big && s.big, item.scoring && s.scoring, current && s.current]}>
          <View style={s.playHead}>
            <Text style={s.clock}>{item.clock}</Text>
            <Text style={s.team}>{item.team}</Text>
            {item.situation ? <Text style={s.situation}>{item.situation}</Text> : null}
          </View>
          <Text style={s.playText}>{item.text}</Text>
          {item.scoring ? <Text style={s.scoreText}>{item.score}</Text> : null}
        </View>
      </Pressable>
    );
  };

  // Each end zone is painted for the team defending it.
  const endZone = (abbr: string) => {
    const team = abbr === home.abbr ? home : away;
    const c = teamColors(abbr);
    return { abbr, name: team.nickname.toUpperCase(), color: c.primary, trim: c.trim };
  };
  const leftOwner = play ? (play.direction === 1 ? play.offense : play.defense) : game.home;
  const rightOwner = play ? (play.direction === 1 ? play.defense : play.offense) : game.away;

  return (
    <View style={s.screen}>

      <Scoreboard
        game={game}
        score={score}
        possession={atEnd || !play ? null : play.offense}
        status={atEnd ? `Final${game.overtime ? " OT" : ""}` : !started ? (context?.title ?? "Kickoff") : (play?.clock ?? "")}
        sub={atEnd ? (context?.title ?? "") : !started ? "Press play" : play?.situation || " "}
      />
      <WinBar game={game} home={chance} />

      {play && tab !== "recap" ? (
        <View style={s.fieldWrap}>
          {camera === "tv" ? (
            <TvFieldView
              play={play}
              time={pb.time}
              width={fieldW}
              height={fieldH}
              offense={uniform(play.offense, play.offense === game.home)}
              defense={uniform(play.defense, play.defense === game.home)}
              endZones={{ left: endZone(leftOwner), right: endZone(rightOwner) }}
              colorsOf={teamColors}
            />
          ) : (
            <FieldView
              play={play}
              time={pb.time}
              width={fieldW}
              height={fieldH}
              offense={uniform(play.offense, play.offense === game.home)}
              defense={uniform(play.defense, play.defense === game.home)}
              endZones={{ left: endZone(leftOwner), right: endZone(rightOwner) }}
              midfield={{ abbr: home.abbr, color: teamColors(home.abbr).primary, trim: teamColors(home.abbr).trim }}
              colorsOf={teamColors}
            />
          )}
        </View>
      ) : null}

      {tab === "recap" ? null : (
      <Text style={s.caption} numberOfLines={3}>
        {!play ? "" : pb.done ? play.caption : pb.playing ? "…" : `${play.offense} ball${play.situation ? `, ${play.situation}` : ""}. Press play.`}
      </Text>
      )}

      <View style={s.controls}>
        <Control label="◀︎" hint="Previous play" onPress={pb.prev} theme={theme} />
        <Control label={pb.playing ? "Pause" : "Play"} hint={pb.playing ? "Pause" : "Play"} onPress={pb.toggle} theme={theme} primary />
        <Control label="▶︎" hint="Next play" onPress={pb.next} theme={theme} />
        <Control label={`${pb.speed}×`} hint="Playback speed" onPress={pb.cycleSpeed} theme={theme} />
        <Control label="Final" hint="Skip to the end of the game" onPress={pb.toEnd} theme={theme} />
        <Control label={camera === "tv" ? "Top" : "TV"} hint={camera === "tv" ? "Switch to the top-down view" : "Switch to the TV angle"} onPress={() => setCamera(camera === "tv" ? "top" : "tv")} theme={theme} />
      </View>

      <View style={{ marginHorizontal: 12, marginTop: 10 }}>
        <Segmented
          options={[
            ...(atEnd ? [{ key: "recap" as const, label: "Recap" }] : started ? [] : [{ key: "preview" as const, label: "Preview" }]),
            { key: "plays" as const, label: "Plays" },
            { key: "leaders" as const, label: "Leaders" },
            { key: "box" as const, label: "Box" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <View style={s.bottom}>
        {tab === "preview" ? (
          <ScrollView>
            <Pregame home={home} away={away} context={context} chance={wp.pregame} />
          </ScrollView>
        ) : tab === "recap" && box ? (
          <ScrollView>
            <Recap game={game} box={box} who={who} chances={wp.after} pregame={wp.pregame} feed={feed} width={winW} onPlay={jumpTo} onPlayer={(id) => router.push(`/player/${id}`)} finish={finish} />
          </ScrollView>
        ) : tab === "leaders" && box ? (
          <ScrollView>
            <Leaders game={game} box={box} who={who} onPlayer={(id) => router.push(`/player/${id}`)} />
          </ScrollView>
        ) : tab === "plays" ? (
          <View style={{ flex: 1 }}>
            <Pressable onPress={() => setBigOnly(!bigOnly)} accessibilityRole="switch" accessibilityState={{ checked: bigOnly }} style={{ alignSelf: "flex-end", marginRight: 16, marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: bigOnly ? theme.accent : theme.muted, fontWeight: "700", fontSize: 12 }}>{bigOnly ? "★ Big plays only" : "☆ Big plays only"}</Text>
            </Pressable>
            {visibleFeed.length > 0 ? (
              <FlatList inverted data={visibleFeed} keyExtractor={(r) => r.key} renderItem={renderRow} contentContainerStyle={s.feed} initialNumToRender={20} />
            ) : (
              <Text style={s.empty}>{bigOnly && started ? "No big plays yet." : "Plays appear here as they happen."}</Text>
            )}
          </View>
        ) : box ? (
          <BoxScoreView game={game} box={box} line={line} who={who} />
        ) : null}
      </View>
    </View>
  );
}

function Control({ label, onPress, theme, primary, hint }: { label: string; onPress: () => void; theme: Theme; primary?: boolean; hint: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint}
      style={({ pressed }) => [
        { minWidth: 48, height: 44, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
        { backgroundColor: primary ? theme.accent : theme.card, borderWidth: primary ? 0 : 1, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={{ fontSize: 15, fontWeight: "700", color: primary ? theme.onAccent : theme.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    scoreboard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
    status: { flex: 1, alignItems: "center" },
    statusMain: { fontSize: 16, fontWeight: "700", color: t.text, fontVariant: ["tabular-nums"] },
    statusSub: { fontSize: 12, color: t.muted, marginTop: 2 },
    fieldWrap: { alignItems: "center" },
    caption: { minHeight: 57, marginHorizontal: 16, marginTop: 8, fontSize: 14, lineHeight: 19, color: t.text },
    controls: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 4 },
    tabs: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, padding: 3, borderRadius: 10, backgroundColor: t.border },
    tab: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
    tabOn: { backgroundColor: t.card },
    tabText: { fontSize: 14, fontWeight: "600", color: t.muted },
    tabTextOn: { color: t.text },
    bottom: { flex: 1, marginTop: 4 },
    feed: { padding: 16 },
    empty: { padding: 24, textAlign: "center", color: t.muted },
    period: { marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: "700", color: t.accent, textTransform: "uppercase", letterSpacing: 0.5 },
    drive: { marginTop: 6, marginBottom: 4, fontSize: 12, color: t.muted },
    play: { paddingVertical: 7, paddingHorizontal: 10, marginBottom: 4, backgroundColor: t.card, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
    scoring: { backgroundColor: t.scoreBg },
    big: { borderLeftWidth: 3, borderLeftColor: t.gold },
    current: { borderColor: t.accent },
    playHead: { flexDirection: "row", gap: 8, marginBottom: 2 },
    clock: { fontSize: 12, color: t.muted, fontVariant: ["tabular-nums"] },
    team: { fontSize: 12, fontWeight: "700", color: t.text },
    situation: { fontSize: 12, color: t.muted },
    playText: { fontSize: 14, color: t.text, lineHeight: 19 },
    scoreText: { marginTop: 3, fontSize: 12, fontWeight: "700", color: t.score },
  });
