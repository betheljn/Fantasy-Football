// A duel: your game this week against a friend, both of you calling every
// snap. The server holds the calls and shows you only what you may see (never
// your friend's call before you make yours); the field is the same sim game
// replayed here from those calls. While your friend is deciding, the screen
// checks back every few seconds.
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { duelScheduledGame, type CoachCall, type CoachedGame, type GamePrompt, type League, type ScheduledGame } from "@dynasty/sim";
import { teamShort } from "../field/colors";
import { api, type OnlineDuel } from "../online/api";
import { useTheme } from "../theme";
import { CoachView } from "./CoachView";

/** How often to look for your friend's call. */
const POLL_MS = 3000;

interface Props {
  league: League;
  game: ScheduledGame;
  online: { id: string; token: string; team: string; humans: Record<string, string> };
  /** The duel is gone (the week was played): bring the league up to date. */
  onGone: () => void;
}

export function DuelScreen({ league, game: g, online, onGone }: Props) {
  const t = useTheme();
  const router = useRouter();
  const [duel, setDuel] = useState<OnlineDuel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const load = useCallback(() => {
    api
      .duel(online.id, online.token)
      .then((r) => {
        if (!r.duel || r.duel.game !== g.id) {
          setError("This week has been played: the result is with the league.");
          onGone();
          return;
        }
        setDuel(r.duel);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [online.id, online.token, g.id, onGone]);
  useEffect(load, [load]);
  // Waiting on your friend: check back now and then.
  const theirTurn = !!duel && !duel.over && !duel.prompt;
  useEffect(() => {
    if (!theirTurn) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [theirTurn, load]);

  // The game so far, replayed from the calls you may see; your waiting call comes from the server.
  const view = useMemo((): CoachedGame | null => {
    if (!duel) return null;
    const local = duelScheduledGame(league, g, duel.calls);
    const sofar = local.result ?? local.prompt!.sofar;
    const prompt: GamePrompt | null = duel.prompt ? { ...duel.prompt, sofar } : null;
    const send = (p: Promise<{ duel: OnlineDuel }>) => {
      sending.current = true;
      p.then((r) => setDuel(r.duel))
        .catch((e: Error) => {
          setError(e.message);
          load();
        })
        .finally(() => {
          sending.current = false;
        });
    };
    return {
      prompt,
      result: duel.over ? local.result : null,
      calls: duel.calls,
      answer(call?: CoachCall) {
        if (!sending.current) send(api.duelCall(online.id, online.token, duel.made, call ?? null));
      },
      autoDrive() {
        send(api.duelHand(online.id, online.token, "drive"));
      },
      autoHalf() {
        send(api.duelHand(online.id, online.token, "half"));
      },
      get sofar() {
        return sofar;
      },
    };
  }, [duel, league, g, online.id, online.token, load]);

  const friend = teamShort(g.home === online.team ? g.away : g.home);
  if (!duel || !view) {
    return <Text style={{ padding: 16, color: error ? t.score : t.muted }}>{error ?? "Loading your duel…"}</Text>;
  }
  return (
    <View style={{ flex: 1 }}>
      {error ? <Text style={{ color: t.score, paddingHorizontal: 16, paddingTop: 6 }}>{error}</Text> : null}
      <CoachView
        game={view}
        home={league.teams[g.home]!}
        away={league.teams[g.away]!}
        title={`Week ${g.week} · duel`}
        team={online.team}
        waiting={theirTurn ? `Waiting on ${friend}'s call…` : null}
        waitingAt={theirTurn ? duel.at : null}
        onCall={() => {}}
        onHand={(until) => {
          sending.current = true;
          api
            .duelHand(online.id, online.token, until)
            .then((r) => setDuel(r.duel))
            .catch((e: Error) => setError(e.message))
            .finally(() => {
              sending.current = false;
            });
        }}
        finish={{ label: "Back to the league", onPress: () => router.replace("/") }}
      />
    </View>
  );
}
