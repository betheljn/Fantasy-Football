// One online league: the lobby, then the season (ready up, scores). Once the
// season is on, the league opens in the app's own screens from here.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Button, Card } from "../../components/ui";
import { useDynasty } from "../../league/LeagueProvider";
import type { OnlineLeague } from "../../online/api";
import { OnlineLeagueView } from "../../online/OnlineLeague";
import { myLeagues, type MyLeague } from "../../online/store";
import { useTheme } from "../../theme";

export default function OnlineLeagueScreen() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [me, setMe] = useState<MyLeague | null | undefined>(undefined);
  const [league, setLeague] = useState<OnlineLeague | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    myLeagues().then((all) => setMe(all.find((l) => l.id === id) ?? null));
  }, [id]);
  // Opened: over to the hub, where the league's screens are.
  useEffect(() => {
    if (opening && d.phase === "online" && d.online?.id === id) router.replace("/");
  }, [opening, d.phase, d.online?.id, id, router]);

  if (me === undefined) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;
  if (me === null) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: t.muted }}>This phone isn't signed in to that league.</Text>
      </View>
    );
  }
  const team = league?.members.find((m) => m.id === me.memberId)?.team;
  return (
    <>
      <Stack.Screen options={{ title: league?.name ?? me.name }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {league?.phase === "season" && team ? (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: t.text }}>Open the league in the app: standings, schedule, Top 25, every team and player, box scores and replays.</Text>
            <Button label={d.onlineOpening ? "Opening…" : "Open the league"} primary disabled={d.onlineOpening} onPress={() => (setOpening(true), d.openOnline(me, team))} />
            {opening && d.onlineError ? <Text style={{ color: t.score }}>{d.onlineError}</Text> : null}
          </Card>
        ) : null}
        <OnlineLeagueView me={me} onLeague={setLeague} />
      </ScrollView>
    </>
  );
}
