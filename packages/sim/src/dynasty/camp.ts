// Training camp: before the season, the close calls on each depth chart get
// settled on the field. Where a team's last starting spot at a position is
// within a few points between the starter and the first man behind him, the
// two compete: each has a camp (talent, a little extra from the young and
// hungry, and the luck of a few weeks of practice), and the better one takes
// the job. The winner's camp shows: a small bump in his position's key
// ratings. Camp reports make the preseason news.
import { BASE_STARTERS, POSITIONS, type Position } from "../model/positions.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { OVERALL_WEIGHTS, type RatingKey } from "../model/ratings.ts";
import type { Team } from "../model/team.ts";
import type { League } from "../league/league.ts";
import type { Story } from "../media/news.ts";
import { Rng } from "../rng.ts";

export const CAMP = {
  /** Spots this close (overall points) are battles. */
  closeWithin: 3,
  /** Battles per team at most (the closest). */
  perTeam: 3,
  /** Spread of a camp, overall points. */
  spread: 2.5,
  /** Extra camp for the young (per year under 25) and for a backup chasing the job. */
  youth: 0.15,
  hunger: 0.25,
  /** The winner's bump in his position's most important ratings. */
  bump: 2,
  bumpRatings: 5,
} as const;

export interface CampBattle {
  team: string;
  position: Position;
  /** The spot being fought for (1 = the starter, 3 = the third starter). */
  spot: number;
  winner: PlayerId;
  loser: PlayerId;
  winnerName: string;
  loserName: string;
  /** The backup took the job. */
  upset: boolean;
  /** How close it was (camp points). */
  margin: number;
}

const name = (p: Player) => `${p.firstName} ${p.lastName}`;

/** A position's most important ratings (by the overall formula's weights). */
function keyRatings(pos: Position): RatingKey[] {
  return (Object.entries(OVERALL_WEIGHTS[pos]) as Array<[RatingKey, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, CAMP.bumpRatings)
    .map(([k]) => k);
}

function campOf(rng: Rng, p: Player, challenger: boolean): number {
  return playerOverall(p) + CAMP.youth * Math.max(0, 25 - p.age) + (challenger ? CAMP.hunger : 0) + rng.normal(0, CAMP.spread);
}

/** One team's camp: its battles and its roster and depth chart after them. */
export function teamCamp(team: Team, seed: string): { team: Team; battles: CampBattle[] } {
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  // The close spots, closest first.
  const close: Array<{ pos: Position; spot: number; starter: Player; backup: Player; gap: number }> = [];
  for (const pos of POSITIONS) {
    const n = BASE_STARTERS[pos];
    const chart = team.depthChart[pos];
    const starter = byId.get(chart[n - 1] ?? "");
    const backup = byId.get(chart[n] ?? "");
    if (!starter || !backup || starter.injury || backup.injury) continue;
    const gap = playerOverall(starter) - playerOverall(backup);
    if (gap <= CAMP.closeWithin) close.push({ pos, spot: n, starter, backup, gap });
  }
  close.sort((a, b) => a.gap - b.gap || a.pos.localeCompare(b.pos));
  const battles: CampBattle[] = [];
  const bumped = new Map<PlayerId, Player>();
  const chart = { ...team.depthChart };
  for (const c of close.slice(0, CAMP.perTeam)) {
    const rng = new Rng(`${seed}:camp:${team.abbr}:${c.pos}`);
    const a = campOf(rng, c.starter, false);
    const b = campOf(rng, c.backup, true);
    const upset = b > a;
    const winner = upset ? c.backup : c.starter;
    const loser = upset ? c.starter : c.backup;
    // The winner's camp shows in his ratings.
    const ratings = { ...winner.ratings };
    for (const k of keyRatings(c.pos)) ratings[k] = Math.min(99, ratings[k] + CAMP.bump);
    bumped.set(winner.id, { ...winner, ratings });
    if (upset) {
      const order = [...chart[c.pos]];
      order[c.spot - 1] = c.backup.id;
      order[c.spot] = c.starter.id;
      chart[c.pos] = order;
    }
    battles.push({ team: team.abbr, position: c.pos, spot: c.spot, winner: winner.id, loser: loser.id, winnerName: name(winner), loserName: name(loser), upset, margin: Math.round(Math.abs(a - b) * 10) / 10 });
  }
  if (!battles.length) return { team, battles };
  const roster = team.roster.map((p) => bumped.get(p.id) ?? p);
  return { team: { ...team, roster, depthChart: chart }, battles };
}

/** Every team's training camp before `league`'s season. */
export function trainingCamp(league: League): { league: League; battles: CampBattle[] } {
  const seed = `${league.seed}:${league.season}`;
  const teams: Record<string, Team> = {};
  const battles: CampBattle[] = [];
  for (const [abbr, t] of Object.entries(league.teams)) {
    const r = teamCamp(t, seed);
    teams[abbr] = r.team;
    battles.push(...r.battles);
  }
  return { league: { ...league, teams }, battles };
}

const SPOT_NAMES: Partial<Record<Position, string[]>> = { WR: ["", "", "third receiver"], OL: ["", "", "", "", "fifth spot on the line"], CB: ["", "second corner"], S: ["", "second safety spot"], DL: ["", "", "", "fourth spot on the line"], LB: ["", "", "third linebacker spot"], TE: ["tight end job"], RB: ["running back job"] };
const jobName = (b: CampBattle) => SPOT_NAMES[b.position]?.[b.spot - 1] || `starting ${b.position} job`;

/** The preseason's camp stories: quarterback battles and upsets first, and every battle on your team. */
export function campStories(battles: readonly CampBattle[], season: number, teamName: (abbr: string) => string, yours?: string): Story[] {
  return battles
    .filter((b) => b.team === yours || b.upset || b.position === "QB")
    .map((b, i) => {
      const local = b.team === yours;
      const importance = (b.position === "QB" ? 60 : 30) + (b.upset ? 15 : 0) + (local ? 10 : 0);
      return {
        id: `camp-${season}-${b.team}-${b.position}`,
        season,
        week: 0,
        kind: "camp" as const,
        headline: b.upset ? `${b.winnerName} wins the ${jobName(b)} for ${teamName(b.team)}` : `${b.winnerName} holds off ${b.loserName} at ${b.position}`,
        body: b.upset
          ? `${b.winnerName} outplayed ${b.loserName} through camp and takes over the ${jobName(b)}${b.margin < 1 ? " by a whisker" : ""}. His camp showed: he comes out of it a better player.`
          : `${b.loserName} pushed him all camp, but ${b.winnerName} keeps the ${jobName(b)}${b.margin < 1 ? " by the slimmest of margins" : ""} and comes out of camp sharper for it.`,
        teams: [b.team],
        players: [b.winner, b.loser],
        importance: importance - i * 0.01,
        ...(local ? { local: true } : {}),
      };
    })
    .sort((a, b) => b.importance - a.importance);
}
