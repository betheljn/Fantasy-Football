// Your team's identity: the city name, nickname, short tag, logo and colors
// you give it when a dynasty starts. The state (the team's key, division and
// market) never changes; everything here is how the team is shown.
import { LOGOS, logoById, logoForNickname, type TeamLogo } from "../gen/logos.ts";
import { teamTag, type Team, type TeamColorChoice } from "../model/team.ts";
import type { League } from "./league.ts";

export interface TeamIdentityChoice {
  /** Shown in place of the state; blank or the state name = the state. */
  city?: string;
  nickname: string;
  /** 2-4 letters; blank or the abbr = the abbr. */
  tag?: string;
  /** Logo library id. */
  logo: string;
  /** Absent = the team's designed colors. */
  colors?: TeamColorChoice;
}

export const IDENTITY_LIMITS = { city: 20, nickname: 16 } as const;

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** The logo a team shows: its chosen one, else the one that goes with its nickname. */
export function teamLogo(team: Team): TeamLogo {
  return (team.logo ? logoById(team.logo) : undefined) ?? logoForNickname(team.nickname) ?? LOGOS[0]!;
}

/** Why this identity can't be used for `abbr`, or null if it can. */
export function identityProblem(league: League, abbr: string, choice: TeamIdentityChoice): string | null {
  const team = league.teams[abbr];
  if (!team) return `${abbr} is not in the league`;
  const city = choice.city?.trim() ?? "";
  const nickname = choice.nickname.trim();
  const tag = choice.tag?.trim().toUpperCase() ?? "";
  if (city.length > IDENTITY_LIMITS.city) return `City name is ${IDENTITY_LIMITS.city} characters at most`;
  if (!nickname) return "Your team needs a nickname";
  if (nickname.length > IDENTITY_LIMITS.nickname) return `Nickname is ${IDENTITY_LIMITS.nickname} characters at most`;
  if (tag && !/^[A-Z]{2,4}$/.test(tag)) return "The short name is 2 to 4 letters";
  if (tag && tag !== abbr) {
    const clash = Object.values(league.teams).find((t) => t.abbr !== abbr && (t.abbr === tag || teamTag(t) === tag));
    if (clash) return `${tag} is already ${clash.state}'s short name`;
  }
  if (!logoById(choice.logo)) return "Pick a logo from the list";
  if (choice.colors && (!HEX.test(choice.colors.primary) || !HEX.test(choice.colors.trim))) return "Colors must be #RRGGBB";
  if (choice.colors && choice.colors.primary.toLowerCase() === choice.colors.trim.toLowerCase()) return "Pick two different colors";
  return null;
}

/**
 * Give `abbr` its identity. If another team already has that nickname or
 * logo, the two trade, so no two teams ever share a name or a logo. Throws
 * on an identity `identityProblem` rejects.
 */
export function customizeTeam(league: League, abbr: string, choice: TeamIdentityChoice): League {
  const problem = identityProblem(league, abbr, choice);
  if (problem) throw new Error(problem);
  const team = league.teams[abbr]!;
  const nickname = choice.nickname.trim();
  const city = choice.city?.trim();
  const tag = choice.tag?.trim().toUpperCase();
  const teams = { ...league.teams };
  const sameNick = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  // Hand our old nickname and logo to whoever had the new ones.
  const oldLogo = teamLogo(team).id;
  for (const other of Object.values(league.teams)) {
    if (other.abbr === abbr) continue;
    const nickClash = sameNick(other.nickname, nickname);
    const logoClash = teamLogo(other).id === choice.logo;
    if (!nickClash && !logoClash) continue;
    // The logo is written out: one that came from the nickname would follow it.
    teams[other.abbr] = { ...other, nickname: nickClash ? team.nickname : other.nickname, logo: logoClash ? oldLogo : teamLogo(other).id };
  }

  const { city: _c, tag: _t, colors: _k, ...rest } = team;
  teams[abbr] = {
    ...rest,
    nickname,
    logo: choice.logo,
    ...(city && city !== team.state ? { city } : {}),
    ...(tag && tag !== abbr ? { tag } : {}),
    ...(choice.colors ? { colors: { primary: choice.colors.primary.toUpperCase(), trim: choice.colors.trim.toUpperCase() } } : {}),
  };
  return { ...league, teams };
}

/**
 * Online: why this identity clashes with a team another friend runs, or null.
 * `friends` are the other claimed teams with the identity each has chosen
 * (null = it keeps its own). Taking an AI team's name or logo is fine (they
 * trade); a friend's never is.
 */
export function friendIdentityClash(league: League, abbr: string, choice: TeamIdentityChoice, friends: Readonly<Record<string, TeamIdentityChoice | null>>): string | null {
  const nickname = choice.nickname.trim().toLowerCase();
  const tag = choice.tag?.trim().toUpperCase() || abbr;
  for (const [other, theirs] of Object.entries(friends)) {
    const team = league.teams[other];
    if (other === abbr || !team) continue;
    const theirNick = (theirs?.nickname ?? team.nickname).trim().toLowerCase();
    const theirLogo = theirs?.logo ?? teamLogo(team).id;
    const theirTag = theirs?.tag?.trim().toUpperCase() || (theirs ? other : teamTag(team));
    if (theirNick === nickname) return `A friend's team (${team.state}) is the ${theirs?.nickname ?? team.nickname}`;
    if (theirLogo === choice.logo) return `A friend's team (${team.state}) has that logo`;
    if (theirTag === tag) return `${tag} is a friend's short name (${team.state})`;
  }
  return null;
}
