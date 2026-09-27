import type { Player } from "../model/player.ts";
import { starters, type Team } from "../model/team.ts";

/** The 11 offensive starters in base (11 personnel) formation. */
export interface OffensePersonnel {
  qb: Player;
  rbs: Player[];
  wrs: Player[];
  te: Player;
  ol: Player[];
}

/** The 11 defensive starters in base 4-3. */
export interface DefensePersonnel {
  dl: Player[];
  lb: Player[];
  cb: Player[];
  s: Player[];
  all: Player[];
}

export function offensePersonnel(team: Team): OffensePersonnel {
  return {
    qb: starters(team, "QB")[0]!,
    // RB2 is not on the field in 11 personnel but can spell RB1 on carries.
    rbs: starters(team, "RB", 2),
    wrs: starters(team, "WR"),
    te: starters(team, "TE")[0]!,
    ol: starters(team, "OL"),
  };
}

export function defensePersonnel(team: Team): DefensePersonnel {
  const dl = starters(team, "DL");
  const lb = starters(team, "LB");
  const cb = starters(team, "CB");
  const s = starters(team, "S");
  return { dl, lb, cb, s, all: [...dl, ...lb, ...cb, ...s] };
}
