// The league every screen reads from: generated from a seed, its schedule, and
// the regular season simulated in the background a few games at a time (so the
// app stays responsive), with standings, rankings and season stats as weeks finish.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addGameToSeason,
  allTeams,
  computeRankings,
  createSeasonStats,
  divisionStandings,
  generateLeague,
  generateSchedule,
  playGame,
  type DivisionStandings,
  type GameSummary,
  type League,
  type Player,
  type RankingEntry,
  type Schedule,
  type SeasonStats,
  type Team,
} from "@dynasty/sim";

export const LEAGUE_SEED = "dynasty";
/** Games simulated between yields to the UI. */
const GAMES_PER_SLICE = 4;

export interface LeagueData {
  league: League;
  schedule: Schedule;
  results: GameSummary[];
  stats: SeasonStats;
  /** Weeks fully played. */
  weeksPlayed: number;
  /** Share of the regular season simulated so far (0-1). */
  progress: number;
  standings: DivisionStandings[];
  rankings: RankingEntry[];
  playerById: Map<string, { player: Player; team: Team }>;
}

const LeagueContext = createContext<LeagueData | null>(null);

export function useLeague(): LeagueData {
  const data = useContext(LeagueContext);
  if (!data) throw new Error("useLeague outside LeagueProvider");
  return data;
}

export function LeagueProvider({ children }: { children: ReactNode }) {
  const league = useMemo(() => generateLeague(LEAGUE_SEED), []);
  const schedule = useMemo(() => generateSchedule(league), [league]);
  const playerById = useMemo(() => {
    const m = new Map<string, { player: Player; team: Team }>();
    for (const team of allTeams(league)) for (const player of team.roster) m.set(player.id, { player, team });
    return m;
  }, [league]);

  const stats = useRef(createSeasonStats()).current;
  const [results, setResults] = useState<GameSummary[]>([]);
  const [weeksPlayed, setWeeksPlayed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const done: GameSummary[] = [];
    const games = schedule.games;
    const step = () => {
      if (cancelled) return;
      const end = Math.min(games.length, i + GAMES_PER_SLICE);
      for (; i < end; i++) {
        const { summary, result } = playGame(league, games[i]!);
        addGameToSeason(stats, result);
        done.push(summary);
      }
      // Publish at the end of each week.
      const week = games[i - 1]!.week;
      if (i === games.length || games[i]!.week !== week) {
        setResults([...done]);
        setWeeksPlayed(week);
      }
      if (i < games.length) setTimeout(step, 0);
    };
    const t = setTimeout(step, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [league, schedule, stats]);

  const standings = useMemo(() => divisionStandings(league, results), [league, results]);
  const rankings = useMemo(() => computeRankings(league, results), [league, results]);

  const value: LeagueData = {
    league,
    schedule,
    results,
    stats,
    weeksPlayed,
    progress: weeksPlayed / schedule.weeks,
    standings,
    rankings,
    playerById,
  };
  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}
