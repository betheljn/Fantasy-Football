// Watch a game: a regular-season game (including yours before the week is
// played) or a playoff game. The sim replays it from its seed, so it's exactly
// the game that counts.
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Text } from "react-native";
import { ROUND_NAMES, playGame, simulateGame } from "@dynasty/sim";
import { useLeague } from "../../league/LeagueProvider";
import { GameView } from "../../screens/GameView";
import { useTheme } from "../../theme";

export default function GameRoute() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league, schedule, playoffs } = useLeague();
  const found = useMemo(() => {
    const g = schedule.games.find((x) => x.id === id);
    if (g) return { home: g.home, away: g.away, title: `Wk ${g.week}`, game: playGame(league, g).result };
    const p = playoffs?.games.find((x) => x.summary.id === id);
    if (p) {
      const game = simulateGame(league.teams[p.summary.home]!, league.teams[p.summary.away]!, p.summary.seed, { playoff: true, neutralSite: p.neutralSite });
      return { home: p.summary.home, away: p.summary.away, title: ROUND_NAMES[p.round], game };
    }
    return null;
  }, [id, league, schedule, playoffs]);
  if (!found) return <Text style={{ padding: 16, color: t.text }}>Unknown game.</Text>;
  return (
    <>
      <Stack.Screen options={{ title: `${found.away} at ${found.home} · ${found.title}` }} />
      <GameView game={found.game} home={league.teams[found.home]!} away={league.teams[found.away]!} />
    </>
  );
}
