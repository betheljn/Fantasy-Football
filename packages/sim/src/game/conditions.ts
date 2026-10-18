// Game-day conditions: the weather where the game is played (by the home
// team's region and the week of the season) and the home crowd's noise.
// Rules 6 and later play them: wind takes the air out of deep balls and long
// kicks, rain and snow cost completions and loosen the ball, cold shortens
// kicks, and a loud crowd rattles the visitors into false starts. Under a
// dome there's no weather. Every game records its conditions, so it replays
// the same whatever the forecast says later.
import type { Roof, Surface } from "../business/stadium.ts";
import type { League } from "../league/league.ts";
import type { ScheduledGame } from "../league/schedule.ts";
import { leagueFormat } from "../league/format.ts";
import { regionOf } from "../gen/regions.ts";
import type { Team } from "../model/team.ts";
import { Rng } from "../rng.ts";

export type Precip = "none" | "rain" | "snow";

export interface GameConditions {
  /** Played indoors: no weather at all. */
  dome: boolean;
  /** Degrees Fahrenheit at kickoff. */
  temp: number;
  precip: Precip;
  /** Miles an hour. */
  wind: number;
  /** The home crowd's noise, 0 (none: a neutral site) to 1 (deafening). */
  noise: number;
  /** The stadium: its roof (a retractable one closed for the game counts as indoors), and the field (rules 7). */
  roof?: Roof;
  roofClosed?: boolean;
  surface?: Surface;
}

/** Fair weather in front of nobody (what games without recorded conditions played in). */
export const CALM: GameConditions = { dome: false, temp: 65, precip: "none", wind: 0, noise: 0 };

/** Each region's season: temperature at the start and at the end (playoffs), chance of rain, typical wind. */
export const REGION_CLIMATE: Record<string, { early: number; late: number; wet: number; wind: number }> = {
  Northeast: { early: 72, late: 34, wet: 0.22, wind: 9 },
  Atlantic: { early: 78, late: 40, wet: 0.2, wind: 8 },
  Capital: { early: 80, late: 42, wet: 0.2, wind: 7 },
  Southeast: { early: 87, late: 58, wet: 0.24, wind: 6 },
  "Great Lakes": { early: 74, late: 28, wet: 0.22, wind: 11 },
  North: { early: 70, late: 16, wet: 0.18, wind: 11 },
  Plains: { early: 82, late: 30, wet: 0.14, wind: 14 },
  Southwest: { early: 94, late: 56, wet: 0.06, wind: 9 },
  Mountain: { early: 76, late: 26, wet: 0.1, wind: 10 },
  Pacific: { early: 74, late: 52, wet: 0.16, wind: 8 },
};
const MILD = { early: 75, late: 45, wet: 0.15, wind: 8 };

/** The region a team plays its home games in. */
export const venueRegion = (team: Team) => team.region ?? regionOf(team.abbr) ?? "";

/** The weather and crowd for a game, worked out once from the league and the game (the same every time). */
export function gameConditions(league: League, game: Pick<ScheduledGame, "id" | "week" | "home">, neutralSite = false): GameConditions {
  const home = league.teams[game.home]!;
  const climate = REGION_CLIMATE[venueRegion(home)] ?? MILD;
  const rng = new Rng(`${league.seed}:${game.id}:weather`);
  // Through the season (and on into the playoffs) it gets colder.
  const span = leagueFormat(league).weeks + 5;
  const t = Math.min(1, Math.max(0, (game.week - 1) / span));
  const temp = Math.round(climate.early + (climate.late - climate.early) * t + rng.normal(0, 7));
  const wet = rng.chance(climate.wet * 0.55);
  const precip: Precip = wet ? (temp <= 33 ? "snow" : "rain") : "none";
  const wind = Math.max(0, Math.round(rng.normal(climate.wind, 5)));
  const dome = !!home.venue?.dome;
  const noise = neutralSite ? 0 : (home.venue?.noise ?? 0.5);
  const roof = home.venue?.roof ?? (dome ? "dome" : "open");
  const field = { roof, surface: home.venue?.surface ?? (roof === "dome" ? "turf" : "grass") } as const;
  // A retractable roof closes against rain, snow, cold and a gale; then it's a dome for the day.
  const closed = roof === "retractable" && (precip !== "none" || temp < 40 || wind >= 20);
  if (dome || closed) return { dome: true, temp: 70, precip: "none", wind: 0, noise: Math.min(1, noise + 0.1), ...field, ...(closed ? { roofClosed: true } : {}) };
  return { dome, temp, precip, wind, noise, ...field };
}

