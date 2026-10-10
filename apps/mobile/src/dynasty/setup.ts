// A new dynasty as your setup makes it: your program (from your skill groups),
// then its look and your head coach. Pure and repeatable, so a draft resumed
// after closing the app starts from exactly the same league.
import { createProgram, setUpTeam, type Dynasty } from "@dynasty/sim";
import type { TeamSetup } from "./save";

export function startingDynasty(dynasty: Dynasty, setup: TeamSetup): Dynasty {
  const base = setup.groups ? createProgram(dynasty, setup.groups).dynasty : dynasty;
  return setUpTeam(base, setup.team, setup);
}
