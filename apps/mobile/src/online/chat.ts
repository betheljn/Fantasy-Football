// The league's chat on the phone: the latest messages (and older ones on
// request), kept up to date over the league's live connection, which signs in
// with your token as its first message and reconnects if it drops. Posting and
// removing go through the server like any request.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, liveUrl, type ChatEvent, type ChatMessage } from "./api";
import type { MyLeague } from "./store";

export interface LeagueChat {
  /** Newest first. */
  messages: ChatMessage[];
  more: boolean;
  loading: boolean;
  /** The live connection is up. */
  live: boolean;
  error: string | null;
  send: (body: string) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  loadOlder: () => Promise<void>;
}

/** Newest first, each message once (a later copy, e.g. removed, wins). */
function merge(have: readonly ChatMessage[], add: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map(have.map((m) => [m.id, m]));
  for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
}

export function useLeagueChat(me: MyLeague | null): LeagueChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oldest = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const page = await api.chat(me.id, me.token);
      setMessages((m) => merge(m, page.messages));
      setMore(page.more);
      oldest.current = page.messages.at(-1)?.id;
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [me]);

  // The live connection, reconnecting with a growing pause if it drops (and catching up when it's back).
  useEffect(() => {
    if (!me) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let wait = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      ws = new WebSocket(liveUrl(me.id));
      ws.onopen = () => ws?.send(JSON.stringify({ type: "auth", token: me.token }));
      ws.onmessage = (e) => {
        let ev: ChatEvent;
        try {
          ev = JSON.parse(String(e.data)) as ChatEvent;
        } catch {
          return;
        }
        if (ev.type === "ready") {
          setLive(true);
          wait = 1000;
          load();
        } else if (ev.type === "message") setMessages((m) => merge(m, [ev.message]));
        else if (ev.type === "removed") setMessages((m) => m.map((x) => (x.id === ev.id ? { ...x, removed: true, body: "" } : x)));
        else if (ev.type === "error") setError(ev.error);
      };
      ws.onclose = () => {
        setLive(false);
        if (closed) return;
        timer = setTimeout(connect, wait);
        wait = Math.min(30_000, wait * 2);
      };
    };
    load();
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [me, load]);

  const send = useCallback(
    async (body: string) => {
      if (!me) return false;
      try {
        const r = await api.sendChat(me.id, me.token, body);
        setMessages((m) => merge(m, [r.message]));
        setError(null);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [me],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!me) return;
      try {
        await api.removeChat(me.id, me.token, id);
        setMessages((m) => m.map((x) => (x.id === id ? { ...x, removed: true, body: "" } : x)));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [me],
  );

  const loadOlder = useCallback(async () => {
    if (!me || !more || !oldest.current) return;
    try {
      const page = await api.chat(me.id, me.token, oldest.current);
      setMessages((m) => merge(m, page.messages));
      setMore(page.more);
      oldest.current = page.messages.at(-1)?.id ?? oldest.current;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me, more]);

  return { messages, more, loading, live, error, send, remove, loadOlder };
}
