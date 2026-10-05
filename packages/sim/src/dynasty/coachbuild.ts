// Build your own head coach when a dynasty starts: his name and age, whether
// he's offensive-minded (calls the offense himself), defensive-minded (calls
// the defense) or a balanced leader of men, the schemes your team runs, his
// tendencies, and his ratings from a fixed budget of points. He replaces the
// generated head coach; both coordinators keep their jobs and run your
// schemes. Nothing new happens in games: the existing staff rules use him.
import { salaryCap } from "../contracts/cap.ts";
import { staffAsk, staffBudget, staffContract } from "../contracts/staffcontracts.ts";
import { Rng } from "../rng.ts";
import {
  DEFENSIVE_SCHEMES,
  OFFENSIVE_SCHEMES,
  type DefensiveScheme,
  type HeadCoach,
  type OffensiveScheme,
  type StaffMember,
} from "../model/staff.ts";
import type { League } from "../league/league.ts";
import { customizeTeam, type TeamIdentityChoice } from "../league/identity.ts";
import type { Dynasty } from "./dynasty.ts";

export type CoachStyle = "offense" | "defense" | "balanced";

export const COACH_STYLES: Record<CoachStyle, { label: string; note: string }> = {
  offense: { label: "Offensive mind", note: "Calls the offense: the coach's scheme and play calling run it. Your defensive coordinator calls the defense." },
  defense: { label: "Defensive mind", note: "Calls the defense: the coach's scheme and play calling run it. Your offensive coordinator calls the offense." },
  balanced: { label: "Leader of men", note: "Leaves the play calling to the coordinators and puts everything into game management, discipline and development." },
};

/** The ratings you spend points on. Play calling only for a coach who calls a side. */
export type CoachRatingKey = "gameManagement" | "discipline" | "development" | "playCalling";

export const COACH_RATING_NAMES: Record<CoachRatingKey, { label: string; note: string }> = {
  gameManagement: { label: "Game management", note: "Clock, timeouts, the right call late in games" },
  discipline: { label: "Discipline", note: "Fewer penalties" },
  development: { label: "Development", note: "Players improve faster and decline slower" },
  playCalling: { label: "Play calling", note: "The right play at the right time on that side of the ball" },
};

/**
 * Every rating starts at the floor; the points raise them, none past the max.
 * An average hire is about 58, so a full build is a little better than that
 * (62 across four ratings, or 66 across three for a coach who calls neither side).
 */
export const COACH_BUDGET = { floor: 40, max: 90, points: { offense: 88, defense: 88, balanced: 78 } as Record<CoachStyle, number> };

export const COACH_AGE = { min: 30, max: 62 } as const;

export interface CoachBuild {
  firstName: string;
  lastName: string;
  age: number;
  style: CoachStyle;
  offenseScheme: OffensiveScheme;
  defenseScheme: DefensiveScheme;
  /** 0-99: 4th downs and two-point tries (50 = conventional). */
  aggressiveness: number;
  /** 0-99: how often the offense goes up-tempo (used when he calls the offense). */
  tempo: number;
  ratings: Record<CoachRatingKey, number>;
}

/** The ratings a style spends points on. */
export function coachRatingKeys(style: CoachStyle): CoachRatingKey[] {
  return style === "balanced" ? ["gameManagement", "discipline", "development"] : ["gameManagement", "discipline", "development", "playCalling"];
}

/** Points spent on a build (play calling doesn't count for a coach who doesn't call a side). */
export function coachPointsSpent(build: CoachBuild): number {
  return coachRatingKeys(build.style).reduce((s, k) => s + Math.max(0, build.ratings[k] - COACH_BUDGET.floor), 0);
}

/** A starting build: the points spread evenly, conventional tendencies. */
export function defaultCoachBuild(style: CoachStyle = "balanced", name = { firstName: "", lastName: "" }): CoachBuild {
  const keys = coachRatingKeys(style);
  const each = Math.floor(COACH_BUDGET.points[style] / keys.length);
  const ratings = { gameManagement: COACH_BUDGET.floor, discipline: COACH_BUDGET.floor, development: COACH_BUDGET.floor, playCalling: COACH_BUDGET.floor };
  keys.forEach((k, i) => (ratings[k] = COACH_BUDGET.floor + each + (i === 0 ? COACH_BUDGET.points[style] - each * keys.length : 0)));
  return { ...name, age: 44, style, offenseScheme: "Pro Style", defenseScheme: "Multiple", aggressiveness: 50, tempo: 45, ratings };
}

