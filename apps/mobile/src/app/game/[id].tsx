// Watch a scheduled game. The sim replays it from its seed, so it's exactly the
// game that went into the standings.
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Text } from "react-native";
import { playGame } from "@dynasty/sim";
import { useLeague } from "../../league/LeagueProvider";
import { GameView } from "../../screens/GameView";
import { useTheme } from "../../theme";

export default function GameRoute() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league, schedule } = useLeague();
  const scheduled = schedule.games.find((g) => g.id === id);
  const game = useMemo(() => (scheduled ? playGame(league, scheduled).result : null), [league, scheduled]);
  if (!scheduled || !game) return <Text style={{ padding: 16, color: t.text }}>Unknown game.</Text>;
  return (
    <>
      <Stack.Screen options={{ title: `${scheduled.away} at ${scheduled.home} · Wk ${scheduled.week}` }} />
      <GameView game={game} home={league.teams[scheduled.home]!} away={league.teams[scheduled.away]!} />
    </>
  );
}
