// Online leagues: the ones you're in, starting a new one (you're the
// commissioner), and joining a friend's with their invite code.
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, LinkRow, SectionTitle } from "../../components/ui";
import { api, serverUrl } from "../../online/api";
import { myLeagues, rememberLeague, type MyLeague } from "../../online/store";
import { useTheme } from "../../theme";

const WEEK_HOURS = [12, 24, 48];

export default function OnlineLeagues() {
  const t = useTheme();
  const router = useRouter();
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [server, setServer] = useState<"checking" | "up" | "down">("checking");
  const [name, setName] = useState("");
  const [you, setYou] = useState("");
  const [hours, setHours] = useState(24);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      myLeagues().then(setLeagues);
    }, []),
  );
  useEffect(() => {
    api
      .health()
      .then((h) => setServer(h.ok ? "up" : "down"))
      .catch(() => setServer("down"));
  }, []);

  const enter = async (kind: "create" | "join") => {
    setBusy(kind);
    setError(null);
    try {
      const r = kind === "create" ? await api.create(name, you, hours) : await api.join(code, you);
      await rememberLeague({ id: r.league.id, name: r.league.name, displayName: you.trim(), memberId: r.memberId, token: r.token });
      router.push(`/online/${r.league.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Online leagues" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: server === "down" ? t.score : t.muted, fontSize: 12 }}>
          {server === "checking" ? "Checking the league server…" : server === "up" ? `League server: ${serverUrl()}` : `Can't reach the league server at ${serverUrl()}`}
        </Text>

        {leagues.length > 0 ? (
          <Card>
            <SectionTitle>Your leagues</SectionTitle>
            {leagues.map((l) => (
              <LinkRow key={l.id} label={`Open ${l.name}`} onPress={() => router.push(`/online/${l.id}`)}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{l.name}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>as {l.displayName}</Text>
              </LinkRow>
            ))}
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <SectionTitle>Your name</SectionTitle>
          <Field label="Display name (what your friends see)" value={you} onChangeText={setYou} maxLength={24} autoCapitalize="words" placeholder="e.g. Jai" />
        </Card>

        <Card style={{ gap: 10 }}>
          <SectionTitle>Join a friend's league</SectionTitle>
          <Field label="Invite code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={8} autoCapitalize="characters" autoCorrect={false} placeholder="6 letters and numbers" />
          <Button label={busy === "join" ? "Joining…" : "Join league"} onPress={() => enter("join")} primary disabled={!code.trim() || !you.trim() || busy !== null} />
        </Card>

        <Card style={{ gap: 10 }}>
          <SectionTitle>Start a league</SectionTitle>
          <Text style={{ color: t.muted }}>You'll be the commissioner: you share the invite code and start the season once everyone has a state.</Text>
          <Field label="League name" value={name} onChangeText={setName} maxLength={40} placeholder="e.g. Group Chat League" />
          <View style={{ gap: 4 }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>Each week is played after</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {WEEK_HOURS.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setHours(h)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: hours === h }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: hours === h ? t.accent : t.border, backgroundColor: hours === h ? t.accent : "transparent" }}
                >
                  <Text style={{ color: hours === h ? t.onAccent : t.text, fontWeight: "600" }}>{h} hours</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: t.muted, fontSize: 12 }}>…or as soon as everyone readies up.</Text>
          </View>
          <Button label={busy === "create" ? "Building the league…" : "Create league"} onPress={() => enter("create")} primary disabled={!name.trim() || !you.trim() || busy !== null} />
        </Card>

        {error ? <Text style={{ color: t.score, fontWeight: "600" }}>{error}</Text> : null}
      </ScrollView>
    </>
  );
}
