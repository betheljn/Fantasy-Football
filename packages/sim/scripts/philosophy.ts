// Milestone 23 step 2c: coach-philosophy fit. A coach who loves to run
// inside and throw off play action, with a Power Run coordinator and then an
// Air Raid one (the same games otherwise): what the fit report says, and
// what it costs on the field.
// Usage: node scripts/philosophy.ts
import { OFFENSE_CONCEPT_INFO, OFFENSIVE_SCHEMES, callingStyle, generateLeague, offenseSchemeFit, philosophyFit, startCoachedGame, type GameResult, type OffensiveScheme, type Team } from "../src/index.ts";

const league = generateLeague("philosophy-demo");
const [me, them] = [league.teams.OH!, league.teams.TX!];
const withScheme = (t: Team, scheme: OffensiveScheme): Team => ({ ...t, staff: { ...t.staff!, hc: { ...t.staff!.hc, calls: undefined } as never, oc: { ...t.staff!.oc, scheme } } });

function season(scheme: OffensiveScheme) {
  const team = withScheme(me, scheme);
  const games: GameResult[] = [];
  for (let i = 0; i < 30; i++) {
    const g = startCoachedGame(team, them, `phil-${i}`, team.abbr);
    while (g.prompt) {
      const p = g.prompt;
      g.answer(p.kind === "offense" && p.options.includes("run") && (p.suggestion === "run" || p.suggestion === "pass") ? (p.situation.down <= 2 && p.situation.distance <= 10 ? { call: "run", concept: "inside_run" } : { call: "pass", concept: "play_action" }) : undefined);
    }
    games.push(g.result!);
  }
  let yards = 0;
  let snaps = 0;
  let points = 0;
  for (const g of games) {
    points += g.score[team.abbr]!;
    for (const p of g.plays) if ((p.event.kind === "run" || p.event.kind === "pass") && p.event.offense === team.abbr) (yards += p.event.yardsGained), snaps++;
  }
  return { team, games, ypp: yards / snaps, ppg: points / games.length };
}

const power = season("Power Run");
const style = callingStyle(power.games, me.abbr);
console.log(`Your calls: ${Object.entries(style.offense).map(([k, n]) => `${OFFENSE_CONCEPT_INFO[k as keyof typeof OFFENSE_CONCEPT_INFO].label} ${Math.round((100 * n!) / style.offenseCalls)}%`).join(", ")} (${style.offenseCalls} called yourself)\n`);
console.log("How each offensive scheme fits you:");
for (const s of OFFENSIVE_SCHEMES) {
  const f = offenseSchemeFit(s, style)!;
  console.log(`  ${s.padEnd(14)} ${f.grade.padEnd(10)} drawn up well ${Math.round(f.well * 100)}%, poorly ${Math.round(f.poorly * 100)}%  (edge ${f.edge >= 0 ? "+" : ""}${f.edge.toFixed(2)} a call)`);
}
const air = season("Air Raid");
console.log(`\n30 games each, same opponent and seeds:`);
console.log(`  Power Run coordinator (${philosophyFit(power.team, style).offense!.grade}): ${power.ypp.toFixed(2)} yards a play, ${power.ppg.toFixed(1)} points a game`);
console.log(`  Air Raid coordinator  (${philosophyFit(air.team, style).offense!.grade}): ${air.ypp.toFixed(2)} yards a play, ${air.ppg.toFixed(1)} points a game`);
