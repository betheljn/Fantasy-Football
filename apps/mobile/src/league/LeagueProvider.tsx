// The dynasty the app is running: loaded from a save slot (or built new), played
// week by week, then the playoffs round by round, then the offseason - saved
// after every step (mid-offseason, as a checkpoint of your calls so far). Every screen reads the league from here (useLeague); the
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
  offseasonRosterPlan,
  offseasonStaffReleases,
  staffCandidates,
  staffOverview,
  type PlayedSeason,
  type StaffOpening,
  type StaffReleases,
  type StaffSeat,
  type StaffSlot,
  runOffseasonFreeAgency,
  type Position,
  type RosterPlan,
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
  type TeamRecord,
  type TradeProposal,
  type TradeVerdict,
  aiTradeWeek,
  aiInSeasonMoves,
  localFeed,
  nationalFeed,
  rivalries,
  rivalryGames,
  rivalryNews,
  collectSeason,
  collectWeek,
  startCollection,
  addToRecords,
  emptyRecords,
  gradeHostPicks,
  radioShow,
  weeklyNews,
  buildBoxScore,
  boardGames,
  isOwnGame,
  linesSteps,
  ownPicks,
  settleSlate,
  slateProblems,
  topUp,
  SLATE_RULES,
  type GameLines,
  type Slate,
  type SlatePick,
  ensureFreeAgents,
  injuryNews,
  irProblems,
  placeOnIR,
  signFreeAgent,
  signingProblems,
  teamPlayers,
  playWeek,
  applyTrade,
  checkTrade,
  draftOrder,
  draftWeekTrades,
  draftWeekWindow,
  judgeTrade,
  seasonWindow,
  tradesOpen,
  type TradeWindow,
} from "@dynasty/sim";
import { buildReport } from "../dynasty/report";
import { DRAFT_WEEK, logTeam, logTrades, startLog } from "../dynasty/lineups";
import { SAVE_VERSION, type OffseasonProgress, type PicksState, type RadioState, type SaveState, type SlotInfo } from "../dynasty/save";
import { closeSlot, deleteSlot, freeSlot, loadSlot, readIndex, touchSlot, writeProgress, writeSlot, type SlotIndex } from "../dynasty/slots";

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
  /** Every team's record so far (computed once per week played). */
  records: Map<string, TeamRecord>;
  rankings: RankingEntry[];
  playerById: Map<string, { player: Player; team: Team }>;
  userTeam: string;
  /** The playoffs once the regular season is over (rounds beyond playoffRoundsShown are still hidden). */
  playoffs: PlayoffResult | null;
  playoffRoundsShown: number;
}

export type Phase = "loading" | "start" | "building" | "choose" | "season" | "simming" | "playoffs" | "complete" | "offseason" | "staff" | "hire" | "resign" | "draft" | "freeagency" | "cuts" | "report";

