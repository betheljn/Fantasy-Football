// The Hall of Fame. Each season a ballot of retired players goes to a panel
// of media voters (and to you): anyone out of the game a full season, with a
// long, productive career, can be on it, for up to ten years. A player named
// on three-quarters of the ballots is in, and the team he played the most
// seasons for retires his number. Careers count from the dynasty's first
// season, so the first class takes a few years to arrive.
import { Rng } from "../rng.ts";
import type { PlayerId } from "../model/player.ts";
import type { Dynasty, CareerLine } from "../dynasty/dynasty.ts";

export const HOF_RULES = {
  /** Seasons a player must sit out before he's eligible. */
  wait: 1,
  /** Years a player can stay on the ballot. */
  ballotYears: 10,
  minSeasons: 5,
  /** Career score needed to make the ballot (100 = an elite career at his position). */
  minScore: 60,
  ballotSize: 15,
  voters: 48,
  /** Most names on one ballot. */
  votesPerBallot: 10,
  /** Share of ballots needed to get in, and the largest class in one year (the rest wait). */
  induct: 0.75,
  maxClass: 3,
  /** A voter only names candidates they think are worthy (at least this score, as they see it). */
  worthy: 100,
};

export interface HofCandidate {
  id: PlayerId;
  name: string;
  position: string;
  teams: string[];
  seasons: number;
  lastSeason: number;
  score: number;
  /** One line on his career. */
  line: string;
  /** Major awards (MVP, Offensive/Defensive Player of the Year). */
  awards: string[];
}

export interface Inductee extends HofCandidate {
  season: number;
  /** Share of ballots that named him. */
  pct: number;
  /** The team that retired his number (most seasons there), and the number. */
  team: string;
  jersey: number | null;
}

export interface HofVote {
  season: number;
  results: Array<{ candidate: HofCandidate; pct: number; inducted: boolean }>;
}

/** A career's production, before comparing it with others at his position. */
export function careerProduction(c: CareerLine): number {
  const s = c.stats;
  const offense = s.passYds / 300 + s.passTd * 1.5 - s.passInt * 0.5 + s.rushYds / 80 + s.rushTd * 1.5 + s.recYds / 80 + s.recTd * 1.5;
  const defense = s.tackles / 12 + s.sacks * 2 + s.defInt * 3 + s.defTd * 4 + s.forcedFumbles;
  const kicking = s.fgMade * 0.4 + s.punts * 0.05;
  // Linemen (and everyone) get credit for a long career.
  return offense + defense + kicking + c.games * 0.5;
}

/** What an elite career looks like at each position: the 97th-percentile production among long careers. */
function benchmarks(careers: Iterable<CareerLine>): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const c of careers) if (c.seasons >= HOF_RULES.minSeasons) by.set(c.position, [...(by.get(c.position) ?? []), careerProduction(c)]);
  const out = new Map<string, number>();
  for (const [pos, xs] of by) {
    xs.sort((a, b) => a - b);
    out.set(pos, Math.max(1, xs[Math.floor(xs.length * 0.97)] ?? xs.at(-1)!));
  }
  return out;
}

/**
 * A career in one number: production against an elite career at his
 * position (100 = the 97th percentile), plus major awards. Every position
 * has a path in.
 */
export function careerScore(c: CareerLine, awards: readonly string[], benchmark: number): number {
  const honors = awards.reduce((n, a) => n + (a === "MVP" ? 25 : a.includes("Player of the Year") ? 15 : 5), 0);
  return Math.round((100 * careerProduction(c)) / benchmark + honors);
}

function careerLine(c: CareerLine): string {
  const s = c.stats;
  const parts: string[] = [`${c.seasons} seasons`];
  if (s.passYds > 2000) parts.push(`${s.passYds.toLocaleString()} passing yards, ${s.passTd} TD`);
  if (s.rushYds > 1500) parts.push(`${s.rushYds.toLocaleString()} rushing yards, ${s.rushTd} TD`);
  if (s.recYds > 1500) parts.push(`${s.recYds.toLocaleString()} receiving yards, ${s.recTd} TD`);
  if (s.sacks >= 15) parts.push(`${s.sacks} sacks`);
  if (s.defInt >= 8) parts.push(`${s.defInt} interceptions`);
  if (s.fgMade >= 50) parts.push(`${s.fgMade} field goals`);
  return parts.join(" · ");
}

