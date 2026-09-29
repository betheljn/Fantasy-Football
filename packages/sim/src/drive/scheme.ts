// Coaching decisions before the snap: which personnel the offense sends in,
// and how the defense answers (package, coverage shell, blitz).
import { playerOverall } from "../model/player.ts";
import { passRushing } from "../model/ratings.ts";
import { defenseProfile, offenseProfile } from "../play/coaching.ts";
import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { avg, clamp, edge, weightedPick } from "../play/common.ts";
import {
  buildDefense,
  buildOffense,
  pickBlitzers,
  type Coverage,
  type DefenseFormation,
  type DefensePackage,
  type OffenseFormation,
  type Personnel,
} from "../play/formation.ts";
import { halfSecondsLeft, paceFor, type CallContext } from "./playcall.ts";

const PERSONNEL_LIST: Personnel[] = ["11", "12", "21", "13", "10"];
const COVERAGE_LIST: Coverage[] = ["cover_0", "cover_1", "cover_2", "cover_3", "cover_4"];

/** Share of snaps from shotgun, by personnel. */
const SHOTGUN_RATE: Record<Personnel, number> = { "10": 0.95, "11": 0.78, "12": 0.45, "13": 0.1, "21": 0.12 };

/** How often RB2 spells RB1 in one-back sets. */
export const RB_ROTATION = 0.32;

type Situational = Pick<CallContext, "situation" | "margin">;

function isLongYardage(c: Situational): boolean {
  return c.situation.down >= 3 && c.situation.distance >= 7;
}

function isShortYardage(c: Situational): boolean {
  const s = c.situation;
  return 100 - s.yardline <= 2 || (s.distance <= 1 && s.down >= 3);
}

/** Offensive personnel and alignment for this snap. */
export function chooseOffense(rng: Rng, team: Team, c: Situational): OffenseFormation {
  const pace = paceFor(c);
  // Team tendency: a good second tight end relative to the third receiver means more 12.
  const te2 = starters(team, "TE", 2)[1];
  const wr3 = starters(team, "WR", 3)[2];
  const twoTe = te2 && wr3 ? clamp(0.2 + 0.01 * (playerOverall(te2) - playerOverall(wr3)), 0.08, 0.35) : 0.1;

  let w: Record<Personnel, number>;
  if (isShortYardage(c)) w = { "13": 0.4, "12": 0.25, "21": 0.25, "11": 0.1, "10": 0 };
  else if (pace === "hurry" || isLongYardage(c)) w = { "11": 0.72, "10": 0.2, "12": 0.08, "13": 0, "21": 0 };
  else if (pace === "milk") w = { "12": 0.35, "21": 0.2, "11": 0.4, "13": 0.05, "10": 0 };
  else w = { "11": 0.64 - (twoTe - 0.2), "12": twoTe, "21": 0.08, "13": 0.04, "10": 0.04 };
  // The coordinator's scheme tilts the personnel mix.
  const profile = offenseProfile(team);
  const personnel = weightedPick(rng, PERSONNEL_LIST, (p) => w[p] * (profile.personnel[p] ?? 1));

  let shotgun = SHOTGUN_RATE[personnel];
  if (pace === "hurry" || isLongYardage(c)) shotgun = Math.max(shotgun, 0.95);
  if (isShortYardage(c)) shotgun *= 0.5;
  shotgun = clamp(shotgun + profile.shotgun, 0.02, 0.98);
  const set = rng.chance(shotgun) ? "shotgun" : "under_center";
  // RB2 spells RB1 on some snaps; a lead back with less stamina needs more breathers.
  const rb1 = starters(team, "RB", 1)[0];
  const rotation = RB_ROTATION * (rb1 ? clamp(1 - 0.3 * edge(rb1.ratings.stamina), 0.75, 1.4) : 1);
  return buildOffense(team, personnel, set, rng.chance(rotation));
}

