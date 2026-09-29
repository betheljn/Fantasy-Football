// Season awards from season stats: MVP, Offensive and Defensive Player of the
// Year, Rookie of the Year.
import type { PlayerId } from "../model/player.ts";
import type { League } from "../league/league.ts";
import type { PlayerSeason, SeasonStats } from "../league/seasonstats.ts";
import { computeRecords, winPct, type GameSummary } from "../league/standings.ts";

export type AwardName = "MVP" | "Offensive Player of the Year" | "Defensive Player of the Year" | "Rookie of the Year";

export interface Award {
  award: AwardName;
  player: PlayerId;
  name: string;
  position: string;
  team: string;
  /** One-line stat summary for the history books. */
  line: string;
}

/** Offensive production, roughly fantasy-point style. */
export function offensiveScore(p: PlayerSeason): number {
  const s = p.stats;
  return s.passYds / 25 + s.passTd * 4 - s.passInt * 2 + (s.rushYds + s.recYds) / 10 + (s.rushTd + s.recTd) * 6 - s.fumblesLost * 2;
}

export function defensiveScore(p: PlayerSeason): number {
  const s = p.stats;
  return s.tackles + s.sacks * 6 + s.defInt * 8 + s.passDefended * 2 + s.forcedFumbles * 5 + s.fumbleRecoveries * 3 + s.defTd * 6;
}

function statLine(p: PlayerSeason): string {
  const s = p.stats;
  if (s.passAtt > 100) return `${s.passYds} pass yds, ${s.passTd} TD, ${s.passInt} INT`;
  if (s.rushAtt > s.targets) return `${s.rushYds} rush yds, ${s.rushTd} TD, ${s.recYds} rec yds`;
  if (s.targets > 0 && s.rec > 10) return `${s.rec} rec, ${s.recYds} yds, ${s.recTd} TD`;
  return `${s.tackles} tkl, ${s.sacks} sacks, ${s.defInt} INT, ${s.forcedFumbles} FF`;
}

const OFFENSE = new Set(["QB", "RB", "WR", "TE"]);
const DEFENSE = new Set(["DL", "LB", "CB", "S"]);

/**
 * The season's awards. MVP weighs production by team success; the other
 * awards are production only. Rookies are players drafted into this season.
 */
export function computeAwards(league: League, stats: SeasonStats, results: readonly GameSummary[]): Award[] {
  const records = computeRecords(league, results);
  const all = [...stats.players.values()];
  const player = (id: PlayerId) => {
    for (const t of Object.values(league.teams)) {
      const p = t.roster.find((x) => x.id === id);
      if (p) return p;
    }
    return undefined;
  };
  const award = (name: AwardName, p: PlayerSeason | undefined): Award[] => {
    const info = p && player(p.id);
    if (!p || !info) return [];
    return [{ award: name, player: p.id, name: `${info.firstName} ${info.lastName}`, position: info.position, team: p.team, line: statLine(p) }];
  };
  const best = (xs: PlayerSeason[], score: (p: PlayerSeason) => number) =>
    xs.length === 0 ? undefined : xs.reduce((a, b) => (score(b) > score(a) ? b : a));

  const offense = all.filter((p) => OFFENSE.has(player(p.id)?.position ?? ""));
  const defense = all.filter((p) => DEFENSE.has(player(p.id)?.position ?? ""));
  const teamFactor = (p: PlayerSeason) => 0.6 + 0.8 * winPct(records.get(p.team)!);
  const mvp = best(offense, (p) => offensiveScore(p) * teamFactor(p));
  const opoy = best(offense.filter((p) => p !== mvp), offensiveScore);
  const dpoy = best(defense, defensiveScore);
  const rookies = all.filter((p) => p.id.startsWith(`D${league.season}-`));
  const roy = best(rookies, (p) => Math.max(offensiveScore(p), defensiveScore(p) * 1.2));

  return [...award("MVP", mvp), ...award("Offensive Player of the Year", opoy), ...award("Defensive Player of the Year", dpoy), ...award("Rookie of the Year", roy)];
}
