// Online lobby: make the team you claimed yours (look, then head coach). The
// server checks it (a friend's name or logo is off limits) and makes it when
// the league starts.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { fromSaveJson, type CoachBuild, type Dynasty, type TeamIdentityChoice } from "@dynasty/sim";
import { Button } from "../../../components/ui";
import { api, type OnlineLeague, type OnlineSetup } from "../../../online/api";
import { myLeagues, type MyLeague } from "../../../online/store";
import { CoachBuilderScreen } from "../../../screens/CoachBuilderScreen";
import { MakeItYours, type FriendTeams } from "../../../screens/TeamSetupScreen";
import { useTheme } from "../../../theme";

interface Loaded {
  me: MyLeague;
  view: OnlineLeague;
  dynasty: Dynasty;
  mine: OnlineSetup | null;
}

export default function OnlineTeamSetupScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<TeamIdentityChoice | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const me = (await myLeagues()).find((l) => l.id === id);
      if (!me) throw new Error("This phone isn't signed in to that league.");
      const [view, save, mine] = await Promise.all([api.league(me.id, me.token), api.save(me.id, me.token), api.mySetup(me.id, me.token)]);
      setLoaded({ me, view, dynasty: fromSaveJson<{ dynasty: Dynasty }>(save.text).dynasty, mine: mine.setup });
    })().catch((e: Error) => setError(e.message));
  }, [id]);

  const self = loaded?.view.members.find((m) => m.id === loaded.me.memberId);
  const team = self?.team ? loaded?.dynasty.league.teams[self.team] : undefined;
  // The other friends' teams, as they've set them up: off limits.
  const friends = useMemo((): FriendTeams => {
    if (!loaded) return {};
    const out: FriendTeams = {};
    for (const x of loaded.view.teams) {
      if (!x.claimedBy || x.claimedBy === loaded.me.memberId) continue;
      out[x.abbr] = { identity: { nickname: x.nickname, logo: x.logo, tag: x.tag }, owner: loaded.view.members.find((m) => m.id === x.claimedBy)?.displayName ?? x.abbr };
    }
    return out;
  }, [loaded]);

  const save = async (coach: CoachBuild) => {
    if (!loaded || !identity) return;
    setSaving(true);
    setError(null);
    try {
      await api.setup(loaded.me.id, loaded.me.token, { identity, coach });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const header = <Stack.Screen options={{ title: "Make it yours" }} />;
  if (error && !loaded) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        {header}
        <Text style={{ color: t.score }}>{error}</Text>
        <Button label="Back to the lobby" onPress={() => router.back()} />
      </View>
    );
  }
  const spinner = (
    <View>
      {header}
      <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />
    </View>
  );
  if (!loaded) return spinner;
  if (!team) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        {header}
        <Text style={{ color: t.muted }}>Claim a state in the lobby first.</Text>
        <Button label="Back to the lobby" onPress={() => router.back()} />
      </View>
    );
  }
  if (saving) return spinner;

  return (
    <View style={{ flex: 1 }}>
      {header}
      {error ? <Text style={{ color: t.score, padding: 12, fontWeight: "600" }}>{error}</Text> : null}
      <View style={{ flex: 1, display: identity ? "none" : "flex" }}>
        <MakeItYours
          league={loaded.dynasty.league}
          team={team}
          initial={loaded.mine?.identity}
          friends={friends}
          backLabel="Lobby"
          onBack={() => router.back()}
          onDone={(_abbr, _role, chosen) => setIdentity(chosen)}
        />
      </View>
      {identity ? (
        <CoachBuilderScreen
          league={loaded.dynasty.league}
          abbr={team.abbr}
          teamLabel={`${identity.city?.trim() || team.state} ${identity.nickname.trim()}`}
          initial={loaded.mine?.coach}
          onBack={() => setIdentity(null)}
          onDone={save}
          doneLabel={(name) => `Hire coach ${name} and save my team`}
        />
      ) : null}
    </View>
  );
}
