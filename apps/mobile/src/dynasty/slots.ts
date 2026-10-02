// Save slots: each holds one dynasty, plus a small checkpoint of your calls in
// an offseason that's under way. A slot list remembers what's in each slot and
// which one you were playing.
import { SLOT_COUNT, deserialize, deserializeProgress, serialize, serializeProgress, type OffseasonProgress, type SaveState, type SlotInfo } from "./save";
import { LEGACY_KEY, loadText, removeText, saveText } from "./storage";

const INDEX = "slots";
const slotKey = (n: number) => `slot${n}`;
const progressKey = (n: number) => `slot${n}-offseason`;

export interface SlotIndex {
  /** The slot you were playing last (opened straight away next time). */
  active: number | null;
  slots: SlotInfo[];
}

async function writeIndex(index: SlotIndex): Promise<void> {
  await saveText(INDEX, JSON.stringify(index));
}

/** The slot list (moving a save from before slots into slot 1 the first time). */
export async function readIndex(): Promise<SlotIndex> {
  const text = await loadText(INDEX);
  if (text) {
    try {
      return JSON.parse(text) as SlotIndex;
    } catch {
      // Fall through and rebuild from the slots themselves.
    }
  }
  const legacy = await loadText(LEGACY_KEY);
  const state = legacy ? deserialize(legacy) : null;
  if (state) {
    await saveText(slotKey(1), serialize(state));
    const index = { active: 1, slots: [slotInfo(1, state, null)] };
    await writeIndex(index);
    await removeText(LEGACY_KEY);
    return index;
  }
  return { active: null, slots: [] };
}

/** The lowest empty slot, or null when all are full. */
export function freeSlot(index: SlotIndex): number | null {
  for (let n = 1; n <= SLOT_COUNT; n++) if (!index.slots.some((s) => s.slot === n)) return n;
  return null;
}

export async function loadSlot(n: number): Promise<{ state: SaveState | null; progress: OffseasonProgress | null }> {
  const [text, progress] = await Promise.all([loadText(slotKey(n)), loadText(progressKey(n))]);
  return { state: text ? deserialize(text) : null, progress: deserializeProgress(progress) };
}

/** Where a dynasty is, for the slot list. */
export function slotInfo(slot: number, s: SaveState, progress: OffseasonProgress | null): SlotInfo {
  const season = s.dynasty.league.season;
  const stage =
    !s.userTeam ? "Choosing a team"
    : s.report ? `${season - 1} offseason report`
    : progress ? `${progress.season} offseason`
    : s.weeksPlayed === 0 ? "Preseason"
    : s.playoffRoundsShown > 0 ? "Playoffs"
    : `Week ${s.weeksPlayed}`;
  return { slot, team: s.userTeam, season, stage, savedAt: Date.now() };
}

async function updateIndex(slot: number, info: SlotInfo | null, active: number | null): Promise<SlotIndex> {
  const index = await readIndex();
  const slots = index.slots.filter((x) => x.slot !== slot);
  const next = { active, slots: (info ? [...slots, info] : slots).sort((a, b) => a.slot - b.slot) };
  await writeIndex(next);
  return next;
}

/** Save the dynasty in a slot (`progress` only labels it; the checkpoint is saved by writeProgress). */
export async function writeSlot(slot: number, state: SaveState, progress: OffseasonProgress | null): Promise<SlotIndex> {
  await saveText(slotKey(slot), serialize(state));
  return updateIndex(slot, slotInfo(slot, state, progress), slot);
}

/** Save just the offseason checkpoint (the league doesn't change mid-offseason). */
export async function writeProgress(slot: number, progress: OffseasonProgress | null): Promise<void> {
  if (progress) await saveText(progressKey(slot), serializeProgress(progress));
  else await removeText(progressKey(slot));
}

/** Refresh a slot's line in the list (e.g. "2034 offseason") without rewriting the save. */
export async function touchSlot(slot: number, state: SaveState, progress: OffseasonProgress | null): Promise<SlotIndex> {
  return updateIndex(slot, slotInfo(slot, state, progress), slot);
}

/** Leave the slot (it stays saved); the start screen opens next time. */
export async function closeSlot(): Promise<SlotIndex> {
  const index = await readIndex();
  const next = { ...index, active: null };
  await writeIndex(next);
  return next;
}

export async function deleteSlot(slot: number): Promise<SlotIndex> {
  await Promise.all([removeText(slotKey(slot)), removeText(progressKey(slot))]);
  return updateIndex(slot, null, null);
}
