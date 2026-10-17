// Milestone 25 step 2: the week's practice. What AI teams install for an
// opponent; installed calls against the same calls not installed; then a
// season of hard, normal or light weeks for one team: practice injuries,
// fourth-quarter legs and the offseason's growth.
// Usage: node scripts/practice.ts
import { CURRENT_FORMAT, aiPracticePlan, generateLeague, generateSchedule, playWeek, practiceGrowth, simulateGame, type Intensity, type League, type PracticePlan } from "../src/index.ts";

const league0 = { ...generateLeague("practice-demo"), format: CURRENT_FORMAT };
const [oh, tx] = [league0.teams.OH!, league0.teams.TX!];
const plan = aiPracticePlan(oh, tx);
console.log(`Ohio's AI plan for Texas (${oh.staff!.oc.scheme} vs ${tx.staff!.dc.scheme}): installs ${plan.installs.join(", ")}, ${plan.intensity}\n`);

// Installed calls vs the same calls without the install: yards per snap on the installed offensive concepts.
const ypp = (practice?: Record<string, PracticePlan>) => {
  let y = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    const g = simulateGame(oh, tx, `inst-${i}`, practice ? { practice } : {});
    for (const p of g.plays) {
      const e = p.event;
      if ((e.kind === "run" || e.kind === "pass") && e.offense === "OH" && e.calls && plan.installs.includes(e.calls.offense)) (y += e.yardsGained), n++;
    }
  }
  return `${(y / n).toFixed(2)} yds (${n} snaps)`;
};
console.log(`Ohio's installed plays over 60 games: installed ${ypp({ OH: plan })}, not installed ${ypp()}\n`);

// Tired legs: the same 60 games with Ohio after a hard week and after a normal one, fourth quarters only.
const q4 = (intensity: Intensity) => {
  let y = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    const g = simulateGame(oh, tx, `q4-${i}`, { practice: { OH: { installs: [], intensity }, TX: { installs: [], intensity: "normal" } } });
    for (const p of g.plays) if ((p.event.kind === "run" || p.event.kind === "pass") && p.event.offense === "OH" && p.quarter === 4) (y += p.event.yardsGained), n++;
  }
  return (y / n).toFixed(2);
};
console.log(`Fourth quarters, the same 60 games: ${q4("normal")} yds a snap after a normal week, ${q4("hard")} after a hard one\n`);

// A season of each: practice injuries and the growth multiplier it earns.
const season = (intensity: Intensity) => {
  let league: League = { ...league0, teams: { ...league0.teams, OH: { ...oh, practice: { installs: [], intensity } } } };
  const schedule = generateSchedule(league);
  let hurt = 0;
  for (let w = 1; w <= schedule.weeks; w++) {
    const before = new Set(league.teams.OH!.roster.filter((p) => p.injury).map((p) => p.id));
    const r = playWeek(league, schedule, w);
    const inGames = new Set(r.games.flatMap((g) => g.result.injuries).map((i) => i.player));
    hurt += r.league.teams.OH!.roster.filter((p) => p.injury && !before.has(p.id) && !inGames.has(p.id)).length;
    league = r.league;
  }
  return `${intensity.padEnd(6)}: ${hurt} practice injur${hurt === 1 ? "y" : "ies"}, offseason growth x${practiceGrowth(league.teams.OH!.practiceLog).toFixed(2)}`;
};
console.log("A season of each for Ohio:");
for (const i of ["hard", "normal", "light"] as const) console.log(`  ${season(i)}`);
