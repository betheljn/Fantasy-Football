// Coach your game this week. The game starts from your calls so far (saved
// as you go, so you can leave and come back); when it's over, the week is
// played with it and you land on its recap.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Text } from "react-native";
import { coachScheduledGame } from "@dynasty/sim";
import { useDynasty, useLeague } from "../../league/LeagueProvider";
import { CoachView } from "../../screens/CoachView";
import { useTheme } from "../../theme";

/** Save this long after the last call. */
const SAVE_AFTER_MS = 1500;

export default function CoachRoute() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league, schedule, results, userTeam, weeksPlayed } = useLeague();
  const g = schedule.games.find((x) => x.id === id);
  const mine = !!g && (g.home === userTeam || g.away === userTeam);
  // Online: your games against AI teams (games between friends are left to the coaches for now).
  const friendly = !!g && !!d.online && !!d.online.humans[g.home === userTeam ? g.away : g.home];
  const seasonOn = d.online ? d.canMakeMoves : d.phase === "season";
  const playable = !!g && mine && !friendly && seasonOn && g.week === weeksPlayed + 1 && !results.some((r) => r.id === id);
  // One game for the whole visit, picked up from any calls already made.
  const [game] = useState(() => (playable && g ? coachScheduledGame(league, g, userTeam, d.coaching?.game === g.id ? d.coaching.calls : []) : null));

  // Save the calls a moment after each one (not on every tap of a quick run of calls),
  // and right away when you leave the screen or the app goes to the background.
  const saved = useRef(game?.calls.length ?? 0);
  const done = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!game || done.current || game.calls.length === saved.current) return;
    saved.current = game.calls.length;
    d.saveCoaching(id, [...game.calls]);
  };
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") latest.current();
    });
    return () => {
      sub.remove();
      latest.current();
    };
  }, []);

  if (!game || !g) return <Text style={{ padding: 16, color: t.text }}>{friendly ? "Games between friends are left to the coaches for now." : "This game can't be coached now."}</Text>;
  return (
    <>
      <Stack.Screen options={{ title: `${g.away} at ${g.home} · Week ${g.week}` }} />
      <CoachView
        game={game}
        home={league.teams[g.home]!}
        away={league.teams[g.away]!}
        title={`Week ${g.week}`}
        onCall={() => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => latest.current(), SAVE_AFTER_MS);
        }}
        finish={
          d.online
            ? {
                // Online, the league plays the week (with your calls) when everyone's ready.
                label: "Send my calls to the league",
                onPress: () => {
                  latest.current();
                  done.current = true;
                  router.replace("/");
                },
              }
            : {
                label: `Record it and play the rest of week ${g.week}`,
                onPress: () => {
                  done.current = true;
                  d.playWeek({ game: g.id, calls: [...game.calls] });
                  router.replace(`/game/${g.id}?final=1`);
                },
              }
        }
      />
    </>
  );
}
