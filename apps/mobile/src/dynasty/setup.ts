// A new dynasty as your setup makes it: your program (from your skill groups),
// then its look, your stadium and your head coach. Pure and repeatable, so a draft resumed
// after closing the app starts from exactly the same league.
import { buildDesignedStadium, createProgram, setUpTeam, type Dynasty } from "@dynasty/sim";
import type { TeamSetup } from "./save";

export function startingDynasty(dynasty: Dynasty, setup: TeamSetup): Dynasty {
  const base = setup.groups ? createProgram(dynasty, setup.groups, setup.region ? { region: setup.region } : undefined).dynasty : dynasty;
  const made = setUpTeam(base, setup.team, setup);
  // Your stadium, built to your design.
  return setup.stadium ? buildDesignedStadium(made, setup.team, setup.stadium) : made;
}
