// The offseason in stages, for an online league: each friend makes their calls
// stage by stage (staff, hires, re-signings, draft board, free agency, cuts),
// and anyone who doesn't is left to the AI. Only the calls are kept; the
// offseason is worked out again from the season's end each time, so the
// server (which runs it) and the phones (which show each friend their plans)
// always land in the same place.
import type { FreeAgentOffer } from "../contracts/offseason.ts";
import type { PlayerId } from "../model/player.ts";
import type { DraftResult } from "./draft.ts";
import {
  beginOffseason,
  completeOffseason,
  draftWithBoards,
  offseasonStaffReleases,
  resolveContracts,
  runOffseasonFreeAgency,
  type Dynasty,
  type OffseasonLog,
  type OffseasonState,
  type PlayedSeason,
} from "./dynasty.ts";
import type { StaffReleases, StaffSlot } from "./staffcareers.ts";

export const OFFSEASON_STAGES = ["staff", "hire", "resign", "draft", "freeagency", "cuts"] as const;
export type OffseasonStage = (typeof OFFSEASON_STAGES)[number];

/** Every friend's calls so far, by stage and team (plain data, so it saves as is). */
export interface StagedChoices {
  staff?: Record<string, { fire: StaffSlot[]; renew: StaffSlot[] }>;
  hires?: Record<string, Array<[StaffSlot, string]>>;
  resign?: Record<string, PlayerId[]>;
  /** Ranked draft boards: the first prospect still there is the pick. */
  boards?: Record<string, PlayerId[]>;
  freeAgency?: Record<string, { offers: Array<[PlayerId, FreeAgentOffer]>; frontOffice: boolean }>;
  cuts?: Record<string, PlayerId[]>;
}

/** Which part of the calls each stage fills. */
export const STAGE_CHOICE_KEY = { staff: "staff", hire: "hires", resign: "resign", draft: "boards", freeagency: "freeAgency", cuts: "cuts" } as const satisfies Record<OffseasonStage, keyof StagedChoices>;

const entries = <T>(r: Record<string, T> | undefined) => Object.entries(r ?? {}).sort(([a], [b]) => a.localeCompare(b));

const staffDecisions = (c: StagedChoices) => entries(c.staff).map(([team, d]) => ({ team, fire: new Set(d.fire), renew: new Set(d.renew) }));
const staffHires = (c: StagedChoices) => entries(c.hires).map(([team, picks]) => ({ team, picks: new Map(picks) }));

/** Where the offseason stands at a stage: what that stage's plans are worked out from. */
export interface StagedOffseason {
  /** Staff after departures (everyone's decisions), before hiring: the hire stage's candidates. */
  releases?: StaffReleases;
  /** The offseason so far (from the re-signing stage on). */
  state?: OffseasonState;
  /** The draft (from the free-agency stage on). */
  draft?: DraftResult;
}

/**
 * The offseason worked out up to (not including) `stage`: everything before
 * it done with everyone's calls, so `stage`'s plans can be shown.
 */
export function stagedOffseason(dynasty: Dynasty, played: PlayedSeason, choices: StagedChoices, stage: OffseasonStage): StagedOffseason {
  const at = OFFSEASON_STAGES.indexOf(stage);
  if (at <= 0) return {};
  const decisions = staffDecisions(choices);
  if (at === 1) return { releases: offseasonStaffReleases(dynasty, played, decisions) };
  let state = beginOffseason(dynasty, played, { decisions, hires: staffHires(choices) });
  if (at === 2) return { state };
  state = resolveContracts(state, entries(choices.resign).map(([team, keep]) => ({ team, keep: new Set(keep) })));
  if (at === 3) return { state };
  const draft = draftWithBoards(state, new Map(entries(choices.boards)));
  if (at === 4) return { state, draft };
  state = runOffseasonFreeAgency(
    state,
    draft,
    entries(choices.freeAgency).map(([team, f]) => ({ team, offers: new Map(f.offers), frontOffice: f.frontOffice })),
  );
  return { state, draft };
}

/** The whole offseason with everyone's calls: next season's dynasty. */
export function finishStagedOffseason(dynasty: Dynasty, played: PlayedSeason, choices: StagedChoices): { dynasty: Dynasty; log: OffseasonLog } {
  const { state, draft } = stagedOffseason(dynasty, played, choices, "cuts");
  return completeOffseason(
    state!,
    draft!,
    entries(choices.freeAgency).map(([team, f]) => ({ team, offers: new Map(f.offers), frontOffice: f.frontOffice })),
    entries(choices.cuts).map(([team, players]) => ({ team, players: new Set(players) })),
  );
}