/** Everyone still in the league (rosters, injured reserve, free agents). */
function active(dynasty: Dynasty): Set<PlayerId> {
  const ids = new Set<PlayerId>();
  for (const t of Object.values(dynasty.league.teams)) for (const p of [...t.roster, ...(t.reserve ?? [])]) ids.add(p.id);
  for (const p of dynasty.league.freeAgents ?? []) ids.add(p.id);
  return ids;
}

/** This season's ballot: eligible retired players, best careers first. */
export function hofBallot(dynasty: Dynasty, season: number): HofCandidate[] {
  const inducted = new Set((dynasty.hallOfFame ?? []).map((i) => i.id));
  const playing = active(dynasty);
  const honors = new Map<PlayerId, string[]>();
  for (const h of dynasty.history) for (const a of h.awards) if (a.award !== "Rookie of the Year") honors.set(a.player, [...(honors.get(a.player) ?? []), `${h.season} ${a.award}`]);
  const bench = benchmarks(dynasty.careers.values());
  const out: HofCandidate[] = [];
  for (const c of dynasty.careers.values()) {
    if (c.lastSeason === undefined || inducted.has(c.id) || playing.has(c.id)) continue;
    const away = season - c.lastSeason - 1;
    if (away < HOF_RULES.wait || away >= HOF_RULES.wait + HOF_RULES.ballotYears) continue;
    if (c.seasons < HOF_RULES.minSeasons) continue;
    const awards = honors.get(c.id) ?? [];
    const score = careerScore(c, awards.map((a) => a.replace(/^\d+ /, "")), bench.get(c.position) ?? 1);
    if (score < HOF_RULES.minScore) continue;
    out.push({ id: c.id, name: c.name, position: c.position, teams: c.teams, seasons: c.seasons, lastSeason: c.lastSeason, score, line: careerLine(c), awards });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, HOF_RULES.ballotSize);
}

/**
 * The vote: each media voter names up to ten candidates they see as worthy
 * (their own read of each career); `yours` is your ballot, counted as one
 * more. Three-quarters of the ballots gets a player in (at most three a year).
 */
export function hofVote(leagueSeed: string, season: number, ballot: readonly HofCandidate[], yours?: readonly PlayerId[]): HofVote {
  const votes = new Map<PlayerId, number>(ballot.map((c) => [c.id, 0]));
  const rng = new Rng(`${leagueSeed}:hof:${season}`);
  for (let v = 0; v < HOF_RULES.voters; v++) {
    const seen = ballot.map((c) => ({ c, s: c.score * (1 + rng.normal(0, 0.15)) })).filter((x) => x.s >= HOF_RULES.worthy);
    for (const { c } of seen.sort((a, b) => b.s - a.s).slice(0, HOF_RULES.votesPerBallot)) votes.set(c.id, votes.get(c.id)! + 1);
  }
  const mine = (yours ?? []).filter((id) => votes.has(id)).slice(0, HOF_RULES.votesPerBallot);
  for (const id of mine) votes.set(id, votes.get(id)! + 1);
  const ballots = HOF_RULES.voters + (yours ? 1 : 0);
  const ranked = ballot.map((c) => ({ candidate: c, pct: votes.get(c.id)! / ballots })).sort((a, b) => b.pct - a.pct || b.candidate.score - a.candidate.score);
  const results = ranked.map((r, i) => ({ ...r, inducted: r.pct >= HOF_RULES.induct && i < HOF_RULES.maxClass }));
  return { season, results };
}

/** The class from a vote, with the team that retires each number. */
export function inductees(vote: HofVote, careers: ReadonlyMap<PlayerId, CareerLine>): Inductee[] {
  return vote.results
    .filter((r) => r.inducted)
    .map((r) => {
      const c = careers.get(r.candidate.id);
      const seasons = Object.entries(c?.teamSeasons ?? {}).sort((a, b) => b[1] - a[1]);
      const team = seasons[0]?.[0] ?? r.candidate.teams[0] ?? "";
      return { ...r.candidate, season: vote.season, pct: r.pct, team, jersey: c?.jersey ?? null };
    });
}

/** A team's retired numbers. */
export function retiredNumbers(dynasty: Dynasty, team: string): Inductee[] {
  return (dynasty.hallOfFame ?? []).filter((i) => i.team === team && i.jersey !== null);
}
