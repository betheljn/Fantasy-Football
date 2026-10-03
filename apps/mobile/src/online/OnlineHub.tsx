// The hub while an online league is open: your team and your moves (depth
// chart, injured reserve, free agents, trades with AI teams, all sent to the
// server), the week (ready up, the commissioner's push, scores that open box
// scores), and the way back out.
// The tabs (standings, schedule, Top 25, teams) work on the league as usual.
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { STAGE_CHOICE_KEY } from "@dynasty/sim";
import { Button, Card, Swatch } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";
import { OnlineLeagueView, STAGE_NAMES } from "./OnlineLeague";
import { useOffers } from "./offers";

export function OnlineHub() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, records } = useLeague();
  const router = useRouter();
  const me = d.online;
  const { offers } = useOffers();
  if (!me) return null;
  const waiting = offers.filter((x) => x.status === "open" && x.to === userTeam).length;
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
          <Button small label="Depth chart" onPress={() => router.push("/depth")} />
          <Button small label="Injuries" onPress={() => router.push("/injuries")} />
          {d.canMakeMoves ? <Button small label="Free agents" onPress={() => router.push("/freeagents")} /> : null}
          {d.canTrade ? <Button small label="Trade" onPress={() => router.push("/trade")} /> : null}
          <Button small primary={waiting > 0} label={waiting > 0 ? `Trade offers (${waiting})` : "Trade offers"} onPress={() => router.push("/offers")} />
          {(d.save?.dynasty.springs ?? []).length > 0 ? <Button small label="Spring season" onPress={() => router.push("/spring")} /> : null}
        </View>
        <Text style={{ color: t.muted, fontSize: 12 }}>
          Your moves go straight to the league. Ready up to keep the AI's hands off your roster; if you don't, it handles your injured reserve and signings when the week is played.
        </Text>
      </Card>
      {me.offseason ? <OffseasonCard /> : null}
      {d.onlineError ? (
        <Card style={{ borderColor: t.score, borderWidth: 1 }}>
          <Text style={{ color: t.score, fontWeight: "700" }}>{d.onlineError}</Text>
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Your team now shows the league as the server has it.</Text>
        </Card>
      ) : null}
      <OnlineLeagueView me={me} inApp />
      <Pressable onPress={d.closeDynasty} accessibilityRole="button" style={{ alignSelf: "center", padding: 8 }}>
        <Text style={{ color: t.accent, fontWeight: "600" }}>Back to your saves</Text>
      </Pressable>
    </ScrollView>
  );
}

/** The open offseason stage: make your call (or change it) before it closes. */
function OffseasonCard() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const off = d.online!.offseason!;
  const made = !!off.choices[STAGE_CHOICE_KEY[off.stage]]?.[d.online!.team];
  return (
    <Card style={{ gap: 8, borderColor: made ? t.border : t.accent, borderWidth: made ? undefined : 1.5 }}>
      <Text style={{ color: t.accent, fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 }}>Offseason: {STAGE_NAMES[off.stage]}</Text>
      <Text style={{ color: t.text }}>
        {made ? "Your call is in. You can change it until the stage closes." : "Make your call before the stage closes, or the AI makes it for you."}
      </Text>
      <Button primary={!made} label={made ? "Change my call" : "Make my call"} onPress={() => router.push("/offseason")} />
    </Card>
  );
}
