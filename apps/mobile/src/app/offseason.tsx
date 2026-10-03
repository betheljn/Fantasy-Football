// Your call for the online offseason's open stage: the same screens as a solo
// dynasty (staff, hiring, re-signings, free agency, cuts) plus a draft board,
// worked out on the phone from the save. Your call goes to the server; you can
// change it until the stage closes, and if you make none the AI makes it.
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  DRAFT_ROUNDS,
  mood,
  offseasonContractPlan,
  offseasonFreeAgencyPlan,
  offseasonRosterPlan,
  staffCandidates,
  staffOverview,
  teamAppeal,
  teamBoard,
  winPct,
  type FreeAgentOffer,
} from "@dynasty/sim";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { api, type OffseasonChoice } from "../online/api";
import { DraftBoardScreen } from "../online/DraftBoardScreen";
import { STAGE_NAMES } from "../online/OnlineLeague";
import { useStagedOffseason } from "../online/staged";
import { OffseasonStepper } from "../components/OffseasonStepper";
import { CutsScreen } from "../screens/CutsScreen";
import { FreeAgencyScreen } from "../screens/FreeAgencyScreen";
import { ResignScreen } from "../screens/ResignScreen";
import { HireScreen, StaffScreen } from "../screens/StaffScreen";
import { useTheme } from "../theme";

const SUBMIT = "Submit my call";

export default function OffseasonCallScreen() {
  const t = useTheme();
  const d = useDynasty();
  const data = useLeague();
  const router = useRouter();
  const ready = useStagedOffseason();
  const [error, setError] = useState<string | null>(null);
  const o = d.online;
  const off = o?.offseason;
  const team = o?.team ?? data.userTeam;
  const choices = off?.choices;
  // Free agency: your offers while you build them (starting from the call you made, if any).
  const [offers, setOffers] = useState<Map<string, FreeAgentOffer>>(() => new Map(choices?.freeAgency?.[team]?.offers ?? []));
  const [frontOffice, setFrontOffice] = useState(() => choices?.freeAgency?.[team]?.frontOffice ?? true);

  const send = async (choice: OffseasonChoice) => {
    if (!o) return;
    setError(null);
    try {
      const r = await api.offseason(o.id, o.token, choice);
      if (!r.done) return setError(r.problems.join(" "));
      d.refreshOnline();
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const title = off ? `Offseason: ${STAGE_NAMES[off.stage]}` : "Offseason";
  // The stage's plan, worked out once (not on every tap).
  const plan = useMemo(() => {
    if (!ready || !d.save) return null;
    const { staged, stage } = ready;
    const league = d.save.dynasty.league;
    switch (stage) {
      case "staff":
        return { stage, overview: staffOverview(league, d.save.dynasty.staffCareers, team) };
      case "hire":
        return { stage, openings: staffCandidates(staged.releases!, team) };
      case "resign":
        return { stage, contracts: offseasonContractPlan(staged.state!, team) };
      case "draft": {
        // Your picks this draft: each round in draft order, traded picks going to their new owners.
        const st = staged.state!;
        const owners = st.contracts!.league.pickOwners ?? {};
        const picks: number[] = [];
        for (let round = 1; round <= DRAFT_ROUNDS; round++) {
          st.order.forEach((original, i) => {
            if ((owners[`${st.draftClass.season}:${round}:${original}`] ?? original) === team) picks.push((round - 1) * st.order.length + i + 1);
          });
        }
        return { stage, board: teamBoard(st.scouting, st.draftClass, team), picks };
      }
      case "freeagency":
        return { stage, market: offseasonFreeAgencyPlan(staged.state!, staged.draft!, team) };
      case "cuts":
        return { stage, roster: offseasonRosterPlan(staged.state!, team) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, team]);

  const body = (() => {
    if (!o || !off || !d.save) return <Text style={{ color: t.muted, padding: 16 }}>No offseason call is due right now.</Text>;
    if (!plan) {
      return (
        <View style={{ padding: 24, alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={t.accent} />
          <Text style={{ color: t.muted, textAlign: "center" }}>Working out the offseason so far (the same way the league's server does)…</Text>
        </View>
      );
    }
    const league = d.save.dynasty.league;
    switch (plan.stage) {
      case "staff":
        return (
          <StaffScreen
            overview={plan.overview}
            initial={choices?.staff?.[team]}
            confirmLabel={SUBMIT}
            onConfirm={(fire, renew) => send({ stage: "staff", fire: [...fire], renew: [...renew] })}
          />
        );
      case "hire":
        return <HireScreen openings={plan.openings} initial={choices?.hires?.[team]} confirmLabel={SUBMIT} onConfirm={(picks) => send({ stage: "hire", picks: [...picks] })} />;
      case "resign":
        return <ResignScreen plan={plan.contracts} initial={choices?.resign?.[team]} confirmLabel={SUBMIT} onDone={(keep) => send({ stage: "resign", keep: [...keep] })} />;
      case "draft":
        return (
          <DraftBoardScreen
            board={plan.board}
            picks={plan.picks}
            initial={choices?.boards?.[team] ?? []}
            onSave={(board) => send({ stage: "draft", board })}
          />
        );
      case "freeagency": {
        const rec = data.records.get(team);
        return (
          <FreeAgencyScreen
            plan={plan.market}
            offers={offers}
            setOffer={(player, offer) => {
              const n = new Map(offers);
              if (offer) n.set(player, offer);
              else n.delete(player);
              setOffers(n);
            }}
            frontOffice={frontOffice}
            setFrontOffice={setFrontOffice}
            moodAt={(l, annual) => mood(l.player, teamAppeal(league.teams[team]!, l.player, rec ? winPct(rec) : 0.5), annual / l.market)}
            confirmLabel={`Submit my offers (${offers.size})`}
            onOpen={() => send({ stage: "freeagency", offers: [...offers], frontOffice })}
          />
        );
      }
      case "cuts":
        return <CutsScreen plan={plan.roster} initial={choices?.cuts?.[team]} confirmLabel={SUBMIT} onDone={(cuts) => send({ stage: "cuts", cuts: [...cuts] })} />;
    }
  })();

  return (
    <>
      <Stack.Screen options={{ title }} />
      {off ? <OffseasonStepper step={off.stage} note="your call" /> : null}
      {error ? <Text style={{ color: t.score, fontWeight: "700", padding: 12 }}>{error}</Text> : null}
      <View style={{ flex: 1 }}>{body}</View>
    </>
  );
}
