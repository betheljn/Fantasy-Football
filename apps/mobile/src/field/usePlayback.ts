// Drives the field: which play is showing, a shared clock that runs from just
// before the snap to the end of the play, whether that play has finished (so
// its result can be revealed), pause/resume, speed, seeking, and moving on to
// the next play after a short hold.
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelAnimation, Easing, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { PreparedPlay } from "../game/playback";

/** Seconds shown before the snap (formation) and held after the play ends. */
export const PRE_SNAP = 0.8;
export const POST_PLAY = 1.1;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export function usePlayback(plays: readonly PreparedPlay[]) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  /** The play position whose action has finished (its result is revealed). */
  const [donePos, setDonePos] = useState(-1);
  const time = useSharedValue(-PRE_SNAP);
  const shownPos = useRef(-1);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = plays.length - 1;
  const play = plays[Math.min(pos, Math.max(0, last))];
  const done = donePos === pos;

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const finish = useCallback((at: number) => setDonePos(at), []);

  // A new game: back to the first play.
  useEffect(() => {
    clearHold();
    shownPos.current = -1;
    setPos(0);
    setDonePos(-1);
    setPlaying(false);
  }, [plays]);

  useEffect(() => {
    if (!play) return;
    if (shownPos.current !== pos) {
      shownPos.current = pos;
      clearHold();
      cancelAnimation(time);
      time.value = -PRE_SNAP;
    }
    if (!playing) {
      cancelAnimation(time);
      clearHold();
      return;
    }
    if (done) {
      // Hold on the result, then move on (or stop at the end of the game).
      holdTimer.current = setTimeout(() => {
        if (pos >= last) setPlaying(false);
        else setPos(pos + 1);
      }, (POST_PLAY * 1000) / speed);
      return clearHold;
    }
    const end = play.duration;
    const remaining = Math.max(0, end - time.value);
    const at = pos;
    time.value = withTiming(end, { duration: (remaining * 1000) / speed, easing: Easing.linear }, (finished) => {
      if (finished) scheduleOnRN(finish, at);
    });
    return () => cancelAnimation(time);
  }, [pos, playing, speed, play, done, last, time, finish]);

  /** Jump to a play; its action replays from the snap. */
  const seek = (to: number) => {
    const p = Math.max(0, Math.min(last, to));
    shownPos.current = -1;
    setDonePos(-1);
    setPos(p);
  };

  return {
    play,
    pos,
    count: plays.length,
    playing,
    done,
    speed,
    time,
    toggle: () => setPlaying((p) => !p),
    next: () => seek(pos + 1),
    prev: () => seek(pos - 1),
    seek,
    /** Skip to the final whistle, with everything revealed. */
    toEnd: () => {
      setPlaying(false);
      clearHold();
      shownPos.current = last;
      setPos(last);
      setDonePos(last);
      cancelAnimation(time);
      time.value = plays[last]?.duration ?? 0;
    },
    cycleSpeed: () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!),
  };
}
