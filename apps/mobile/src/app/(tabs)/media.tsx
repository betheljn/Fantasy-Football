// The talk around the league: headlines, the weekly radio show, and picks.
import { useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { NavGroup, NavRow } from "../../components/ui";
import { useDynasty } from "../../league/LeagueProvider";

export default function MediaTab() {
  const d = useDynasty();
  const router = useRouter();
  const news = d.save?.news ?? [];
  const top = [...news].sort((a, b) => b.week - a.week || b.importance - a.importance)[0];
  const shows = d.save?.radio?.shows ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <NavGroup>
        {d.online ? <NavRow icon="chatbubbles-outline" title="League chat" detail="Talk with your league, live" onPress={() => router.push("/chat")} /> : null}
        <NavRow icon="newspaper-outline" title="Headlines" detail={top ? top.headline : "Stories start after week 1"} onPress={() => router.push("/news")} />
        <NavRow
          icon="repeat-outline"
          title="Transactions"
          detail={`${(d.save?.trades ?? []).length} trades · ${(d.save?.moves ?? []).length} signings and IR moves this season`}
          onPress={() => router.push("/transactions")}
        />
        <NavRow icon="radio-outline" title="Radio show" detail={shows.length ? shows.at(-1)!.title : "On air from week 1"} onPress={() => router.push("/radio")} />
        <NavRow icon="ticket-outline" title="Picks" detail={`${d.picks.balance.toLocaleString()} points · ${d.online ? "against the house and your friends" : "over/unders on this week's games"}`} onPress={() => router.push("/picks")} last />
      </NavGroup>
    </ScrollView>
  );
}
