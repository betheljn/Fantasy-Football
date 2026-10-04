// The week's news, written from what happened: upsets, thrillers and
// blowouts, big individual games, streaks, rankings shake-ups, star injuries,
// trades, and the MVP race. Every story is ranked by how big it is; the
// national feed takes the biggest, and your team's local feed has everything
// about you (plus a recap of your game and a look at the next one). Wording
// varies by seed, so the same week always reads the same.
import { Rng } from "../rng.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import type { Team } from "../model/team.ts";
import type { League } from "../league/league.ts";
import type { GameResult } from "../game/game.ts";
import type { GameSummary } from "../league/standings.ts";
import { computeRecords, formatRecord } from "../league/standings.ts";
import type { RankingEntry } from "../league/rankings.ts";
import type { Schedule } from "../league/schedule.ts";
import type { SeasonStats } from "../league/seasonstats.ts";
import { buildBoxScore, type PlayerStats } from "../stats/boxscore.ts";
import { computeAwards } from "../dynasty/awards.ts";
import type { InjuryNews } from "../game/injuries.ts";
import { SEASON_ENDING } from "../game/injuries.ts";
import type { TradeRecord } from "../contracts/trades.ts";
import { teamCaptains } from "../contracts/morale.ts";
import type { CareerLine } from "../dynasty/dynasty.ts";
import type { PlayerStatKey } from "../stats/boxscore.ts";

/** Career marks worth a story, and what each is called. */
export const MILESTONES: ReadonlyArray<{ key: PlayerStatKey; marks: readonly number[]; what: string }> = [
  { key: "passYds", marks: [25_000, 40_000, 50_000, 60_000, 70_000], what: "career passing yards" },
  { key: "passTd", marks: [200, 300, 400, 500], what: "career touchdown passes" },
  { key: "rushYds", marks: [7_500, 10_000, 12_500, 15_000], what: "career rushing yards" },
  { key: "rushTd", marks: [75, 100, 150], what: "career rushing touchdowns" },
  { key: "recYds", marks: [7_500, 10_000, 12_500, 15_000], what: "career receiving yards" },
  { key: "recTd", marks: [75, 100], what: "career touchdown catches" },
  { key: "sacks", marks: [75, 100, 150], what: "career sacks" },
  { key: "defInt", marks: [30, 50], what: "career interceptions" },
  { key: "tackles", marks: [750, 1_000, 1_500], what: "career tackles" },
];

export type StoryKind = "upset" | "clash" | "thriller" | "blowout" | "performance" | "streak" | "rankings" | "injury" | "trade" | "mvp" | "recap" | "preview" | "rivalry" | "spring" | "lockerroom" | "milestone";

export interface Story {
  id: string;
  season: number;
  week: number;
  kind: StoryKind;
  headline: string;
  body: string;
  teams: string[];
  players: PlayerId[];
  /** How big a story it is, 0-100. */
  importance: number;
  /** Only for your team's local feed (your recap and preview). */
  local?: boolean;
}

export interface WeekNewsInput {
  league: League;
  schedule: Schedule;
  season: number;
  week: number;
  /** This week's games, with full results (for box scores). */
  games: ReadonlyArray<{ summary: GameSummary; result: GameResult }>;
  /** Every result through this week. */
  results: readonly GameSummary[];
  /** Rankings before and after this week. */
  before: readonly RankingEntry[];
  after: readonly RankingEntry[];
  stats: SeasonStats;
  injuries?: readonly InjuryNews[];
  trades?: readonly TradeRecord[];
  /** Your team: a recap of your game and a look at the next one. */
  userTeam?: string;
  /** Careers before this season (for milestones and the all-time lists). */
  careers?: ReadonlyMap<PlayerId, CareerLine>;
}

const NATIONAL_LIMIT = 12;

const pickLine = (rng: Rng, options: readonly string[]) => rng.pick(options);

function nick(league: League, abbr: string): string {
  return league.teams[abbr]?.nickname ?? abbr;
}

function rankOf(entries: readonly RankingEntry[], abbr: string): number | null {
  const r = entries.find((e) => e.team === abbr)?.rank;
  return r !== undefined && r <= 25 ? r : null;
}

/** A team's state, for story bodies ("Ohio"). */
function st(league: League, abbr: string): string {
  return league.teams[abbr]?.state ?? abbr;
}

