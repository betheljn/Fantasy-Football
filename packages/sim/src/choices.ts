// Teams' own calls in the offseason (re-signings, free agency, roster cuts,
// staff moves): one team's (a solo dynasty) or several (an online league with
// friends). Any team without one is the AI's.

/** One team's choices, or several teams' (each team at most once). */
export type PerTeam<T extends { team: string }> = T | readonly T[];

/** The choices by team. */
export function teamChoices<T extends { team: string }>(c: PerTeam<T> | undefined): Map<string, T> {
  if (c === undefined) return new Map();
  const list: readonly T[] = "team" in c ? [c as T] : (c as readonly T[]);
  return new Map(list.map((x) => [x.team, x]));
}
