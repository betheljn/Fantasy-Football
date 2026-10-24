// The front office: your job and the business, then everything the dynasty
// has collected (trophies, moments, the Hall of Fame, history), and your saves.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { NavGroup, NavRow } from "../../components/ui";
import { useDynasty, useLeague } from "../../league/LeagueProvider";
import { coachLevel, describeStadium, openSlots, ownerStanding, upgradePoints } from "@dynasty/sim";
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
          <NavRow icon="cash-outline" title="Business" detail="Tickets, stadium, naming rights and the books" onPress={() => router.push("/business")} />
          <NavRow icon="color-palette-outline" title="Team look" detail="Name, logo and colors" onPress={() => router.push("/look")} last />
        </NavGroup>
      ) : d.online ? (
        <NavGroup title="Your job">
          <NavRow icon="cash-outline" title="Business" detail="Tickets, stadium, naming rights and the books" onPress={() => router.push("/business")} last />
        </NavGroup>
      ) : null}

      <YouGroup />

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

/** You (the owner, solo or online) and your coaches. */
function YouGroup() {
  const d = useDynasty();
  const router = useRouter();
  const { userTeam, results, playoffs, league } = useLeague();
  const progress = d.save?.dynasty.owners?.[userTeam];
  const now = ownerStanding(progress, userTeam, { results, playoffs });
  const points = upgradePoints(progress, now.seasonXp);
  const staff = league.teams[userTeam]?.staff;
  const stadium = d.save?.dynasty.business?.[userTeam]?.stadium;
  const open = staff ? openSlots(staff.hc) + openSlots(staff.oc) + openSlots(staff.dc) : 0;
  return (
    <NavGroup title="You">
      <NavRow icon="trending-up-outline" title="Your level" detail={`Level ${now.level} · ${points ? `${points} point${points === 1 ? "" : "s"} to spend` : "upgrades"}`} badge={points ? String(points) : undefined} onPress={() => router.push("/level")} />
      <NavRow
        icon="people-outline"
        title="Your coaches"
        detail={staff ? `Levels ${coachLevel(staff.hc.xp).level}/${coachLevel(staff.oc.xp).level}/${coachLevel(staff.dc.xp).level} · abilities and fit` : "Abilities and fit"}
        badge={open && d.abilityWindow ? String(open) : undefined}
        onPress={() => router.push("/coaches")}
      />
      <NavRow icon="business-outline" title="Stadium" detail={stadium ? describeStadium(stadium) : "Design and build your stadium"} onPress={() => router.push("/stadium")} last />
    </NavGroup>
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
