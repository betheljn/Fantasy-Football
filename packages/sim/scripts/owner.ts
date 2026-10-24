// Milestone 23 step 1: owner XP and levels. Three seasons of one program,
// left to its coaches: where its XP came from each season and the level it
// reached (calls won count half again in games you call yourself).
// Usage: node scripts/owner.ts [seed] [team]
import { CURRENT_FORMAT, XP_LABELS, finishSeason, ownerLevel, ownerStanding, playSeason, startDynasty, teamName, withOwners, xpForLevel, type Dynasty } from "../src/index.ts";

const seed = process.argv[2] ?? "owner-demo";
let dynasty: Dynasty = startDynasty(seed);
// New dynasties play the current season shape.
dynasty = { ...dynasty, league: { ...dynasty.league, format: CURRENT_FORMAT } };
const team = process.argv[3] ?? "OH";
dynasty = withOwners(dynasty, [team]);
console.log(`${teamName(dynasty.league.teams[team]!)}: levels take ${xpForLevel(1)} XP at first, ${xpForLevel(10)} at level 10, ${xpForLevel(30)} at level 30\n`);

for (let i = 0; i < 3; i++) {
  const played = playSeason(dynasty);
  const mine = played.season.results.filter((g) => g.home === team || g.away === team);
  // Mid-season, the XP so far (as the app would show it).
  const half = ownerStanding(dynasty.owners![team], team, { results: mine.filter((g) => g.week <= 8) });
  dynasty = finishSeason(dynasty, played).dynasty;
  const s = dynasty.owners![team]!.seasons.at(-1)!;
  const w = mine.filter((g) => g.winner === team).length;
  const lvl = ownerLevel(dynasty.owners![team]!.xp);
  console.log(`${s.season} (${w}-${mine.length - w}${played.playoffs.champion === team ? ", champions" : ""}): +${s.xp} XP  (after week 8: level ${half.level}, ${half.seasonXp} XP this season)`);
  for (const l of s.lines) console.log(`  ${XP_LABELS[l.source].padEnd(24)} ${String(l.count).padStart(4)}  ${String(l.xp).padStart(5)} XP`);
  console.log(`  Level ${lvl.level} (${lvl.into}/${lvl.next} to the next), ${lvl.xp} XP in all\n`);
}
