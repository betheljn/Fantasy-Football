import { assignStaffContracts } from "../contracts/staffcontracts.ts";
import { assignContracts } from "../gen/contract-gen.ts";
// The league: 50 teams, one per state, in two conferences of five
// geographic divisions each.
import { POSITION_UNIT, POSITIONS, BASE_STARTERS } from "../model/positions.ts";
import { playerOverall } from "../model/player.ts";
import { starters, type Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import { NICKNAMES, STATES } from "../gen/names.ts";
import { generateTeam } from "../gen/team-gen.ts";
import { generateStaff } from "../gen/staff-gen.ts";

export interface Division {
  name: string;
  /** Team abbrs (state postal codes). */
  teams: string[];
}

export interface Conference {
  name: string;
  abbr: string;
  divisions: Division[];
}

export interface League {
  seed: string;
  /** Season year shown to players; the first season of a new league. */
  season: number;
  conferences: Conference[];
  /** Team abbr -> team. */
  teams: Record<string, Team>;
  /** Draft picks that changed hands: pick id ("draft:round:original team") -> owner. */
  pickOwners?: Readonly<Record<string, string>>;
}

/** Fixed geography: which states play in which division. */
export const LEAGUE_STRUCTURE: ReadonlyArray<{ name: string; abbr: string; divisions: ReadonlyArray<{ name: string; states: readonly string[] }> }> = [
  {
    name: "Eastern Conference",
    abbr: "EC",
    divisions: [
      { name: "Northeast", states: ["ME", "NH", "VT", "MA", "RI"] },
      { name: "Atlantic", states: ["CT", "NY", "NJ", "PA", "DE"] },
      { name: "Capital", states: ["MD", "VA", "WV", "NC", "SC"] },
      { name: "Southeast", states: ["GA", "FL", "AL", "MS", "TN"] },
      { name: "Great Lakes", states: ["OH", "MI", "IN", "KY", "IL"] },
    ],
  },
  {
    name: "Western Conference",
    abbr: "WC",
    divisions: [
      { name: "North", states: ["WI", "MN", "IA", "ND", "SD"] },
      { name: "Plains", states: ["NE", "KS", "MO", "OK", "AR"] },
      { name: "Southwest", states: ["TX", "LA", "NM", "AZ", "NV"] },
      { name: "Mountain", states: ["CO", "UT", "WY", "MT", "ID"] },
      { name: "Pacific", states: ["WA", "OR", "CA", "AK", "HI"] },
    ],
  },
];

export const FIRST_SEASON = 2031;

/**
 * Generate a new league. Deterministic: the same seed always gives the same
 * league. Each team gets its own random stream, so teams don't depend on
 * one another's generation.
 */
export function generateLeague(seed: number | string, season = FIRST_SEASON): League {
  const rng = new Rng(`league:${seed}`);
  const stateName = new Map(STATES.map(([name, abbr]) => [abbr, name]));
  const nicknames = rng.shuffle(NICKNAMES);

  const teams: Record<string, Team> = {};
  let i = 0;
  const conferences: Conference[] = LEAGUE_STRUCTURE.map((c) => ({
    name: c.name,
    abbr: c.abbr,
    divisions: c.divisions.map((d) => {
      for (const abbr of d.states) {
        const state = stateName.get(abbr);
        if (!state) throw new Error(`Unknown state ${abbr}`);
        const team = generateTeam(new Rng(`league:${seed}:team:${abbr}`), { state, abbr, nickname: nicknames[i++]! });
        // Staff from their own stream, so rosters don't depend on them.
        teams[abbr] = { ...team, staff: generateStaff(new Rng(`league:${seed}:staff:${abbr}`), abbr) };
      }
      return { name: d.name, teams: [...d.states] };
    }),
  }));
  // Contracts come last, from their own streams, so rosters and staff never depend on them.
  return assignStaffContracts(assignContracts({ seed: String(seed), season, conferences, teams }));
}

export function allTeams(league: League): Team[] {
  return league.conferences.flatMap((c) => c.divisions.flatMap((d) => d.teams.map((abbr) => league.teams[abbr]!)));
}

export function divisionOf(league: League, abbr: string): Division {
  for (const c of league.conferences) for (const d of c.divisions) if (d.teams.includes(abbr)) return d;
  throw new Error(`${abbr} is not in the league`);
}

export function conferenceOf(league: League, abbr: string): Conference {
  const c = league.conferences.find((conf) => conf.divisions.some((d) => d.teams.includes(abbr)));
  if (!c) throw new Error(`${abbr} is not in the league`);
  return c;
}

export interface TeamRatings {
  offense: number;
  defense: number;
  special: number;
  /** Weighted blend: offense and defense matter most. */
  overall: number;
}

/** Average starter overall by unit, for power rankings and previews. */
export function teamRatings(team: Team): TeamRatings {
  const unit = { offense: [] as number[], defense: [] as number[], special: [] as number[] };
  for (const pos of POSITIONS) {
    for (const p of starters(team, pos, BASE_STARTERS[pos])) unit[POSITION_UNIT[pos]].push(playerOverall(p));
  }
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const offense = mean(unit.offense);
  const defense = mean(unit.defense);
  const special = mean(unit.special);
  return { offense, defense, special, overall: offense * 0.45 + defense * 0.45 + special * 0.1 };
}
