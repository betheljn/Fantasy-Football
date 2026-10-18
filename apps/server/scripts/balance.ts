// A long balance check: an online league played season after season through
// the server's own loop (weeks, playoffs, the staged offseason, owners, the
// business), with one friend's team that always readies up and buys every
// owner upgrade it can, and everything else left to the AI. Then the same
// league with that team left to the AI too, to see what being a person's team
// is worth. Prints the league's health each season (talent, ages, parity,
// money, save size) and the team's path in both runs.
// Usage: PICKS_SIMS=1 node scripts/balance.ts [seasons] [seed] [team]
import { allTeams, computeRecords, ownerLevel, talentSnapshot, teamRatings, UPGRADES, type UpgradeTrack } from "@dynasty/sim";
import { RECRUITING, RECRUIT_DRAFT } from "@dynasty/sim";

// Tuning experiments: RECRUIT_TIER (points per recruiting tier) and LEAN_DISCOUNT (how far AI boards mark down a prospect leaning elsewhere).
if (process.env.RECRUIT_TIER) (RECRUITING as { perUpgradeTier: number }).perUpgradeTier = Number(process.env.RECRUIT_TIER);
if (process.env.LEAN_DISCOUNT) (RECRUIT_DRAFT as { elsewhereDiscount: number }).elsewhereDiscount = Number(process.env.LEAN_DISCOUNT);
import { applyMove } from "../src/moves.ts";
import { advance, openSeason } from "../src/season.ts";
import { encodeState, newLeagueState, type LeagueState } from "../src/state.ts";

const seasons = Number(process.argv[2] ?? 25);
const seed = process.argv[3] ?? "balance";
const fixedTeam = process.argv[4];

interface Row {
  season: number;
  rank: number;
  wins: number;
  losses: number;
  champion: string;
  playoffs: boolean;
  level: number;
  upgrades: string;
  starterOvr: number;
  rosterOvr: number;
  age: number;
  stars: number;
  winSpread: number;
  topGap: number;
  cash: number;
  debt: number;
  brokeTeams: number;
  saveKb: number;
}

// UPGRADE_TRACKS=facilities,clinic limits what the friend buys (to see what each is worth).
const TRACKS = (process.env.UPGRADE_TRACKS?.split(",") ?? Object.keys(UPGRADES)) as UpgradeTrack[];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

/** Buy every owner upgrade the points allow (facilities first: it's player growth). */
function buyAll(s: LeagueState, team: string): LeagueState {
  for (let bought = true; bought; ) {
    bought = false;
    for (const track of TRACKS) {
      const r = applyMove(s, team, { kind: "upgrade", track });
      if (r.state) {
        s = r.state;
        bought = true;
      }
    }
  }
  return s;
}

