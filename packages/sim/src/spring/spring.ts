// The spring season: a second, smaller season for the players who don't
// dress on game day. Each division pools its five teams' spring players
// (everyone below the game-day 53 on the depth chart) into one regional
// spring team; the ten teams play a round robin in two conferences, then a
// spring championship. Standouts break out: they come back to their teams a
// few points better, and a breakout backup can win a real job.
import { Rng } from "../rng.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { POSITIONS, type Position } from "../model/positions.ts";
import { buildDepthChart, type Team } from "../model/team.ts";
import { LEAGUE_STRUCTURE, type League } from "../league/league.ts";
import type { GameSummary } from "../league/standings.ts";
import { simulateGame } from "../game/game.ts";
import { addGameToSeason, createSeasonStats, type SeasonStats } from "../league/seasonstats.ts";
import { GAME_MIN } from "../game/injuries.ts";
import { generatePlayer } from "../gen/team-gen.ts";
import { keyAttributes } from "../feed/playercard.ts";
import { ROSTER_POSITION_MAX } from "../dynasty/roster.ts";
import type { PlayerStatKey } from "../stats/boxscore.ts";

type Line = Record<PlayerStatKey, number>;

/** Game-day allotment at each position (53 in all): anyone below it on the depth chart plays in the spring. */
export const GAME_DAY: Record<Position, number> = { QB: 2, RB: 4, WR: 6, TE: 3, OL: 9, DL: 9, LB: 7, CB: 6, S: 4, K: 1, P: 1, LS: 1 };

export const SPRING_RULES = {
  /** Players who break out each spring, and how much they grow (points on each key rating). */
  breakouts: 12,
  growth: 3,
  minGames: 3,
};

const NICKNAMES: Record<string, string> = {
  Northeast: "Squalls", Atlantic: "Ironworkers", Capital: "Monuments", Southeast: "Gators", "Great Lakes": "Freighters",
  North: "Blizzard", Plains: "Twisters", Southwest: "Roadrunners", Mountain: "Avalanche", Pacific: "Breakers",
};

export interface SpringTeam extends Team {
  division: string;
  /** The five teams it draws from. */
  parents: string[];
}

export interface SpringBreakout {
  player: PlayerId;
  name: string;
  position: Position;
  /** His real team. */
  team: string;
  before: number;
  after: number;
  /** His spring in a line. */
  line: string;
}

export interface SpringSeason {
  season: number;
  teams: Array<{ abbr: string; name: string; division: string; conference: string; wins: number; losses: number; ties: number }>;
  games: GameSummary[];
  champion: string;
  runnerUp: string;
  mvp: { player: PlayerId; name: string; position: Position; team: string; line: string } | null;
  breakouts: SpringBreakout[];
}

/** Who plays in the spring for a team: everyone below the game-day allotment at his position. */
export function springPlayers(team: Team): Player[] {
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  return POSITIONS.flatMap((pos) => team.depthChart[pos].slice(GAME_DAY[pos]).map((id) => byId.get(id)!).filter(Boolean));
}

/** The ten regional spring teams (filled from the free-agent pool, or with new faces, where a position runs short). */
export function springTeams(league: League, season: number): SpringTeam[] {
  const rng = new Rng(`${league.seed}:spring:${season}:fill`);
  const used = new Set<PlayerId>();
  const pool = [...(league.freeAgents ?? [])];
  const teams: SpringTeam[] = [];
  for (const conf of LEAGUE_STRUCTURE)
    for (const div of conf.divisions) {
      const parents = div.states.filter((s) => league.teams[s]);
      const players = parents.flatMap((s) => springPlayers(league.teams[s]!));
      const roster: Player[] = [];
      for (const pos of POSITIONS) {
        const mine = players.filter((p) => p.position === pos).sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, ROSTER_POSITION_MAX[pos]);
        roster.push(...mine);
        for (let n = mine.length; n < GAME_MIN[pos]; n++) {
          const fa = pool.filter((p) => p.position === pos && !used.has(p.id)).sort((a, b) => playerOverall(b) - playerOverall(a))[0];
          if (fa) {
            used.add(fa.id);
            roster.push(fa);
          } else roster.push(generatePlayer(rng, { id: `SP${season}-${div.name}-${pos}-${n}`, position: pos, talentMean: 50, jersey: 0 }));
        }
      }
      // Spring jerseys: just keep them unique on the field.
      const numbered = roster.map((p, i) => ({ ...p, jersey: (i % 99) + 1 }));
      const abbr = `S-${div.name.replace(/\s/g, "")}`;
      teams.push({ id: abbr, abbr, state: div.name, nickname: NICKNAMES[div.name] ?? "Spring", roster: numbered, depthChart: buildDepthChart(numbered), division: div.name, parents });
    }
  return teams;
}

