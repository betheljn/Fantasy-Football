// Starting a dynasty: pick your state, make the team yours (city name,
// nickname, short name, logo, colors, your role), build your head coach, then
// the fantasy draft (or keep the roster). The sim checks and makes each
// choice; the draft is saved as you go.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  IDENTITY_LIMITS,
  LOGOS,
  allTeams,
  formatMoney,
  friendIdentityClash,
  identityProblem,
  payroll,
  salaryCap,
  staffOverall,
  teamLogo,
  setUpTeam,
  teamRatings,
  type League,
  type Team,
  type CoachBuild,
  type TeamIdentityChoice,
} from "@dynasty/sim";
import { CoachBuilderScreen } from "./CoachBuilderScreen";
import { DraftSetupScreen } from "./DraftSetupScreen";
import { FantasyDraftScreen } from "./FantasyDraftScreen";
import { Card, Field, Icon, LinkRow, LogoBadge, SectionTitle, Segmented, StickyFooter, Swatch, Button } from "../components/ui";
import { designedColors, palette, readableOn } from "../field/colors";
import { useDynasty, type LeagueData } from "../league/LeagueProvider";
import type { TeamSetup } from "../dynasty/save";
import { useTheme } from "../theme";

export type Role = "owner" | "gm";

/** Colors to choose from: fictional, a broad spread of hues and neutrals. */
const COLORS = [
  "#B3261E", "#C8102E", "#7A0019", "#8C1D40", "#E35205", "#FF6900", "#F2C14E", "#FFD100", "#C99700", "#9C7A3C",
  "#1E7B3A", "#006747", "#154734", "#69BE28", "#00838F", "#00B2A9", "#0B3D91", "#003DA5", "#0057B8", "#0C2340",
  "#5B2C83", "#4F2683", "#6B4226", "#2D2D2D", "#111111", "#5C5C5C", "#A2AAAD", "#C9D3D9", "#F2E3C6", "#FFFFFF",
];

export function TeamSetupScreen({ data }: { data: LeagueData }) {
  const d = useDynasty();
  const [team, setTeam] = useState<Team | null>(null);
  const [look, setLook] = useState<{ role: Role; identity: TeamIdentityChoice } | null>(null);
  const [coach, setCoach] = useState<CoachBuild | null>(null);
  const dynasty = d.save?.dynasty;
  // The league as your choices make it (look and coach), which the draft starts from.
  const setupLeague = useMemo(
    () => (dynasty && team && look && coach ? setUpTeam(dynasty, team.abbr, { identity: look.identity, coach }).league : null),
    [dynasty, team, look, coach],
  );

  // A draft under way (saved): carry on with it.
  if (d.setup?.draft) return <DraftInProgress setup={d.setup as TeamSetup & { draft: NonNullable<TeamSetup["draft"]> }} />;
  if (!team) return <PickState data={data} onPick={setTeam} />;
  const setup = look && coach ? { team: team.abbr, role: look.role, identity: look.identity, coach } : null;
  // Earlier steps stay mounted under later ones, so going back keeps your choices.
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, display: look ? "none" : "flex" }}>
        <MakeItYours league={data.league} team={team} onBack={() => setTeam(null)} onDone={(_abbr, role, identity) => setLook({ role, identity })} />
      </View>
      {look ? (
        <View style={{ flex: 1, display: coach ? "none" : "flex" }}>
          <CoachBuilderScreen
            league={data.league}
            abbr={team.abbr}
            teamLabel={`${look.identity.city?.trim() || team.state} ${look.identity.nickname.trim()}`}
            onBack={() => setLook(null)}
            onDone={setCoach}
          />
        </View>
      ) : null}
      {setup && setupLeague ? (
        <DraftSetupScreen
          league={setupLeague}
          abbr={team.abbr}
          onBack={() => setCoach(null)}
          onDraft={(rounds, slot) => d.saveSetup({ ...setup, draft: { rounds, slot, picks: [] } })}
          onKeep={() => d.beginDynasty(setup)}
        />
      ) : null}
    </View>
  );
}

/** The fantasy draft, from the saved setup (your picks so far replay first). */
function DraftInProgress({ setup }: { setup: TeamSetup & { draft: NonNullable<TeamSetup["draft"]> } }) {
  const d = useDynasty();
  const dynasty = d.save!.dynasty;
  const league = useMemo(() => setUpTeam(dynasty, setup.team, setup).league, [dynasty, setup.team, setup.identity, setup.coach]);
  return (
    <FantasyDraftScreen
      league={league}
      team={setup.team}
      rounds={setup.draft.rounds}
      slot={setup.draft.slot}
      picks={setup.draft.picks}
      onPicks={(picks) => d.saveSetup({ ...setup, draft: { ...setup.draft, picks } })}
      onDone={(drafted) => d.beginDynasty(setup, drafted)}
    />
  );
}