function run(team: string, human: boolean): Row[] {
  let s = openSeason({ ...newLeagueState(seed), humans: human ? { [team]: "m1" } : {} });
  const rows: Row[] = [];
  const t0 = performance.now();
  for (let i = 0; i < seasons; i++) {
    const season = s.dynasty.league.season;
    if (human && !process.env.NO_UPGRADES) s = buyAll(s, team);
    // The regular season and the playoffs.
    while (!s.progress.playoffs) s = advance(s, new Set(human ? [team] : [])).state;
    // Measure the season before the offseason clears it.
    const league = s.dynasty.league;
    const records = computeRecords(league, s.progress.results);
    const strength = allTeams(league)
      .map((t) => ({ abbr: t.abbr, ovr: teamRatings(t).overall }))
      .sort((a, b) => b.ovr - a.ovr);
    const pct = allTeams(league).map((t) => {
      const r = records.get(t.abbr)!;
      return (r.wins + 0.5 * r.ties) / Math.max(1, r.wins + r.losses + r.ties);
    });
    const talent = talentSnapshot(league);
    const business = s.dynasty.business ?? {};
    const mine = business[team];
    const rec = records.get(team)!;
    const owner = s.dynasty.owners?.[team];
    rows.push({
      season,
      rank: strength.findIndex((x) => x.abbr === team) + 1,
      wins: rec.wins,
      losses: rec.losses,
      champion: s.progress.playoffs!.champion,
      playoffs: s.progress.playoffs!.seeds.some((x) => x.team === team),
      level: owner ? ownerLevel(owner.xp).level : 0,
      upgrades: owner?.upgrades ? TRACKS.map((k) => owner.upgrades![k] ?? 0).join("") : "-",
      starterOvr: talent.starterOverall,
      rosterOvr: talent.rosterOverall,
      age: talent.averageAge,
      stars: talent.stars,
      winSpread: sd(pct),
      topGap: strength[0]!.ovr - strength[24]!.ovr,
      cash: mine ? mine.cash / 1000 : 0,
      debt: mine ? mine.stadium.debt / 1000 : 0,
      brokeTeams: Object.values(business).filter((b) => b.cash < 0).length,
      saveKb: Math.round(encodeState(s).length / 1024),
    });
    // The offseason, stage by stage, into the next season.
    while (s.dynasty.league.season === season) s = advance(s, new Set(human ? [team] : [])).state;
    const r = rows.at(-1)!;
    console.error(`  ${human ? "friend" : "AI"} ${season}: rank ${r.rank}, ${r.wins}-${r.losses}${r.playoffs ? ", playoffs" : ""}${r.champion === team ? ", CHAMPION" : ""} (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  }
  return rows;
}

// A middling team: the 25th strongest in the new league.
const start = newLeagueState(seed).dynasty.league;
const team = fixedTeam ?? allTeams(start).map((t) => ({ abbr: t.abbr, ovr: teamRatings(t).overall })).sort((a, b) => b.ovr - a.ovr)[24]!.abbr;
console.log(`Balance check: ${seasons} seasons, league "${seed}", the friend's team ${team} (25th strongest at the start)\n`);
const friend = run(team, true);
const ai = process.env.ONLY_FRIEND ? friend : run(team, false);

const f1 = (x: number) => x.toFixed(1);
console.log("The friend's team (buys every upgrade) | the same team left to the AI");
console.log("season  rank  W-L    lvl upgrades  |  rank  W-L");
friend.forEach((r, i) => {
  const a = ai[i]!;
  console.log(
    `${r.season}    ${String(r.rank).padStart(2)}   ${`${r.wins}-${r.losses}`.padEnd(5)}  ${String(r.level).padStart(2)}  ${r.upgrades.padEnd(8)} ${r.playoffs ? "P" : " "}${r.champion === team ? "C" : " "} |   ${String(a.rank).padStart(2)}   ${a.wins}-${a.losses}${a.playoffs ? " P" : ""}${a.champion === team ? "C" : ""}`,
  );
});
const sum = (rows: Row[]) => ({
  rank: mean(rows.map((r) => r.rank)),
  lateRank: mean(rows.slice(-10).map((r) => r.rank)),
  winPct: mean(rows.map((r) => r.wins / Math.max(1, r.wins + r.losses))),
  playoffs: rows.filter((r) => r.playoffs).length,
  titles: rows.filter((r) => r.champion === team).length,
});
const sf = sum(friend);
const sa = sum(ai);
console.log(`\nFriend: average rank ${f1(sf.rank)} (last 10: ${f1(sf.lateRank)}), win ${(sf.winPct * 100).toFixed(0)}%, ${sf.playoffs} playoffs, ${sf.titles} titles`);
console.log(`AI:     average rank ${f1(sa.rank)} (last 10: ${f1(sa.lateRank)}), win ${(sa.winPct * 100).toFixed(0)}%, ${sa.playoffs} playoffs, ${sa.titles} titles`);

console.log("\nThe league over time (the friend's run):");
console.log("season  starters  roster  age   stars  win% spread  top-25 gap  champion  cash($M) debt($M)  teams in red  save(KB)");
for (const r of friend)
  console.log(
    `${r.season}    ${f1(r.starterOvr).padStart(5)}    ${f1(r.rosterOvr).padStart(5)}  ${f1(r.age)}  ${String(r.stars).padStart(4)}   ${r.winSpread.toFixed(3)}       ${f1(r.topGap).padStart(4)}       ${r.champion.padEnd(4)}   ${f1(r.cash).padStart(6)}   ${f1(r.debt).padStart(6)}    ${String(r.brokeTeams).padStart(3)}         ${r.saveKb}`,
  );
const champs = new Map<string, number>();
for (const r of friend) champs.set(r.champion, (champs.get(r.champion) ?? 0) + 1);
console.log(`\nChampions (friend's run): ${champs.size} different teams in ${seasons} seasons; most: ${[...champs].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${t} ${n}`).join(", ")}`);
