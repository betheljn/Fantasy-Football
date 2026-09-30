// The dynasty the app is running: loaded from the save (or built new), played
// week by week, then the playoffs round by round, then the offseason - saved
// after every step. Every screen reads the league from here (useLeague); the
// hub drives it (useDynasty). The sim decides everything; this only sequences it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addGameToSeason,
  allTeams,
  buildDynasty,
  computeRankings,
  createSeasonStats,
  divisionStandings,
  beginOffseason,
  finishOffseason,
  formatRecord,
  offseasonContractPlan,
  type ContractPlan,
  type OffseasonState,
  computeRecords,
  playGame,
  seasonSchedule,
  simulatePlayoffs,
  type DivisionStandings,
  type GameSummary,
  type League,
  type Player,
  type PlayoffResult,
  type RankingEntry,
  type Schedule,
  type SeasonStats,
  type Team,
} from "@dynasty/sim";
import { buildReport } from "../dynasty/report";
import { SAVE_VERSION, deserialize, serialize, type SaveState } from "../dynasty/save";
import { clearSave, loadText, saveText } from "../dynasty/storage";

export const PLAYOFF_ROUND_COUNT = 4;

export interface LeagueData {
  league: League;
  schedule: Schedule;
  results: GameSummary[];
  stats: SeasonStats;
  /** Weeks fully played. */
  weeksPlayed: number;
  standings: DivisionStandings[];
  rankings: RankingEntry[];
  playerById: Map<string, { player: Player; team: Team }>;
  userTeam: string;
  /** The playoffs once the regular season is over (rounds beyond playoffRoundsShown are still hidden). */
  playoffs: PlayoffResult | null;
  playoffRoundsShown: number;
}

export type Phase = "loading" | "start" | "building" | "choose" | "season" | "simming" | "playoffs" | "complete" | "offseason" | "resign" | "report";

export interface DynastyControls {
  phase: Phase;
  /** Progress of a long job (building a league, simulating to the end), 0-1. */
  progress: number;
  save: SaveState | null;
  newDynasty: () => void;
  chooseTeam: (abbr: string) => void;
  playWeek: () => void;
  playRegularSeason: () => void;
  playPlayoffRound: () => void;
  startOffseason: () => void;
  /** Your re-signing picture while the offseason waits on you. */
  contractPlan: ContractPlan | null;
  /** Finish the offseason keeping these expiring players. */
  finishOffseason: (keep: ReadonlySet<string>) => void;
  startNextSeason: () => void;
  deleteDynasty: () => void;
}

const LeagueContext = createContext<LeagueData | null>(null);
const DynastyContext = createContext<DynastyControls | null>(null);

/** League data; only available once a dynasty exists (screens outside the hub are hidden until then). */
export function useLeague(): LeagueData {
  const data = useContext(LeagueContext);
  if (!data) throw new Error("No dynasty loaded");
  return data;
}

export function useLeagueMaybe(): LeagueData | null {
  return useContext(LeagueContext);
}

