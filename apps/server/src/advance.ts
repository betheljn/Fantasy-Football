// Advancing a league in the database: when every member has readied up, when
// the deadline passes, or when the commissioner says so. One advance at a time
// per league; the save's version guards against two servers racing.
import type { Db } from "./db.ts";
import { advance, type AdvanceSummary } from "./season.ts";
import { decodeState, encodeState } from "./state.ts";

const HOUR_MS = 60 * 60 * 1000;
const busy = new Set<string>();

export const deadlineAfter = (now: Date, weekHours: number) => new Date(now.getTime() + weekHours * HOUR_MS);

/**
 * Play the league's next step (a week, the playoffs or the offseason). Members'
 * ready flags reset and the next deadline is set. Null when the league isn't
 * in a season or another advance got there first.
 */
export async function advanceLeague(db: Db, leagueId: string, now = new Date()): Promise<AdvanceSummary | null> {
  if (busy.has(leagueId)) return null;
  busy.add(leagueId);
  try {
    const league = await db.league.findUnique({ where: { id: leagueId }, include: { members: true, save: true } });
    if (!league?.save || league.phase !== "season") return null;
    const ready = new Set(league.members.filter((m) => m.ready && m.team).map((m) => m.team!));
    const { state, summary } = advance(decodeState(league.save.data), ready);
    const data = encodeState(state);
    const done = await db.$transaction(async (tx) => {
      const saved = await tx.leagueSave.updateMany({ where: { leagueId, version: league.save!.version }, data: { data, version: { increment: 1 } } });
      if (saved.count === 0) return false;
      await tx.member.updateMany({ where: { leagueId }, data: { ready: false } });
      await tx.league.update({ where: { id: leagueId }, data: { deadline: deadlineAfter(now, league.weekHours) } });
      return true;
    });
    return done ? summary : null;
  } finally {
    busy.delete(leagueId);
  }
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
