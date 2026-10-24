// Online lobby: your program's skill groups. Your region is drawn at random
// by the league (the commissioner can move it); your groups shape your roster.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { SkillGroup } from "@dynasty/sim";
import { api } from "../../../online/api";
import { myLeagues, type MyLeague } from "../../../online/store";
import { SkillGroupsScreen } from "../../../screens/ProgramSetupScreen";
import { useTheme } from "../../../theme";

export default function OnlineProgramScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [me, setMe] = useState<MyLeague | null>(null);
  const [initial, setInitial] = useState<SkillGroup[] | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const mine = (await myLeagues()).find((l) => l.id === id);
      if (!mine) throw new Error("This phone isn't signed in to that league.");
      setMe(mine);
      const view = await api.league(mine.id, mine.token);
      setInitial(view.members.find((m) => m.id === mine.memberId)?.program?.groups);
      setLoaded(true);
    })().catch((e: Error) => setError(e.message));
  }, [id]);

  const save = async (groups: SkillGroup[]) => {
    if (!me) return;
    setSaving(true);
    setError(null);
    try {
      await api.program(me.id, me.token, groups);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const header = <Stack.Screen options={{ title: "Your program" }} />;
  if (!loaded) {
    return (
      <View style={{ padding: 16 }}>
        {header}
        {error ? <Text style={{ color: t.score }}>{error}</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />}
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {header}
      {error ? <Text style={{ color: t.score, padding: 12, fontWeight: "600" }}>{error}</Text> : null}
      {saving ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />
      ) : (
        // Your region is drawn at random by the league (the commissioner can change it): your groups go straight in.
        <SkillGroupsScreen initial={initial} randomRegion onDone={(g) => save(g)} />
      )}
    </View>
  );
}
