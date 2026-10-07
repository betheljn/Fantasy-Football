// Your team's look, changed any time (solo): city name, nickname, short name,
// logo and colors. Taking another team's name or logo trades yours to them.
import { Stack, useRouter } from "expo-router";
import { teamLogo, type TeamIdentityChoice } from "@dynasty/sim";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { MakeItYours } from "../screens/TeamSetupScreen";

export default function TeamLookScreen() {
  const data = useLeague();
  const d = useDynasty();
  const router = useRouter();
  const team = data.league.teams[data.userTeam]!;
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/office"));
  const current: TeamIdentityChoice = { city: team.city ?? "", nickname: team.nickname, tag: team.tag ?? "", logo: teamLogo(team).id, ...(team.colors ? { colors: team.colors } : {}) };
  return (
    <>
      <Stack.Screen options={{ title: "Team look" }} />
      <MakeItYours
        league={data.league}
        team={team}
        initial={current}
        pickRole={false}
        backLabel="Office"
        nextLabel="Save the new look"
        onBack={leave}
        onDone={(_abbr, _role, identity) => {
          d.restyleTeam(identity);
          leave();
        }}
      />
    </>
  );
}
