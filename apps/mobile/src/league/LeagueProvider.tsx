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
  REGULAR_SEASON_WEEKS,
  SCOUTING,
  advanceScoutingWeek,
  beginOffseason,
  completeOffseason,
  createScouting,
  generateDraftClass,
  offseasonDraft,
  offseasonFreeAgencyPlan,
  type FreeAgencyPlan,
  type FreeAgentOffer,
  resolveContracts,
  type DraftClass,
  type DraftResult,
  type DraftTurn,
  type ScoutingState,
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
/** Scouting points you get each week (as every team does). */
export const SCOUT_POINTS = SCOUTING.pointsPerWeek;

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

export type Phase = "loading" | "start" | "building" | "choose" | "season" | "simming" | "playoffs" | "complete" | "offseason" | "resign" | "draft" | "freeagency" | "report";

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
  /** Settle re-signings (keeping these expiring players) and go to the draft. */
  finishOffseason: (keep: ReadonlySet<string>) => void;
  /** Next year's draft class and everyone's scouting of it (this season). */
  draftClass: DraftClass | null;
  scouting: ScoutingState | null;
  /** Your points for the coming week, and changing them (+/- points on a prospect). */
  scoutPlan: SaveState["scoutPlan"];
  assignScouting: (prospect: string, delta: number) => void;
  /** Your pick on the clock during the draft. */
  draftTurn: DraftTurn | null;
  draftPick: (prospect: string) => void;
  /** Take the best player on your board with each of your remaining picks. */
  autoDraft: () => void;
  /** The free-agent market after the draft, your offers, and opening free agency. */
  freeAgencyPlan: FreeAgencyPlan | null;
  offers: ReadonlyMap<string, FreeAgentOffer>;
  setOffer: (player: string, offer: FreeAgentOffer | null) => void;
  /** Let your front office bid on players you made no offer to. */
  frontOffice: boolean;
  setFrontOffice: (on: boolean) => void;
  openFreeAgency: () => void;
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
  const [draftTurn, setDraftTurn] = useState<DraftTurn | null>(null);
  /** The finished draft, while you make free-agent offers. */
  const [draftDone, setDraftDone] = useState<DraftResult | null>(null);
  const [offers, setOffers] = useState<ReadonlyMap<string, FreeAgentOffer>>(new Map());
  const [frontOffice, setFrontOffice] = useState(true);
  const draftRef = useRef<Generator<DraftTurn, DraftResult, string> | null>(null);
  /** Expiring players you chose to keep (for the report). */
  const keptRef = useRef<ReadonlySet<string>>(new Set());
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
  const draftClass = useMemo(() => (league ? generateDraftClass(league) : null), [league]);
  const freeAgencyPlanValue = useMemo(
    () => (offseason?.contracts && draftDone && state?.userTeam ? offseasonFreeAgencyPlan(offseason, draftDone, state.userTeam) : null),
    [offseason, draftDone, state?.userTeam],
  );
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
    : offseason?.contracts && draftDone ? "freeagency"
    : offseason?.contracts && draftTurn ? "draft"
    : offseason ? "resign"
    : !state.userTeam ? "choose"
    : !seasonOver ? "season"
    : state.playoffRoundsShown < PLAYOFF_ROUND_COUNT ? "playoffs"
    : "complete";

  /** Play one week of the regular season onto a state (mutates its stats), and a week of scouting. */
  const playOneWeek = (s: SaveState, sched: Schedule): SaveState => {
    const week = s.weeksPlayed + 1;
    const played: GameSummary[] = [];
    for (const g of sched.games.filter((x) => x.week === week)) {
      const { summary, result } = playGame(s.dynasty.league, g);
      addGameToSeason(s.stats, result);
      played.push(summary);
    }
    let scouting = s.scouting;
    if (draftClass) {
      const current = scouting ?? createScouting(s.dynasty.league, draftClass);
      // Your points if you assigned any; otherwise your scouts pick (as they do for every other team).
      const choices = s.scoutPlan.length > 0 ? { [s.userTeam]: s.scoutPlan } : {};
      scouting = current.week < REGULAR_SEASON_WEEKS ? advanceScoutingWeek(current, s.dynasty.league, draftClass, choices) : current;
    }
    return { ...s, weeksPlayed: week, results: [...s.results, ...played], scouting, scoutPlan: [] };
  };

  /** Free agency and the rest of the offseason, then the report. */
  const completeWith = (draft: DraftResult, myOffers: ReadonlyMap<string, FreeAgentOffer>, foBids: boolean) => {
    const s = stateRef.current;
    const off = offseason;
    if (!s || !off || !playoffs) return;
    setBusy("offseason");
    setDraftTurn(null);
    setDraftDone(null);
    draftRef.current = null;
    setTimeout(() => {
      const { dynasty: after, log } = completeOffseason(off, draft, { team: s.userTeam, offers: myOffers, frontOffice: foBids });
      const rec = computeRecords(s.dynasty.league, s.results).get(s.userTeam);
      const rank = playoffs.ranking.find((e) => e.team === s.userTeam)?.rank ?? null;
      const report = buildReport(s.userTeam, s.dynasty, after, log, rec ? formatRecord(rec) : "", rank, keptRef.current, myOffers);
      setOffers(new Map());
      setOffseason(null);
      persist({ ...s, dynasty: after, weeksPlayed: 0, results: [], stats: createSeasonStats(), playoffRoundsShown: 0, report, scouting: null, scoutPlan: [] });
      setBusy(null);
    }, 50);
  };

  /** Draft over: on to free agency. */
  const finishDraft = (draft: DraftResult) => {
    setDraftTurn(null);
    draftRef.current = null;
    setDraftDone(draft);
  };

  /** Move the draft on with your pick (or start it with undefined). */
  const stepDraft = (pick: string | undefined) => {
    const gen = draftRef.current;
    if (!gen) return;
    const r = pick === undefined ? gen.next() : gen.next(pick);
    if (r.done) finishDraft(r.value);
    else setDraftTurn(r.value);
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
        persist({ version: SAVE_VERSION, seed, userTeam: "", dynasty: r.value, weeksPlayed: 0, results: [], stats: createSeasonStats(), playoffRoundsShown: 0, report: null, scouting: null, scoutPlan: [] });
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
        setOffseason(beginOffseason(s.dynasty, { season, stats: s.stats, playoffs, ...(s.scouting ? { scouting: s.scouting } : {}) }));
        setBusy(null);
      }, 50);
    },
    contractPlan,
    finishOffseason: (keep) => {
      if (!state || !offseason || !playoffs) return;
      keptRef.current = keep;
      const withContracts = resolveContracts(offseason, { team: state.userTeam, keep });
      setOffseason(withContracts);
      draftRef.current = offseasonDraft(withContracts, new Set([state.userTeam]));
      stepDraft(undefined);
    },
    draftClass,
    // On draft day, the finished scouting (every week plus the combine).
    scouting: offseason?.scouting ?? state?.scouting ?? null,
    scoutPlan: state?.scoutPlan ?? [],
    assignScouting: (prospect, delta) => {
      if (!state) return;
      const used = state.scoutPlan.reduce((n, a) => n + a.points, 0);
      const current = state.scoutPlan.find((a) => a.prospect === prospect)?.points ?? 0;
      const points = Math.max(0, Math.min(current + delta, current + (SCOUT_POINTS - used)));
      const rest = state.scoutPlan.filter((a) => a.prospect !== prospect);
      persist({ ...state, scoutPlan: points > 0 ? [...rest, { prospect, points }] : rest });
    },
    draftTurn,
    draftPick: (prospect) => stepDraft(prospect),
    autoDraft: () => {
      const gen = draftRef.current;
      if (!gen || !draftTurn) return;
      let r = gen.next(draftTurn.board[0]!.prospect.player.id);
      while (!r.done) r = gen.next(r.value.board[0]!.prospect.player.id);
      finishDraft(r.value);
    },
    freeAgencyPlan: freeAgencyPlanValue,
    offers,
    setOffer: (player, offer) =>
      setOffers((o) => {
        const n = new Map(o);
        if (offer) n.set(player, offer);
        else n.delete(player);
        return n;
      }),
    openFreeAgency: () => {
      if (draftDone) completeWith(draftDone, offers, frontOffice);
    },
    frontOffice,
    setFrontOffice,
    startNextSeason: () => {
      if (state) persist({ ...state, report: null });
    },
    deleteDynasty: () => {
      clearSave().catch(() => undefined);
      setOffseason(null);
      setDraftTurn(null);
      setDraftDone(null);
      setOffers(new Map());
      draftRef.current = null;
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
