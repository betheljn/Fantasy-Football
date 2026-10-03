// Trade offers between friends, as the app shows them: kept fresh while a
// screen is open, and each side described from the league on the phone.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { parsePickId, playerOverall, type Player, type Team } from "@dynasty/sim";
import { useDynasty } from "../league/LeagueProvider";
import { api, type TradeOffer } from "./api";

const POLL_MS = 15_000;

/** Your offers (sent and received), refreshed every so often while the screen is up. */
export function useOffers(): { offers: TradeOffer[]; reload: () => void } {
  const d = useDynasty();
  const o = d.online;
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const reload = useCallback(() => {
    if (o) api.offers(o.id, o.token).then((r) => setOffers(r.offers), () => {});
  }, [o?.id, o?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(reload);
  useEffect(() => {
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);
  return { offers, reload };
}

/** One side of a trade in words: its players (by name, if still on the phone's league) and picks. */
export function describeSide(ids: readonly string[], picks: readonly string[] | undefined, owner: string, find: (id: string) => { player: Player; team: Team } | undefined): string[] {
  const players = ids.map((id) => {
    const p = find(id)?.player;
    return p ? `${p.position} ${p.firstName} ${p.lastName} (${playerOverall(p)})` : "a player no longer there";
  });
  const pickLines = (picks ?? []).map((id) => {
    const p = parsePickId(id);
    return p ? `${p.draft} round ${p.round} pick${p.original !== owner ? ` (from ${p.original})` : ""}` : id;
  });
  return [...players, ...pickLines];
}
