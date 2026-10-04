// Home while an online league is open: the week (ready up, the commissioner's
// push, your games' scores) and one list of everything waiting on you (the
// offseason call, offers from friends, roster holes). Your moves live in the
// Team tab; the league in the League tab.
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { IR_MIN_WEEKS, STAGE_CHOICE_KEY } from "@dynasty/sim";
import { Card, Icon, NavGroup, NavRow, Swatch, type IconName } from "../components/ui";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";
import { OnlineLeagueView, STAGE_NAMES } from "./OnlineLeague";
import { useOffers } from "./offers";

export function OnlineHub() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, records, schedule, weeksPlayed } = useLeague();
  const router = useRouter();
  const me = d.online;
  const { offers } = useOffers();
  if (!me) return null;
  const team = league.teams[userTeam]!;
  const rec = records.get(userTeam);
  // Everything waiting on you: the offseason call, offers from friends, roster holes.
  const waiting = offers.filter((x) => x.status === "open" && x.to === userTeam).length;
  const long = d.canMakeMoves ? team.roster.filter((p) => (p.injury?.weeks ?? 0) >= IR_MIN_WEEKS) : [];
  const open = d.canMakeMoves ? 72 - team.roster.length : 0;
  const off = me.offseason;
  const madeCall = off ? !!off.choices[STAGE_CHOICE_KEY[off.stage]]?.[me.team] : false;
  const items: Array<{ key: string; icon: IconName; title: string; detail: string; go: string }> = [];
  // Your game this week, if it's against an AI team: coach it (the league plays it with your calls).
  const next = d.canMakeMoves ? schedule.games.find((g) => g.week === weeksPlayed + 1 && (g.home === userTeam || g.away === userTeam)) : undefined;
  const opp = next ? (next.home === userTeam ? next.away : next.home) : null;
  if (next && opp && !me.humans[opp]) {
    const started = d.coaching?.game === next.id;
    items.push({ key: "coach", icon: "american-football-outline", title: started ? "Keep coaching your game" : `Coach your game ${next.home === userTeam ? "vs" : "at"} ${opp}`, detail: started ? "Your calls so far are with the league" : "Make the calls; the league plays it with them when the week is played", go: `/coach/${next.id}` });
  }
  if (off && !madeCall) items.push({ key: "call", icon: "clipboard-outline", title: `Offseason: ${STAGE_NAMES[off.stage]}`, detail: "Make your call, or the AI makes it when the stage closes", go: "/offseason" });
  if (off && madeCall) items.push({ key: "call", icon: "checkmark-done-outline", title: `Offseason: ${STAGE_NAMES[off.stage]}`, detail: "Your call is in. Change it until the stage closes", go: "/offseason" });
  if (waiting) items.push({ key: "offers", icon: "mail-unread-outline", title: `${waiting} trade offer${waiting === 1 ? "" : "s"} from friends`, detail: "Accept or decline", go: "/offers" });
  if (long.length) items.push({ key: "ir", icon: "medkit-outline", title: `${long.length} could go on injured reserve`, detail: long.map((p) => `${p.position} ${p.lastName}`).join(", "), go: "/injuries" });
  if (open > 0) items.push({ key: "sign", icon: "person-add-outline", title: `${open} open roster spot${open === 1 ? "" : "s"}`, detail: "Sign a free agent", go: "/freeagents" });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Swatch abbr={userTeam} size={18} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>
            {team.state} {team.nickname}
          </Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {me.name} · online · {league.season}
            {rec ? ` · ${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ""}` : ""}
          </Text>
        </View>
      </View>
      {d.onlineError ? (
        <Card style={{ borderColor: t.score, borderWidth: 1 }}>
          <Text style={{ color: t.score, fontWeight: "700" }}>{d.onlineError}</Text>
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Your team now shows the league as the server has it.</Text>
        </Card>
      ) : null}
      <OnlineLeagueView me={me} inApp />
      <NavGroup title={items.length ? `Needs you · ${items.length}` : "Needs you"}>
        {items.length === 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
            <Icon name="checkmark-circle-outline" color={t.accent} />
            <Text style={{ color: t.muted }}>You're all caught up.</Text>
          </View>
        ) : (
          items.map((x, i) => <NavRow key={x.key} icon={x.icon} title={x.title} detail={x.detail} badge={x.key === "offers" ? String(waiting) : undefined} onPress={() => router.push(x.go as never)} last={i === items.length - 1} />)
        )}
      </NavGroup>
    </ScrollView>
  );
}
