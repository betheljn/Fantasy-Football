// Milestone 2, step 3: simulate a full regular season and print the standings.
// Usage: node scripts/season.ts [league-seed]
import { formatRecord, generateLeague, simulateSeason, teamName, teamRatings, winPct } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const t0 = performance.now();
const season = simulateSeason(league);
const secs = (performance.now() - t0) / 1000;

console.log(`${season.season} regular season, league "${seed}": ${season.results.length} games in ${secs.toFixed(1)}s\n`);

const pad = (s: string | number, n: number) => String(s).padStart(n);
for (const div of season.standings) {
  console.log(`${div.conference} ${div.division.toUpperCase().padEnd(24)}   W-L-T    PCT   PF   PA  DIFF   DIV   CONF   HOME   AWAY  STRK`);
  for (const { team, record: r, tiebreaker } of div.teams) {
    const wlt = `${r.wins}-${r.losses}-${r.ties}`;
    console.log(
      `  ${teamName(league.teams[team]!).padEnd(29)}${pad(wlt, 7)} ${winPct(r).toFixed(3).replace(/^0/, "")} ${pad(r.pointsFor, 4)} ${pad(r.pointsAgainst, 4)} ${pad((r.pointsFor - r.pointsAgainst > 0 ? "+" : "") + (r.pointsFor - r.pointsAgainst), 5)}` +
        ` ${pad(formatRecord(r.division), 5)} ${pad(formatRecord(r.conference), 6)} ${pad(formatRecord(r.home), 6)} ${pad(formatRecord(r.away), 6)} ${pad(r.streak, 5)}` +
        (tiebreaker ? `  (ahead on ${tiebreaker})` : ""),
    );
  }
  console.log();
}

// Sanity: do better teams win more?
const all = season.standings.flatMap((d) => d.teams);
const xs = all.map((t) => teamRatings(league.teams[t.team]!).overall);
const ys = all.map((t) => winPct(t.record));
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const [mx, my] = [mean(xs), mean(ys)];
const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
const corr = cov / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
const homeWins = season.results.filter((g) => g.winner === g.home).length;
const ties = season.results.filter((g) => g.winner === null).length;
const ot = season.results.filter((g) => g.overtime).length;
const pts = mean(season.results.map((g) => (g.homeScore + g.awayScore) / 2));
const best = all.reduce((a, b) => (winPct(b.record) > winPct(a.record) ? b : a));
const worst = all.reduce((a, b) => (winPct(b.record) < winPct(a.record) ? b : a));
console.log(`Best record: ${teamName(league.teams[best.team]!)} ${formatRecord(best.record)}; worst: ${teamName(league.teams[worst.team]!)} ${formatRecord(worst.record)}`);
console.log(`Team rating vs win% correlation: ${corr.toFixed(2)}`);
console.log(`Home teams won ${((100 * homeWins) / (season.results.length - ties)).toFixed(1)}% of decided games; ${ot} overtime games, ${ties} ties; ${pts.toFixed(1)} points per team per game`);
