// Moments and the record book. Notable things that happen in the league are
// kept as collectible moment cards, rarer the rarer the moment: long
// touchdowns, monster games, comebacks, record seasons, perfect seasons. The
// record book starts empty when a dynasty begins (year one, the Founders'
// Era), so every record is one your league set. Breaking a record makes a
// moment one tier rarer; the first time anything happens in league history
// makes it a one-of-one.
import { teamName } from "../model/team.ts";
import type { PlayerId } from "../model/player.ts";
import type { League } from "../league/league.ts";
import type { GameResult } from "../game/game.ts";
import type { GameSummary, TeamRecord } from "../league/standings.ts";
import type { SeasonStats } from "../league/seasonstats.ts";
import type { PlayoffResult } from "../league/playoffs.ts";
import { buildBoxScore, type PlayerStatKey } from "../stats/boxscore.ts";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: readonly Rarity[] = ["common", "rare", "epic", "legendary"];
const up = (r: Rarity): Rarity => RARITIES[Math.min(RARITIES.length - 1, RARITIES.indexOf(r) + 1)]!;

export interface Moment {
  id: string;
  season: number;
  /** Week of the game (0 for a season-long moment). */
  week: number;
  /** What kind of moment ("long-td", "rush-2000", ...): firsts are counted per kind. */
  kind: string;
  title: string;
  detail: string;
  team: string;
  player?: PlayerId;
  name?: string;
  rarity: Rarity;
  /** The first of its kind in league history: a one-of-one. */
  first?: boolean;
  /** It set a league record. */
  record?: boolean;
}

/** One record: the mark, who set it, when. */
export interface RecordEntry {
  value: number;
  player: PlayerId;
  name: string;
  team: string;
  season: number;
  week?: number;
}

export type RecordStat = "passYds" | "passTd" | "rushYds" | "rushTd" | "recYds" | "rec" | "sacks" | "defInt";
export const RECORD_STATS: readonly RecordStat[] = ["passYds", "passTd", "rushYds", "rushTd", "recYds", "rec", "sacks", "defInt"];
export const RECORD_NAMES: Record<RecordStat, string> = {
  passYds: "Passing yards",
  passTd: "Passing touchdowns",
  rushYds: "Rushing yards",
  rushTd: "Rushing touchdowns",
  recYds: "Receiving yards",
  rec: "Receptions",
  sacks: "Sacks",
  defInt: "Interceptions",
};

export interface RecordBook {
  game: Partial<Record<RecordStat, RecordEntry>>;
  season: Partial<Record<RecordStat, RecordEntry>>;
  /** Kinds of moments that have happened at least once. */
  firsts: string[];
}

export const emptyRecordBook = (): RecordBook => ({ game: {}, season: {}, firsts: [] });

/** Moments and the record book for a season in progress. */
export interface Collection {
  book: RecordBook;
  moments: Moment[];
  /** The season-long moments have been added (done once, when the season ends). */
  seasonDone?: boolean;
}

type Lookup = (id: PlayerId) => { name: string; position: string } | null;

function lookupIn(league: League): Lookup {
  const index = new Map<PlayerId, { name: string; position: string }>();
  for (const t of Object.values(league.teams)) for (const p of [...t.roster, ...(t.reserve ?? [])]) index.set(p.id, { name: `${p.firstName} ${p.lastName}`, position: p.position });
  return (id) => index.get(id) ?? null;
}

/** Add a moment: mark firsts (one-of-ones) and keep it if it's worth keeping. */
function keep(c: Collection, m: Omit<Moment, "first">, always: boolean): void {
  // A record is its own honor: the first record of a kind isn't also a one-of-one.
  const first = !m.kind.startsWith("record-") && !c.book.firsts.includes(m.kind);
  if (first) c.book.firsts.push(m.kind);
  const moment: Moment = first ? { ...m, rarity: "legendary", first: true } : m;
  // Common moments are only kept for the teams in `always` (yours); the rest everywhere.
  if (moment.rarity === "common" && !always) return;
  c.moments.push(moment);
}

/** Check a stat against the record book; a new record updates it. */
function checkRecord(book: RecordBook, scope: "game" | "season", stat: RecordStat, entry: RecordEntry, minimum: number): boolean {
  if (entry.value < minimum) return false;
  const held = book[scope][stat];
  if (held && held.value >= entry.value) return false;
  book[scope][stat] = entry;
  return true;
}