/** Prevent defense: protecting a lead late, give up anything underneath but nothing deep. */
function isPrevent(c: Situational): boolean {
  const s = c.situation;
  const late = halfSecondsLeft(s);
  return c.margin < 0 && s.quarter >= 4 && late <= 120 && 100 - s.yardline > 30;
}

/** Defensive package, coverage and blitz, in response to the offense's personnel. */
export function chooseDefense(rng: Rng, team: Team, c: Situational, offense: OffenseFormation): DefenseFormation {
  const s = c.situation;
  const toGoal = 100 - s.yardline;
  const long = isLongYardage(c);

  let pkg: DefensePackage;
  if (offense.personnel === "13" || (toGoal <= 3 && s.distance <= 3)) pkg = toGoal <= 5 ? "goal_line" : "base";
  else if (offense.personnel === "10") pkg = long || rng.chance(0.3) ? "dime" : "nickel";
  else if (offense.personnel === "11") pkg = long ? (rng.chance(0.5) ? "dime" : "nickel") : rng.chance(0.8) ? "nickel" : "base";
  else if (offense.personnel === "12") pkg = rng.chance(0.6) ? "base" : "nickel";
  else pkg = rng.chance(0.9) ? "base" : "nickel";

  // Coverage mix by situation; corners who are better in man than in zone mean more man.
  const corners = starters(team, "CB", 2);
  const manEdge = avg(corners, (p) => p.ratings.manCoverage) - avg(corners, (p) => p.ratings.zoneCoverage);
  const manLean = clamp(1 + 0.03 * manEdge + 0.15 * edge(avg(corners, (p) => p.ratings.manCoverage)), 0.7, 1.5);
  let w: Record<Coverage, number>;
  if (isPrevent(c)) w = { cover_0: 0, cover_1: 0, cover_2: 0.3, cover_3: 0.1, cover_4: 0.6 };
  else if (pkg === "goal_line") w = { cover_0: 0.35, cover_1: 0.45, cover_2: 0, cover_3: 0.2, cover_4: 0 };
  else if (toGoal <= 10) w = { cover_0: 0.15, cover_1: 0.4, cover_2: 0.15, cover_3: 0.2, cover_4: 0.1 };
  else if (long) w = { cover_0: 0.05, cover_1: 0.25, cover_2: 0.25, cover_3: 0.2, cover_4: 0.25 };
  else if (s.down >= 3) w = { cover_0: 0.12, cover_1: 0.38, cover_2: 0.1, cover_3: 0.3, cover_4: 0.1 };
  else w = { cover_0: 0.04, cover_1: 0.28, cover_2: 0.15, cover_3: 0.35, cover_4: 0.18 };
  // The coordinator's scheme tilts the coverage mix.
  const scheme = defenseProfile(team);
  const schemeWeight = (k: Coverage) => (k === "cover_0" || k === "cover_1" ? scheme.man : k === "cover_3" ? scheme.cover3 : scheme.twoHigh);
  const coverage = weightedPick(rng, COVERAGE_LIST, (k) => w[k] * (k === "cover_0" || k === "cover_1" ? manLean : 1) * schemeWeight(k));

  // Blitz: Cover 0 sends two; man and zone blitzes send one. A strong front four blitzes less.
  const front = buildDefense(team, pkg, coverage);
  const aggression = clamp(1 - 0.3 * edge(avg(front.dl, (p) => passRushing(p.ratings))), 0.6, 1.4) * (long ? 1.3 : 1) * scheme.blitz;
  let count = 0;
  if (isPrevent(c)) count = 0;
  else if (coverage === "cover_0") count = 2;
  else if (coverage === "cover_1") count = rng.chance(0.45 * aggression) ? 1 : 0;
  else if (coverage === "cover_3") count = rng.chance(0.25 * aggression) ? 1 : 0;
  return buildDefense(team, pkg, coverage, pickBlitzers(rng, front, count));
}