function PickState({ data, onPick }: { data: LeagueData; onPick: (team: Team) => void }) {
  const t = useTheme();
  const teams = useMemo(
    () => allTeams(data.league).map((team) => ({ team, ovr: teamRatings(team).overall })).sort((a, b) => b.ovr - a.ovr),
    [data.league],
  );
  const cap = salaryCap(data.league.seed, data.league.season);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Pick your state</Text>
      <Text style={{ color: t.muted, marginBottom: 8 }}>
        {"Your state sets your division, your market and your home fans. Next you'll name the team and choose its look. Strongest rosters first; a weak team is a longer road, and a better story."}
      </Text>
      {teams.map(({ team, ovr }) => (
        <Card key={team.abbr} style={{ paddingVertical: 4 }}>
          <LinkRow label={`Choose ${team.state}`} onPress={() => onPick(team)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Swatch abbr={team.abbr} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{team.state}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  Now the {team.nickname} · coach {team.staff?.hc.lastName} ({team.staff ? staffOverall(team.staff.hc) : "–"}) · payroll{" "}
                  {formatMoney(payroll(team, data.league.season))} of {formatMoney(cap)}
                </Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: t.text, fontVariant: ["tabular-nums"] }}>{ovr.toFixed(0)}</Text>
            </View>
          </LinkRow>
        </Card>
      ))}
    </ScrollView>
  );
}

/** Teams other friends run (online): their look as chosen, and who runs them. */
export type FriendTeams = Record<string, { identity: TeamIdentityChoice; owner: string }>;

/**
 * Make the team yours: name, logo, colors (and your role, solo). Online,
 * `friends` are the other friends' teams: their names and logos are off
 * limits, and there's no role to pick.
 */