/** "No. 4 Ohio" or just "Ohio". */
function rankedState(league: League, entries: readonly RankingEntry[], abbr: string): string {
  const r = rankOf(entries, abbr);
  return r ? `No. ${r} ${st(league, abbr)}` : st(league, abbr);
}

/** "No. 4 Ironclads" or just "Ironclads". */
function ranked(league: League, entries: readonly RankingEntry[], abbr: string): string {
  const r = rankOf(entries, abbr);
  return r ? `No. ${r} ${nick(league, abbr)}` : nick(league, abbr);
}

function findPlayer(league: League, id: PlayerId): { player: Player; team: Team } | null {
  for (const t of Object.values(league.teams)) {
    const p = t.roster.find((x) => x.id === id) ?? t.reserve?.find((x) => x.id === id);
    if (p) return { player: p, team: t };
  }
  return null;
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

/** "with a knee injury", "with a torn ACL", "after shoulder surgery". */
function injuryPhrase(type: string): string {
  if (type.includes("surgery")) return `after ${type}`;
  return /torn|broken/.test(type) ? `with a ${type}` : `with ${/^[aeiou]/.test(type) ? "an" : "a"} ${type} injury`;
}

/** A game's standout: offense by yards and touchdowns, defense by sacks and takeaways. */
function impact(s: PlayerStats): number {
  return s.passYds / 25 + s.passTd * 4 - s.passInt * 2 + s.rushYds / 10 + s.rushTd * 6 + s.recYds / 10 + s.recTd * 6 + s.sacks * 4 + s.defInt * 5 + s.defTd * 6;
}

/** "312 passing yards, 3 TD" etc. */
function statLine(s: PlayerStats): string {
  const parts: string[] = [];
  if (s.passAtt > 0) parts.push(`${s.passCmp}-of-${s.passAtt}, ${s.passYds} yards, ${s.passTd} TD${s.passInt ? `, ${s.passInt} INT` : ""}`);
  if (s.rushAtt >= 5 || s.rushTd > 0) parts.push(`${s.rushAtt} carries for ${s.rushYds} yards${s.rushTd ? `, ${s.rushTd} TD` : ""}`);
  if (s.rec > 0 && (s.recYds >= 40 || s.recTd > 0)) parts.push(`${s.rec} catches for ${s.recYds} yards${s.recTd ? `, ${s.recTd} TD` : ""}`);
  if (s.sacks >= 1) parts.push(`${s.sacks} sack${s.sacks === 1 ? "" : "s"}`);
  if (s.defInt >= 1) parts.push(`${s.defInt} interception${s.defInt === 1 ? "" : "s"}`);
  return parts.join("; ");
}

/** Current streak from results in week order: +n wins, -n losses (ties end a streak). */
function findPlayerName(league: League, id: PlayerId): string {
  const f = findPlayer(league, id);
  return f ? fullName(f.player) : "the old mark";
}

/** 12345 -> "12,345". */
function commas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
}

function streak(results: readonly GameSummary[], abbr: string): number {
  const mine = results.filter((r) => r.home === abbr || r.away === abbr).sort((a, b) => a.week - b.week);
  let n = 0;
  for (let i = mine.length - 1; i >= 0; i--) {
    const w = mine[i]!.winner;
    const won = w === abbr;
    if (w === null) break;
    if (n === 0) n = won ? 1 : -1;
    else if (won && n > 0) n++;
    else if (!won && n < 0) n--;
    else break;
  }
  return n;
}