export interface DynastyControls {
  phase: Phase;
  /** Progress of a long job (building a league, simulating to the end), 0-1. */
  progress: number;
  save: SaveState | null;
  /** Your save slots, the one you're playing, and whether there's room for another dynasty. */
  slots: SlotInfo[];
  slot: number | null;
  canStartNew: boolean;
  openSlot: (slot: number) => void;
  deleteSlot: (slot: number) => void;
  /** Back to the save list (this dynasty stays saved). */
  closeDynasty: () => void;
  newDynasty: () => void;
  chooseTeam: (abbr: string) => void;
  playWeek: () => void;
  playRegularSeason: () => void;
  playPlayoffRound: () => void;
  startOffseason: () => void;
  /** Your staff as the offseason opens, and your fire/renew calls. */
  staffSeats: { budget: number; committed: number; seats: StaffSeat[] } | null;
  confirmStaff: (fire: ReadonlySet<StaffSlot>, renew: ReadonlySet<StaffSlot>) => void;
  /** Open seats on your staff and who you could hire; then hiring (missing picks are your front office's). */
  staffOpenings: { budget: number; committed: number; openings: StaffOpening[] } | null;
  confirmHires: (picks: ReadonlyMap<StaffSlot, string>) => void;
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
  /** Your roster after free agency, and finishing the offseason with your cuts. */
  rosterPlan: RosterPlan | null;
  finishCuts: (cuts: ReadonlySet<string>) => void;
  /** Reorder your depth chart at a position (regular season only). */
  canEditDepthChart: boolean;
  /** Your depth chart is locked: you have picks on your own players this week. */
  depthLocked: boolean;
  setDepthChart: (pos: Position, ids: string[]) => void;
  /** Picks: your points and slates; the board for the coming week (worked out on request, with progress). */
  picks: PicksState;
  board: GameLines[] | null;
  /** The board is missing your own game (it's worked out again). */
  boardNeedsOwn: boolean;
  boardProgress: number | null;
  loadBoard: () => void;
  placeSlate: (picks: SlatePick[], stake: number) => string[];
  /** The slate you're building (shared by the picks board and the radio show; cleared when the week moves on). */
  draft: SlatePick[];
  /** Add a pick (or switch its side, or take it off if it's already there on that side). */
  toggleDraft: (pick: SlatePick) => void;
  clearDraft: () => void;
  /** In-season moves (regular season only): injured reserve and free-agent signings. */
  canMakeMoves: boolean;
  placeOnIR: (player: string) => string[];
  signFreeAgent: (player: string) => string[];
  /** Trades: open from the preseason to the deadline, and in draft week (after the championship); null when closed. */
  tradeWindow: TradeWindow | null;
  canTrade: boolean;
  /** Offer a trade to another team: made if their GM accepts. */
  proposeTrade: (t: TradeProposal) => { made: boolean; problems: string[]; verdict: TradeVerdict | null };
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

const newRadio = (): RadioState => ({ shows: [], records: emptyRecords(), last: [] });

const newPicks = (): PicksState => ({ balance: SLATE_RULES.startingBalance, board: null, open: [], history: [] });

/** Your game this week is missing from the board (worked out again after a depth-chart change). */
function needsOwnLines(s: SaveState | null, schedule: Schedule | null): boolean {
  const lines = boardFor(s, schedule);
  if (!s || !schedule || !lines) return false;
  const plays = schedule.games.some((g) => g.week === s.weeksPlayed + 1 && isOwnGame(g, s.userTeam));
  return plays && !lines.some((l) => isOwnGame(l.game, s.userTeam));
}

/** The board for the coming week, if it's been worked out. */
function boardFor(s: SaveState | null, schedule: Schedule | null): GameLines[] | null {
  const b = s?.picks?.board;
  return b && schedule && b.season === schedule.season && b.week === s!.weeksPlayed + 1 ? b.lines : null;
}

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveState | null>(null);
  const [busy, setBusy] = useState<"loading" | "building" | "offseason" | "simming" | null>("loading");
  const [progress, setProgress] = useState(0);
  const [slotIndex, setSlotIndex] = useState<SlotIndex>({ active: null, slots: [] });
  const [slot, setSlot] = useState<number | null>(null);
  const slotRef = useRef<number | null>(null);
  slotRef.current = slot;
  /** Your calls so far in this offseason (the checkpoint), and one waiting to be replayed after loading. */
  const checkpointRef = useRef<OffseasonProgress | null>(null);
  const [restoring, setRestoring] = useState<OffseasonProgress | null>(null);
  /** The offseason paused for your decisions (in memory; rebuilt from the checkpoint after a restart). */
  const [offseason, setOffseason] = useState<OffseasonState | null>(null);
  /** The staff step that opens the offseason (in memory, like the rest of the offseason). */
  const [staffStep, setStaffStep] = useState<null | { step: "decide" } | { step: "hire"; releases: StaffReleases; fire: ReadonlySet<StaffSlot>; renew: ReadonlySet<StaffSlot> }>(null);
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

  /** Saves run one after another, and a burst of quick changes (scouting taps) is written once. */
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useCallback((job: () => Promise<unknown>) => {
    saveChain.current = saveChain.current.then(job).catch((e) => console.warn("Save failed", e));
  }, []);