/** What the conditions do to the game (all neutral in calm weather with no crowd). */
export interface ConditionEffects {
  /** Added to completion odds on every throw, and more on deep ones. */
  completion: number;
  deepCompletion: number;
  /** Multiplies every fumble chance. */
  fumble: number;
  /** Yards added to a field goal's real distance (wind, cold), and taken off the kicker's best accuracy. */
  kickYards: number;
  kickAccuracy: number;
  /** Yards off a punt. */
  puntYards: number;
  /** Multiplies the visiting offense's false starts (a typical crowd, 0.5: the usual road factor). */
  visitorFalseStart: number;
  /** The field (rules 7): multiplies big-run chances, adds yards after the catch, multiplies injuries. */
  breakaway: number;
  yac: number;
  injury: number;
}

/** What the field does (rules 7): turf is fast and hard, grass a touch slower and kinder. */
export const SURFACE_EFFECTS: Record<Surface, { breakaway: number; yac: number; injury: number }> = {
  turf: { breakaway: 1.12, yac: 0.3, injury: 1.15 },
  grass: { breakaway: 0.97, yac: 0, injury: 0.95 },
};

/** What the conditions do (`field`: play the surface too, from rules 7). */
export function conditionEffects(c: GameConditions | undefined, field = false): ConditionEffects {
  const out: ConditionEffects = { completion: 0, deepCompletion: 0, fumble: 1, kickYards: 0, kickAccuracy: 0, puntYards: 0, visitorFalseStart: 1, breakaway: 1, yac: 0, injury: 1 };
  if (!c) return out;
  if (field && c.surface) Object.assign(out, SURFACE_EFFECTS[c.surface]);
  out.visitorFalseStart = 1.3 * (0.5 + c.noise);
  if (c.dome) return out;
  const gust = Math.max(0, c.wind - 10);
  out.completion -= 0.002 * gust;
  out.deepCompletion -= 0.006 * gust;
  out.kickYards += 0.4 * gust;
  out.puntYards += 0.5 * gust;
  if (c.precip === "rain") {
    out.completion -= 0.03;
    out.fumble *= 1.4;
    out.kickAccuracy += 0.03;
  } else if (c.precip === "snow") {
    out.completion -= 0.05;
    out.deepCompletion -= 0.03;
    out.fumble *= 1.6;
    out.kickAccuracy += 0.05;
    out.kickYards += 2;
  }
  if (c.temp < 32) {
    out.completion -= 0.01;
    out.kickYards += (32 - c.temp) / 6;
  }
  return out;
}

/** "38°, snow, wind 18 mph · loud crowd", for the pregame and the feed. */
export function describeConditions(c: GameConditions): string {
  const crowd = c.noise >= 0.75 ? "deafening crowd" : c.noise >= 0.6 ? "loud crowd" : c.noise >= 0.35 ? "home crowd" : c.noise > 0 ? "quiet crowd" : "neutral site";
  const turf = c.surface === "turf" ? " · turf" : "";
  if (c.roofClosed) return `Roof closed${turf} · ${crowd}`;
  if (c.dome) return `Indoors${turf} · ${crowd}`;
  const sky = c.precip === "snow" ? "snow" : c.precip === "rain" ? "rain" : c.temp >= 85 ? "hot" : "clear";
  return `${c.temp}°, ${sky}${c.wind >= 12 ? `, wind ${c.wind} mph` : ""}${c.roof === "retractable" ? " · roof open" : ""}${turf} · ${crowd}`;
}