export function useDynasty(): DynastyControls {
  const c = useContext(DynastyContext);
  if (!c) throw new Error("useDynasty outside LeagueProvider");
  return c;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveState | null>(null);
  const [busy, setBusy] = useState<"loading" | "building" | "offseason" | "simming" | null>("loading");
  const [progress, setProgress] = useState(0);
  /** The offseason paused for your decisions (in memory only; rebuilt identically if the app restarts). */
  const [offseason, setOffseason] = useState<OffseasonState | null>(null);
  const stateRef = useRef<SaveState | null>(null);
  stateRef.current = state;

  const persist = useCallback((s: SaveState) => {
    setState(s);
    saveText(serialize(s)).catch((e) => console.warn("Save failed", e));
  }, []);

  // Load the save, if there is one.
  useEffect(() => {
    loadText()
      .then((text) => setState(text ? deserialize(text) : null))
      .catch(() => setState(null))
      .finally(() => setBusy(null));
  }, []);

  const dynasty = state?.dynasty ?? null;
  const league = dynasty?.league ?? null;
  const schedule = useMemo(() => (dynasty ? seasonSchedule(dynasty) : null), [dynasty]);
  const results = state?.results;
  const standings = useMemo(() => (league && results ? divisionStandings(league, results) : []), [league, results]);
  const rankings = useMemo(() => (league && results ? computeRankings(league, results) : []), [league, results]);
  const seasonOver = !!schedule && !!state && state.weeksPlayed >= schedule.weeks;
  const playoffs = useMemo(() => {
    if (!league || !schedule || !results || !seasonOver) return null;
    return simulatePlayoffs(league, { season: schedule.season, schedule, results, standings });
  }, [league, schedule, results, seasonOver, standings]);
  const contractPlan = useMemo(() => (offseason && state?.userTeam ? offseasonContractPlan(offseason, state.userTeam) : null), [offseason, state?.userTeam]);
  const playerById = useMemo(() => {
    const m = new Map<string, { player: Player; team: Team }>();
    if (league) for (const team of allTeams(league)) for (const player of team.roster) m.set(player.id, { player, team });
    return m;
  }, [league]);

  const phase: Phase =
    busy === "loading" ? "loading"
    : busy === "building" ? "building"
    : busy === "offseason" ? "offseason"
    : busy === "simming" ? "simming"
    : !state ? "start"
    : state.report ? "report"
    : offseason ? "resign"
    : !state.userTeam ? "choose"
    : !seasonOver ? "season"
    : state.playoffRoundsShown < PLAYOFF_ROUND_COUNT ? "playoffs"
    : "complete";

  /** Play one week of the regular season onto a state (mutates its stats). */
  const playOneWeek = (s: SaveState, sched: Schedule): SaveState => {
    const week = s.weeksPlayed + 1;
    const played: GameSummary[] = [];
    for (const g of sched.games.filter((x) => x.week === week)) {
      const { summary, result } = playGame(s.dynasty.league, g);
      addGameToSeason(s.stats, result);
      played.push(summary);
    }
    return { ...s, weeksPlayed: week, results: [...s.results, ...played] };
  };

  const controls: DynastyControls = {
    phase,
    progress,
    save: state,
    newDynasty: () => {
      setBusy("building");
      setProgress(0);
      const seed = `D${Date.now().toString(36)}`;
      const steps = buildDynasty(seed);
      const step = () => {
        const r = steps.next();
        if (!r.done) {
          setProgress(r.value);
          setTimeout(step, 0);
          return;
        }
        persist({ version: SAVE_VERSION, seed, userTeam: "", dynasty: r.value, weeksPlayed: 0, results: [], stats: createSeasonStats(), playoffRoundsShown: 0, report: null });
        setBusy(null);
      };
      setTimeout(step, 50);
    },
    chooseTeam: (abbr) => {
      if (state) persist({ ...state, userTeam: abbr });
    },
    playWeek: () => {
      if (state && schedule && !seasonOver) persist(playOneWeek(state, schedule));
    },
    playRegularSeason: () => {
      if (!state || !schedule || seasonOver) return;
      setBusy("simming");
      (async () => {
        let s = state;
        while (s.weeksPlayed < schedule.weeks) {
          s = playOneWeek(s, schedule);
          setState(s);
          setProgress(s.weeksPlayed / schedule.weeks);
          await yieldToUi();
        }
        persist(s);
        setBusy(null);
      })();
    },
    playPlayoffRound: () => {
      if (state && seasonOver) persist({ ...state, playoffRoundsShown: Math.min(PLAYOFF_ROUND_COUNT, state.playoffRoundsShown + 1) });
    },
    startOffseason: () => {
      if (!state || !schedule || !playoffs) return;
      setBusy("offseason");
      // Let the "running the offseason" screen paint before the heavy work.
      setTimeout(() => {
        const s = stateRef.current!;
        const season = { season: schedule.season, schedule, results: s.results, standings };
        setOffseason(beginOffseason(s.dynasty, { season, stats: s.stats, playoffs }));
        setBusy(null);
      }, 50);
    },
    contractPlan,
    finishOffseason: (keep) => {
      if (!state || !offseason || !playoffs) return;
      setBusy("offseason");
      setTimeout(() => {
        const s = stateRef.current!;
        const { dynasty: after, log } = finishOffseason(offseason, { resign: { team: s.userTeam, keep } });
        const rec = computeRecords(s.dynasty.league, s.results).get(s.userTeam);
        const rank = playoffs.ranking.find((e) => e.team === s.userTeam)?.rank ?? null;
        const report = buildReport(s.userTeam, s.dynasty, after, log, rec ? formatRecord(rec) : "", rank, keep);
        setOffseason(null);
        persist({ ...s, dynasty: after, weeksPlayed: 0, results: [], stats: createSeasonStats(), playoffRoundsShown: 0, report });
        setBusy(null);
      }, 50);
    },
    startNextSeason: () => {
      if (state) persist({ ...state, report: null });
    },
    deleteDynasty: () => {
      clearSave().catch(() => undefined);
      setOffseason(null);
      setState(null);
    },
  };

  const data: LeagueData | null =
    state && league && schedule
      ? {
          league,
          schedule,
          results: state.results,
          stats: state.stats,
          weeksPlayed: state.weeksPlayed,
          standings,
          rankings,
          playerById,
          userTeam: state.userTeam,
          playoffs,
          playoffRoundsShown: state.playoffRoundsShown,
        }
      : null;

  return (
    <DynastyContext.Provider value={controls}>
      <LeagueContext.Provider value={data}>{children}</LeagueContext.Provider>
    </DynastyContext.Provider>
  );
}