/** Write the week's stories, biggest first. */
export function weeklyNews(input: WeekNewsInput): Story[] {
  const { league, season, week, games, before, after, userTeam } = input;
  const rng = (key: string) => new Rng(`news:${league.seed}:${season}:${week}:${key}`);
  const stories: Story[] = [];
  const add = (s: Omit<Story, "season" | "week" | "id"> & { key: string }) => {
    const { key, ...rest } = s;
    stories.push({ ...rest, id: `${season}-${week}-${key}`, season, week, importance: Math.round(Math.max(0, Math.min(100, s.importance))) });
  };
  const records = computeRecords(league, input.results);
  const rec = (abbr: string) => {
    const r = records.get(abbr);
    return r ? formatRecord(r) : "0-0";
  };

  // --- games ---
  const boxes = new Map(games.map((g) => [g.summary.id, buildBoxScore(g.result)]));
  for (const { summary: g } of games) {
    const box = boxes.get(g.id)!;
    const winner = g.winner;
    const loser = winner === null ? null : winner === g.home ? g.away : g.home;
    const margin = Math.abs(g.homeScore - g.awayScore);
    const hi = Math.max(g.homeScore, g.awayScore);
    const lo = Math.min(g.homeScore, g.awayScore);
    const star = Object.values(box.players).sort((a, b) => impact(b) - impact(a))[0];
    const starInfo = star ? findPlayer(league, star.id) : null;
    const starText = star && starInfo ? ` ${starInfo.player.position} ${fullName(starInfo.player)} led the way: ${statLine(star)}.` : "";
    const r = rng(g.id);
    const ot = g.overtime ? " in overtime" : "";
    if (!winner || !loser) {
      add({ key: g.id, kind: "thriller", importance: 45, teams: [g.home, g.away], players: star ? [star.id] : [], headline: `${nick(league, g.away)} and ${nick(league, g.home)} play to a ${hi}-${lo} tie`, body: `Nobody blinked: ${st(league, g.away)} and ${st(league, g.home)} finished level after overtime.${starText}` });
      continue;
    }
    const wr = rankOf(before, winner);
    const lr = rankOf(before, loser);
    const base = { key: g.id, teams: [winner, loser], players: star ? [star.id] : [] };
    const score = `${hi}-${lo}${ot}`;
    if (lr && lr <= 15 && (!wr || wr - lr >= 10)) {
      add({ ...base, kind: "upset", importance: 62 + (26 - lr), headline: pickLine(r, [`${nick(league, winner)} stun ${ranked(league, before, loser)}, ${score}`, `Upset: ${nick(league, winner)} knock off ${ranked(league, before, loser)}`, `${ranked(league, before, loser)} fall to ${nick(league, winner)}`]), body: `${st(league, winner)} (${rec(winner)}) beat ${rankedState(league, before, loser)} ${score}.${starText}` });
    } else if (wr && lr && wr <= 10 && lr <= 10) {
      add({ ...base, kind: "clash", importance: 58, headline: pickLine(r, [`${ranked(league, before, winner)} win the top-10 showdown with ${ranked(league, before, loser)}`, `${nick(league, winner)} take the heavyweight bout, ${score}`]), body: `A meeting of top-10 teams went to ${st(league, winner)}, ${score}.${starText}` });
    } else if (margin <= 3 || g.overtime) {
      add({ ...base, kind: "thriller", importance: 32 + (wr || lr ? 10 : 0), headline: pickLine(r, [`${nick(league, winner)} edge ${nick(league, loser)}, ${score}`, `${nick(league, winner)} survive ${nick(league, loser)}${ot}`, `Down to the wire: ${nick(league, winner)} ${hi}, ${nick(league, loser)} ${lo}`]), body: `${st(league, winner)} (${rec(winner)}) held on against ${st(league, loser)} (${rec(loser)}).${starText}` });
    } else if (margin >= 28) {
      add({ ...base, kind: "blowout", importance: 24 + (wr ? 8 : 0), headline: pickLine(r, [`${nick(league, winner)} rout ${nick(league, loser)}, ${score}`, `${nick(league, winner)} roll past ${nick(league, loser)}`]), body: `It was never close: ${st(league, winner)} (${rec(winner)}) beat ${st(league, loser)} by ${margin}.${starText}` });
    }
  }

  // --- big individual games (the three biggest) ---
  const big: Array<{ s: PlayerStats; score: number; game: GameSummary }> = [];
  for (const { summary } of games)
    for (const s of Object.values(boxes.get(summary.id)!.players)) {
      const huge = s.passYds >= 400 || s.passTd >= 5 || s.rushYds >= 180 || s.rushTd >= 3 || s.recYds >= 170 || s.recTd >= 3 || s.sacks >= 3 || s.defInt >= 2;
      if (huge) big.push({ s, score: impact(s), game: summary });
    }
  for (const { s, score, game } of big.sort((a, b) => b.score - a.score).slice(0, 3)) {
    const info = findPlayer(league, s.id);
    if (!info) continue;
    const opp = game.home === s.team ? game.away : game.home;
    add({ key: `perf-${s.id}`, kind: "performance", importance: 30 + Math.min(30, score / 2), teams: [s.team], players: [s.id], headline: `${info.player.position} ${fullName(info.player)} goes off against ${nick(league, opp)}`, body: `${fullName(info.player)} (${st(league, s.team)}): ${statLine(s)}.` });
  }

  // --- streaks ---
  for (const abbr of new Set(games.flatMap((g) => [g.summary.home, g.summary.away]))) {
    const n = streak(input.results, abbr);
    const r = records.get(abbr);
    if (!r) continue;
    if (r.losses === 0 && r.ties === 0 && r.wins >= 5) add({ key: `unbeaten-${abbr}`, kind: "streak", importance: 50 + r.wins, teams: [abbr], players: [], headline: `${nick(league, abbr)} still perfect at ${formatRecord(r)}`, body: `${league.teams[abbr]!.state} has won all ${r.wins} games this season.` });
    else if (n >= 5) add({ key: `streak-${abbr}`, kind: "streak", importance: 26 + n * 3, teams: [abbr], players: [], headline: `${nick(league, abbr)} win ${n} straight`, body: `${league.teams[abbr]!.state} is ${formatRecord(r)} and rolling.` });
    else if (r.wins === 0 && r.ties === 0 && r.losses >= 5) add({ key: `winless-${abbr}`, kind: "streak", importance: 22, teams: [abbr], players: [], headline: `${nick(league, abbr)} still looking for a win at ${formatRecord(r)}`, body: `${league.teams[abbr]!.state} has lost all ${r.losses} games.` });
    else if (n <= -5) add({ key: `skid-${abbr}`, kind: "streak", importance: 18 + -n * 2, teams: [abbr], players: [], headline: `${nick(league, abbr)} drop ${-n} in a row`, body: `${league.teams[abbr]!.state} has slid to ${formatRecord(r)}.` });
  }

  // --- the locker room: captains step up when a skid starts, and get the credit for a run ---
  for (const abbr of new Set(games.flatMap((g) => [g.summary.home, g.summary.away]))) {
    const n = streak(input.results, abbr);
    if (n !== -3 && n !== 4) continue;
    const team = league.teams[abbr];
    if (!team) continue;
    const c = teamCaptains(team);
    const captain = n < 0 ? (c.defense ?? c.offense) : (c.offense ?? c.defense);
    if (!captain) continue;
    const who = `${captain.position} ${fullName(captain)}`;
    const r = rng(`locker-${abbr}`);
    if (n < 0)
      add({ key: `locker-${abbr}`, kind: "lockerroom", importance: 20, teams: [abbr], players: [captain.id], headline: pickLine(r, [`Captain ${fullName(captain)} calls a players-only meeting in ${team.state}`, `${nick(league, abbr)} captain: "We're better than this"`]), body: `After three straight losses (${rec(abbr)}), ${who} gathered the ${team.nickname} without the coaches. "Nobody's pointing fingers. We fix it together."` });
    else
      add({ key: `locker-${abbr}`, kind: "lockerroom", importance: 18, teams: [abbr], players: [captain.id], headline: pickLine(r, [`${nick(league, abbr)} locker room buzzing after four straight`, `Captain ${fullName(captain)} has the ${team.nickname} believing`]), body: `Four wins in a row (${rec(abbr)}), and the ${team.nickname} point to their captain. "${captain.lastName} sets the tone every day," one teammate said.` });
  }

  // --- career milestones: a round number passed this week, and a new all-time leader ---
  if (input.careers) {
    const careers = input.careers;
    // This week's lines, and every career total before and after the week.
    const week = new Map<PlayerId, PlayerStats>();
    const opponent = new Map<PlayerId, string>();
    for (const { summary } of games)
      for (const line of Object.values(boxes.get(summary.id)!.players)) {
        week.set(line.id, line);
        opponent.set(line.id, summary.home === line.team ? summary.away : summary.home);
      }
    const ids = new Set<PlayerId>([...careers.keys(), ...input.stats.players.keys()]);
    for (const m of MILESTONES) {
      const total = (id: PlayerId) => (careers.get(id)?.stats[m.key] ?? 0) + (input.stats.players.get(id)?.stats[m.key] ?? 0);
      let leadBefore: { id: PlayerId; n: number } | null = null;
      let leadAfter: { id: PlayerId; n: number } | null = null;
      for (const id of ids) {
        const after = total(id);
        const before = after - (week.get(id)?.[m.key] ?? 0);
        if (!leadBefore || before > leadBefore.n || (before === leadBefore.n && id < leadBefore.id)) leadBefore = { id, n: before };
        if (!leadAfter || after > leadAfter.n || (after === leadAfter.n && id < leadAfter.id)) leadAfter = { id, n: after };
      }
      for (const [id, line] of week) {
        const now = total(id);
        const before = now - line[m.key];
        const mark = [...m.marks].reverse().find((x) => before < x && now >= x);
        // A new leader on the all-time list (once the list means something).
        const newLeader = leadAfter?.id === id && leadBefore && leadBefore.id !== id && leadBefore.n >= m.marks[0]!;
        if (!mark && !newLeader) continue;
        const info = findPlayer(league, id);
        if (!info) continue;
        const who = `${info.player.position} ${fullName(info.player)}`;
        const opp = opponent.get(id)!;
        const seasons = (careers.get(id)?.seasons ?? 0) + 1;
        if (newLeader) {
          const was = careers.get(leadBefore!.id)?.name ?? findPlayerName(league, leadBefore!.id);
          add({ key: `alltime-${id}-${m.key}`, kind: "milestone", importance: 60, teams: [line.team], players: [id], headline: `${fullName(info.player)} takes over the league lead in ${m.what}`, body: `${who} (${st(league, line.team)}) passed ${was} against ${nick(league, opp)}. He's at ${commas(now)}, the most in league history.` });
        } else {
          const r = rng(`ms-${id}-${m.key}`);
          add({ key: `ms-${id}-${m.key}-${mark}`, kind: "milestone", importance: 34 + 6 * m.marks.indexOf(mark!), teams: [line.team], players: [id], headline: pickLine(r, [`${fullName(info.player)} reaches ${commas(mark!)} ${m.what}`, `Milestone: ${fullName(info.player)} passes ${commas(mark!)} ${m.what}`]), body: `${who} (${st(league, line.team)}) got there against ${nick(league, opp)}, in his ${ordinal(seasons)} season in the league. He's at ${commas(now)}.` });
        }
      }
    }
  }

  // --- rankings ---
  const top = after[0];
  if (top && before[0] && top.team !== before[0].team) {
    add({ key: "number-one", kind: "rankings", importance: 66, teams: [top.team, before[0].team], players: [], headline: `${nick(league, top.team)} take over No. 1`, body: `${st(league, top.team)} (${formatRecord(top.record)}) moves to the top of the rankings, ahead of ${st(league, before[0].team)}.` });
  }
  const climbs = after
    .filter((e) => e.rank <= 10)
    .map((e) => ({ e, from: before.find((b) => b.team === e.team)?.rank ?? 51 }))
    .filter((x) => x.from - x.e.rank >= 6)
    .sort((a, b) => b.from - b.e.rank - (a.from - a.e.rank));
  for (const { e, from } of climbs.slice(0, 1))
    add({ key: `climb-${e.team}`, kind: "rankings", importance: 34, teams: [e.team], players: [], headline: `${nick(league, e.team)} jump to No. ${e.rank}`, body: `Up from ${from > 25 ? "outside the Top 25" : `No. ${from}`}, ${league.teams[e.team]!.state} is ${formatRecord(e.record)}.` });

  // --- injuries to stars (the three biggest) ---
  const hurt = [...(input.injuries ?? [])].filter((i) => i.overall >= 75 || (i.position === "QB" && i.starter)).sort((a, b) => b.weeks - a.weeks || b.overall - a.overall);
  for (const i of hurt.slice(0, 3)) {
    const seasonOver = i.weeks >= SEASON_ENDING;
    add({ key: `injury-${i.player}`, kind: "injury", importance: 36 + (seasonOver ? 18 : Math.min(12, i.weeks * 2)) + (i.position === "QB" ? 6 : 0), teams: [i.team], players: [i.player], headline: seasonOver ? `${nick(league, i.team)} lose ${i.position} ${i.name} for the season` : `${nick(league, i.team)} ${i.position} ${i.name} out ${i.weeks} week${i.weeks === 1 ? "" : "s"}`, body: `${i.name} (${i.overall}) ${seasonOver ? "is done for the season" : `will miss ${i.weeks} week${i.weeks === 1 ? "" : "s"}`} ${injuryPhrase(i.type)}.` });
  }

  // --- trades ---
  for (const [n, t] of (input.trades ?? []).entries()) {
    const best = [...t.players].sort((a, b) => b.overall - a.overall)[0];
    const firstRound = (t.picks ?? []).some((p) => p.round === 1);
    if (!best || (best.overall < 68 && !firstRound)) continue;
    const to = best.from === t.teams[0] ? t.teams[1] : t.teams[0];
    const rest = t.players.filter((p) => p !== best).map((p) => `${p.position} ${p.name}`);
    const picks = (t.picks ?? []).map((p) => `a ${p.draft} round-${p.round} pick`);
    add({ key: `trade-${n}`, kind: "trade", importance: 30 + Math.max(0, best.overall - 68) + (firstRound ? 10 : 0), teams: [...t.teams], players: t.players.map((p) => p.id), headline: `${nick(league, to)} trade for ${best.position} ${best.name}`, body: `${st(league, to)} acquires ${best.name} (${best.overall}) from ${st(league, best.from)}${rest.length + picks.length ? `; ${[...rest, ...picks].join(", ")} also changed hands` : ""}.` });
  }

  // --- the MVP race (from week 4) ---
  if (week >= 4) {
    const mvp = computeAwards(league, input.stats, input.results).find((a) => a.award === "MVP");
    if (mvp) add({ key: "mvp", kind: "mvp", importance: 28, teams: [mvp.team], players: [mvp.player], headline: `MVP watch: ${mvp.position} ${mvp.name} leads the race`, body: `${mvp.name} (${st(league, mvp.team)}): ${mvp.line}.` });
  }

  // --- your team: a recap of your game and a look at the next one ---
  if (userTeam) {
    const mine = games.find((g) => g.summary.home === userTeam || g.summary.away === userTeam);
    if (mine) {
      const g = mine.summary;
      const opp = g.home === userTeam ? g.away : g.home;
      const us = g.home === userTeam ? g.homeScore : g.awayScore;
      const them = g.home === userTeam ? g.awayScore : g.homeScore;
      const result = us > them ? "beat" : us < them ? "fall to" : "tie";
      const ours = Object.values(boxes.get(g.id)!.players).filter((s) => s.team === userTeam).sort((a, b) => impact(b) - impact(a))[0];
      const who = ours ? findPlayer(league, ours.id) : null;
      add({
        key: "recap",
        kind: "recap",
        local: true,
        importance: 60,
        teams: [userTeam, opp],
        players: ours ? [ours.id] : [],
        headline: `${nick(league, userTeam)} ${result} ${nick(league, opp)}, ${Math.max(us, them)}-${Math.min(us, them)}${g.overtime ? " (OT)" : ""}`,
        body: `${league.teams[userTeam]!.state} is ${rec(userTeam)}.${who && ours ? ` ${who.player.position} ${fullName(who.player)}: ${statLine(ours)}.` : ""}`,
      });
    }
    const next = input.schedule.games.find((x) => x.week > week && (x.home === userTeam || x.away === userTeam));
    if (next) {
      const opp = next.home === userTeam ? next.away : next.home;
      const where = next.home === userTeam ? "host" : "visit";
      // Their best playmaker or defender (linemen and specialists don't make the preview).
      const theirStar = [...league.teams[opp]!.roster].filter((p) => !["OL", "K", "P", "LS"].includes(p.position)).sort((a, b) => playerOverall(b) - playerOverall(a))[0];
      add({ key: "preview", kind: "preview", local: true, importance: 40, teams: [userTeam, opp], players: theirStar ? [theirStar.id] : [], headline: `Week ${next.week}: ${nick(league, userTeam)} ${where} ${ranked(league, after, opp)}`, body: `${st(league, opp)} (${rec(opp)}) brings ${theirStar ? `${theirStar.position} ${fullName(theirStar)} (${playerOverall(theirStar)})` : "its best"}.` });
    }
  }

  return stories.sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id));
}

/** The national feed: the week's biggest stories (your team's recap and preview stay local). */
export function nationalFeed(stories: readonly Story[], limit = NATIONAL_LIMIT): Story[] {
  return stories.filter((s) => !s.local).slice(0, limit);
}

/** Your local feed: everything about your team. */
export function localFeed(stories: readonly Story[], team: string): Story[] {
  return stories.filter((s) => s.teams.includes(team));
}
