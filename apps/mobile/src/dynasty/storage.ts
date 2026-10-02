// Saves on the phone: one JSON file per key in the app's documents folder
// (each save slot, its offseason checkpoint, and the slot list).
// (storage.web.ts is the browser version.)
import { File, Paths } from "expo-file-system";

const file = (key: string) => new File(Paths.document, `${key}.json`);
/** Where the one save lived before save slots. */
export const LEGACY_KEY = "dynasty-save";

export async function saveText(key: string, text: string): Promise<void> {
  file(key).write(text);
}

export async function loadText(key: string): Promise<string | null> {
  const f = file(key);
  return f.exists ? f.text() : null;
}

export async function removeText(key: string): Promise<void> {
  const f = file(key);
  if (f.exists) f.delete();
}

