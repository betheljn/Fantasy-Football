// The owner's progress: you are the owner, and the owner levels up. XP comes
// from what your program does: games won (and played), calls won in the play
// duel (more in games you call yourself), division titles and playoff runs,
// your players' awards, and how much your players grew over the offseason.
// A season's XP builds as it's played (worked out from its results) and is
// banked when the offseason is done. Levels come faster early and slower
// later; each level is a point to spend on upgrades (Milestone 23 step 2).
import type { Award } from "./awards.ts";
import type { GameSummary } from "../league/standings.ts";
import type { PlayoffResult } from "../league/playoffs.ts";
import type { League } from "../league/league.ts";
import { playerOverall } from "../model/player.ts";
import type { Team, UpgradeTrack } from "../model/team.ts";

export type XpSource = "win" | "tie" | "loss" | "calls" | "winning_season" | "division_title" | "playoff_berth" | "playoff_win" | "championship" | "award" | "development";

/** What each thing is worth. */
export const XP = {
  win: 150,
  tie: 50,
  /** Every game played counts for something. */
  loss: 25,
  /** Per call your side won in the play duel... */
  callWon: 1,
  /** ...and half again in games you called yourself. */
  calledYourself: 1.5,
  winningSeason: 150,
  divisionTitle: 400,
  playoffBerth: 200,
  playoffWin: 250,
  /** On top of the title game win. */
  championship: 1000,
  /** Each of your players' season awards (MVP, Offensive and Defensive Player, Rookie of the Year). */
  award: 250,
  /** Per point of overall your players gained over the offseason (gains only). */
  developmentPoint: 6,
} as const;

export const XP_LABELS: Record<XpSource, string> = {
  win: "Wins",
  tie: "Ties",
  loss: "Games played (losses)",
  calls: "Calls won",
  winning_season: "Winning season",
  division_title: "Division title",
  playoff_berth: "Playoff berth",
  playoff_win: "Playoff wins",
  championship: "Championship",
  award: "Players' awards",
  development: "Player development",
};

export interface XpLine {
  source: XpSource;
  /** How many (wins, calls, overall points...). */
  count: number;
  xp: number;
}

export interface OwnerSeason {
  season: number;
  xp: number;
  lines: XpLine[];
}

export interface OwnerProgress {
  /** Banked XP (seasons finished). */
  xp: number;
  seasons: OwnerSeason[];
  /** Tiers bought in each upgrade track. */
  upgrades?: Partial<Record<UpgradeTrack, number>>;
}

export const MAX_LEVEL = 50;

/** XP to go from `level` to the next one. */
export function xpForLevel(level: number): number {
  return 400 + 60 * (level - 1);
}

export interface OwnerLevel {
  level: number;
  /** XP into this level, and what the next one takes (0 at the top). */
  into: number;
  next: number;
  xp: number;
}

export function ownerLevel(xp: number): OwnerLevel {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  return { level, into: level < MAX_LEVEL ? left : 0, next: level < MAX_LEVEL ? xpForLevel(level) : 0, xp: Math.floor(xp) };
}

export interface SeasonXpInput {
  /** The season's games so far (regular season). */
  results: readonly GameSummary[];
  /** Championship week and the playoffs, once played. */
  playoffs?: PlayoffResult | null;
  /** The season's awards, once given. */
  awards?: readonly Award[];
  /** Overall points your players gained over the offseason, once developed. */
  development?: number;
}

