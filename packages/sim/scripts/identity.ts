// Milestone 19 step 1: a team's identity and the logo library.
import { LOGOS, LEAGUE_LOGOS, allTeams, customizeTeam, generateLeague, identityProblem, teamLogo, teamName, teamTag } from "../src/index.ts";

const league = generateLeague("identity-demo");
console.log(`Logo library: ${LOGOS.length} (${LEAGUE_LOGOS} handed out to a new league, ${LOGOS.length - LEAGUE_LOGOS} only for yours)`);
for (const l of LOGOS.slice(LEAGUE_LOGOS)) console.log(`  ${l.nickname.padEnd(14)} ${l.emblem}`);

const before = league.teams.MN!;
const holder = allTeams(league).find((t) => t.nickname === "Wolfhounds")!;
console.log(`\nBefore: ${teamName(before)} [${teamTag(before)}], logo ${teamLogo(before).emblem}`);
console.log(`        ${teamName(holder)} [${teamTag(holder)}], logo ${teamLogo(holder).emblem}`);

console.log(`\nTag "WI" for Minnesota: ${identityProblem(league, "MN", { nickname: "Wolfhounds", logo: "wolfhounds", tag: "WI" })}`);
const after = customizeTeam(league, "MN", { city: "Twin Cities", nickname: "Wolfhounds", tag: "TWC", logo: "wolfhounds", colors: { primary: "#1B365D", trim: "#F2C14E" } });
const mn = after.teams.MN!;
const other = after.teams[holder.abbr]!;
console.log(`\nAfter:  ${teamName(mn)} [${teamTag(mn)}], logo ${teamLogo(mn).emblem}, colors ${mn.colors!.primary}/${mn.colors!.trim}, still state ${mn.state}`);
console.log(`        ${teamName(other)} [${teamTag(other)}], logo ${teamLogo(other).emblem} (traded names and logos)`);
