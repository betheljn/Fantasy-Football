// Milestone 4, step 1: team staffs.
// Usage: node scripts/staff.ts [league-seed] [team]
import { DEFENSIVE_SCHEMES, GM_PHILOSOPHIES, OFFENSIVE_SCHEMES, allTeams, formatStaff, generateLeague, staffOverall, teamName } from "../src/index.ts";

const [seed = "dynasty", teamArg = "TX"] = process.argv.slice(2);
const league = generateLeague(seed);
const team = league.teams[teamArg.toUpperCase()]!;
console.log(`${teamName(team)} staff (league "${seed}")\n${formatStaff(team.staff!)}\n`);

const teams = allTeams(league);
const count = <T extends string>(list: readonly T[], get: (t: (typeof teams)[number]) => T) =>
  list.map((x) => `${x} ${teams.filter((t) => get(t) === x).length}`).join(", ");
console.log(`Offensive schemes: ${count(OFFENSIVE_SCHEMES, (t) => t.staff!.oc.scheme)}`);
console.log(`Defensive schemes: ${count(DEFENSIVE_SCHEMES, (t) => t.staff!.dc.scheme)}`);
console.log(`GM philosophies:   ${count(GM_PHILOSOPHIES, (t) => t.staff!.gm.philosophy)}`);
const best = [...teams].sort((a, b) => staffOverall(b.staff!.hc) - staffOverall(a.staff!.hc)).slice(0, 3);
console.log(`Top head coaches:  ${best.map((t) => `${t.staff!.hc.firstName} ${t.staff!.hc.lastName} (${t.abbr}, ${staffOverall(t.staff!.hc)})`).join(", ")}`);