/** A round robin for five teams: five weeks, two games a week, one team resting. */
function roundRobin(abbrs: readonly string[]): Array<[string, string]>[] {
  const slots = [...abbrs, null] as (string | null)[];
  const weeks: Array<[string, string]>[] = [];
  for (let w = 0; w < slots.length - 1; w++) {
    const games: Array<[string, string]> = [];
    for (let i = 0; i < slots.length / 2; i++) {
      const a = slots[i];
      const b = slots[slots.length - 1 - i];
      if (a && b) games.push(w % 2 ? [a, b] : [b, a]);
    }
    weeks.push(games);
    slots.splice(1, 0, slots.pop()!);
  }
  return weeks;
}

function impact(s: Line): number {
  return s.passYds / 25 + s.passTd * 4 - s.passInt * 2 + s.rushYds / 10 + s.rushTd * 6 + s.recYds / 10 + s.recTd * 6 + s.sacks * 4 + s.defInt * 5 + s.tackles * 0.5 + s.fgMade * 2;
}

function line(s: Line, games: number): string {
  const parts: string[] = [`${games} games`];
  if (s.passAtt > 0) parts.push(`${s.passYds} passing yards, ${s.passTd} TD`);
  if (s.rushAtt >= 10) parts.push(`${s.rushYds} rushing yards, ${s.rushTd} TD`);
  if (s.rec >= 5) parts.push(`${s.rec} catches, ${s.recYds} yards, ${s.recTd} TD`);
  if (s.sacks >= 1) parts.push(`${s.sacks} sacks`);
  if (s.defInt >= 1) parts.push(`${s.defInt} INT`);
  if (s.tackles >= 10) parts.push(`${s.tackles} tackles`);
  return parts.join(", ");
}