/** Minimums before a mark counts as a record (no record for a 30-yard game). */
const GAME_MIN: Record<RecordStat, number> = { passYds: 350, passTd: 4, rushYds: 180, rushTd: 3, recYds: 170, rec: 11, sacks: 3, defInt: 2 };
const SEASON_MIN: Record<RecordStat, number> = { passYds: 5000, passTd: 35, rushYds: 1600, rushTd: 16, recYds: 1600, rec: 110, sacks: 16, defInt: 8 };

interface Milestone {
  kind: string;
  stat: PlayerStatKey;
  at: number;
  rarity: Rarity;
  title: (name: string, v: number) => string;
}

const GAME_MILESTONES: Milestone[] = [
  { kind: "pass-500", stat: "passYds", at: 500, rarity: "epic", title: (n, v) => `${n} throws for ${v} yards` },
  { kind: "pass-450", stat: "passYds", at: 450, rarity: "rare", title: (n, v) => `${n} throws for ${v} yards` },
  { kind: "pass-td-6", stat: "passTd", at: 6, rarity: "epic", title: (n, v) => `${n} throws ${v} touchdowns` },
  { kind: "pass-td-5", stat: "passTd", at: 5, rarity: "rare", title: (n, v) => `${n} throws ${v} touchdowns` },
  { kind: "rush-300", stat: "rushYds", at: 300, rarity: "epic", title: (n, v) => `${n} runs for ${v} yards` },
  { kind: "rush-225", stat: "rushYds", at: 225, rarity: "rare", title: (n, v) => `${n} runs for ${v} yards` },
  { kind: "rush-td-4", stat: "rushTd", at: 4, rarity: "rare", title: (n, v) => `${n} runs in ${v} touchdowns` },
  { kind: "rec-250", stat: "recYds", at: 250, rarity: "epic", title: (n, v) => `${n} catches ${v} yards of passes` },
  { kind: "rec-200", stat: "recYds", at: 200, rarity: "rare", title: (n, v) => `${n} piles up ${v} receiving yards` },
  { kind: "sacks-5", stat: "sacks", at: 5, rarity: "rare", title: (n, v) => `${n} sacks the quarterback ${v} times` },
  { kind: "picks-3", stat: "defInt", at: 3, rarity: "epic", title: (n, v) => `${n} picks off ${v} passes` },
];

// A 20-game season: milestones are set for that length.
const SEASON_MILESTONES: Milestone[] = [
  { kind: "season-pass-6500", stat: "passYds", at: 6500, rarity: "epic", title: (n, v) => `${n}: a ${v.toLocaleString()}-yard passing season` },
  { kind: "season-pass-5500", stat: "passYds", at: 5500, rarity: "rare", title: (n, v) => `${n}: ${v.toLocaleString()} passing yards` },
  { kind: "season-rush-2200", stat: "rushYds", at: 2200, rarity: "epic", title: (n, v) => `${n} runs for ${v.toLocaleString()} yards` },
  { kind: "season-rush-1800", stat: "rushYds", at: 1800, rarity: "rare", title: (n, v) => `${n}: ${v.toLocaleString()} rushing yards` },
  { kind: "season-rec-2200", stat: "recYds", at: 2200, rarity: "epic", title: (n, v) => `${n}: ${v.toLocaleString()} receiving yards` },
  { kind: "season-rec-1800", stat: "recYds", at: 1800, rarity: "rare", title: (n, v) => `${n}: ${v.toLocaleString()} receiving yards` },
  { kind: "season-sacks-25", stat: "sacks", at: 25, rarity: "epic", title: (n, v) => `${n}: ${v} sacks in a season` },
  { kind: "season-sacks-20", stat: "sacks", at: 20, rarity: "rare", title: (n, v) => `${n}: ${v} sacks` },
  { kind: "season-int-10", stat: "defInt", at: 10, rarity: "epic", title: (n, v) => `${n}: ${v} interceptions` },
];

/** The biggest deficit the winner came back from (points), from the score after each play. */
function comeback(result: GameResult): number {
  if (!result.winner) return 0;
  const other = result.winner === result.home ? result.away : result.home;
  let worst = 0;
  for (const p of result.plays) worst = Math.max(worst, p.score[other]! - p.score[result.winner]!);
  return worst;
}

/**
 * The moments in one game (and any game records), added to the collection.
 * `yours` keeps common moments for your team.
 */