/** A season's XP for one team, line by line (only lines with something in them). */
export function seasonXp(team: string, input: SeasonXpInput): XpLine[] {
  const counts: Partial<Record<XpSource, number>> = {};
  const xp: Partial<Record<XpSource, number>> = {};
  const add = (source: XpSource, n: number, each: number) => {
    if (n <= 0) return;
    counts[source] = (counts[source] ?? 0) + n;
    xp[source] = (xp[source] ?? 0) + n * each;
  };
  const games = (gs: readonly GameSummary[]) => {
    for (const g of gs) {
      if (g.home !== team && g.away !== team) continue;
      if (g.winner === team) add("win", 1, XP.win);
      else if (g.winner === null) add("tie", 1, XP.tie);
      else add("loss", 1, XP.loss);
      const won = g.calls?.[team]?.[0] ?? 0;
      const yours = g.coached && (g.coached.team === team || g.coached.rival === team);
      add("calls", won, XP.callWon * (yours ? XP.calledYourself : 1));
    }
  };
  games(input.results);
  const mine = input.results.filter((g) => g.home === team || g.away === team);
  const wins = mine.filter((g) => g.winner === team).length;
  const losses = mine.filter((g) => g.winner !== null && g.winner !== team).length;
  // Judged on the full regular season (it's only known once the playoffs are on).
  if (input.playoffs && wins > losses) add("winning_season", 1, XP.winningSeason);

  const p = input.playoffs;
  if (p) {
    const titles = p.titleGames ?? [];
    games(titles.map((t) => t.summary));
    // Division champions: the title game winners (format 2), else the division winners in the field.
    const champ = titles.length ? titles.some((t) => t.summary.winner === team) : p.seeds.some((s) => s.team === team && s.bid === "division_winner");
    if (champ) add("division_title", 1, XP.divisionTitle);
    if (p.seeds.some((s) => s.team === team)) add("playoff_berth", 1, XP.playoffBerth);
    for (const g of p.games) {
      if (g.summary.home !== team && g.summary.away !== team) continue;
      if (g.summary.winner === team) add("playoff_win", 1, XP.playoffWin);
      const won = g.summary.calls?.[team]?.[0] ?? 0;
      add("calls", won, XP.callWon);
    }
    if (p.champion === team && p.games.length) add("championship", 1, XP.championship);
  }
  add("award", (input.awards ?? []).filter((a) => a.team === team).length, XP.award);
  add("development", Math.round(input.development ?? 0), XP.developmentPoint);

  const order: XpSource[] = ["win", "tie", "loss", "calls", "winning_season", "division_title", "playoff_berth", "playoff_win", "championship", "award", "development"];
  return order.filter((s) => counts[s]).map((s) => ({ source: s, count: counts[s]!, xp: Math.round(xp[s]!) }));
}

export const totalXp = (lines: readonly XpLine[]) => lines.reduce((t, l) => t + l.xp, 0);

/** Overall points the players a team had gained over the offseason's development (gains only). */
export function developmentGain(before: Team | undefined, after: Team | undefined): number {
  if (!before || !after) return 0;
  const then = new Map(before.roster.map((p) => [p.id, playerOverall(p)]));
  let gain = 0;
  for (const p of after.roster) {
    const was = then.get(p.id);
    if (was !== undefined) gain += Math.max(0, playerOverall(p) - was);
  }
  return gain;
}

export const newOwner = (): OwnerProgress => ({ xp: 0, seasons: [] });

/** Bank a finished season's XP. */
export function bankSeason(progress: OwnerProgress, season: number, lines: XpLine[]): OwnerProgress {
  const xp = totalXp(lines);
  return { ...progress, xp: progress.xp + xp, seasons: [...progress.seasons.filter((s) => s.season !== season), { season, xp, lines }] };
}

/** Banked XP for every owner, for a season that's done (development compares the league before and after it). */
export function bankOwners(owners: Record<string, OwnerProgress>, season: number, input: Omit<SeasonXpInput, "development">, before: League, developed: League): Record<string, OwnerProgress> {
  const out: Record<string, OwnerProgress> = {};
  for (const [team, progress] of Object.entries(owners)) {
    const lines = seasonXp(team, { ...input, development: developmentGain(before.teams[team], developed.teams[team]) });
    out[team] = bankSeason(progress, season, lines);
  }
  return out;
}

/** Where an owner stands now: banked XP plus the season being played. */
export function ownerStanding(progress: OwnerProgress | undefined, team: string, live: SeasonXpInput): OwnerLevel & { season: XpLine[]; seasonXp: number } {
  const season = seasonXp(team, live);
  const seasonTotal = totalXp(season);
  return { ...ownerLevel((progress?.xp ?? 0) + seasonTotal), season, seasonXp: seasonTotal };
}

/** Give these teams an owner (people play them) if they don't have one yet. */
export function withOwners<D extends { owners?: Record<string, OwnerProgress> }>(dynasty: D, teams: Iterable<string>): D {
  const owners = { ...dynasty.owners };
  let added = false;
  for (const t of teams) {
    if (owners[t]) continue;
    owners[t] = newOwner();
    added = true;
  }
  return added ? { ...dynasty, owners } : dynasty;
}

