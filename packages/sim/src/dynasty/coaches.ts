// Coaches level up too. Each head coach and coordinator earns XP from his
// team's season (the same sources as the owner's: games, calls won on his
// side of the ball, titles, his players' awards), banked when the season is
// over, before anyone is fired or hired, so it goes to the coaches who earned
// it and stays with them wherever they go. The owner's coaching clinic adds
// to it. Every third level opens an ability slot (three at most): AI teams'
// coaches fill theirs as the offseason begins; a person picks for their own
// coaches before the next season starts (abilities never change mid-season,
// so every game played replays the same).
import type { HeadCoach, DefensiveCoordinator, OffensiveCoordinator, TeamStaff } from "../model/staff.ts";
import type { Team } from "../model/team.ts";
import type { League } from "../league/league.ts";
import type { OffenseConcept, DefenseConcept } from "../play/concepts.ts";
import { CLINIC_PER_TIER, seasonXp, type SeasonXpInput, type XpLine } from "./progression.ts";

export type CoachRole = "HC" | "OC" | "DC";

export type CoachAbility =
  | "run_game_guru"
  | "quick_game_architect"
  | "shot_caller"
  | "red_zone_wizard"
  | "pressure_packages"
  | "coverage_scholar"
  | "run_fits"
  | "disguise"
  | "developer"
  | "clock_manager"
  | "film_junkie"
  | "halftime_adjuster";

export interface CoachAbilityInfo {
  role: CoachRole;
  label: string;
  note: string;
}

export const COACH_ABILITIES: Record<CoachAbility, CoachAbilityInfo> = {
  run_game_guru: { role: "OC", label: "Run game guru", note: "His runs are drawn up better: inside, outside and draws" },
  quick_game_architect: { role: "OC", label: "Quick-game architect", note: "Quick throws and screens are drawn up better" },
  shot_caller: { role: "OC", label: "Shot caller", note: "Deep shots and play action are drawn up better" },
  red_zone_wizard: { role: "OC", label: "Red zone wizard", note: "Every call is drawn up better inside the 10" },
  pressure_packages: { role: "DC", label: "Pressure packages", note: "Blitzes and press are drawn up better" },
  coverage_scholar: { role: "DC", label: "Coverage scholar", note: "Cover 2, 3 and 4 are drawn up better" },
  run_fits: { role: "DC", label: "Run fits", note: "Base and run blitz stop runs better" },
  disguise: { role: "DC", label: "Disguise", note: "Offenses read his defense's tendencies more slowly" },
  developer: { role: "HC", label: "Developer", note: "Players grow 5% more" },
  clock_manager: { role: "HC", label: "Clock manager", note: "Never misses the moment for a timeout" },
  film_junkie: { role: "HC", label: "Film junkie", note: "His staff reads the other side's tendencies sooner" },
  halftime_adjuster: { role: "HC", label: "Halftime adjuster", note: "His staff reads tendencies far better after halftime" },
};

export const COACH_ABILITY_KEYS = Object.keys(COACH_ABILITIES) as CoachAbility[];

/** How much a matching play-design ability adds to a call's matchup edge (in edge points)... */
export const PLAY_DESIGN_EDGE = 0.35;
/** ...and a defensive one takes away (smaller: the defense's abilities cover more of the calls they meet). */
export const DEFENSE_DESIGN_EDGE = 0.25;

export const COACH_MAX_LEVEL = 10;

/** XP for a coach to go from `level` to the next. */
export function xpForCoachLevel(level: number): number {
  return 2000 + 750 * (level - 1);
}

export function coachLevel(xp: number | undefined): { level: number; into: number; next: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(xp ?? 0));
  while (level < COACH_MAX_LEVEL && left >= xpForCoachLevel(level)) {
    left -= xpForCoachLevel(level);
    level++;
  }
  return { level, into: level < COACH_MAX_LEVEL ? left : 0, next: level < COACH_MAX_LEVEL ? xpForCoachLevel(level) : 0 };
}