  const persist = useCallback(
    (s: SaveState, now = false) => {
      setState(s);
      const n = slotRef.current;
      if (n === null) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const write = () => queue(() => writeSlot(n, s, checkpointRef.current).then(setSlotIndex));
      if (now) write();
      else
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          write();
        }, 250);
    },
    [queue],
  );

  /** Save your latest offseason call (or clear the checkpoint once the offseason is over). */
  const checkpoint = useCallback(
    (p: OffseasonProgress | null) => {
      const relabel = (checkpointRef.current === null) !== (p === null);
      checkpointRef.current = p;
      const n = slotRef.current;
      const s = stateRef.current;
      if (n === null) return;
      queue(async () => {
        await writeProgress(n, p);
        if (relabel && s) setSlotIndex(await touchSlot(n, s, p));
      });
    },
    [queue],
  );
  const updateCheckpoint = (f: (p: OffseasonProgress) => OffseasonProgress) => {
    if (checkpointRef.current) checkpoint(f(checkpointRef.current));
  };

  /** Forget the offseason in memory (switching or deleting a dynasty). */
  const resetOffseason = () => {
    setOffseason(null);
    setStaffStep(null);
    setDraftTurn(null);
    setDraftDone(null);
    setOffers(new Map());
    setFrontOffice(true);
    draftRef.current = null;
    keptRef.current = new Set();
    checkpointRef.current = null;
    setRestoring(null);
  };

  const openSlotNow = (n: number) => {
    setBusy("loading");
    resetOffseason();
    loadSlot(n)
      .then(({ state: loaded, progress: p }) => {
        setSlot(loaded ? n : null);
        // Saves from before in-season free agents get a pool to sign from.
        setState(loaded && !loaded.dynasty.league.freeAgents ? { ...loaded, dynasty: { ...loaded.dynasty, league: ensureFreeAgents(loaded.dynasty.league) } } : loaded);
        checkpointRef.current = p;
        setRestoring(p);
        if (loaded) queue(() => touchSlot(n, loaded, p).then(setSlotIndex));
      })
      .catch(() => setState(null))
      .finally(() => setBusy(null));
  };

  // Open the slot you were playing last, if any.
  useEffect(() => {
    readIndex()
      .then((index) => {
        setSlotIndex(index);
        if (index.active !== null && index.slots.some((x) => x.slot === index.active)) openSlotNow(index.active);
        else setBusy(null);
      })
      .catch(() => setBusy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dynasty = state?.dynasty ?? null;
  const league = dynasty?.league ?? null;
  const schedule = useMemo(() => (dynasty ? seasonSchedule(dynasty) : null), [dynasty]);
  const results = state?.results;
  const standings = useMemo(() => (league && results ? divisionStandings(league, results) : []), [league, results]);
  const rankings = useMemo(() => (league && results ? computeRankings(league, results) : []), [league, results]);
  const records = useMemo(() => (league && results ? computeRecords(league, results) : new Map<string, TeamRecord>()), [league, results]);
  const seasonOver = !!schedule && !!state && state.weeksPlayed >= schedule.weeks;
  // The playoffs are played on the rosters as the regular season ended (saved
  // then), so draft-week trades can't change them.
  const savedPlayoffs = state?.playoffs ?? null;
  const playoffs = useMemo(() => {
    if (savedPlayoffs) return savedPlayoffs;
    if (!league || !schedule || !results || !seasonOver) return null;
    return simulatePlayoffs(league, { season: schedule.season, schedule, results, standings });
  }, [savedPlayoffs, league, schedule, results, seasonOver, standings]);
  const draftClass = useMemo(() => (league ? generateDraftClass(league) : null), [league]);
  const freeAgencyPlanValue = useMemo(
    () => (offseason?.contracts && draftDone && state?.userTeam ? offseasonFreeAgencyPlan(offseason, draftDone, state.userTeam) : null),
    [offseason, draftDone, state?.userTeam],
  );
  const staffSeats = useMemo(
    () => (staffStep?.step === "decide" && state?.userTeam ? staffOverview(state.dynasty.league, state.dynasty.staffCareers, state.userTeam) : null),
    [staffStep, state?.dynasty, state?.userTeam],
  );
  const staffOpenings = useMemo(() => (staffStep?.step === "hire" && state?.userTeam ? staffCandidates(staffStep.releases, state.userTeam) : null), [staffStep, state?.userTeam]);
  const rosterPlanValue = useMemo(() => (offseason?.freeAgency && state?.userTeam ? offseasonRosterPlan(offseason, state.userTeam) : null), [offseason, state?.userTeam]);
  const contractPlan = useMemo(() => (offseason && state?.userTeam ? offseasonContractPlan(offseason, state.userTeam) : null), [offseason, state?.userTeam]);
  const playerById = useMemo(() => {
    const m = new Map<string, { player: Player; team: Team }>();
    if (league) for (const team of allTeams(league)) for (const player of teamPlayers(team)) m.set(player.id, { player, team });
    return m;
  }, [league]);

  // After loading a slot mid-offseason: replay your calls so far through the
  // sim (deterministic, so it lands exactly where you left off).
  useEffect(() => {
    const p = restoring;
    const s = state;
    if (!p || !s || busy) return;
    setRestoring(null);
    const played = playedSeason();
    if (!played || p.season !== played.season.season) {
      checkpoint(null);
      return;
    }
    if (!p.staff) {
      setStaffStep({ step: "decide" });
      return;
    }
    const fire = new Set(p.staff.fire);
    const renew = new Set(p.staff.renew);
    const decisions = { team: s.userTeam, fire, renew };
    if (!p.hires) {
      setStaffStep({ step: "hire", releases: offseasonStaffReleases(s.dynasty, played, decisions), fire, renew });
      return;
    }
    setBusy("offseason");
    setTimeout(() => {
      try {
        let off = beginOffseason(s.dynasty, played, { decisions, hires: { team: s.userTeam, picks: new Map(p.hires) } });
        setOffers(new Map(p.offers));
        setFrontOffice(p.frontOffice);
        if (p.keep) {
          keptRef.current = new Set(p.keep);
          off = resolveContracts(off, { team: s.userTeam, keep: keptRef.current });
          const gen = offseasonDraft(off, new Set([s.userTeam]));
          let r = gen.next();
          for (const pick of p.picks) {
            if (r.done) break;
            r = gen.next(pick);
          }
          if (!r.done) {
            draftRef.current = gen;
            setDraftTurn(r.value);
          } else {
            setDraftDone(r.value);
            if (p.freeAgencyDone) off = runOffseasonFreeAgency(off, r.value, { team: s.userTeam, offers: new Map(p.offers), frontOffice: p.frontOffice });
          }
        }
        setOffseason(off);
      } catch (e) {
        // A checkpoint that no longer fits (it shouldn't happen): start the offseason over.
        console.warn("Couldn't restore the offseason", e);
        resetOffseason();
        checkpoint({ season: played.season.season, picks: [], offers: [], frontOffice: true });
        setStaffStep({ step: "decide" });
      }
      setBusy(null);
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoring, state, busy, playoffs]);

  const [boardProgress, setBoardProgress] = useState<number | null>(null);
  const [draft, setDraft] = useState<SlatePick[]>([]);
  // A new week, a new slate.
  useEffect(() => setDraft([]), [state?.weeksPlayed, state?.dynasty.league.season]);
  // With picks riding on your own players this week, your depth chart is locked until it's played.
  const depthLocked = !!state && (state.picks?.open ?? []).some((x) => x.week === state.weeksPlayed + 1 && ownPicks(x.picks, state.userTeam).length > 0);
  const boardJob = useRef<object | null>(null);

  const canMakeMoves = !!state?.userTeam && !offseason && !staffStep && !state?.report && !busy && !seasonOver;

  // Trading: preseason through the deadline, and draft week (season over, playoffs done, offseason not begun).
  const tradeWindow = useMemo((): TradeWindow | null => {
    if (!state?.userTeam || !league || offseason || staffStep || state.report || busy) return null;
    if (!seasonOver) return tradesOpen(state.weeksPlayed) ? seasonWindow(league, state.weeksPlayed) : null;
    if (playoffs && state.playoffRoundsShown >= PLAYOFF_ROUND_COUNT) return draftWeekWindow(league, draftOrder(playoffs));
    return null;
  }, [state?.userTeam, state?.report, state?.weeksPlayed, state?.playoffRoundsShown, league, offseason, staffStep, busy, seasonOver, playoffs]);

  const phase: Phase =
    busy === "loading" ? "loading"
    : busy === "building" ? "building"
    : busy === "offseason" ? "offseason"
    : busy === "simming" ? "simming"
    : !state ? "start"
    : state.report ? "report"
    : staffStep?.step === "decide" ? "staff"
    : staffStep?.step === "hire" ? "hire"
    : offseason?.freeAgency ? "cuts"
    : offseason?.contracts && draftDone ? "freeagency"
    : offseason?.contracts && draftTurn ? "draft"
    : offseason ? "resign"
    : !state.userTeam ? "choose"
    : !seasonOver ? "season"
    : state.playoffRoundsShown < PLAYOFF_ROUND_COUNT ? "playoffs"
    : "complete";

  /** Play one week of the regular season onto a state (mutates its stats), and a week of scouting. */
  /**
   * The season opens: rosters logged for replays, and the first round of AI
   * trade talks (before week 1). After that, talks follow each week's games,
   * so the league you see is always the one that plays.
   */
  const openSeason = (s: SaveState): SaveState => {
    const before = s.dynasty.league;
    const talks = aiTradeWeek(before, seasonWindow(before, 0), new Set([s.userTeam]));
    const lineups = logTrades(startLog(before), before, talks.league, talks.trades, 1);
    return { ...s, dynasty: { ...s.dynasty, league: talks.league }, trades: [...s.trades, ...talks.trades], lineups };
  };

  const playOneWeek = (s: SaveState, sched: Schedule): SaveState => {
    const week = s.weeksPlayed + 1;
    // A save from before lineups were logged starts its log now.
    let lineups = s.lineups ?? startLog(s.dynasty.league);
    // The week's games (injured players sit), then injuries move on a week.
    const week_ = playWeek(s.dynasty.league, sched, week, (g) => addGameToSeason(s.stats, g));
    const collection = collectWeek(s.collection ?? startCollection(s.dynasty.recordBook), s.dynasty.league, sched.season, week_.games, s.userTeam);
    const news = injuryNews(s.dynasty.league, week_.games.flatMap((g) => g.result.injuries), week);
    // Settle this week's slates, then the weekly top-up.
    const before = s.picks ?? newPicks();
    const due = before.open.filter((x) => x.week === week && x.season === sched.season);
    const onAir = (s.radio?.shows ?? []).find((x) => x.season === sched.season && x.week === week);
    const needed = new Set([...due.flatMap((x) => x.picks.map((p) => p.prop.game)), ...(onAir?.picks ?? []).map((p) => p.prop.game)]);
    const boxes = new Map(week_.games.filter((g) => needed.has(g.summary.id)).map((g) => [g.summary.id, { summary: g.summary, box: buildBoxScore(g.result) }]));
    const settled = due.map((x) => settleSlate(x, boxes));
    // The hosts' picks are graded too.
    const graded = onAir ? gradeHostPicks(onAir.picks, boxes) : [];
    const radioBefore = s.radio ?? newRadio();
    const radio = { ...radioBefore, records: addToRecords(radioBefore.records, graded), last: graded };
    const picks: PicksState = {
      balance: topUp(before.balance + settled.reduce((n, x) => n + x.payout, 0)),
      board: null,
      open: before.open.filter((x) => !(x.week === week && x.season === sched.season)),
      history: [...before.history, ...settled],
    };
    // The AI teams' moves: long injuries to IR, free agents signed (you make your own).
    const ai = aiInSeasonMoves(week_.league, sched.season, week, new Set([s.userTeam]));
    for (const abbr of new Set(ai.moves.map((m) => m.team))) lineups = logTeam(lineups, ai.league.teams[abbr]!, week + 1);
    let league = ai.league;
    const played: GameSummary[] = week_.games.map((g) => g.summary);
    // Trade talks around the league for next week (you're left out: you make your own).
    const traded = new Set(s.trades.flatMap((t) => t.players.map((p) => p.id)));
    const talks = aiTradeWeek(league, seasonWindow(league, week), new Set([s.userTeam]), traded);
    lineups = logTrades(lineups, league, talks.league, talks.trades, week + 1);
    league = talks.league;
    let scouting = s.scouting;
    if (draftClass) {
      const current = scouting ?? createScouting(league, draftClass);
      // Your points if you assigned any; otherwise your scouts pick (as they do for every other team).
      const choices = s.scoutPlan.length > 0 ? { [s.userTeam]: s.scoutPlan } : {};
      scouting = current.week < REGULAR_SEASON_WEEKS ? advanceScoutingWeek(current, league, draftClass, choices) : current;
    }
    const dynasty = { ...s.dynasty, league };
    const allResults = [...s.results, ...played];
    // The week's news: the national feed and everything about your team.
    const rankBefore = computeRankings(s.dynasty.league, s.results);
    const rankAfter = computeRankings(league, allResults, rankBefore);
    // Rivalry games this week: trophies kept or changing hands.
    const rivals = rivalries(league.seed);
    const rivalryBefore = [...(s.dynasty.rivalryGames ?? []), ...rivalryGames(rivals, s.results, sched.season)];
    const rivalryStories = rivalryNews(league, rivals, rivalryBefore, rivalryGames(rivals, played, sched.season));
    const stories = [...weeklyNews({ league, schedule: sched, season: sched.season, week, games: week_.games, results: allResults, before: rankBefore, after: rankAfter, stats: s.stats, injuries: news, trades: talks.trades, userTeam: s.userTeam }), ...rivalryStories].sort((a, b) => b.importance - a.importance);
    const national = nationalFeed(stories);
    // Rivalry results always make the paper, whatever else happened.
    const kept = [...new Set([...national, ...rivalryStories, ...localFeed(stories, s.userTeam)])];
    // Regular season over: the playoffs are decided now, on these rosters.
    const final = week === sched.weeks ? simulatePlayoffs(league, { season: sched.season, schedule: sched, results: allResults, standings: divisionStandings(league, allResults) }) : undefined;
    return { ...s, dynasty, weeksPlayed: week, results: allResults, scouting, scoutPlan: [], trades: [...s.trades, ...talks.trades], lineups, injuryNews: [...(s.injuryNews ?? []), ...news], moves: [...(s.moves ?? []), ...ai.moves], picks, radio, collection, news: [...(s.news ?? []), ...kept], ...(final ? { playoffs: final } : {}) };
  };

  /** The season as played, for the offseason. */
  const playedSeason = (): PlayedSeason | null => {
    const s = stateRef.current;
    if (!s || !schedule || !playoffs) return null;
    const season = { season: schedule.season, schedule, results: s.results, standings };
    return { season, stats: s.stats, playoffs, ...(s.scouting ? { scouting: s.scouting } : {}), ...(s.collection ? { collection: s.collection } : {}) };
  };

  /** After your staff calls: staff moves, retirements and development, then re-signings. */
  const startRestOfOffseason = (fire: ReadonlySet<StaffSlot>, renew: ReadonlySet<StaffSlot>, picks: ReadonlyMap<StaffSlot, string>) => {
    const s = stateRef.current;
    const played = playedSeason();
    if (!s || !played) return;
    setBusy("offseason");
    setStaffStep(null);
    updateCheckpoint((p) => ({ ...p, staff: { fire: [...fire], renew: [...renew] }, hires: [...picks] }));
    // Let the "running the offseason" screen paint before the heavy work.
    setTimeout(() => {
      setOffseason(beginOffseason(s.dynasty, played, { decisions: { team: s.userTeam, fire, renew }, hires: { team: s.userTeam, picks } }));
      setBusy(null);
    }, 50);
  };

  /** Free agency (with your offers); roster cuts come next. */
  const runFreeAgencyNow = (draft: DraftResult, myOffers: ReadonlyMap<string, FreeAgentOffer>, foBids: boolean) => {
    const s = stateRef.current;
    const off = offseason;
    if (!s || !off) return;
    setBusy("offseason");
    updateCheckpoint((p) => ({ ...p, offers: [...myOffers], frontOffice: foBids, freeAgencyDone: true }));
    setTimeout(() => {
      setOffseason(runOffseasonFreeAgency(off, draft, { team: s.userTeam, offers: myOffers, frontOffice: foBids }));
      setBusy(null);
    }, 50);
  };

  /** Your cuts, the rest of the offseason, then the report. */
  const completeWith = (cuts: ReadonlySet<string>) => {
    const s = stateRef.current;
    const off = offseason;
    if (!s || !off?.freeAgency || !playoffs) return;
    const myOffers = offers;
    setBusy("offseason");
    setDraftTurn(null);
    setDraftDone(null);
    draftRef.current = null;
    setTimeout(() => {
      const { dynasty: after, log } = completeOffseason(off, off.freeAgency!.draft, undefined, { team: s.userTeam, players: cuts });
      const rec = computeRecords(s.dynasty.league, s.results).get(s.userTeam);
      const rank = playoffs.ranking.find((e) => e.team === s.userTeam)?.rank ?? null;
      const report = buildReport(s.userTeam, s.dynasty, after, log, rec ? formatRecord(rec) : "", rank, keptRef.current, myOffers);
      setOffers(new Map());
      setOffseason(null);
      checkpointRef.current = null;
      persist({ ...s, dynasty: after, weeksPlayed: 0, results: [], stats: createSeasonStats(), playoffRoundsShown: 0, report, scouting: null, scoutPlan: [], trades: [], playoffs: null, lineups: undefined, injuryNews: [], moves: [], news: [], radio: newRadio(), collection: undefined }, true);
      // Clear the checkpoint only after the new season is saved.
      checkpoint(null);
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
    if (pick !== undefined) updateCheckpoint((p) => ({ ...p, picks: [...p.picks, pick] }));
    const r = pick === undefined ? gen.next() : gen.next(pick);
    if (r.done) finishDraft(r.value);
    else setDraftTurn(r.value);
  };

  const controls: DynastyControls = {
    phase,
    progress,
    save: state,
    slots: slotIndex.slots,
    slot,
    canStartNew: freeSlot(slotIndex) !== null,
    openSlot: openSlotNow,
    deleteSlot: (n) => {
      queue(() => deleteSlot(n).then(setSlotIndex));
    },
    closeDynasty: () => {
      // Write anything still waiting, then leave.
      if (saveTimer.current && state && slot !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const s = state;
        queue(() => writeSlot(slot, s, checkpointRef.current));
      }
      queue(() => closeSlot().then(setSlotIndex));
      resetOffseason();
      setSlot(null);
      setState(null);
    },
    newDynasty: () => {
      const n = freeSlot(slotIndex);
      if (n === null) return;
      resetOffseason();
      setSlot(n);
      slotRef.current = n;
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
        persist({ version: SAVE_VERSION, seed, userTeam: "", dynasty: r.value, weeksPlayed: 0, results: [], stats: createSeasonStats(), playoffRoundsShown: 0, report: null, scouting: null, scoutPlan: [], trades: [] }, true);
        setBusy(null);
      };
      setTimeout(step, 50);
    },
    chooseTeam: (abbr) => {
      if (state) persist(openSeason({ ...state, userTeam: abbr }), true);
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
        persist(s, true);
        setBusy(null);
      })();
    },
    playPlayoffRound: () => {
      if (state && seasonOver) persist({ ...state, playoffRoundsShown: Math.min(PLAYOFF_ROUND_COUNT, state.playoffRoundsShown + 1) });
    },
    startOffseason: () => {
      if (!state || !schedule || !playoffs) return;
      // Draft week closes: the AI teams make their trades before the offseason opens.
      const traded = new Set(state.trades.flatMap((t) => t.players.map((p) => p.id)));
      const week = draftWeekTrades(state.dynasty.league, playoffs, new Set([state.userTeam]), traded);
      // The season's own moments (milestone seasons, the champion), once.
      const collection = state.collection ?? startCollection(state.dynasty.recordBook);
      if (!collection.seasonDone) {
        collectSeason(collection, state.dynasty.league, schedule.season, state.stats, computeRecords(state.dynasty.league, state.results), playoffs, state.userTeam);
        collection.seasonDone = true;
      }
      persist({ ...state, dynasty: { ...state.dynasty, league: week.league }, trades: [...state.trades, ...week.trades], playoffs, collection }, true);
      checkpoint({ season: schedule.season, picks: [], offers: [], frontOffice: true });
      setStaffStep({ step: "decide" });
    },
    staffSeats,
    confirmStaff: (fire, renew) => {
      const s = stateRef.current;
      const played = playedSeason();
      if (!s || !played) return;
      const decisions = { team: s.userTeam, fire, renew };
      const releases = offseasonStaffReleases(s.dynasty, played, decisions);
      updateCheckpoint((p) => ({ ...p, staff: { fire: [...fire], renew: [...renew] } }));
      if (releases.vacancies.some((v) => v.team === s.userTeam)) setStaffStep({ step: "hire", releases, fire, renew });
      else startRestOfOffseason(fire, renew, new Map());
    },
    staffOpenings,
    confirmHires: (picks) => {
      if (staffStep?.step === "hire") startRestOfOffseason(staffStep.fire, staffStep.renew, picks);
    },
    contractPlan,
    finishOffseason: (keep) => {
      if (!state || !offseason || !playoffs) return;
      keptRef.current = keep;
      updateCheckpoint((p) => ({ ...p, keep: [...keep] }));
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
      const picks = [draftTurn.board[0]!.prospect.player.id];
      let r = gen.next(picks[0]!);
      while (!r.done) {
        picks.push(r.value.board[0]!.prospect.player.id);
        r = gen.next(picks[picks.length - 1]!);
      }
      updateCheckpoint((p) => ({ ...p, picks: [...p.picks, ...picks] }));
      finishDraft(r.value);
    },
    freeAgencyPlan: freeAgencyPlanValue,
    offers,
    setOffer: (player, offer) => {
      const n = new Map(offers);
      if (offer) n.set(player, offer);
      else n.delete(player);
      setOffers(n);
      updateCheckpoint((p) => ({ ...p, offers: [...n] }));
    },
    openFreeAgency: () => {
      if (draftDone) runFreeAgencyNow(draftDone, offers, frontOffice);
    },
    rosterPlan: rosterPlanValue,
    finishCuts: (cuts) => completeWith(cuts),
    // Not during the playoffs (they're computed from the league as it stood) or the offseason (which has its own copy).
    canEditDepthChart: !!state?.userTeam && !offseason && !state?.report && !seasonOver && !depthLocked,
    depthLocked,
    setDepthChart: (pos, ids) => {
      if (!state || offseason || !state.userTeam || seasonOver || depthLocked) return;
      const league = state.dynasty.league;
      const team = league.teams[state.userTeam]!;
      const updated = { ...team, depthChart: { ...team.depthChart, [pos]: ids } };
      const lineups = logTeam(state.lineups ?? startLog(league), updated, state.weeksPlayed + 1);
      // Your game's lines were set on the old depth chart: they're worked out again.
      const p = state.picks;
      const picks = p?.board ? { ...p, board: { ...p.board, lines: p.board.lines.filter((l) => !isOwnGame(l.game, state.userTeam)) } } : p;
      persist({ ...state, lineups, ...(picks ? { picks } : {}), dynasty: { ...state.dynasty, league: { ...league, teams: { ...league.teams, [team.abbr]: updated } } } });
    },
    picks: state?.picks ?? newPicks(),
    board: boardFor(state, schedule),
    boardNeedsOwn: needsOwnLines(state, schedule),
    boardProgress,
    loadBoard: () => {
      const s = stateRef.current;
      if (!s || !schedule || seasonOver || !s.userTeam || boardJob.current) return;
      const existing = boardFor(s, schedule);
      const own = needsOwnLines(s, schedule);
      if (existing && !own) return;
      const week = s.weeksPlayed + 1;
      // The whole board, or just your game again (after a depth-chart change).
      const games = existing ? boardGames(s.dynasty.league, schedule, week, s.userTeam).filter((g) => isOwnGame(g, s.userTeam)) : boardGames(s.dynasty.league, schedule, week, s.userTeam);
      const steps = linesSteps(s.dynasty.league, games, undefined, s.userTeam);
      const token = {};
      boardJob.current = token;
      setBoardProgress(0);
      const step = () => {
        if (boardJob.current !== token) return;
        const r = steps.next();
        if (!r.done) {
          setBoardProgress(r.value);
          setTimeout(step, 0);
          return;
        }
        boardJob.current = null;
        setBoardProgress(null);
        const now = stateRef.current;
        // Only if nothing moved on meanwhile (the week wasn't played).
        if (!now || now.weeksPlayed + 1 !== week || now.dynasty.league.season !== s.dynasty.league.season) return;
        const p = now.picks ?? newPicks();
        const lines = existing && p.board ? [...r.value, ...p.board.lines] : r.value;
        // The radio show for the week is written off the board (once).
        const radio = now.radio ?? newRadio();
        const show = radio.shows.some((x) => x.season === schedule.season && x.week === week)
          ? null
          : radioShow({
              leagueSeed: now.dynasty.league.seed,
              season: schedule.season,
              week,
              board: lines,
              stats: now.stats,
              stories: (now.news ?? []).filter((x) => x.week === week - 1 && !x.local).sort((a, b) => b.importance - a.importance),
              lastWeek: radio.last,
              records: radio.records,
              own: now.userTeam,
            });
        persist({ ...now, picks: { ...p, board: { season: schedule.season, week, lines } }, ...(show ? { radio: { ...radio, shows: [...radio.shows, show] } } : {}) });
      };
      setTimeout(step, 30);
    },
    placeSlate: (picks, stake) => {
      const s = stateRef.current;
      if (!s || !schedule || !boardFor(s, schedule)) return ["The board isn't open."];
      const p = s.picks ?? newPicks();
      const ownGames = new Set(schedule.games.filter((g) => g.week === s.weeksPlayed + 1 && isOwnGame(g, s.userTeam)).map((g) => g.id));
      const problems = slateProblems(picks, stake, p.balance, s.userTeam, ownGames);
      if (problems.length > 0) return problems;
      const slate: Slate = { id: `${schedule.season}-${s.weeksPlayed + 1}-${p.history.length + p.open.length + 1}`, season: schedule.season, week: s.weeksPlayed + 1, picks, stake };
      persist({ ...s, picks: { ...p, balance: p.balance - stake, open: [...p.open, slate] } }, true);
      return [];
    },
    draft,
    toggleDraft: (pick) =>
      setDraft((c) => {
        const same = c.find((p) => p.prop.id === pick.prop.id);
        if (same && same.side === pick.side) return c.filter((p) => p.prop.id !== pick.prop.id);
        return [...c.filter((p) => p.prop.id !== pick.prop.id), pick];
      }),
    clearDraft: () => setDraft([]),
    canMakeMoves,
    placeOnIR: (id) => {
      const s = stateRef.current;
      if (!s || !canMakeMoves) return ["Moves can be made during the regular season."];
      const league = s.dynasty.league;
      const problems = irProblems(league.teams[s.userTeam]!, id);
      if (problems.length > 0) return problems;
      const done = placeOnIR(league, s.userTeam, id, s.weeksPlayed, true);
      const lineups = logTeam(s.lineups ?? startLog(league), done.league.teams[s.userTeam]!, s.weeksPlayed + 1);
      persist({ ...s, lineups, dynasty: { ...s.dynasty, league: done.league }, moves: [...(s.moves ?? []), done.move] }, true);
      return [];
    },
    signFreeAgent: (id) => {
      const s = stateRef.current;
      if (!s || !canMakeMoves) return ["Moves can be made during the regular season."];
      const league = s.dynasty.league;
      const problems = signingProblems(league, league.season, s.userTeam, id);
      if (problems.length > 0) return problems;
      const done = signFreeAgent(league, league.season, s.userTeam, id, s.weeksPlayed, true);
      const lineups = logTeam(s.lineups ?? startLog(league), done.league.teams[s.userTeam]!, s.weeksPlayed + 1);
      persist({ ...s, lineups, dynasty: { ...s.dynasty, league: done.league }, moves: [...(s.moves ?? []), done.move] }, true);
      return [];
    },
    tradeWindow,
    canTrade: tradeWindow !== null,
    proposeTrade: (t) => {
      const s = stateRef.current;
      const w = tradeWindow;
      if (!s || !w) return { made: false, problems: ["Trading is closed right now."], verdict: null };
      const league = s.dynasty.league;
      const problems = checkTrade(league, w, t);
      if (problems.length > 0) return { made: false, problems, verdict: null };
      const verdict = judgeTrade(league, w, t, t.to, true);
      if (!verdict.accept) return { made: false, problems: [], verdict };
      const done = applyTrade(league, w, t, new Set([s.userTeam]));
      const lineups = logTrades(s.lineups ?? startLog(league), league, done.league, [done.record], w.week === 0 ? DRAFT_WEEK : w.week);
      persist({ ...s, lineups, dynasty: { ...s.dynasty, league: done.league }, trades: [...s.trades, done.record], ...(playoffs ? { playoffs } : {}) }, true);
      return { made: true, problems: [], verdict };
    },
    frontOffice,
    setFrontOffice: (on) => {
      setFrontOffice(on);
      updateCheckpoint((p) => ({ ...p, frontOffice: on }));
    },
    startNextSeason: () => {
      if (state) persist(openSeason({ ...state, report: null }), true);
    },
    deleteDynasty: () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (slot !== null) queue(() => deleteSlot(slot).then(setSlotIndex));
      resetOffseason();
      setSlot(null);
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
          records,
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
