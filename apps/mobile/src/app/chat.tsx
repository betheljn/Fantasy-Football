// League chat (online leagues): friends' messages and the league's own posts,
// newest at the bottom, live as they arrive. Remove your own messages; the
// commissioner can remove anyone's. Opened from an online league in the app,
// or from a league's page by its id (?league=).
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useDynasty } from "../league/LeagueProvider";
import { api, type ChatMessage } from "../online/api";
import { useLeagueChat } from "../online/chat";
import { myLeagues, type MyLeague } from "../online/store";
import { useTheme, type Theme } from "../theme";

const MAX = 500;

/** "Tue 7:42 PM", or "Oct 3" for older ones. */
function when(iso: string): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  return days < 6 ? d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ChatScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league: leagueId } = useLocalSearchParams<{ league?: string }>();
  const [me, setMe] = useState<MyLeague | null>(d.online && (!leagueId || d.online.id === leagueId) ? d.online : null);
  useEffect(() => {
    if (me || !leagueId) return;
    myLeagues().then((ls) => setMe(ls.find((l) => l.id === leagueId) ?? null));
  }, [me, leagueId]);
  const chat = useLeagueChat(me);
  const [commish, setCommish] = useState(false);
  const [title, setTitle] = useState("League chat");
  useEffect(() => {
    if (!me) return;
    api.league(me.id, me.token).then((l) => {
      setCommish(!!l.members.find((m) => m.id === me.memberId)?.isCommissioner);
      setTitle(`${l.name} chat`);
    }, () => {});
  }, [me]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);

  if (!me) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: t.muted }}>League chat is for online leagues.</Text>
      </View>
    );
  }
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    if (await chat.send(body)) setDraft("");
    setSending(false);
  };
  const canRemove = (m: ChatMessage) => !m.removed && m.kind === "chat" && (m.memberId === me.memberId || commish);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderColor: t.border }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: chat.live ? t.accent : t.muted }} />
        <Text style={{ color: t.muted, fontSize: 12 }}>{chat.live ? "Live" : "Connecting…"}</Text>
        {chat.error ? <Text style={{ color: t.score, fontSize: 12, flex: 1, textAlign: "right" }} numberOfLines={1}>{chat.error}</Text> : null}
      </View>
      <FlatList
        inverted
        data={chat.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        onEndReached={chat.loadOlder}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={chat.loading ? null : <Text style={{ color: t.muted, textAlign: "center", padding: 24, transform: [{ scaleY: -1 }] }}>No messages yet. Say something.</Text>}
        renderItem={({ item }) => (
          <Message
            m={item}
            mine={item.memberId === me.memberId}
            removable={canRemove(item)}
            armed={armed === item.id}
            onRemove={() => (armed === item.id ? (chat.remove(item.id), setArmed(null)) : setArmed(item.id))}
            theme={t}
          />
        )}
      />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderColor: t.border, backgroundColor: t.card }}>
        <TextInput
          value={draft}
          onChangeText={(v) => setDraft(v.slice(0, MAX))}
          placeholder="Message the league"
          placeholderTextColor={t.muted}
          multiline
          accessibilityLabel="Message"
          style={{ flex: 1, maxHeight: 110, minHeight: 40, color: t.text, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: t.bg }}
        />
        <Pressable onPress={send} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send" style={{ height: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: "center", backgroundColor: t.accent, opacity: !draft.trim() || sending ? 0.4 : 1 }}>
          <Text style={{ color: t.onAccent, fontWeight: "800" }}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Message({ m, mine, removable, armed, onRemove, theme: t }: { m: ChatMessage; mine: boolean; removable: boolean; armed: boolean; onRemove: () => void; theme: Theme }) {
  if (m.kind === "post") {
    // The league's own posts: a quiet card across the middle.
    return (
      <View style={{ alignSelf: "stretch", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.card }}>
        <Text style={{ color: t.accent, fontWeight: "800", fontSize: 11, letterSpacing: 1 }}>THE LEAGUE · {when(m.createdAt).toUpperCase()}</Text>
        <Text style={{ color: t.text, marginTop: 4, lineHeight: 20 }}>{m.body}</Text>
      </View>
    );
  }
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
      {!mine ? <Text style={{ color: t.muted, fontSize: 12, marginBottom: 2 }}>{m.author}</Text> : null}
      <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: mine ? t.accent : t.card, borderWidth: mine ? 0 : 1, borderColor: t.border }}>
        {m.removed ? (
          <Text style={{ color: mine ? t.onAccent : t.muted, fontStyle: "italic" }}>Message removed</Text>
        ) : (
          <Text style={{ color: mine ? t.onAccent : t.text, lineHeight: 20 }}>{m.body}</Text>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 10, justifyContent: mine ? "flex-end" : "flex-start", marginTop: 2 }}>
        <Text style={{ color: t.muted, fontSize: 11 }}>{when(m.createdAt)}</Text>
        {removable ? (
          <Text onPress={onRemove} accessibilityRole="button" style={{ color: armed ? t.score : t.muted, fontSize: 11, fontWeight: armed ? "800" : "400" }}>
            {armed ? "Tap again to remove" : "Remove"}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