export function collectGame(c: Collection, league: League, season: number, summary: GameSummary, result: GameResult, yours?: string): void {
  const who = lookupIn(league);
  const box = buildBoxScore(result);
  const always = (team: string) => team === yours;
  const id = (k: string) => `${season}-${summary.id}-${k}`;
  const vs = (team: string) => (team === summary.home ? summary.away : summary.home);

  // Big plays.
  for (const [i, p] of result.plays.entries()) {
    const e = p.event;
    if ((e.kind === "run" || e.kind === "pass") && e.touchdown && e.yardsGained >= 90 && !e.turnover) {
      const scorer = e.kind === "run" ? e.rusher : e.target;
      const info = scorer ? who(scorer) : null;
      keep(c, { id: id(`long-${i}`), season, week: summary.week, kind: "long-td", title: `${info ? info.name : e.offense} goes ${e.yardsGained} yards for a touchdown`, detail: `${e.offense} vs ${e.defense}, week ${summary.week}.`, team: e.offense, ...(scorer ? { player: scorer } : {}), ...(info ? { name: info.name } : {}), rarity: e.yardsGained >= 99 ? "epic" : "rare" }, always(e.offense));
    }
    if ((e.kind === "run" || e.kind === "pass") && e.turnover?.touchdown) {
      const info = who(e.turnover.by);
      const kind = e.turnover.type === "interception" ? "pick-six" : "scoop-and-score";
      keep(c, { id: id(`${kind}-${i}`), season, week: summary.week, kind, title: `${info?.name ?? e.defense} ${e.turnover.type === "interception" ? "takes an interception" : "returns a fumble"} ${e.turnover.returnYards} yards to the house`, detail: `${e.defense} vs ${e.offense}, week ${summary.week}.`, team: e.defense, player: e.turnover.by, ...(info ? { name: info.name } : {}), rarity: e.turnover.returnYards >= 90 ? "rare" : "common" }, always(e.defense));
    }
    if ((e.kind === "kickoff" || e.kind === "punt") && e.touchdown && e.returner) {
      const info = who(e.returner);
      keep(c, { id: id(`return-${i}`), season, week: summary.week, kind: "return-td", title: `${info?.name ?? e.defense} returns a ${e.kind} for a touchdown`, detail: `${e.returnYards} yards, week ${summary.week}.`, team: e.defense, player: e.returner, ...(info ? { name: info.name } : {}), rarity: "rare" }, always(e.defense));
    }
    if (e.kind === "field_goal" && e.made && e.distance >= 62) {
      const info = who(e.kicker);
      keep(c, { id: id(`fg-${i}`), season, week: summary.week, kind: "long-fg", title: `${info?.name ?? e.offense} drills a ${e.distance}-yard field goal`, detail: `${e.offense} vs ${e.defense}, week ${summary.week}.`, team: e.offense, player: e.kicker, ...(info ? { name: info.name } : {}), rarity: e.distance >= 65 ? "epic" : "rare" }, always(e.offense));
    }
  }

  // Monster games, and game records.
  for (const s of Object.values(box.players)) {
    const info = who(s.id);
    if (!info) continue;
    const records = RECORD_STATS.filter((stat) => checkRecord(c.book, "game", stat, { value: s[stat], player: s.id, name: info.name, team: s.team, season, week: summary.week }, GAME_MIN[stat]));
    const hit = GAME_MILESTONES.find((m) => s[m.stat] >= m.at);
    if (hit || records.length > 0) {
      const stat = hit?.stat ?? records[0]!;
      const v = s[stat];
      const base: Rarity = hit?.rarity ?? "rare";
      keep(c, {
        id: id(`game-${s.id}`),
        season,
        week: summary.week,
        kind: hit?.kind ?? `record-game-${stat}`,
        title: hit ? hit.title(info.name, v) : `${info.name}: a record ${v} ${RECORD_NAMES[stat as RecordStat].toLowerCase()}`,
        detail: `${info.position}, ${s.team} vs ${vs(s.team)}, week ${summary.week}.${records.length ? ` League record: ${records.map((r) => RECORD_NAMES[r].toLowerCase()).join(", ")} in a game.` : ""}`,
        team: s.team,
        player: s.id,
        name: info.name,
        rarity: records.length ? up(base) : base,
        ...(records.length ? { record: true } : {}),
      }, always(s.team));
    }
  }

  // Comebacks and shutouts.
  const name = (abbr: string) => (league.teams[abbr] ? teamName(league.teams[abbr]!) : abbr);
  const back = comeback(result);
  if (result.winner && back >= 17) {
    keep(c, { id: id("comeback"), season, week: summary.week, kind: "comeback", title: `${name(result.winner)} storm back from ${back} down`, detail: `Beat ${name(vs(result.winner))} ${Math.max(summary.homeScore, summary.awayScore)}-${Math.min(summary.homeScore, summary.awayScore)}, week ${summary.week}.`, team: result.winner, rarity: back >= 24 ? "epic" : "rare" }, always(result.winner));
  }
  for (const [team, allowed] of [
    [summary.home, summary.awayScore],
    [summary.away, summary.homeScore],
  ] as const)
    if (allowed === 0) keep(c, { id: id(`shutout-${team}`), season, week: summary.week, kind: "shutout", title: `${name(team)} pitch a shutout`, detail: `Blanked ${name(vs(team))}, week ${summary.week}.`, team, rarity: "common" }, always(team));
}