/** Ability slots a coach has at his level: one at 3, 6 and 9. */
export const abilitySlots = (xp: number | undefined) => Math.floor(coachLevel(xp).level / 3);

type Coach = HeadCoach | OffensiveCoordinator | DefensiveCoordinator;

/** Slots open for a new ability. */
export const openSlots = (c: Coach) => abilitySlots(c.xp) - (c.abilities?.length ?? 0);

/** A coach's share of his team's season, by role. */
export function coachSeasonXp(role: CoachRole, team: Team, input: SeasonXpInput): XpLine[] {
  const lines = seasonXp(team.abbr, { ...input, development: 0 });
  const games = [...input.results, ...(input.playoffs?.titleGames?.map((g) => g.summary) ?? []), ...(input.playoffs?.games.map((g) => g.summary) ?? [])];
  // Calls won on his side of the ball (the head coach's are both sides).
  const sideCalls = (side: "offense" | "defense") =>
    games.reduce((t, g) => {
      const c = g.calls?.[team.abbr];
      if (!c) return t;
      const off = c[2] ?? Math.round(c[0] / 2);
      return t + (side === "offense" ? off : c[0] - off);
    }, 0);
  const clinic = 1 + CLINIC_PER_TIER * (team.upgrades?.clinic ?? 0);
  const awards = (input.awards ?? []).filter((a) => a.team === team.abbr);
  return lines
    .map((l): XpLine => {
      if (l.source === "calls" && role !== "HC") {
        const n = sideCalls(role === "OC" ? "offense" : "defense");
        return { source: "calls", count: n, xp: n };
      }
      if (l.source === "award") {
        // Each coach gets his side's awards (the head coach all of them).
        const mine = awards.filter((a) => role === "HC" || (role === "OC" ? a.award !== "Defensive Player of the Year" : a.award !== "Offensive Player of the Year")).length;
        return { source: "award", count: mine, xp: Math.round((l.xp / l.count) * mine) };
      }
      return l;
    })
    .filter((l) => l.count > 0)
    .map((l) => ({ ...l, xp: Math.round(l.xp * clinic) }));
}

/** The ability an AI coach picks next: the one that fits his scheme best, then the role's list in order. */
export function autoAbility(c: Coach): CoachAbility | null {
  const have = new Set(c.abilities ?? []);
  const role = c.role as CoachRole;
  const prefs: CoachAbility[] =
    c.role === "OC"
      ? c.scheme === "Power Run" || c.scheme === "Spread Option"
        ? ["run_game_guru", "red_zone_wizard", "shot_caller", "quick_game_architect"]
        : c.scheme === "Air Raid"
          ? ["shot_caller", "quick_game_architect", "red_zone_wizard", "run_game_guru"]
          : c.scheme === "West Coast"
            ? ["quick_game_architect", "red_zone_wizard", "shot_caller", "run_game_guru"]
            : ["red_zone_wizard", "run_game_guru", "shot_caller", "quick_game_architect"]
      : c.role === "DC"
        ? c.scheme === "Blitz Heavy" || c.scheme === "Man Press"
          ? ["pressure_packages", "disguise", "run_fits", "coverage_scholar"]
          : ["coverage_scholar", "run_fits", "disguise", "pressure_packages"]
        : c.development >= c.gameManagement
          ? ["developer", "film_junkie", "halftime_adjuster", "clock_manager"]
          : ["clock_manager", "film_junkie", "halftime_adjuster", "developer"];
  return prefs.find((a) => !have.has(a) && COACH_ABILITIES[a].role === role) ?? null;
}

const fill = <C extends Coach>(c: C): C => {
  let out = c;
  while (openSlots(out) > 0) {
    const a = autoAbility(out);
    if (!a) break;
    out = { ...out, abilities: [...(out.abilities ?? []), a] };
  }
  return out;
};

/**
 * Bank every team's coaches' XP for a finished season; AI teams' coaches fill
 * any ability slots that open (`people`: teams people run pick their own).
 */
