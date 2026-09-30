// Your team's offseason, pulled from the sim's full offseason log: who left,
// who arrived, the draft, staff changes - plus the league's headline news.
import { playerOverall, type Award, type Dynasty, type OffseasonLog, type Player } from "@dynasty/sim";

export interface ReportPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  overall: number;
  note: string;
}

export interface OffseasonReport {
  season: number;
  champion: string;
  runnerUp: string;
  awards: Award[];
  coachOfTheYear: string | null;
  /** Your team's regular-season record and final ranking. */
  record: string;
  rank: number | null;
  staff: string[];
  draft: ReportPlayer[];
  arrived: ReportPlayer[];
  departed: ReportPlayer[];
  kept: ReportPlayer[];
}

const person = (p: Player, note: string): ReportPlayer => ({
  id: p.id,
  name: `${p.firstName} ${p.lastName}`,
  position: p.position,
  age: p.age,
  overall: playerOverall(p),
  note,
});

/**
 * `before` is the dynasty as the season was played; `after` is the one returned
 * by finishSeason. `record` and `rank` are your team's final regular season.
 */
export function buildReport(
  team: string,
  before: Dynasty,
  after: Dynasty,
  log: OffseasonLog,
  record: string,
  rank: number | null,
  /** Expiring players you chose to keep (so the report can say why one still left). */
  wantedBack: ReadonlySet<string> = new Set(),
): OffseasonReport {
  const h = after.history.at(-1)!;
  const oldTeam = new Map<string, string>();
  for (const t of Object.values(before.league.teams)) for (const p of t.roster) oldTeam.set(p.id, t.abbr);
  const beforeRoster = new Map(before.league.teams[team]!.roster.map((p) => [p.id, p]));
  const afterRoster = new Map(after.league.teams[team]!.roster.map((p) => [p.id, p]));
  const newTeam = new Map<string, string>();
  for (const t of Object.values(after.league.teams)) for (const p of t.roster) newTeam.set(p.id, t.abbr);

  const departed: ReportPlayer[] = [];
  const retired = new Set(log.retirees.filter((r) => r.team === team).map((r) => r.player.id));
  const why = new Map<string, string>();
  for (const m of log.contractMoves) {
    if (m.team !== team) continue;
    if (m.kind === "released") why.set(m.player.id, wantedBack.has(m.player.id) ? "didn't fit under the cap" : "not re-signed");
    if (m.kind === "declined") why.set(m.player.id, wantedBack.has(m.player.id) ? "turned down your offer" : "tested free agency");
    if (m.kind === "cut" || m.kind === "cap cut") why.set(m.player.id, m.kind === "cap cut" ? "cap cut" : "cut");
  }
  // The offseason's version of each player (a year older, after development) where the log has one.
  const current = new Map(log.contractMoves.map((m) => [m.player.id, m.player]));
  for (const [id, p] of beforeRoster) {
    if (afterRoster.has(id)) continue;
    const went = newTeam.get(id);
    const note = retired.has(id) ? "retired" : `${why.get(id) ?? "left"}${went ? ` → signed with ${went}` : ""}`;
    departed.push(person(current.get(id) ?? p, note));
  }

  const draft = log.draft.filter((d) => d.team === team).map((d) => person(afterRoster.get(d.player.id) ?? d.player, `round ${d.round}, pick ${d.overall}`));
  const drafted = new Set(draft.map((d) => d.id));
  const arrived: ReportPlayer[] = [];
  for (const [id, p] of afterRoster) {
    if (beforeRoster.has(id) || drafted.has(id)) continue;
    const signing = log.contractMoves.find((m) => m.kind === "signed" && m.player.id === id);
    const from = oldTeam.get(id);
    arrived.push(person(p, signing ? `free agent${from ? ` from ${from}` : ""}` : p.age <= 23 ? "undrafted rookie" : "signed"));
  }

  const kept = log.contractMoves
    .filter((m) => m.team === team && (m.kind === "re-signed" || m.kind === "extended" || m.kind === "option"))
    .map((m) => person(afterRoster.get(m.player.id) ?? m.player, m.kind === "option" ? "5th-year option" : m.kind));

  const staff = log.staffChanges
    .filter((c) => c.team === team)
    .map((c) => `${c.role}: ${c.out ?? "—"} (${c.reason}) → ${c.in}`);

  return {
    season: h.season,
    champion: h.champion,
    runnerUp: h.runnerUp,
    awards: h.awards,
    coachOfTheYear: h.coachOfTheYear ? `${h.coachOfTheYear.name} (${h.coachOfTheYear.team})` : null,
    record,
    rank,
    staff,
    draft,
    arrived,
    departed: departed.sort((a, b) => b.overall - a.overall),
    kept: kept.sort((a, b) => b.overall - a.overall),
  };
}
