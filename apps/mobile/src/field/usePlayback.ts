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

/** Touchdowns hold a little longer, for the celebration. */
const holdFor = (play: PreparedPlay) => (play.outcome.touchdown ? 2.4 : POST_PLAY);

/**
 * `follow`: the plays grow as a game is played (a coached game). New plays
 * play on from where you are instead of starting the game over.
 */
export function usePlayback(plays: readonly PreparedPlay[], follow = false) {
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

  /** Plays seen so far (-1 before the first). */
  const seen = useRef(-1);
  const live = useRef({ pos, playing });
  live.current = { pos, playing };
  // A new game: back to the first play. Following a game in progress: play on into the new plays.
  useEffect(() => {
    const before = seen.current;
    seen.current = plays.length;
    if (follow && before === -1 && plays.length > 0) {
      // Picking a game back up: start on the latest play, already played.
      const at = plays.length - 1;
      shownPos.current = at;
      setPos(at);
      setDonePos(at);
      setPlaying(false);
      time.value = (plays[at]?.duration ?? 0) + 0.5;
      return;
    }
    if (follow && before > 0 && plays.length >= before) {
      // Still working through earlier plays: they run on into the new ones by themselves.
      if (plays.length === before || live.current.playing) return;
      clearHold();
      shownPos.current = -1;
      setPos(live.current.pos >= before - 1 ? before : live.current.pos);
      setDonePos(-1);
      setPlaying(true);
      return;
    }
    clearHold();
    shownPos.current = -1;
    setPos(0);
    setDonePos(-1);
    setPlaying(follow && plays.length > 0);
  }, [plays, follow, time]);

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
      // Hold on the result (the clock keeps running, so the play's moment can play out), then move on.
      const hold = holdFor(play);
      time.value = withTiming(play.duration + hold, { duration: (hold * 1000) / speed, easing: Easing.linear });
      holdTimer.current = setTimeout(() => {
        if (pos >= last) setPlaying(false);
        else setPos(pos + 1);
      }, (hold * 1000) / speed);
      return () => {
        clearHold();
        cancelAnimation(time);
      };
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
      // Just past the whistle, so the last play's banner shows.
      time.value = (plays[last]?.duration ?? 0) + 0.5;
    },
    cycleSpeed: () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!),
  };
}
