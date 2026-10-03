// The online offseason's open stage, worked out on the phone: the same sim
// code the server runs, from the downloaded save and the calls of the stages
// already closed, so the plans you see are the ones the server will use.
import { useEffect, useState } from "react";
import { divisionStandings, seasonSchedule, stagedOffseason, type OffseasonStage, type PlayedSeason, type StagedOffseason } from "@dynasty/sim";
import type { SaveState } from "../dynasty/save";
import { useDynasty } from "../league/LeagueProvider";

/** The season as the server hands it to the offseason. */
export function playedFrom(save: SaveState): PlayedSeason {
  const schedule = seasonSchedule(save.dynasty);
  const season = { season: schedule.season, schedule, results: save.results, standings: divisionStandings(save.dynasty.league, save.results) };
  return { season, stats: save.stats, playoffs: save.playoffs!, trades: save.trades, ...(save.collection ? { collection: save.collection } : {}) };
}

/** The open stage's starting point (null while it's being worked out: a few seconds for the later stages). */
export function useStagedOffseason(): { stage: OffseasonStage; staged: StagedOffseason } | null {
  const d = useDynasty();
  const off = d.online?.offseason;
  const save = d.save;
  // Earlier stages' calls only change when a stage closes, so the stage (and season) is the key.
  const key = off && save ? `${d.online!.id}:${save.dynasty.league.season}:${off.stage}` : null;
  const [result, setResult] = useState<{ key: string; stage: OffseasonStage; staged: StagedOffseason } | null>(null);
  useEffect(() => {
    if (!key || !off || !save || result?.key === key) return;
    // Let the screen draw its "working it out" state first.
    const timer = setTimeout(() => setResult({ key, stage: off.stage, staged: stagedOffseason(save.dynasty, playedFrom(save), off.choices, off.stage) }), 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result && result.key === key ? result : null;
}