// --- upgrades: each level is a point; a track's tier n costs n points ---

export interface UpgradeInfo {
  label: string;
  /** What each tier does. */
  tiers: readonly string[];
}

export const UPGRADES: Record<UpgradeTrack, UpgradeInfo> = {
  facilities: {
    label: "Facilities",
    tiers: ["Weight room: +4% player growth", "Training staff: +8% growth", "Sports science: +12% growth", "Performance center: +16% growth", "Elite campus: +20% growth"],
  },
  recruiting: {
    label: "Recruiting",
    tiers: ["Regional network: +8% scouting reach", "Area scouts: +16%", "National network: +24%", "Data scouting: +32%", "Everywhere: +40%"],
  },
  analytics: {
    label: "Analytics",
    tiers: ["Scouting report: their playbook's leanings by situation", "Film study: what they've called this game", "Self-scout: your own tendencies, as they see them"],
  },
  clinic: {
    label: "Coaching clinic",
    tiers: ["Clinic: coaches earn 15% more XP", "Coaching retreat: +30%", "Mentor program: +45%", "Staff college: +60%", "Coaching tree: +75%"],
  },
};

export const UPGRADE_TRACKS = Object.keys(UPGRADES) as UpgradeTrack[];

/** Coach XP multiplier per clinic tier. */
export const CLINIC_PER_TIER = 0.15;

/** Points it costs to buy the next tier of a track (the tier's number). */
export const upgradeCost = (nextTier: number) => nextTier;

/** Points spent on upgrades. */
export function pointsSpent(upgrades: Partial<Record<UpgradeTrack, number>> | undefined): number {
  let spent = 0;
  for (const t of UPGRADE_TRACKS) for (let tier = 1; tier <= (upgrades?.[t] ?? 0); tier++) spent += upgradeCost(tier);
  return spent;
}

/** Points to spend: one per level gained, less what's been spent. */
export function upgradePoints(progress: OwnerProgress | undefined, liveXp = 0): number {
  return ownerLevel((progress?.xp ?? 0) + liveXp).level - 1 - pointsSpent(progress?.upgrades);
}

/** Why this tier can't be bought now, or null. */
export function upgradeProblem(progress: OwnerProgress | undefined, track: UpgradeTrack, liveXp = 0): string | null {
  if (!UPGRADES[track]) return "That isn't an upgrade";
  const next = (progress?.upgrades?.[track] ?? 0) + 1;
  if (next > UPGRADES[track].tiers.length) return `${UPGRADES[track].label} is maxed out`;
  const cost = upgradeCost(next);
  const have = upgradePoints(progress, liveXp);
  return have < cost ? `${UPGRADES[track].label} tier ${next} takes ${cost} point${cost === 1 ? "" : "s"} (you have ${have})` : null;
}

/** Buy the next tier of a track for `team`'s owner (`liveXp`: this season's XP so far counts toward levels). */
export function buyUpgrade<D extends { owners?: Record<string, OwnerProgress>; league: League }>(dynasty: D, team: string, track: UpgradeTrack, liveXp = 0): D {
  const progress = dynasty.owners?.[team];
  if (!progress) throw new Error("No owner for that team");
  const problem = upgradeProblem(progress, track, liveXp);
  if (problem) throw new Error(problem);
  const upgrades = { ...progress.upgrades, [track]: (progress.upgrades?.[track] ?? 0) + 1 };
  return syncUpgrades({ ...dynasty, owners: { ...dynasty.owners, [team]: { ...progress, upgrades } } });
}

/** Put each owner's upgrades on their team (and take them off any team no owner runs). */
export function syncUpgrades<D extends { owners?: Record<string, OwnerProgress>; league: League }>(dynasty: D): D {
  const teams = { ...dynasty.league.teams };
  let changed = false;
  for (const [abbr, team] of Object.entries(teams)) {
    const want = dynasty.owners?.[abbr]?.upgrades;
    const has = team.upgrades;
    if (JSON.stringify(want ?? {}) === JSON.stringify(has ?? {})) continue;
    const { upgrades: _old, ...rest } = team;
    teams[abbr] = want && Object.keys(want).length ? { ...rest, upgrades: want } : rest;
    changed = true;
  }
  return changed ? { ...dynasty, league: { ...dynasty.league, teams } } : dynasty;
}
