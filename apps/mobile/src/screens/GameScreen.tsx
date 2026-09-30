// Step 1 screen: pick a matchup, simulate it with the sim, show the final
// score by quarter and the full play-by-play.
import { useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { allTeams, generateLeague, lookupFor, periodLabel, simulateGame, teamName, type League, type Team } from "@dynasty/sim";
import { buildFeed, type FeedRow } from "../game/feed";
import { useTheme, type Theme } from "../theme";

const LEAGUE_SEED = "dynasty";

export function GameScreen() {
  const theme = useTheme();
  const s = styles(theme);
  const league = useMemo<League>(() => generateLeague(LEAGUE_SEED), []);
  const teams = useMemo(() => allTeams(league), [league]);
  const [n, setN] = useState(0);
  const list = useRef<FlatList<FeedRow>>(null);
  const nextGame = () => {
    setN((x) => x + 1);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // Game n: a matchup and seed that depend only on n, so it always replays the same.
  const { game, home, away, feed } = useMemo(() => {
    const home = teams[(n * 7) % teams.length]!;
    const away = teams[(n * 7 + 1 + ((n * 13) % (teams.length - 1))) % teams.length]!;
    const game = simulateGame(home, away, `app-game-${n}`);
    return { game, home, away, feed: buildFeed(game, lookupFor(home, away)) };
  }, [n, teams]);

  const periods = game.periodScores[game.home]!.map((_, i) => periodLabel(i + 1));

  const renderRow = ({ item }: { item: FeedRow }) => {
    if (item.kind === "period") return <Text style={s.period}>{item.label}</Text>;
    if (item.kind === "drive") return <Text style={s.drive}>{item.text}</Text>;
    return (
      <View style={[s.play, item.scoring && s.scoring]}>
        <View style={s.playHead}>
          <Text style={s.clock}>{item.clock}</Text>
          <Text style={s.team}>{item.team}</Text>
          {item.situation ? <Text style={s.situation}>{item.situation}</Text> : null}
        </View>
        <Text style={s.playText}>{item.text}</Text>
        {item.scoring ? <Text style={s.scoreText}>{item.score}</Text> : null}
      </View>
    );
  };

  const teamRow = (t: Team, abbr: string) => (
    <View style={s.lineRow} key={abbr}>
      <Text style={[s.lineTeam, game.winner === abbr && s.winner]} numberOfLines={1}>
        {teamName(t)}
      </Text>
      {game.periodScores[abbr]!.map((pts, i) => (
        <Text key={i} style={s.lineCell}>
          {pts}
        </Text>
      ))}
      <Text style={[s.lineTotal, game.winner === abbr && s.winner]}>{game.score[abbr]}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <Text style={s.title}>
          {away.abbr} @ {home.abbr}
        </Text>
        <Pressable style={s.button} onPress={nextGame} accessibilityRole="button">
          <Text style={s.buttonText}>Next game</Text>
        </Pressable>
      </View>
      <View style={s.card}>
        <View style={s.lineRow}>
          <Text style={[s.lineTeam, s.lineHead]}>Final{game.overtime ? " (OT)" : ""}</Text>
          {periods.map((p) => (
            <Text key={p} style={[s.lineCell, s.lineHead]}>
              {p}
            </Text>
          ))}
          <Text style={[s.lineTotal, s.lineHead]}>T</Text>
        </View>
        {teamRow(away, game.away)}
        {teamRow(home, game.home)}
      </View>
      <FlatList ref={list} data={feed} keyExtractor={(r) => r.key} renderItem={renderRow} contentContainerStyle={s.feed} initialNumToRender={30} />
    </SafeAreaView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
    title: { fontSize: 22, fontWeight: "700", color: t.text },
    button: { backgroundColor: t.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    buttonText: { color: t.onAccent, fontWeight: "600" },
    card: { marginHorizontal: 16, padding: 12, backgroundColor: t.card, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    lineRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
    lineHead: { color: t.muted, fontSize: 12, fontWeight: "600" },
    lineTeam: { flex: 1, color: t.text, fontSize: 15 },
    lineCell: { width: 28, textAlign: "center", color: t.muted, fontVariant: ["tabular-nums"] },
    lineTotal: { width: 36, textAlign: "right", color: t.text, fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
    winner: { fontWeight: "800" },
    feed: { padding: 16, paddingBottom: 40 },
    period: { marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: "700", color: t.accent, textTransform: "uppercase", letterSpacing: 0.5 },
    drive: { marginTop: 8, marginBottom: 4, fontSize: 12, color: t.muted },
    play: { paddingVertical: 7, paddingHorizontal: 10, marginBottom: 4, backgroundColor: t.card, borderRadius: 8 },
    scoring: { backgroundColor: t.scoreBg },
    playHead: { flexDirection: "row", gap: 8, marginBottom: 2 },
    clock: { fontSize: 12, color: t.muted, fontVariant: ["tabular-nums"] },
    team: { fontSize: 12, fontWeight: "700", color: t.text },
    situation: { fontSize: 12, color: t.muted },
    playText: { fontSize: 14, color: t.text, lineHeight: 19 },
    scoreText: { marginTop: 3, fontSize: 12, fontWeight: "700", color: t.score },
  });
