// The online leagues you're in, kept on this phone: each league's id and name,
// your display name, and your device token (the server's only proof it's you).
import { loadText, saveText } from "../dynasty/storage";

const KEY = "online-leagues";

export interface MyLeague {
  id: string;
  name: string;
  displayName: string;
  memberId: string;
  token: string;
}

export async function myLeagues(): Promise<MyLeague[]> {
  try {
    const text = await loadText(KEY);
    return text ? (JSON.parse(text) as MyLeague[]) : [];
  } catch {
    return [];
  }
}

export async function rememberLeague(l: MyLeague): Promise<MyLeague[]> {
  const list = [l, ...(await myLeagues()).filter((x) => x.id !== l.id)];
  await saveText(KEY, JSON.stringify(list));
  return list;
}

export async function forgetLeague(id: string): Promise<MyLeague[]> {
  const list = (await myLeagues()).filter((x) => x.id !== id);
  await saveText(KEY, JSON.stringify(list));
  return list;
}

const ACTIVE_KEY = "online-active";

/** The online league open in the app (reopened at launch), or null. */
export async function activeOnline(): Promise<{ id: string; team: string } | null> {
  try {
    const text = await loadText(ACTIVE_KEY);
    return text ? (JSON.parse(text) as { id: string; team: string } | null) : null;
  } catch {
    return null;
  }
}

export async function setActiveOnline(active: { id: string; team: string } | null): Promise<void> {
  await saveText(ACTIVE_KEY, JSON.stringify(active));
}
