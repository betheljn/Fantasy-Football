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
}

export interface PlayerInit {
  id: PlayerId;
  firstName: string;
  lastName: string;
  position: Position;
  age?: number;
  jersey?: number;
  ratings?: Partial<Ratings>;
}

/** Build a player; any rating not supplied defaults to 50. */
export function createPlayer(init: PlayerInit): Player {
  return {
    id: init.id,
    firstName: init.firstName,
    lastName: init.lastName,
    position: init.position,
    age: init.age ?? 22,
    jersey: init.jersey ?? 0,
    ratings: makeRatings(init.ratings),
  };
}

export function playerOverall(player: Player): number {
  return overall(player.position, player.ratings);
}

export function displayName(player: Player): string {
  return `${player.firstName.charAt(0)}. ${player.lastName}`;
}
