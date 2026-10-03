// Changing a league's save in the database: advancing it (when every member has
// readied up, when the deadline passes, or when the commissioner says so) and
// friends' own moves. One change at a time per league; the save's version
// guards against two servers racing.
import type { Db } from "./db.ts";
import { tradeWindowOf } from "./moves.ts";
import { advance, type AdvanceSummary } from "./season.ts";
import { decodeState, encodeState, type LeagueState } from "./state.ts";

const HOUR_MS = 60 * 60 * 1000;
const busy = new Set<string>();

export const deadlineAfter = (now: Date, weekHours: number) => new Date(now.getTime() + weekHours * HOUR_MS);

/**
 * Change a league's save under its lock: `change` gets the state and the
 * league's members and returns the new state (or null to leave it), plus
 * anything to report. Null when the league is busy (an advance or another
 * change) or changed underneath (the version moved).
 */
export async function changeLeague<R>(
  db: Db,
  leagueId: string,
  change: (state: LeagueState, league: LeagueRow) => { state: LeagueState | null; result: R; resetWeek?: boolean },
  now = new Date(),
): Promise<{ result: R; version: number } | null> {
  if (busy.has(leagueId)) return null;
  busy.add(leagueId);
  try {
    const league = await db.league.findUnique({ where: { id: leagueId }, include: { members: true, save: true } });
    if (!league?.save) return null;
    const { state, result, resetWeek } = change(decodeState(league.save.data), league);
    if (!state) return { result, version: league.save.version };
    const data = encodeState(state);
    const done = await db.$transaction(async (tx) => {
      const saved = await tx.leagueSave.updateMany({ where: { leagueId, version: league.save!.version }, data: { data, version: { increment: 1 } } });
      if (saved.count === 0) return false;
      if (resetWeek) {
        await tx.member.updateMany({ where: { leagueId }, data: { ready: false } });
        await tx.league.update({ where: { id: leagueId }, data: { deadline: deadlineAfter(now, league.weekHours) } });
      }
      return true;
    });
    return done ? { result, version: league.save.version + 1 } : null;
  } finally {
    busy.delete(leagueId);
  }
}

type LeagueRow = NonNullable<Awaited<ReturnType<Db["league"]["findUnique"]>>> & { members: Array<{ team: string | null; ready: boolean }> };

/**
 * Play the league's next step (a week, the playoffs or the offseason). Members'
 * ready flags reset and the next deadline is set. Null when the league isn't
 * in a season or another change got there first.
 */
export async function advanceLeague(db: Db, leagueId: string, now = new Date()): Promise<AdvanceSummary | null> {
  const r = await changeLeague<{ summary: AdvanceSummary; tradesOpen: boolean } | null>(
    db,
    leagueId,
    (state, league) => {
      if (league.phase !== "season") return { state: null, result: null };
      const ready = new Set(league.members.filter((m) => m.ready && m.team).map((m) => m.team!));
      const a = advance(state, ready);
      // Offers between friends last while trading stays open (not past the deadline, nor into a new season).
      const tradesOpen = a.summary.kind !== "offseason" && tradeWindowOf(a.state) !== null;
      return { state: a.state, result: { summary: a.summary, tradesOpen }, resetWeek: true };
    },
    now,
  );
  if (!r?.result) return null;
  if (!r.result.tradesOpen) {
    await db.tradeOffer.updateMany({ where: { leagueId, status: "open" }, data: { status: "expired", note: "Trading closed before it was answered." } });
  }
  return r.result.summary;
}

/** Advance every league whose deadline has passed (run on a timer). */
export async function advanceOverdue(db: Db, now = new Date()): Promise<Array<{ leagueId: string; summary: AdvanceSummary }>> {
  const due = await db.league.findMany({ where: { phase: "season", deadline: { lte: now } }, select: { id: true } });
  const out: Array<{ leagueId: string; summary: AdvanceSummary }> = [];
  for (const { id } of due) {
    const summary = await advanceLeague(db, id, now);
    if (summary) out.push({ leagueId: id, summary });
  }
  return out;
}
