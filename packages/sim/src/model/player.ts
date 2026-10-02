import type { PlayerInjury } from "../game/injuries.ts";
import type { Position } from "./positions.ts";
import { makeRatings, overall, type Ratings } from "./ratings.ts";
import type { Contract } from "./contract.ts";

export type PlayerId = string;

/** How fast a player develops (Madden-style). Hidden until revealed. */
export type DevTrait = "normal" | "impact" | "star" | "elite";
export const DEV_TRAITS: readonly DevTrait[] = ["normal", "impact", "star", "elite"];
export const DEV_TRAIT_NAMES: Record<DevTrait, string> = { normal: "Normal", impact: "Impact", star: "Star", elite: "Elite" };

export interface Player {
  readonly id: PlayerId;
  readonly firstName: string;
  readonly lastName: string;
  readonly position: Position;
  readonly age: number;
  readonly jersey: number;
  readonly ratings: Ratings;
  /**
   * Hidden ceiling for development: the overall a player can grow toward.
   * Never shown to the user directly (scouts will estimate it).
   */
  readonly potential: number;
  /** What kind of player he is at his position (e.g. "Scrambler", "Power Back"). */
  readonly archetype: string;
  /** Development speed. Always true for the sim; whether anyone can SEE it is devTraitRevealed. */
  readonly devTrait: DevTrait;
  /** Known to the league: after a pro season, or through scouting. */
  readonly devTraitRevealed: boolean;
  /** Current deal. Absent for players outside the cap system (tests, prospects). */
  readonly contract?: Contract;
  /** Hurt and missing games (absent = healthy). */
  readonly injury?: PlayerInjury;
}

export interface PlayerInit {
  id: PlayerId;
  firstName: string;
  lastName: string;
  position: Position;
  age?: number;
  jersey?: number;
  ratings?: Partial<Ratings>;
  /** Defaults to the player's current overall (no room to grow). */
  potential?: number;
  archetype?: string;
  devTrait?: DevTrait;
  devTraitRevealed?: boolean;
}

/** Build a player; any rating not supplied defaults to 50. */
export function createPlayer(init: PlayerInit): Player {
  const ratings = makeRatings(init.ratings);
  return {
    id: init.id,
    firstName: init.firstName,
    lastName: init.lastName,
    position: init.position,
    age: init.age ?? 22,
    jersey: init.jersey ?? 0,
    ratings,
    potential: init.potential ?? overall(init.position, ratings),
    archetype: init.archetype ?? "",
    devTrait: init.devTrait ?? "normal",
    devTraitRevealed: init.devTraitRevealed ?? true,
  };
}

export function playerOverall(player: Player): number {
  return overall(player.position, player.ratings);
}

export function displayName(player: Player): string {
  return `${player.firstName.charAt(0)}. ${player.lastName}`;
}
