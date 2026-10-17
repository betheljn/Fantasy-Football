// The week's practice: plays installed for the next opponent and how hard the
// team works. Installed concepts are drawn up better in that game (less so
// after a light week); a hard week grows players a little more over the
// season but risks a practice injury and tired legs late in the game; a light
// week is the other way round. A team people run keeps its plan until they
// change it; AI teams install what attacks the next opponent's playbook.
// Every game records both teams' plans, so it replays the same.
import { DEFENSE_CONCEPTS, EDGE_TABLE, OFFENSE_CONCEPTS, OFFENSE_CONCEPT_INFO, type DefenseConcept, type OffenseConcept } from "../play/concepts.ts";
import { defensePlaybook, offensePlaybook } from "../drive/duelcall.ts";
import type { League } from "../league/league.ts";
import type { ScheduledGame } from "../league/schedule.ts";
import type { Team } from "../model/team.ts";
import type { Situation } from "../play/events.ts";
import { Rng } from "../rng.ts";
import type { Injury } from "./injuries.ts";

export type Intensity = "light" | "normal" | "hard";

export interface PracticePlan {
  /** Concepts installed for the next opponent (offense or defense; up to PRACTICE.maxInstalls). */
  installs: Array<OffenseConcept | DefenseConcept>;
  intensity: Intensity;
}

export const PRACTICE = {
  maxInstalls: 3,
  /** How much an installed call adds to its matchup edge (edge points)... */
  installEdge: 0.3,
  /** ...and how much of that a light week installs. */
  lightInstall: 0.6,
  /** A hard week's tired legs in the fourth quarter (edge points against). */
  fatigueEdge: 0.25,
  /** A practice injury's chance, per team and week. */
  injuryChance: { light: 0, normal: 0.04, hard: 0.15 } as Record<Intensity, number>,
  /** Growth over the season: a season of hard weeks adds this much, a season of light ones takes it away. */
  growth: 0.04,
} as const;

export const INTENSITY_NOTES: Record<Intensity, string> = {
  light: "Fresh legs, no practice injuries; installs stick less and players grow a little less",
  normal: "The usual week",
  hard: "Installs stick, players grow a little more; risks a practice injury and tired legs late",
};

const isOffense = (c: string): c is OffenseConcept => (OFFENSE_CONCEPTS as readonly string[]).includes(c);

/** Why a plan can't be used, or null. */
export function practiceProblem(plan: PracticePlan): string | null {
  if (!["light", "normal", "hard"].includes(plan.intensity)) return "That isn't an intensity";
  if (plan.installs.length > PRACTICE.maxInstalls) return `Install at most ${PRACTICE.maxInstalls} plays a week`;
  if (new Set(plan.installs).size !== plan.installs.length) return "Install each play once";
  if (plan.installs.some((c) => !isOffense(c) && !(DEFENSE_CONCEPTS as readonly string[]).includes(c))) return "That isn't a play";
  return null;
}

const EARLY: Situation = { quarter: 1, clock: 900, down: 1, distance: 10, yardline: 30 };

/** An AI team's week: the two plays that best attack the opponent's defense and the one defense that best answers its offense. */
export function aiPracticePlan(team: Team, opponent: Team): PracticePlan {
  const theirD = defensePlaybook(opponent, EARLY, "11", false);
  const offenseScore = OFFENSE_CONCEPTS.map((c, i) => {
    const mine = offensePlaybook(team, EARLY, OFFENSE_CONCEPT_INFO[c].kind, "shotgun")[i]!;
    const vs = EDGE_TABLE[i]!.reduce((t, e, j) => t + e * theirD[j]!, 0);
    return { c, score: vs + mine };
  });
  const runs = offensePlaybook(opponent, EARLY, "run", "shotgun");
  const passes = offensePlaybook(opponent, EARLY, "pass", "shotgun");
  const theirO = runs.map((r, i) => 0.45 * r + 0.55 * passes[i]!);
  const defenseScore = DEFENSE_CONCEPTS.map((d, j) => ({ d, score: -OFFENSE_CONCEPTS.reduce((t, _c, i) => t + theirO[i]! * EDGE_TABLE[i]![j]!, 0) }));
  const two = offenseScore.sort((a, b) => b.score - a.score || a.c.localeCompare(b.c)).slice(0, 2).map((x) => x.c);
  const one = defenseScore.sort((a, b) => b.score - a.score || a.d.localeCompare(b.d))[0]!.d;
  return { installs: [...two, one], intensity: "normal" };
}

/** Both teams' plans for a game: their own standing plans, or the AI's for this opponent. */
export function practiceFor(league: League, game: Pick<ScheduledGame, "home" | "away">): Record<string, PracticePlan> {
  const home = league.teams[game.home]!;
  const away = league.teams[game.away]!;
  return { [game.home]: home.practice ?? aiPracticePlan(home, away), [game.away]: away.practice ?? aiPracticePlan(away, home) };
}

/** How the week's practice moves a call's matchup edge (the offense's point of view). */
export function practiceEdge(practice: Readonly<Record<string, PracticePlan>> | undefined, offense: string, defense: string, off: OffenseConcept, def: DefenseConcept, quarter: number): number {
  if (!practice) return 0;
  let e = 0;
  const o = practice[offense];
  const d = practice[defense];
  const stick = (p: PracticePlan) => PRACTICE.installEdge * (p.intensity === "light" ? PRACTICE.lightInstall : 1);
  if (o?.installs.includes(off)) e += stick(o);
  if (d?.installs.includes(def)) e -= stick(d);
  // A hard week shows in the fourth quarter.
  if (quarter >= 4) {
    if (o?.intensity === "hard") e -= PRACTICE.fatigueEdge;
    if (d?.intensity === "hard") e += PRACTICE.fatigueEdge;
  }
  return e;
}

/** A season's practice so far, for growth: weeks worked hard and weeks taken light. */
export interface PracticeLog {
  hard: number;
  light: number;
  weeks: number;
}

/** Growth multiplier from a season's practice (1 with none logged). */
export function practiceGrowth(log: PracticeLog | undefined): number {
  if (!log?.weeks) return 1;
  return 1 + (PRACTICE.growth * (log.hard - log.light)) / log.weeks;
}

/**
 * After a week's games: practice for the next one. Each team logs its week,
 * and a team working hard (or normally) can lose a player to a practice
 * injury for a week or three. Deterministic from the league and week.
 */
export function practiceWeek(league: League, week: number, plans: Readonly<Record<string, PracticePlan>>): { league: League; injuries: Injury[] } {
  const injuries: Injury[] = [];
  const teams: Record<string, Team> = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    const plan = plans[abbr];
    if (!plan) {
      teams[abbr] = t;
      continue;
    }
    const log = t.practiceLog ?? { hard: 0, light: 0, weeks: 0 };
    teams[abbr] = { ...t, practiceLog: { hard: log.hard + (plan.intensity === "hard" ? 1 : 0), light: log.light + (plan.intensity === "light" ? 1 : 0), weeks: log.weeks + 1 } };
    const rng = new Rng(`${league.seed}:${league.season}:${week}:${abbr}:practice`);
    if (!rng.chance(PRACTICE.injuryChance[plan.intensity])) continue;
    const healthy = t.roster.filter((p) => !p.injury);
    if (!healthy.length) continue;
    const p = rng.pick(healthy);
    injuries.push({ player: p.id, team: abbr, type: rng.pick(["hamstring", "ankle", "shoulder", "groin"]), weeks: rng.int(1, 3) });
  }
  return { league: { ...league, teams }, injuries };
}
