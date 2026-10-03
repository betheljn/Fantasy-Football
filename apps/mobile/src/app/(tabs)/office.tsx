// The front office: your job and the business, then everything the dynasty
// has collected (trophies, moments, the Hall of Fame, history), and your saves.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { NavGroup, NavRow } from "../../components/ui";
import { useDynasty } from "../../league/LeagueProvider";
import { useTheme } from "../../theme";

export default function OfficeTab() {
  const t = useTheme();
  const d = useDynasty();
  const router = useRouter();
  const office = d.save?.office;
  const dynasty = d.save?.dynasty;
  const solo = !d.online;
  const moments = (dynasty?.moments?.length ?? 0) + (d.save?.collection?.moments.length ?? 0);
  const seasons = dynasty?.history.length ?? 0;
  const springs = dynasty?.springs ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {solo && office ? (
        <NavGroup title="Your job">
          <NavRow
            icon="briefcase-outline"
            title="Owner and fans"
            detail={office.role === "owner" ? `You own the team · fan mood ${office.fanMood}` : `Owner's trust ${office.trust} · fan mood ${office.fanMood}`}
            onPress={() => router.push("/owner")}
          />
          <NavRow icon="cash-outline" title="Business" detail="Tickets, stadium, naming rights and the books" onPress={() => router.push("/business")} last />
        </NavGroup>
      ) : null}

      <NavGroup title="The dynasty">
        <NavRow icon="trophy-outline" title="Trophy room" detail="Titles, division crowns, awards and rivalries" onPress={() => router.push("/trophies")} />
        <NavRow icon="sparkles-outline" title="Moments" detail={moments ? `${moments} collected` : "Big plays and records, collected as they happen"} onPress={() => router.push("/moments")} />
        <NavRow icon="ribbon-outline" title="Hall of Fame" detail={`${dynasty?.hallOfFame?.length ?? 0} inducted`} onPress={() => router.push("/halloffame")} />
        {springs.length ? <NavRow icon="flower-outline" title="Spring season" detail={`${springs.at(-1)!.season} spring champions and breakouts`} onPress={() => router.push("/spring")} /> : null}
        <NavRow icon="time-outline" title="History" detail={seasons ? `${seasons} season${seasons === 1 ? "" : "s"} played` : "Your first season is underway"} onPress={() => router.push("/history")} last />
      </NavGroup>

      <SavesZone />
    </ScrollView>
  );
}

/** Switch to another save (or back out of an online league), or delete this one. */
function SavesZone() {
  const t = useTheme();
  const d = useDynasty();
  const [armed, setArmed] = useState(false);
  return (
    <View style={{ alignItems: "center", marginTop: 8, gap: 14 }}>
      <Pressable onPress={d.closeDynasty} accessibilityRole="button">
        <Text style={{ color: t.accent, fontWeight: "600" }}>{d.online ? "Back to your saves" : "Switch dynasty"}</Text>
      </Pressable>
      {d.online ? null : (
        <Pressable onPress={() => (armed ? d.deleteDynasty() : setArmed(true))} accessibilityRole="button">
          <Text style={{ color: armed ? t.score : t.muted, fontWeight: armed ? "700" : "400" }}>{armed ? "Tap again to delete this dynasty for good" : "Delete dynasty"}</Text>
        </Pressable>
      )}
    </View>
  );
}