export function bankCoaches(league: League, input: SeasonXpInput, people: ReadonlySet<string>): League {
  const teams: Record<string, Team> = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    if (!t.staff) {
      teams[abbr] = t;
      continue;
    }
    const earn = <C extends Coach>(c: C, role: CoachRole): C => {
      const gained = coachSeasonXp(role, t, input).reduce((s, l) => s + l.xp, 0);
      const next = { ...c, xp: (c.xp ?? 0) + gained };
      return people.has(abbr) ? next : fill(next);
    };
    const staff: TeamStaff = { ...t.staff, hc: earn(t.staff.hc, "HC"), oc: earn(t.staff.oc, "OC"), dc: earn(t.staff.dc, "DC") };
    teams[abbr] = { ...t, staff };
  }
  return { ...league, teams };
}

/** Why `ability` can't be given to this team's coach now, or null. */
export function abilityProblem(team: Team | undefined, ability: CoachAbility): string | null {
  const info = COACH_ABILITIES[ability];
  if (!info) return "That isn't an ability";
  const c = coachIn(team, info.role);
  if (!c) return "No coach in that job";
  if (c.abilities?.includes(ability)) return `${c.lastName} already has ${info.label}`;
  if (openSlots(c) <= 0) return `${c.lastName} has no open ability slot (one at levels 3, 6 and 9)`;
  return null;
}

/** Give one of your coaches a new ability (offseason only: callers make sure no games of the season have been played). */
export function chooseAbility(league: League, abbr: string, ability: CoachAbility): League {
  const team = league.teams[abbr];
  const problem = abilityProblem(team, ability);
  if (problem) throw new Error(problem);
  const role = COACH_ABILITIES[ability].role;
  const key = role === "HC" ? "hc" : role === "OC" ? "oc" : "dc";
  const c = team!.staff![key];
  const staff = { ...team!.staff!, [key]: { ...c, abilities: [...(c.abilities ?? []), ability] } };
  return { ...league, teams: { ...league.teams, [abbr]: { ...team!, staff } } };
}

function coachIn(team: Team | undefined, role: CoachRole): Coach | undefined {
  const s = team?.staff;
  return !s ? undefined : role === "HC" ? s.hc : role === "OC" ? s.oc : s.dc;
}

/** Does this team's coach in `role` have the ability? */
export function hasAbility(team: Team | undefined, ability: CoachAbility): boolean {
  return !!coachIn(team, COACH_ABILITIES[ability].role)?.abilities?.includes(ability);
}

const OFF_DESIGN: Partial<Record<CoachAbility, readonly OffenseConcept[]>> = {
  run_game_guru: ["inside_run", "outside_run", "draw"],
  quick_game_architect: ["quick", "screen"],
  shot_caller: ["deep_shot", "play_action"],
};
const DEF_DESIGN: Partial<Record<CoachAbility, readonly DefenseConcept[]>> = {
  pressure_packages: ["run_blitz", "pass_blitz", "man_press"],
  coverage_scholar: ["cover_2", "cover_3", "cover_4"],
};

/**
 * How much the coordinators' play design moves a call's matchup edge (the
 * offense's point of view): his own calls drawn up better, the other side's
 * drawn up better against him.
 */
export function playDesignEdge(offense: Team, defense: Team, off: OffenseConcept, def: DefenseConcept, redZone: boolean): number {
  let e = 0;
  const oc = offense.staff?.oc.abilities ?? [];
  const dc = defense.staff?.dc.abilities ?? [];
  for (const a of oc) if (OFF_DESIGN[a]?.includes(off) || (a === "red_zone_wizard" && redZone)) e += PLAY_DESIGN_EDGE;
  for (const a of dc) if (DEF_DESIGN[a]?.includes(def)) e -= DEFENSE_DESIGN_EDGE;
  // Run fits: the base front and the run blitz stop runs better.
  if (dc.includes("run_fits") && (def === "base" || def === "run_blitz") && (off === "inside_run" || off === "outside_run" || off === "draw")) e -= DEFENSE_DESIGN_EDGE;
  return e;
}
