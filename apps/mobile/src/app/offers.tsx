// Trade offers between friends in an online league: offers made to you
// (accept or decline), the ones you've made (withdraw), and how recent ones
// ended. Accepting makes the trade on the server if it still works.
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { teamName } from "@dynasty/sim";
import { Button, Card, SectionTitle } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { api, type TradeOffer } from "../online/api";
import { describeSide, useOffers } from "../online/offers";
import { useTheme, type Theme } from "../theme";

const ENDED: Record<TradeOffer["status"], string> = {
  open: "Open",
  accepting: "Being made…",
  accepted: "Accepted: the trade was made",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
  failed: "Couldn't be made",
};

export default function OffersScreen() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { userTeam } = useLeague();
  const { offers, reload } = useOffers();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const o = d.online;
  if (!o) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: t.muted }}>Trade offers are for online leagues.</Text>
      </View>
    );
  }

  const answer = async (offer: TradeOffer, action: "accept" | "decline" | "withdraw") => {
    setBusy(offer.id);
    setMessage(null);
    try {
      const r = await api.answerOffer(o.id, o.token, offer.id, action);
      if (action === "accept") {
        if (r.offer.status === "accepted") {
          setMessage({ text: "Done: the trade is made.", good: true });
          d.refreshOnline();
        } else setMessage({ text: `It can't be made now: ${r.problems[0] ?? "something changed"}.`, good: false });
      }
    } catch (e) {
      setMessage({ text: (e as Error).message, good: false });
    } finally {
      setBusy(null);
      reload();
    }
  };

  const toYou = offers.filter((x) => x.status === "open" && x.to === userTeam);
  const fromYou = offers.filter((x) => x.status === "open" && x.from === userTeam);
  const past = offers.filter((x) => x.status !== "open");
  return (
    <>
      <Stack.Screen options={{ title: "Trade offers" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ color: t.muted }}>Offers between friends. Make one from Trade by picking a friend's team. Open offers expire when trading closes.</Text>
        {message ? <Text style={{ color: message.good ? t.accent : t.score, fontWeight: "700" }}>{message.text}</Text> : null}
        <Card style={{ gap: 10 }}>
          <SectionTitle>Offers to you</SectionTitle>
          {toYou.length === 0 ? <Text style={{ color: t.muted }}>None right now.</Text> : null}
          {toYou.map((x) => (
            <View key={x.id} style={{ gap: 6 }}>
              <OfferLines offer={x} you={userTeam} theme={t} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button small primary label={busy === x.id ? "…" : "Accept"} disabled={busy !== null} onPress={() => answer(x, "accept")} />
                <Button small label="Decline" disabled={busy !== null} onPress={() => answer(x, "decline")} />
              </View>
            </View>
          ))}
        </Card>
        <Card style={{ gap: 10 }}>
          <SectionTitle>Your offers</SectionTitle>
          {fromYou.length === 0 ? <Text style={{ color: t.muted }}>None waiting.</Text> : null}
          {fromYou.map((x) => (
            <View key={x.id} style={{ gap: 6 }}>
              <OfferLines offer={x} you={userTeam} theme={t} />
              <View style={{ flexDirection: "row" }}>
                <Button small label="Withdraw" disabled={busy !== null} onPress={() => answer(x, "withdraw")} />
              </View>
            </View>
          ))}
        </Card>
        {past.length > 0 ? (
          <Card style={{ gap: 10 }}>
            <SectionTitle>Recent</SectionTitle>
            {past.map((x) => (
              <View key={x.id} style={{ gap: 2 }}>
                <OfferLines offer={x} you={userTeam} theme={t} />
                <Text style={{ color: x.status === "accepted" ? t.accent : t.muted, fontSize: 12, fontWeight: "600" }}>
                  {ENDED[x.status]}
                  {x.note ? `: ${x.note}` : ""}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
        <Button label="Make an offer" onPress={() => router.push("/trade")} disabled={!d.canTrade} />
      </ScrollView>
    </>
  );
}

function OfferLines({ offer, you, theme: t }: { offer: TradeOffer; you: string; theme: Theme }) {
  const { league, playerById } = useLeague();
  const find = (id: string) => playerById.get(id);
  const p = offer.proposal;
  const name = (abbr: string) => (abbr === you ? "You" : league.teams[abbr] ? teamName(league.teams[abbr]!) : abbr);
  const gives = describeSide(p.give, p.givePicks, offer.from, find);
  const gets = describeSide(p.get, p.getPicks, offer.to, find);
  return (
    <View>
      <Text style={{ color: t.text, fontWeight: "700" }}>
        {name(offer.from)} → {name(offer.to)}
      </Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>{offer.from === you ? "You send" : `${offer.from} sends`}</Text>
      {gives.map((line) => (
        <Text key={line} style={{ color: t.text, fontSize: 13 }}>
          {line}
        </Text>
      ))}
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>{offer.to === you ? "You send" : `${offer.to} sends`}</Text>
      {gets.map((line) => (
        <Text key={line} style={{ color: t.text, fontSize: 13 }}>
          {line}
        </Text>
      ))}
    </View>
  );
}
