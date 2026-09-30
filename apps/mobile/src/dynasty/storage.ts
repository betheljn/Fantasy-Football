// Save slot on the phone: one JSON file in the app's documents folder.
// (storage.web.ts is the browser version.)
import { File, Paths } from "expo-file-system";

const file = () => new File(Paths.document, "dynasty-save.json");

export async function saveText(text: string): Promise<void> {
  file().write(text);
}

export async function loadText(): Promise<string | null> {
  const f = file();
  return f.exists ? f.text() : null;
}

export async function clearSave(): Promise<void> {
  const f = file();
  if (f.exists) f.delete();
}