/** Why this build can't be used, or null if it can. */
export function coachBuildProblem(build: CoachBuild): string | null {
  if (!build.firstName.trim() || !build.lastName.trim()) return "Give your coach a first and last name";
  if (build.firstName.trim().length > 16 || build.lastName.trim().length > 20) return "That name is too long";
  if (!Number.isInteger(build.age) || build.age < COACH_AGE.min || build.age > COACH_AGE.max) return `Age is ${COACH_AGE.min} to ${COACH_AGE.max}`;
  if (!OFFENSIVE_SCHEMES.includes(build.offenseScheme)) return "Pick an offensive scheme";
  if (!DEFENSIVE_SCHEMES.includes(build.defenseScheme)) return "Pick a defensive scheme";
  for (const dial of [build.aggressiveness, build.tempo]) if (!(dial >= 0 && dial <= 99)) return "Tendencies run 0 to 99";
  for (const k of coachRatingKeys(build.style)) {
    const v = build.ratings[k];
    if (!Number.isInteger(v) || v < COACH_BUDGET.floor || v > COACH_BUDGET.max) return `Ratings run ${COACH_BUDGET.floor} to ${COACH_BUDGET.max}`;
  }
  const over = coachPointsSpent(build) - COACH_BUDGET.points[build.style];
  if (over > 0) return `${over} point${over === 1 ? "" : "s"} over budget`;
  return null;
}

/** The head coach a build makes (no contract yet). */
export function headCoachFromBuild(build: CoachBuild, id: string): HeadCoach {
  const r = build.ratings;
  const calls: HeadCoach["calls"] =
    build.style === "offense"
      ? { side: "offense", scheme: build.offenseScheme, playCalling: r.playCalling, tempo: Math.round(build.tempo) }
      : build.style === "defense"
        ? { side: "defense", scheme: build.defenseScheme, playCalling: r.playCalling }
        : undefined;
  return {
    id,
    firstName: build.firstName.trim(),
    lastName: build.lastName.trim(),
    age: build.age,
    experience: 0,
    tenure: 0,
    role: "HC",
    gameManagement: r.gameManagement,
    discipline: r.discipline,
    development: r.development,
    aggressiveness: Math.round(build.aggressiveness),
    ...(calls ? { calls } : {}),
  };
}

/** What your coach would earn a year, and whether the staff budget fits him. */
export function coachBuildCost(league: League, abbr: string, build: CoachBuild): { salary: number; budget: number; others: number } {
  const cap = salaryCap(league.seed, league.season);
  const staff = league.teams[abbr]?.staff;
  const others = staff ? [staff.oc, staff.dc, staff.gm, staff.scout].reduce((s, m) => s + (m.contract?.salary ?? 0), 0) : 0;
  return { salary: staffAsk(headCoachFromBuild(build, "preview"), cap), budget: staffBudget(cap), others };
}

/**
 * Put your coach in charge of `abbr`. The generated head coach is let go
 * (returned, without his deal, for the pool of coaches out of work); the
 * coordinators stay and run your schemes. Throws on a build
 * `coachBuildProblem` rejects.
 */
export function installHeadCoach(league: League, abbr: string, build: CoachBuild): { league: League; released: StaffMember | null } {
  const problem = coachBuildProblem(build);
  if (problem) throw new Error(problem);
  const team = league.teams[abbr];
  if (!team?.staff) throw new Error(`${abbr} has no staff`);
  const cap = salaryCap(league.seed, league.season);
  const rng = new Rng(`${league.seed}:${league.season}:coachbuild:${abbr}`);
  const coach = headCoachFromBuild(build, `S-${abbr}-HC-${league.season}-yours`);
  const hc: HeadCoach = { ...coach, contract: staffContract(rng, coach, league.season, cap) };
  const { contract: _ended, ...released } = team.staff.hc;
  const staff = {
    ...team.staff,
    hc,
    oc: { ...team.staff.oc, scheme: build.offenseScheme },
    dc: { ...team.staff.dc, scheme: build.defenseScheme },
  };
  return { league: { ...league, teams: { ...league.teams, [abbr]: { ...team, staff } } }, released: released as StaffMember };
}

/**
 * A new dynasty's team made yours before the season (and before any fantasy
 * draft): its identity, then your coach (the coach replaced joins the
 * coaches out of work). Same inputs, same dynasty.
 */
export function setUpTeam(dynasty: Dynasty, abbr: string, choices: { identity?: TeamIdentityChoice; coach?: CoachBuild }): Dynasty {
  let league = dynasty.league;
  let staffPool = dynasty.staffPool;
  if (choices.identity) league = customizeTeam(league, abbr, choices.identity);
  if (choices.coach) {
    const hired = installHeadCoach(league, abbr, choices.coach);
    league = hired.league;
    if (hired.released) staffPool = [...staffPool, hired.released];
  }
  return { ...dynasty, league, staffPool };
}
