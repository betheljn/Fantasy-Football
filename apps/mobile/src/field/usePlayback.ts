// Drives the field: which play is showing, a shared clock that runs from just
// before the snap to just after the whistle, pause/resume, speed, and moving on
// to the next play when one finishes.
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelAnimation, Easing, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { PreparedPlay } from "../game/playback";

/** Seconds shown before the snap (formation) and after the play ends. */
export const PRE_SNAP = 0.8;
export const POST_PLAY = 0.9;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export function usePlayback(plays: readonly PreparedPlay[]) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const time = useSharedValue(-PRE_SNAP);
  const lastPos = useRef(-1);
  const play = plays[Math.min(pos, plays.length - 1)];

  const advance = useCallback(() => {
    setPos((p) => {
      if (p + 1 >= plays.length) {
        setPlaying(false);
        return p;
      }
      return p + 1;
    });
  }, [plays.length]);

  useEffect(() => {
    if (!play) return;
    if (lastPos.current !== pos) {
      lastPos.current = pos;
      cancelAnimation(time);
      time.value = -PRE_SNAP;
    }
    if (!playing) {
      cancelAnimation(time);
      return;
    }
    const end = play.duration + POST_PLAY;
    const remaining = Math.max(0, end - time.value);
    time.value = withTiming(end, { duration: (remaining * 1000) / speed, easing: Easing.linear }, (finished) => {
      if (finished) scheduleOnRN(advance);
    });
    return () => cancelAnimation(time);
  }, [pos, playing, speed, play, time, advance]);

  // A new game: back to the first play.
  useEffect(() => {
    setPos(0);
    lastPos.current = -1;
  }, [plays]);

  return {
    play,
    pos,
    count: plays.length,
    playing,
    speed,
    time,
    toggle: () => setPlaying((p) => !p),
    next: () => setPos((p) => Math.min(plays.length - 1, p + 1)),
    prev: () => setPos((p) => Math.max(0, p - 1)),
    cycleSpeed: () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!),
  };
}