/** Play the spring season (after the offseason): the games, the champion, the MVP and the breakouts. */
export function playSpring(league: League, season: number): { spring: SpringSeason; stats: SeasonStats } {
  const teams = springTeams(league, season);
  const byAbbr = new Map(teams.map((t) => [t.abbr, t]));
  const stats = createSeasonStats();
  const games: GameSummary[] = [];
  const record = new Map(teams.map((t) => [t.abbr, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }]));
  const play = (week: number, home: string, away: string, playoff = false) => {
    const id = `${season}-S${week}-${away}@${home}`;
    const seed = `${league.seed}:spring:${id}`;
    const r = simulateGame(byAbbr.get(home)!, byAbbr.get(away)!, seed, playoff ? { playoff: true, neutralSite: true } : {});
    addGameToSeason(stats, r);
    const summary: GameSummary = { id, week, home, away, kind: "conference", homeScore: r.score[home]!, awayScore: r.score[away]!, overtime: r.overtime, winner: r.winner, seed };
    games.push(summary);
    return summary;
  };
  const conferences = LEAGUE_STRUCTURE.map((c) => ({ name: c.name, teams: teams.filter((t) => c.divisions.some((d) => d.name === t.division)).map((t) => t.abbr) }));
  const schedules = conferences.map((c) => roundRobin(c.teams));
  for (let w = 0; w < schedules[0]!.length; w++)
    for (const sched of schedules)
      for (const [home, away] of sched[w]!) {
        const g = play(w + 1, home, away);
        const h = record.get(home)!;
        const a = record.get(away)!;
        h.pf += g.homeScore;
        h.pa += g.awayScore;
        a.pf += g.awayScore;
        a.pa += g.homeScore;
        if (g.winner === home) (h.wins++, a.losses++);
        else if (g.winner === away) (a.wins++, h.losses++);
        else (h.ties++, a.ties++);
      }
  // Conference winners meet for the spring title.
  const best = (abbrs: string[]) =>
    [...abbrs].sort((x, y) => {
      const rx = record.get(x)!;
      const ry = record.get(y)!;
      return ry.wins + ry.ties / 2 - (rx.wins + rx.ties / 2) || ry.pf - ry.pa - (rx.pf - rx.pa) || x.localeCompare(y);
    })[0]!;
  const finalists = conferences.map((c) => best(c.teams));
  const final = play(schedules[0]!.length + 1, finalists[0]!, finalists[1]!, true);
  const champion = final.winner!;
  const runnerUp = champion === final.home ? final.away : final.home;

  // The parent team of every player who played (spring fill-ins have none).
  const parentOf = new Map<PlayerId, string>();
  for (const t of Object.values(league.teams)) for (const p of t.roster) parentOf.set(p.id, t.abbr);
  const players = new Map<PlayerId, Player>();
  for (const t of teams) for (const p of t.roster) players.set(p.id, p);
  // The best at each position breaks out, then whoever stands out most against
  // the top quarter at his position (raw passing numbers would swamp everyone).
  const eligible = [...stats.players.values()].filter((s) => s.games >= SPRING_RULES.minGames && parentOf.has(s.id) && players.has(s.id));
  const perGame = (s: (typeof eligible)[number]) => impact(s.stats) / s.games;
  const posOf = (s: (typeof eligible)[number]) => players.get(s.id)!.position;
  const top = new Map<Position, number>();
  for (const pos of POSITIONS) {
    const xs = eligible.filter((s) => posOf(s) === pos).map(perGame).sort((a, b) => a - b);
    if (xs.length) top.set(pos, Math.max(1, xs[Math.floor(xs.length * 0.75)]!));
  }
  const picked: typeof eligible = [];
  for (const pos of ["QB", "RB", "WR", "TE", "DL", "LB", "CB", "S"] as Position[]) {
    const best = eligible.filter((s) => posOf(s) === pos).sort((a, b) => perGame(b) - perGame(a) || a.id.localeCompare(b.id))[0];
    if (best) picked.push(best);
  }
  const rest = eligible
    .filter((s) => !picked.includes(s) && top.has(posOf(s)))
    .sort((a, b) => perGame(b) / top.get(posOf(b))! - perGame(a) / top.get(posOf(a))! || a.id.localeCompare(b.id));
  // No more than two from one position.
  const count = new Map<Position, number>(picked.map((s) => [posOf(s), 1]));
  const extra = rest.filter((s) => {
    const n = count.get(posOf(s)) ?? 0;
    if (n >= 2) return false;
    count.set(posOf(s), n + 1);
    return true;
  });
  const ranked = [...picked, ...extra].slice(0, SPRING_RULES.breakouts).map((s) => ({ s }));
  const mvpBest = [...eligible].sort((a, b) => perGame(b) - perGame(a) || a.id.localeCompare(b.id))[0];
  const mvpLine = mvpBest ? { s: mvpBest } : undefined;
  const mvpPlayer = mvpLine ? players.get(mvpLine.s.id) : undefined;
  const breakouts: SpringBreakout[] = ranked.slice(0, SPRING_RULES.breakouts).map(({ s }) => {
    const p = players.get(s.id)!;
    const grown = grow(p);
    return { player: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position, team: parentOf.get(p.id)!, before: playerOverall(p), after: playerOverall(grown), line: line(s.stats, s.games) };
  });

  const nameOf = (abbr: string) => {
    const t = byAbbr.get(abbr)!;
    return `${t.state} ${t.nickname}`;
  };
  const spring: SpringSeason = {
    season,
    teams: teams.map((t) => {
      const r = record.get(t.abbr)!;
      return { abbr: t.abbr, name: nameOf(t.abbr), division: t.division, conference: conferences.find((c) => c.teams.includes(t.abbr))!.name, wins: r.wins, losses: r.losses, ties: r.ties };
    }),
    games,
    champion,
    runnerUp,
    mvp: mvpLine && mvpPlayer ? { player: mvpPlayer.id, name: `${mvpPlayer.firstName} ${mvpPlayer.lastName}`, position: mvpPlayer.position, team: parentOf.get(mvpPlayer.id)!, line: line(mvpLine.s.stats, mvpLine.s.games) } : null,
    breakouts,
  };
  return { spring, stats };
}

/** A breakout: a few points on each of his key ratings. */
function grow(p: Player): Player {
  const ratings = { ...p.ratings };
  for (const k of keyAttributes(p, 6)) ratings[k] = Math.min(99, ratings[k] + SPRING_RULES.growth);
  return { ...p, ratings, potential: Math.max(p.potential, Math.min(99, p.potential + 1)) };
}

/**
 * The spring's breakouts go home better. AI teams redo their depth charts
 * (a breakout backup can win the job); teams in `keepDepth` (yours) decide
 * for themselves.
 */
export function applyBreakouts(league: League, spring: SpringSeason, keepDepth: ReadonlySet<string> = new Set()): League {
  const ids = new Set(spring.breakouts.map((b) => b.player));
  if (ids.size === 0) return league;
  const teams: League["teams"] = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    if (!t.roster.some((p) => ids.has(p.id))) {
      teams[abbr] = t;
      continue;
    }
    const roster = t.roster.map((p) => (ids.has(p.id) ? grow(p) : p));
    teams[abbr] = { ...t, roster, depthChart: keepDepth.has(abbr) ? t.depthChart : buildDepthChart(roster) };
  }
  return { ...league, teams };
}
