// Watch a game on the 2D field: score and situation, the field, the current
// play's description, and playback controls.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { GameResult, PlayerLookup } from "@dynasty/sim";
import { FieldView } from "../field/FieldView";
import { teamColor, uniform } from "../field/colors";
import { usePlayback } from "../field/usePlayback";
import { prepareGame } from "../game/playback";
import { useTheme, type Theme } from "../theme";

/** Height of everything in the panel except the field (strip, caption, controls, spacing). */
const CHROME_HEIGHT = 205;

export function FieldPanel({ game, who }: { game: GameResult; who: PlayerLookup }) {
  const theme = useTheme();
  const s = styles(theme);
  const plays = useMemo(() => prepareGame(game, who), [game, who]);
  const pb = usePlayback(plays);
  const { width: winW } = useWindowDimensions();
  // The field gets whatever height is left after the score strip, caption and controls.
  const [panelH, setPanelH] = useState(0);
  const width = Math.min(winW - 32, 480);
  const height = Math.max(180, Math.round(Math.min(width * 1.4, panelH - CHROME_HEIGHT)));
  const play = pb.play;
  if (!play) return null;

  // Each end zone belongs to the team defending it.
  const leftOwner = play.direction === 1 ? play.offense : play.defense;
  const rightOwner = play.direction === 1 ? play.defense : play.offense;
  const scoreBefore = pb.pos > 0 ? plays[pb.pos - 1]!.score : { [game.home]: 0, [game.away]: 0 };

  return (
    <View style={s.panel} onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}>
      <View style={s.strip}>
        <Text style={s.score}>
          {game.away} {scoreBefore[game.away]} – {game.home} {scoreBefore[game.home]}
        </Text>
        <Text style={s.clock}>{play.clock}</Text>
      </View>
      <Text style={s.situation} numberOfLines={1}>
        {play.offense} ball{play.situation ? ` · ${play.situation}` : ""}
      </Text>
      <FieldView
        play={play}
        time={pb.time}
        width={width}
        height={height}
        offense={uniform(play.offense, play.offense === game.home)}
        defense={uniform(play.defense, play.defense === game.home)}
        endZones={{ left: { abbr: leftOwner, color: teamColor(leftOwner) }, right: { abbr: rightOwner, color: teamColor(rightOwner) } }}
      />
      <Text style={s.caption} numberOfLines={3}>
        {play.caption}
      </Text>
      <View style={s.controls}>
        <Control label="◀︎" onPress={pb.prev} theme={theme} hint="Previous play" />
        <Control label={pb.playing ? "Pause" : "Play"} onPress={pb.toggle} theme={theme} primary hint={pb.playing ? "Pause" : "Play"} />
        <Control label="▶︎" onPress={pb.next} theme={theme} hint="Next play" />
        <Control label={`${pb.speed}×`} onPress={pb.cycleSpeed} theme={theme} hint="Playback speed" />
      </View>
      <Text style={s.progress}>
        Play {pb.pos + 1} of {pb.count}
      </Text>
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
        { minWidth: 56, height: 44, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
        { backgroundColor: primary ? theme.accent : theme.card, borderWidth: primary ? 0 : 1, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={{ fontSize: 16, fontWeight: "700", color: primary ? theme.onAccent : theme.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    panel: { flex: 1, alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
    strip: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    score: { fontSize: 20, fontWeight: "800", color: t.text, fontVariant: ["tabular-nums"] },
    clock: { fontSize: 15, fontWeight: "600", color: t.muted, fontVariant: ["tabular-nums"] },
    situation: { alignSelf: "stretch", marginTop: 2, marginBottom: 8, fontSize: 13, color: t.muted },
    caption: { alignSelf: "stretch", minHeight: 58, marginTop: 10, fontSize: 14, lineHeight: 19, color: t.text },
    controls: { flexDirection: "row", gap: 10, marginTop: 6 },
    progress: { marginTop: 8, fontSize: 12, color: t.muted },
  });
