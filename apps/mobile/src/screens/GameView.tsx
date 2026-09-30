// Watch a game: live scoreboard, the 2D field, the play's result, playback
// controls, and below it the play-by-play and box score - all kept in step with
// the play on the field, so nothing ahead is given away.
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { lookupFor, type GameResult, type Team } from "@dynasty/sim";
import { BoxScoreView } from "../components/BoxScoreView";
import { FieldView } from "../field/FieldView";
import { teamColor, uniform } from "../field/colors";
import { usePlayback } from "../field/usePlayback";
import { buildFeed, type FeedRow } from "../game/feed";
import { boxScoreAfter, lineScoreAfter, scoreAfter } from "../game/live";
import { prepareGame } from "../game/playback";
import { useTheme, type Theme } from "../theme";

/** Watch one finished game (the sim has already decided it; this only replays it). */
export function GameView({ game, home, away }: { game: GameResult; home: Team; away: Team }) {
  const theme = useTheme();
  const s = styles(theme);
  const [tab, setTab] = useState<"plays" | "box">("plays");
  const { who, feed, plays } = useMemo(() => {
    const who = lookupFor(home, away);
    return { who, feed: buildFeed(game, who), plays: prepareGame(game, who) };
  }, [game, home, away]);

  const pb = usePlayback(plays);
  const play = pb.play;
  const atEnd = pb.pos === plays.length - 1 && pb.done;
  // Everything up to this play in game.plays has happened (and can be shown).
  const revealed = !play ? -1 : atEnd ? game.plays.length - 1 : pb.done ? play.index : play.index - 1;

  const score = scoreAfter(game, revealed);
  const line = useMemo(() => lineScoreAfter(game, revealed), [game, revealed]);
  const box = useMemo(() => (tab === "box" ? boxScoreAfter(game, revealed) : null), [game, revealed, tab]);
  const visibleFeed = useMemo(() => feed.filter((r) => r.index <= revealed).reverse(), [feed, revealed]);

  const { width: winW, height: winH } = useWindowDimensions();
  const fieldW = Math.min(winW - 32, 480);
  const fieldH = Math.round(Math.max(200, Math.min(fieldW * 1.1, winH * 0.36)));

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
        <View style={[s.play, item.scoring && s.scoring, current && s.current]}>
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

  const leftOwner = play ? (play.direction === 1 ? play.offense : play.defense) : game.home;
  const rightOwner = play ? (play.direction === 1 ? play.defense : play.offense) : game.away;

  return (
    <View style={s.screen}>

      <View style={s.scoreboard}>
        <TeamScore abbr={game.away} score={score[game.away]!} hasBall={!atEnd && play?.offense === game.away} theme={theme} />
        <View style={s.status}>
          <Text style={s.statusMain}>{atEnd ? `Final${game.overtime ? "/OT" : ""}` : (play?.clock ?? "")}</Text>
          <Text style={s.statusSub} numberOfLines={1}>
            {atEnd ? "" : play?.situation || " "}
          </Text>
        </View>
        <TeamScore abbr={game.home} score={score[game.home]!} hasBall={!atEnd && play?.offense === game.home} theme={theme} right />
      </View>

      {play ? (
        <View style={s.fieldWrap}>
          <FieldView
            play={play}
            time={pb.time}
            width={fieldW}
            height={fieldH}
            offense={uniform(play.offense, play.offense === game.home)}
            defense={uniform(play.defense, play.defense === game.home)}
            endZones={{ left: { abbr: leftOwner, color: teamColor(leftOwner) }, right: { abbr: rightOwner, color: teamColor(rightOwner) } }}
          />
        </View>
      ) : null}

      <Text style={s.caption} numberOfLines={3}>
        {!play ? "" : pb.done ? play.caption : pb.playing ? "…" : `${play.offense} ball${play.situation ? `, ${play.situation}` : ""}. Press play.`}
      </Text>

      <View style={s.controls}>
        <Control label="◀︎" hint="Previous play" onPress={pb.prev} theme={theme} />
        <Control label={pb.playing ? "Pause" : "Play"} hint={pb.playing ? "Pause" : "Play"} onPress={pb.toggle} theme={theme} primary />
        <Control label="▶︎" hint="Next play" onPress={pb.next} theme={theme} />
        <Control label={`${pb.speed}×`} hint="Playback speed" onPress={pb.cycleSpeed} theme={theme} />
        <Control label="Final" hint="Skip to the end of the game" onPress={pb.toEnd} theme={theme} />
      </View>

      <View style={s.tabs}>
        {(["plays", "box"] as const).map((v) => (
          <Pressable key={v} onPress={() => setTab(v)} style={[s.tab, tab === v && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === v }}>
            <Text style={[s.tabText, tab === v && s.tabTextOn]}>{v === "plays" ? "Plays" : "Box score"}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.bottom}>
        {tab === "plays" ? (
          visibleFeed.length > 0 ? (
            <FlatList inverted data={visibleFeed} keyExtractor={(r) => r.key} renderItem={renderRow} contentContainerStyle={s.feed} initialNumToRender={20} />
          ) : (
            <Text style={s.empty}>Plays appear here as they happen.</Text>
          )
        ) : box ? (
          <BoxScoreView game={game} box={box} line={line} who={who} />
        ) : null}
      </View>
    </View>
  );
}

function TeamScore({ abbr, score, hasBall, theme, right }: { abbr: string; score: number; hasBall: boolean; theme: Theme; right?: boolean }) {
  const dot = <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hasBall ? theme.accent : "transparent" }} />;
  return (
    <View style={{ flexDirection: right ? "row-reverse" : "row", alignItems: "center", gap: 8, minWidth: 96 }}>
      <View style={{ width: 6, height: 30, borderRadius: 3, backgroundColor: teamColor(abbr) }} />
      <View style={{ alignItems: right ? "flex-end" : "flex-start" }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: theme.muted }}>{abbr}</Text>
        <Text style={{ fontSize: 26, fontWeight: "800", color: theme.text, fontVariant: ["tabular-nums"] }}>{score}</Text>
      </View>
      {dot}
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
    current: { borderColor: t.accent },
    playHead: { flexDirection: "row", gap: 8, marginBottom: 2 },
    clock: { fontSize: 12, color: t.muted, fontVariant: ["tabular-nums"] },
    team: { fontSize: 12, fontWeight: "700", color: t.text },
    situation: { fontSize: 12, color: t.muted },
    playText: { fontSize: 14, color: t.text, lineHeight: 19 },
    scoreText: { marginTop: 3, fontSize: 12, fontWeight: "700", color: t.score },
  });
