// Your program: you rank the three skill groups you most want to build
// around, the region whose talent core fits them best is yours, and the
// league makes room: the region's program with the most typical market folds
// (its players become free agents) and a new program takes its place, with a
// fresh roster drawn mostly from local talent (so it leans to the region's
// core) plus players from outside. No state is named: the program is its
// region until you name it.
import { POPULATION } from "../business/business.ts";
import { freeAgentPool } from "../contracts/inseason.ts";
import { assignContracts } from "../gen/contract-gen.ts";
import { REGION_CORES, SKILL_GROUP_KEYS, corePull, regionOf, regions, type SkillGroup } from "../gen/regions.ts";
import { generatePlayer, pickJersey, rollPotential, ROSTER_TEMPLATE } from "../gen/team-gen.ts";
import { allTeams, teamRatings, type League } from "../league/league.ts";
import { POSITIONS } from "../model/positions.ts";
import { playerOverall, type Player } from "../model/player.ts";
import { buildDepthChart, type Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import type { Dynasty } from "./dynasty.ts";

/** How much your first, second and third choices count toward a region's fit. */
const CHOICE_WEIGHT = [3, 2, 1] as const;
/** Share of a new program's roster that grew up in its region. */
export const LOCAL_SHARE = 0.7;
/** Candidates per roster spot: at least this many, and more until there are enough locals to choose from. */
const CANDIDATES = 3;
const MAX_CANDIDATES = 30;

export interface RegionFit {
  region: string;
  /** How well the region's core matches your choices (higher is better). */
  score: number;
  /** Your choices that are in its core. */
  matches: SkillGroup[];
}

/** Why these three choices can't be used, or null. */
export function skillChoiceProblem(groups: readonly SkillGroup[]): string | null {
  if (groups.length !== 3) return "Pick three skill groups";
  if (new Set(groups).size !== 3) return "Pick three different skill groups";
  if (groups.some((g) => !SKILL_GROUP_KEYS.includes(g))) return "That isn't a skill group";
  return null;
}

/** Every region scored against your top three skill groups, best first. */
export function regionFits(groups: readonly SkillGroup[]): RegionFit[] {
  return regions()
    .map((r) => ({
      region: r.name,
      score: Math.round(groups.reduce((s, g, i) => s + (CHOICE_WEIGHT[i] ?? 0) * corePull(r.name, g), 0) * 100) / 100,
      matches: groups.filter((g) => REGION_CORES[r.name]!.includes(g)),
    }))
    .sort((a, b) => b.score - a.score || b.matches.length - a.matches.length || a.region.localeCompare(b.region));
}

/** The program in a region whose market is closest to the region's average (it makes way for yours). */
export function programSlot(region: string): string {
  const states = regions().find((r) => r.name === region)?.states;
  if (!states) throw new Error(`No region ${region}`);
  const pop = (s: string) => POPULATION[s] ?? 3;
  const mean = states.reduce((t, s) => t + pop(s), 0) / states.length;
  return [...states].sort((a, b) => Math.abs(pop(a) - mean) - Math.abs(pop(b) - mean) || a.localeCompare(b))[0]!;
}

export interface NewProgram {
  dynasty: Dynasty;
  /** The program's key (the slot it took). */
  team: string;
  region: string;
  fits: RegionFit[];
  /** The program that made way (its players are now free agents). */
  replaced: { abbr: string; name: string };
}

/**
 * Start your program in the region that best fits your three skill groups (or
 * `region`, if given). Its roster is about as strong as the program it
 * replaces, so the league stays balanced. Same choices, same program.
 */
export function createProgram(dynasty: Dynasty, groups: readonly SkillGroup[], region?: string): NewProgram {
  const problem = skillChoiceProblem(groups);
  if (problem) throw new Error(problem);
  const fits = regionFits(groups);
  const home = region ?? fits[0]!.region;
  if (!regions().some((r) => r.name === home)) throw new Error(`No region ${home}`);
  const league = dynasty.league;
  const abbr = programSlot(home);
  const old = league.teams[abbr]!;
  const target = teamRatings(old).overall;
  const seed = `${league.seed}:${league.season}:program:${groups.join(",")}:${home}`;

  // Calibrate talent so the new roster's starters match the program it replaces.
  // (Secant steps: strength isn't quite linear in talent, since the best local finds are kept.)
  const strength = (r: Player[]) => teamRatings({ ...old, roster: r, depthChart: buildDepthChart(r) }).overall;
  let mean = 58;
  let roster = programRoster(seed, abbr, home, mean, league.season);
  let got = strength(roster);
  let best = { roster, miss: Math.abs(got - target) };
  let prev: { mean: number; got: number } | null = null;
  for (let i = 0; i < 8 && best.miss >= 0.3; i++) {
    const slope = prev && Math.abs(got - prev.got) > 0.05 ? (got - prev.got) / (mean - prev.mean) : 1;
    prev = { mean, got };
    mean += (target - got) / Math.max(0.3, Math.min(2, slope));
    roster = programRoster(seed, abbr, home, mean, league.season);
    got = strength(roster);
    if (Math.abs(got - target) < best.miss) best = { roster, miss: Math.abs(got - target) };
  }
  roster = best.roster;

  const team: Team = { ...old, roster, depthChart: buildDepthChart(roster), reserve: [], region: home, cap: { rollover: 0, deadMoney: 0 } };
  const { city: _c, tag: _t, logo: _l, colors: _k, ...plain } = team;
  // The folded program's players join the free agents.
  const rostered = new Set(allTeams(league).filter((t) => t.abbr !== abbr).flatMap((t) => t.roster.map((p) => p.id)));
  const freeAgents = freeAgentPool([...old.roster, ...(old.reserve ?? []), ...(league.freeAgents ?? [])], rostered);
  // Contracts for everyone, as for any new league (the new roster has none yet).
  const next = assignContracts({ ...league, teams: { ...league.teams, [abbr]: plain }, freeAgents });
  return { dynasty: { ...dynasty, league: next }, team: abbr, region: home, fits, replaced: { abbr, name: `${old.state} ${old.nickname}` } };
}

/** A fresh 72-man roster: the best of several candidates per spot, mostly local. */
function programRoster(seed: string, abbr: string, region: string, talentMean: number, season: number): Player[] {
  const rng = new Rng(seed);
  const local = (p: Player) => regionOf(p.home ?? "") === region;
  const roster: Player[] = [];
  const usedNames = new Set<string>();
  const usedJerseys = new Set<number>();
  let n = 0;
  for (const pos of POSITIONS) {
    const spots = ROSTER_TEMPLATE[pos];
    const wantLocal = Math.round(spots * LOCAL_SHARE);
    const candidates: Player[] = [];
    let locals = 0;
    // Keep scouting until there are a couple of local options per local spot.
    while (candidates.length < spots * MAX_CANDIDATES && (candidates.length < spots * CANDIDATES || locals < wantLocal * 2)) {
      const id = `${abbr}-P${season}-${String(++n).padStart(4, "0")}`;
      const p = rollPotential(rng, generatePlayer(rng, { id, position: pos, talentMean, jersey: 0, usedNames }));
      candidates.push(p);
      if (local(p)) locals++;
    }
    // Local players first (best first), then outsiders, in the mix the program is built from.
    const byOvr = (a: Player, b: Player) => playerOverall(b) - playerOverall(a) || a.id.localeCompare(b.id);
    // You scout your own region deeply and elsewhere lightly: outsiders come from the first look only.
    const near = candidates.filter(local).sort(byOvr);
    const far = candidates.slice(0, spots * CANDIDATES).filter((p) => !local(p)).sort(byOvr);
    const picked = [...near.slice(0, wantLocal), ...far.slice(0, spots - Math.min(wantLocal, near.length))];
    // Short on locals or outsiders: fill from whoever's left.
    for (const p of [...near, ...far]) if (picked.length < spots && !picked.includes(p)) picked.push(p);
    for (const p of picked.slice(0, spots)) roster.push({ ...p, jersey: pickJersey(rng, pos, usedJerseys) });
  }
  return roster;
}