export function MakeItYours({ league, team, onBack, onDone, initial, friends, backLabel = "All states", nextLabel = "Next: your head coach", pickRole = !friends }: { league: League; team: Team; onBack: () => void; onDone: (abbr: string, role: Role, identity: TeamIdentityChoice) => void; initial?: TeamIdentityChoice; friends?: FriendTeams; backLabel?: string; nextLabel?: string; pickRole?: boolean }) {
  const t = useTheme();
  const designed = designedColors(team.abbr);
  const [city, setCity] = useState(initial?.city ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? team.nickname);
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [logo, setLogo] = useState(initial?.logo ?? teamLogo(team).id);
  const [colorMode, setColorMode] = useState<"designed" | "custom">(initial?.colors ? "custom" : "designed");
  const [primary, setPrimary] = useState(initial?.colors?.primary ?? designed.primary);
  const [trim, setTrim] = useState(initial?.colors?.trim ?? designed.trim);
  const [role, setRole] = useState<Role>("owner");

  const colors = colorMode === "custom" ? palette(primary, trim) : designed;
  const choice: TeamIdentityChoice = { city, nickname, tag, logo, ...(colorMode === "custom" ? { colors: { primary, trim } } : {}) };
  const friendChoices = useMemo(() => (friends ? Object.fromEntries(Object.entries(friends).map(([abbr, f]) => [abbr, f.identity])) : null), [friends]);
  const problem = identityProblem(league, team.abbr, choice) ?? (friendChoices ? friendIdentityClash(league, team.abbr, choice, friendChoices) : null);
  const friendLogo = useMemo(() => new Map(Object.values(friends ?? {}).map((f) => [f.identity.logo, f.owner])), [friends]);
  // Who holds each logo and nickname now (taking one trades yours to them).
  const holders = useMemo(() => {
    const m = new Map<string, Team>();
    for (const other of allTeams(league)) if (other.abbr !== team.abbr) m.set(teamLogo(other).id, other);
    return m;
  }, [league, team.abbr]);
  const nickHolder = allTeams(league).find((o) => o.abbr !== team.abbr && o.nickname.toLowerCase() === nickname.trim().toLowerCase());
  const logoHolder = holders.get(logo);

  const pickLogo = (id: string) => {
    // The nickname follows the logo, unless you've written your own.
    const wasLogoName = LOGOS.some((l) => l.nickname === nickname.trim()) || !nickname.trim();
    setLogo(id);
    if (wasLogoName) setNickname(LOGOS.find((l) => l.id === id)!.nickname);
  };

  const place = city.trim() || team.state;
  const short = (tag.trim() || team.abbr).toUpperCase();
  const trades = [nickHolder && `${nickHolder.state} becomes the ${team.nickname}`, logoHolder && logoHolder !== nickHolder && `${logoHolder.state} takes your old logo`].filter(Boolean);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="chevron-back" size={18} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700" }}>{backLabel}</Text>
        </Pressable>

        <View style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 4, borderBottomColor: colors.trim }}>
          <LogoBadge logo={logo} primary={colors.primary} trim={colors.trim} size={76} label={`${place} ${nickname} logo`} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: "700", opacity: 0.85 }}>{short}</Text>
            <Text style={{ color: colors.onPrimary, fontSize: 22, fontWeight: "900" }} numberOfLines={2}>
              {place} {nickname.trim() || "…"}
            </Text>
            <Text style={{ color: colors.onPrimary, fontSize: 12, opacity: 0.85 }}>
              {team.state} · {league.conferences.find((c) => c.divisions.some((d) => d.teams.includes(team.abbr)))?.divisions.find((d) => d.teams.includes(team.abbr))?.name} division
            </Text>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          <SectionTitle>Name</SectionTitle>
          <Field label="City or region (blank = the state)" value={city} onChangeText={setCity} placeholder={team.state} maxLength={IDENTITY_LIMITS.city} autoCorrect={false} />
          <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Tigers" maxLength={IDENTITY_LIMITS.nickname} autoCorrect={false} />
          <Field
            label="Short name, 2 to 4 letters (blank = the state's)"
            value={tag}
            onChangeText={(v) => setTag(v.replace(/[^A-Za-z]/g, "").toUpperCase())}
            placeholder={team.abbr}
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </Card>

        <Card>
          <SectionTitle>Logo</SectionTitle>
          <Text style={{ color: t.muted, fontSize: 12, marginBottom: 8 }}>{"The nickname follows the logo unless you've written your own. A logo another team has trades with them."}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 }}>
            {LOGOS.map((l) => {
              const on = l.id === logo;
              const holder = holders.get(l.id);
              return (
                <Pressable
                  key={l.id}
                  onPress={() => pickLogo(l.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${l.nickname}: ${l.emblem}`}
                  style={{ width: "23%", alignItems: "center", paddingVertical: 6, borderRadius: 10, borderWidth: 2, borderColor: on ? t.accent : "transparent", backgroundColor: on ? t.bg : "transparent" }}
                >
                  <LogoBadge logo={l.id} primary={colors.primary} trim={colors.trim} size={54} />
                  <Text style={{ color: t.text, fontSize: 11, fontWeight: on ? "800" : "600", marginTop: 3 }} numberOfLines={1}>
                    {l.nickname}
                  </Text>
                  <Text style={{ color: friendLogo.has(l.id) ? t.warn : t.muted, fontSize: 9 }} numberOfLines={1}>
                    {friendLogo.get(l.id) ?? (holder ? holder.abbr : "open")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <SectionTitle>Colors</SectionTitle>
          <Segmented
            options={[
              { key: "designed", label: `${team.state}'s colors` },
              { key: "custom", label: "Your own" },
            ]}
            value={colorMode}
            onChange={setColorMode}
          />
          {colorMode === "custom" ? (
            <>
              <ColorRow label="Primary" value={primary} onChange={setPrimary} />
              <ColorRow label="Trim" value={trim} onChange={setTrim} />
            </>
          ) : null}
        </Card>

        {!pickRole ? null : (
        <Card>
          <SectionTitle>Your role</SectionTitle>
          {(
            [
              ["owner", "Owner and GM", "Run everything. Nobody can fire you; the board and the fans grade every season."],
              ["gm", "GM for an AI owner", "The owner has a goal and a temper. Meet it and you keep the job; miss it too often and you're out."],
            ] as const
          ).map(([key, label, note]) => (
            <Pressable key={key} onPress={() => setRole(key)} accessibilityRole="radio" accessibilityState={{ selected: role === key }} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
              <Icon name={role === key ? "radio-button-on" : "radio-button-off"} color={role === key ? t.accent : t.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{note}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
        )}
      </ScrollView>
      <StickyFooter note={problem ?? (trades.length ? `${trades.join("; ")}.` : undefined)}>
        <Button label={nextLabel} onPress={() => onDone(team.abbr, role, choice)} primary disabled={!!problem} />
      </StickyFooter>
    </View>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {COLORS.map((hex) => {
          const on = hex === value;
          return (
            <Pressable
              key={hex}
              onPress={() => onChange(hex)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} ${hex}`}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: hex, borderWidth: on ? 3 : 1, borderColor: on ? t.accent : t.border, alignItems: "center", justifyContent: "center" }}
            >
              {on ? <Icon name="checkmark" size={16} color={readableOn(hex)} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

