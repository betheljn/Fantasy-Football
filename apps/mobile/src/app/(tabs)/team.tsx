// Your team: everything about running it, each with a line on what's there now.
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { TRADE_DEADLINE_WEEK, formatRecord, teamName } from "@dynasty/sim";
import { NavGroup, NavRow, Swatch } from "../../components/ui";
import { useDynasty, useLeague } from "../../league/LeagueProvider";
import { useOffers } from "../../online/offers";
import { useTheme } from "../../theme";

export default function TeamTab() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const { league, userTeam, records, weeksPlayed } = useLeague();
  const { offers } = useOffers();
  const team = league.teams[userTeam]!;
  const rec = records.get(userTeam);
  const hurt = team.roster.filter((p) => (p.injury?.weeks ?? 0) > 0).length + (team.reserve?.length ?? 0);
  const waiting = offers.filter((x) => x.status === "open" && x.to === userTeam).length;
  const solo = !d.online;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Swatch abbr={userTeam} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: "800" }}>{teamName(team)}</Text>
          <Text style={{ color: t.muted }}>
            {league.season} season · {rec ? formatRecord(rec) : "0-0"} · {team.roster.length} players
          </Text>
        </View>
      </View>

      <NavGroup title="Roster">
        <NavRow icon="people-outline" title="Roster and schedule" detail="Players, staff, payroll and every game" onPress={() => router.push(`/team/${userTeam}`)} />
        <NavRow icon="git-network-outline" title="Depth chart" detail={d.canEditDepthChart ? "Set your starters" : "Locked until the regular season"} onPress={() => router.push("/depth")} />
        <NavRow icon="medkit-outline" title="Injuries" detail={hurt ? `${hurt} hurt or on injured reserve` : "Everyone's healthy"} badge={hurt ? String(hurt) : undefined} onPress={() => router.push("/injuries")} last={!d.canMakeMoves} />
        {d.canMakeMoves ? (
          <NavRow icon="person-add-outline" title="Free agents" detail={`${(league.freeAgents ?? []).length} available to sign`} onPress={() => router.push("/freeagents")} last />
        ) : null}
      </NavGroup>

      <NavGroup title="Deals">
        <NavRow
          icon="swap-horizontal-outline"
          title="Trades"
          detail={d.canTrade ? (d.tradeWindow?.week === 0 ? "Draft week: trades open" : `Open through week ${TRADE_DEADLINE_WEEK}`) : "Trading is closed right now"}
          onPress={() => router.push("/trade")}
          last={solo}
        />
        {!solo ? <NavRow icon="mail-outline" title="Trade offers" detail="Offers between friends" badge={waiting ? String(waiting) : undefined} onPress={() => router.push("/offers")} last /> : null}
      </NavGroup>

      {solo && d.scouting ? (
        <NavGroup title="Next year's draft">
          <NavRow icon="search-outline" title="Scouting" detail={weeksPlayed > 0 ? "Your board and this week's points" : "Spend your scouting points each week"} onPress={() => router.push("/scouting")} last />
        </NavGroup>
      ) : null}
    </ScrollView>
  );
}
