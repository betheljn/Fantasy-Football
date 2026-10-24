// The stadium's design: what it's like to play in and to watch a game in.
// A roof (open air, a retractable roof that closes against rain, snow and
// cold, or a dome), a surface (grass or turf), the stands (a classic bowl, or
// steep stands right on top of the field that hold the noise in), a video
// board, a name. Older saves' stadiums read as they were: a dome or open
// air, turf under a dome and grass outside, a classic bowl.
import type { Stadium } from "./business.ts";

export type Roof = "open" | "retractable" | "dome";
export type Surface = "grass" | "turf";
export type Stands = "classic" | "steep";

export const ROOF_NAMES: Record<Roof, string> = { open: "Open air", retractable: "Retractable roof", dome: "Dome" };
export const SURFACE_NAMES: Record<Surface, string> = { grass: "Grass", turf: "Turf" };
export const STANDS_NAMES: Record<Stands, string> = { classic: "Classic bowl", steep: "Steep stands" };

/** Video board levels (0: an old scoreboard, 3: the biggest boards in the league). */
export const VIDEO_BOARD_MAX = 3;
export const VIDEO_BOARD_NAMES = ["Old scoreboard", "Video board", "Big video boards", "Wraparound boards"] as const;

export const roofOf = (s: Stadium): Roof => s.roof ?? (s.dome ? "dome" : "open");
export const surfaceOf = (s: Stadium): Surface => s.surface ?? (roofOf(s) === "dome" ? "turf" : "grass");
export const standsOf = (s: Stadium): Stands => s.stands ?? "classic";
export const videoBoardOf = (s: Stadium): number => s.videoBoard ?? 1;

/** Does it have a roof it can close (a dome, or a retractable one)? */
export const covered = (s: Stadium) => roofOf(s) !== "open";

/** The stadium in a line ("Retractable roof · turf · steep stands · 68,000"). */
export function describeStadium(s: Stadium): string {
  return `${ROOF_NAMES[roofOf(s)]} · ${SURFACE_NAMES[surfaceOf(s)].toLowerCase()} · ${STANDS_NAMES[standsOf(s)].toLowerCase()} · ${s.capacity.toLocaleString("en-US")} seats`;
}

/** Why a name won't do, or null. */
export function stadiumNameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return "Give it a name of at least three letters";
  if (n.length > 40) return "Keep it under 40 letters";
  if (!/^[A-Za-z0-9 .'&-]+$/.test(n)) return "Letters, numbers, spaces and . ' & - only";
  return null;
}

/** A stadium's design, as chosen when a program builds its first one. */
export interface StadiumDesign {
  roof: Roof;
  surface: Surface;
  stands: Stands;
  name: string;
}

/** Why a design can't be built, or null. */
export function designProblem(d: StadiumDesign): string | null {
  if (!(d.roof in ROOF_NAMES)) return "That isn't a roof";
  if (!(d.surface in SURFACE_NAMES)) return "That isn't a field";
  if (!(d.stands in STANDS_NAMES)) return "That isn't a kind of stands";
  if (d.roof === "dome" && d.surface === "grass") return "Grass won't grow under a dome";
  return stadiumNameProblem(d.name);
}

/** The stadium built to a design (steep stands hold 3,000 fewer, as when they're rebuilt). */
export function designedStadium(s: Stadium, d: StadiumDesign): Stadium {
  const steepNow = d.stands === "steep" && standsOf(s) !== "steep";
  return {
    ...s,
    name: d.name.trim().replace(/\s+/g, " "),
    roof: d.roof,
    dome: d.roof === "dome",
    surface: d.surface,
    stands: d.stands,
    capacity: steepNow ? Math.max(30_000, s.capacity - 3_000) : s.capacity,
  };
}

/** What each part of the design does on game day (rules 7), in a line. */
export const ROOF_NOTES: Record<Roof, string> = {
  open: "The weather plays: wind, rain, snow and cold all come into it.",
  retractable: "Open on a fine day; closed against rain, snow, cold under 40° and wind over 20 mph. Costs the most to run.",
  dome: "Never any weather, and the roof traps the noise. Costs more to run.",
};
export const SURFACE_NOTES: Record<Surface, string> = {
  grass: "A touch slower (3% fewer big runs) and kinder on the body (5% fewer injuries).",
  turf: "Fast: 12% more big runs and more yards after the catch, but 15% more injuries.",
};
export const STANDS_NOTES: Record<Stands, string> = {
  classic: "The crowd as loud as its fans make it.",
  steep: "Right on top of the field: louder, more visitor false starts, 3,000 fewer seats.",
};
