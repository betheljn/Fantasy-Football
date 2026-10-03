// The talk around the league: headlines, the weekly radio show, and picks.
import { useRouter } from "expo-router";
import { ScrollView, Text } from "react-native";
import { NavGroup, NavRow } from "../../components/ui";
import { useDynasty } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export default function MediaTab() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const news = d.save?.news ?? [];
  const top = [...news].sort((a, b) => b.week - a.week || b.importance - a.importance)[0];
  const shows = d.save?.radio?.shows ?? [];
  const solo = !d.online;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <NavGroup>
        <NavRow icon="newspaper-outline" title="Headlines" detail={top ? top.headline : "Stories start after week 1"} onPress={() => router.push("/news")} />
        <NavRow
          icon="repeat-outline"
          title="Transactions"
          detail={`${(d.save?.trades ?? []).length} trades · ${(d.save?.moves ?? []).length} signings and IR moves this season`}
          onPress={() => router.push("/transactions")}
          last={!solo}
        />
        {solo ? <NavRow icon="radio-outline" title="Radio show" detail={shows.length ? shows.at(-1)!.title : "On air from week 1"} onPress={() => router.push("/radio")} /> : null}
        {solo ? <NavRow icon="ticket-outline" title="Picks" detail={`${d.picks.balance.toLocaleString()} points · over/unders on this week's games`} onPress={() => router.push("/picks")} last /> : null}
      </NavGroup>
      {!solo ? <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>The radio show and picks are in solo dynasties for now.</Text> : null}
    </ScrollView>
  );
}
