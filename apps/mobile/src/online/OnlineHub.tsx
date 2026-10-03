// The hub while an online league is open: your team, the week (ready up, the
// commissioner's push, scores that open box scores), and the way back out.
// The tabs (standings, schedule, Top 25, teams) work on the league as usual.
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Button, Card, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";
import { OnlineLeagueView } from "./OnlineLeague";

export function OnlineHub() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, records } = useLeague();
  const router = useRouter();
  const me = d.online;
  if (!me) return null;
  const team = league.teams[userTeam]!;
  const rec = records.get(userTeam);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Swatch abbr={userTeam} size={18} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>
              {team.state} {team.nickname}
            </Text>
            <Text style={{ color: t.muted }}>
              {me.name} · online · {league.season} season{rec ? ` · ${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ""}` : ""}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button small label="Team page" onPress={() => router.push(`/team/${userTeam}`)} />
          <Button small label="Injuries" onPress={() => router.push("/injuries")} />
          {(d.save?.dynasty.springs ?? []).length > 0 ? <Button small label="Spring season" onPress={() => router.push("/spring")} /> : null}
        </View>
        <Text style={{ color: t.muted, fontSize: 12 }}>The server plays this league. Your own moves (depth chart, injured reserve, signings, trades) come to online leagues next.</Text>
      </Card>
      <OnlineLeagueView me={me} inApp />
      <Pressable onPress={d.closeDynasty} accessibilityRole="button" style={{ alignSelf: "center", padding: 8 }}>
        <Text style={{ color: t.accent, fontWeight: "600" }}>Back to your saves</Text>
      </Pressable>
    </ScrollView>
  );
}
