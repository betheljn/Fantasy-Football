import type { Position } from "./positions.ts";
import { makeRatings, overall, type Ratings } from "./ratings.ts";

export type PlayerId = string;

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
  };
}

export function playerOverall(player: Player): number {
  return overall(player.position, player.ratings);
}

export function displayName(player: Player): string {
  return `${player.firstName.charAt(0)}. ${player.lastName}`;
}
