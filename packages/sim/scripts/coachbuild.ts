// Milestone 19 step 3: build your own head coach.
import { COACH_BUDGET, COACH_STYLES, coachBuildCost, coachBuildProblem, defaultCoachBuild, formatMoney, formatStaff, generateLeague, installHeadCoach, playCallers } from "../src/index.ts";

const league = generateLeague("coach-demo");
const abbr = "TX";
console.log(`Before (${abbr}):\n${formatStaff(league.teams[abbr]!.staff!)}\n`);

for (const style of ["offense", "defense", "balanced"] as const) {
  const b = defaultCoachBuild(style, { firstName: "Dana", lastName: "Reyes" });
  const cost = coachBuildCost(league, abbr, b);
  console.log(`${COACH_STYLES[style].label}: ${COACH_BUDGET.points[style]} points -> ${Object.entries(b.ratings).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`  salary ${formatMoney(cost.salary)}/yr; staff budget ${formatMoney(cost.budget)}, others ${formatMoney(cost.others)}`);
}

const build = { ...defaultCoachBuild("offense", { firstName: "Dana", lastName: "Reyes" }), age: 41, offenseScheme: "Air Raid" as const, defenseScheme: "Cover 3 Zone" as const, aggressiveness: 75, tempo: 70 };
build.ratings = { gameManagement: 55, discipline: 45, development: 60, playCalling: 88 };
console.log(`\nCustom build problem: ${coachBuildProblem(build) ?? "none"}`);
const over = { ...build, ratings: { ...build.ratings, development: 70 } };
console.log(`Ten more in development: ${coachBuildProblem(over)}`);

const { league: after, released } = installHeadCoach(league, abbr, build);
const staff = after.teams[abbr]!.staff!;
console.log(`\nAfter:\n${formatStaff(staff)}`);
const callers = playCallers(staff);
console.log(`\nIn games: offense runs ${callers.oc.scheme} (play calling ${callers.oc.playCalling}, tempo ${callers.oc.tempo}); defense runs ${callers.dc.scheme} (play calling ${callers.dc.playCalling})`);
console.log(`Let go: ${released!.firstName} ${released!.lastName}, to the pool of coaches out of work`);