/**
 * The season's moments (and season records) once the regular season is
 * over: milestone seasons, perfect and winless records, the champion.
 */
export function collectSeason(c: Collection, league: League, season: number, stats: SeasonStats, records: ReadonlyMap<string, TeamRecord>, playoffs: PlayoffResult | null, yours?: string): void {
  const who = lookupIn(league);
  const always = (team: string) => team === yours;
  const name = (abbr: string) => (league.teams[abbr] ? teamName(league.teams[abbr]!) : abbr);
  for (const p of stats.players.values()) {
    const info = who(p.id);
    if (!info) continue;
    const broke = RECORD_STATS.filter((stat) => checkRecord(c.book, "season", stat, { value: p.stats[stat], player: p.id, name: info.name, team: p.team, season }, SEASON_MIN[stat]));
    const hit = SEASON_MILESTONES.find((m) => p.stats[m.stat] >= m.at);
    if (!hit && broke.length === 0) continue;
    const stat = hit?.stat ?? broke[0]!;
    const v = p.stats[stat];
    const base: Rarity = hit?.rarity ?? "rare";
    keep(c, {
      id: `${season}-season-${p.id}`,
      season,
      week: 0,
      kind: hit?.kind ?? `record-season-${stat}`,
      title: hit ? hit.title(info.name, v) : `${info.name} sets the season record: ${v.toLocaleString()} ${RECORD_NAMES[stat as RecordStat].toLowerCase()}`,
      detail: `${info.position}, ${p.team}, ${season}.${broke.length ? ` League record: ${broke.map((r) => RECORD_NAMES[r].toLowerCase()).join(", ")} in a season.` : ""}`,
      team: p.team,
      player: p.id,
      name: info.name,
      rarity: broke.length ? up(base) : base,
      ...(broke.length ? { record: true } : {}),
    }, always(p.team));
  }
  for (const [team, r] of records) {
    if (r.losses === 0 && r.ties === 0 && r.wins >= 15) keep(c, { id: `${season}-perfect-${team}`, season, week: 0, kind: "perfect-season", title: `${name(team)} go ${r.wins}-0`, detail: `A perfect regular season, ${season}.`, team, rarity: "legendary" }, true);
    if (r.wins === 0 && r.ties === 0 && r.losses >= 15) keep(c, { id: `${season}-winless-${team}`, season, week: 0, kind: "winless-season", title: `${name(team)} go 0-${r.losses}`, detail: `Not a single win, ${season}. It happens. Rarely.`, team, rarity: "rare" }, always(team));
  }
  if (playoffs) {
    const champ = playoffs.champion;
    const r = records.get(champ);
    const unbeaten = r && r.losses === 0 && r.ties === 0;
    keep(c, { id: `${season}-champion`, season, week: 0, kind: unbeaten ? "unbeaten-champion" : "champion", title: unbeaten ? `${name(champ)}: unbeaten champions` : `${name(champ)} win the ${season} championship`, detail: `Beat the ${name(playoffs.runnerUp)} in the final.`, team: champ, rarity: unbeaten ? "legendary" : "epic" }, true);
  }
}

/** A fresh collection for a new season, from the dynasty's record book. */
export function startCollection(book: RecordBook | undefined): Collection {
  const b = book ?? emptyRecordBook();
  return { book: { game: { ...b.game }, season: { ...b.season }, firsts: [...b.firsts] }, moments: [] };
}

/** Collect a week of games. */
export function collectWeek(c: Collection, league: League, season: number, games: ReadonlyArray<{ summary: GameSummary; result: GameResult }>, yours?: string): Collection {
  const next: Collection = { ...c, book: { game: { ...c.book.game }, season: { ...c.book.season }, firsts: [...c.book.firsts] }, moments: [...c.moments] };
  for (const g of games) collectGame(next, league, season, g.summary, g.result, yours);
  return next;
}
