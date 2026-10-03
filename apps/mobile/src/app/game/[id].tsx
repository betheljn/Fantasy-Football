// Watch a game: a regular-season game (including yours before the week is
// played) or a playoff game. The sim replays it from its seed with the teams
// exactly as they took the field (rosters that week, minus anyone hurt), so
// it's exactly the game that counts.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Text } from "react-native";
import { ROUND_NAMES, playGame, simulateGame, withOut, type GameSummary, type League, type Team } from "@dynasty/sim";
import { replayTeams } from "../../dynasty/lineups";
import { useDynasty, useLeague } from "../../league/LeagueProvider";
import { GameView } from "../../screens/GameView";
import { useTheme } from "../../theme";

/** The teams for a game already played: from the lineup log, else today's rosters minus who sat. */
function teamsFor(log: Parameters<typeof replayTeams>[0], league: League, summary: GameSummary): { home: Team; away: Team } {
  const exact = replayTeams(log, league, summary);
  if (exact) return exact;
  const sat = (abbr: string) => withOut(league.teams[abbr]!, new Set(summary.out?.[abbr] ?? []));
  return { home: sat(summary.home), away: sat(summary.away) };
}

export default function GameRoute() {
  const t = useTheme();
  const d = useDynasty();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league, schedule, playoffs, results, userTeam, weeksPlayed } = useLeague();
  const router = useRouter();
  const log = d.save?.lineups;
  const found = useMemo(() => {
    const g = schedule.games.find((x) => x.id === id);
    if (g) {
      const summary = results.find((r) => r.id === g.id);
      // Not played yet: play it as it would be now (the same game the week will produce).
      // Not in an online league: that would show friends the result before the server plays it.
      if (!summary) {
        if (d.online) return null;
        const live = playGame(league, g);
        return { home: league.teams[g.home]!, away: league.teams[g.away]!, title: `Week ${g.week}`, week: g.week, game: live.result, unplayed: true };
      }
      const teams = teamsFor(log, league, summary);
      return { ...teams, title: `Week ${g.week}`, week: g.week, game: simulateGame(teams.home, teams.away, summary.seed) };
    }
    const p = playoffs?.games.find((x) => x.summary.id === id);
    if (p) {
      const teams = teamsFor(log, league, p.summary);
      const game = simulateGame(teams.home, teams.away, p.summary.seed, { playoff: true, neutralSite: p.neutralSite });
      return { ...teams, title: ROUND_NAMES[p.round], week: 99, game, neutralSite: p.neutralSite };
    }
    return null;
  }, [id, league, schedule, playoffs, results, log, d.online]);
  if (!found) return <Text style={{ padding: 16, color: t.text }}>{d.online ? "This game hasn't been played yet." : "Unknown game."}</Text>;
  // Each team's record going into the game.
  const before = (abbr: string) => {
    let w = 0, l = 0, tie = 0;
    for (const r of results) {
      if (r.week >= found.week || (r.home !== abbr && r.away !== abbr)) continue;
      if (r.winner === abbr) w++;
      else if (r.winner === null) tie++;
      else l++;
    }
    return `${w}-${l}${tie ? `-${tie}` : ""}`;
  };
  // Watching your own game before the week is played: when it's over, the week is played for real (the same result).
  const mine = found.home.abbr === userTeam || found.away.abbr === userTeam;
  const finish =
    "unplayed" in found && mine && found.week === weeksPlayed + 1 && d.phase === "season"
      ? {
          label: `Record it and play the rest of week ${found.week}`,
          onPress: () => {
            d.playWeek();
            router.replace("/");
          },
        }
      : undefined;
  return (
    <>
      <Stack.Screen options={{ title: `${found.away.abbr} at ${found.home.abbr} · ${found.title}` }} />
      <GameView
        game={found.game}
        home={found.home}
        away={found.away}
        context={{ title: found.title, records: { [found.home.abbr]: before(found.home.abbr), [found.away.abbr]: before(found.away.abbr) }, neutralSite: "neutralSite" in found ? found.neutralSite : false }}
        finish={finish}
      />
    </>
  );
}
