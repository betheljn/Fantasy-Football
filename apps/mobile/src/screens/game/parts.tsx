// Game-day pieces: the scoreboard in both teams' colors, the win-chance bar
// and the game-flow chart, the pregame tale of the tape, the leaders so far,
// and the postgame recap. All read the finished game up to the play on the
// field, so nothing ahead is given away.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Canvas, Line, Rect, Path, Skia, vec } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { BASE_STARTERS, displayName, periodLabel, playerOverall, teamRatings, type BoxScore, type CoachingReport, type GameResult, type PlayLine, type PlayerLookup, type PlayerStats, type Team } from "@dynasty/sim";
import { Card, Swatch } from "../../components/ui";
import { teamColors } from "../../field/colors";
import type { FeedRow } from "../../game/feed";
import { useTheme } from "../../theme";

export interface GameContext {
  /** "Week 5", "Semifinal". */
  title?: string;
  records?: Record<string, string>;
  neutralSite?: boolean;
}

/** Both teams' colors edge to edge, the score big, and the clock and situation between them. */
export function Scoreboard({ game, score, possession, status, sub }: { game: GameResult; score: Record<string, number>; possession: string | null; status: string; sub: string }) {
  const side = (abbr: string, right: boolean) => {
    const c = teamColors(abbr);
    return (
      <View style={{ flex: 1, backgroundColor: c.primary, flexDirection: right ? "row-reverse" : "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
        <Swatch abbr={abbr} size={34} />
        <View style={{ alignItems: right ? "flex-end" : "flex-start" }}>
          <View style={{ flexDirection: right ? "row-reverse" : "row", alignItems: "center", gap: 4 }}>
            <Text style={{ color: c.onPrimary, fontWeight: "800", fontSize: 13 }}>{abbr}</Text>
            {possession === abbr ? <Ionicons name="american-football" size={12} color={c.onPrimary} /> : null}
          </View>
          <Text style={{ color: c.onPrimary, fontSize: 30, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 34 }}>{score[abbr] ?? 0}</Text>
        </View>
      </View>
    );
  };
  return (
    <View style={{ flexDirection: "row", borderRadius: 12, overflow: "hidden", marginHorizontal: 12, marginTop: 8 }}>
      {side(game.away, false)}
      <View style={{ width: 92, backgroundColor: "#111418", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
        <Text style={{ color: "#ffffff", fontWeight: "800", fontSize: 15, fontVariant: ["tabular-nums"] }}>{status}</Text>
        <Text style={{ color: "#b7c0c8", fontSize: 11, marginTop: 2, textAlign: "center" }} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      {side(game.home, true)}
    </View>
  );
}

/** Who's likely to win right now: the away team's color from the left, the home team's from the right. */
export function WinBar({ game, home }: { game: GameResult; home: number }) {
  const t = useTheme();
  const pct = Math.round(home * 100);
  const lead = home >= 0.5 ? game.home : game.away;
  return (
    <View style={{ marginHorizontal: 12, marginTop: 8 }}>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" }}>
        <View style={{ flex: Math.max(1, 100 - pct), backgroundColor: teamColors(game.away).primary }} />
        <View style={{ width: 2, backgroundColor: t.bg }} />
        <View style={{ flex: Math.max(1, pct), backgroundColor: teamColors(game.home).primary }} />
      </View>
      <Text style={{ color: t.muted, fontSize: 11, marginTop: 3, textAlign: "center" }}>
        Win chance: {lead} {Math.max(pct, 100 - pct)}%
      </Text>
    </View>
  );
}

/** The home team's win chance play by play: up is the home team, down the road team. */
export function FlowChart({ game, chances, pregame, upto, width, height = 90 }: { game: GameResult; chances: number[]; pregame: number; upto: number; width: number; height?: number }) {
  const t = useTheme();
  const path = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const n = Math.max(1, game.plays.length);
    const x = (i: number) => ((i + 1) / n) * width;
    const y = (w: number) => (1 - w) * height;
    p.moveTo(0, y(pregame));
    for (let i = 0; i <= upto && i < chances.length; i++) p.lineTo(x(i), y(chances[i]!));
    return p.detach();
  }, [game, chances, pregame, upto, width, height]);
  const home = teamColors(game.home).primary;
  const away = teamColors(game.away).primary;
  return (
    <View>
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height / 2} color={home} opacity={0.18} />
        <Rect x={0} y={height / 2} width={width} height={height / 2} color={away} opacity={0.18} />
        <Line p1={vec(0, height / 2)} p2={vec(width, height / 2)} color={t.muted} strokeWidth={1} opacity={0.6} />
        <Path path={path} color={t.text} style="stroke" strokeWidth={2} />
      </Canvas>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
        <Text style={{ color: t.muted, fontSize: 10 }}>Kickoff</Text>
        <Text style={{ color: t.muted, fontSize: 10 }}>
          ▲ {game.home} · ▼ {game.away}
        </Text>
        <Text style={{ color: t.muted, fontSize: 10 }}>Final</Text>
      </View>
    </View>
  );
}

/** Before kickoff: the two teams side by side, and the players to watch. */
export function Pregame({ home, away, context, chance }: { home: Team; away: Team; context?: GameContext; chance: number }) {
  const t = useTheme();
  const rh = teamRatings(home);
  const ra = teamRatings(away);
  const rows: Array<[string, number, number]> = [
    ["Overall", ra.overall, rh.overall],
    ["Offense", ra.offense, rh.offense],
    ["Defense", ra.defense, rh.defense],
    ["Special teams", ra.special, rh.special],
  ];
  const fav = chance >= 0.5 ? home : away;
  return (
    <View style={{ padding: 12, gap: 10 }}>
      <Card style={{ gap: 6 }}>
        <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Tale of the tape</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ flex: 1, color: t.text, fontWeight: "800" }}>
            {away.abbr}
            {context?.records?.[away.abbr] ? <Text style={{ color: t.muted, fontWeight: "400" }}> {context.records[away.abbr]}</Text> : null}
          </Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{context?.neutralSite ? "neutral site" : "at"}</Text>
          <Text style={{ flex: 1, color: t.text, fontWeight: "800", textAlign: "right" }}>
            {context?.records?.[home.abbr] ? <Text style={{ color: t.muted, fontWeight: "400" }}>{context.records[home.abbr]} </Text> : null}
            {home.abbr}
          </Text>
        </View>
        {rows.map(([label, a, h]) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2 }}>
            <Text style={{ width: 40, color: a > h ? t.text : t.muted, fontWeight: a > h ? "800" : "500", fontVariant: ["tabular-nums"] }}>{a.toFixed(0)}</Text>
            <Text style={{ flex: 1, textAlign: "center", color: t.muted, fontSize: 12 }}>{label}</Text>
            <Text style={{ width: 40, textAlign: "right", color: h > a ? t.text : t.muted, fontWeight: h > a ? "800" : "500", fontVariant: ["tabular-nums"] }}>{h.toFixed(0)}</Text>
          </View>
        ))}
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 4, textAlign: "center" }}>
          {Math.abs(chance - 0.5) < 0.04 ? "A coin flip on paper." : `${fav.state} ${fav.nickname} favored (${Math.round(Math.max(chance, 1 - chance) * 100)}%).`}
        </Text>
      </Card>
      <Card style={{ gap: 6 }}>
        <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Players to watch</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[away, home].map((team) => (
            <View key={team.abbr} style={{ flex: 1, gap: 4 }}>
              {keyPlayers(team).map((p) => (
                <Text key={p.id} style={{ color: t.text, fontSize: 13 }} numberOfLines={1}>
                  <Text style={{ color: t.muted }}>{p.position} </Text>
                  {p.firstName.charAt(0)}. {p.lastName} <Text style={{ fontWeight: "800" }}>{playerOverall(p)}</Text>
                </Text>
              ))}
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

/** The quarterback, then the best starters elsewhere. */
function keyPlayers(team: Team) {
  const starters = Object.entries(team.depthChart).flatMap(([pos, ids]) => ids.slice(0, BASE_STARTERS[pos as keyof typeof BASE_STARTERS] ?? 1));
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  const players = starters.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p && p.position !== "K" && p.position !== "P" && p.position !== "LS");
  const qb = players.find((p) => p.position === "QB");
  const rest = players.filter((p) => p !== qb).sort((a, b) => playerOverall(b) - playerOverall(a));
  return [...(qb ? [qb] : []), ...rest].slice(0, 4);
}

type Leader = { label: string; p: PlayerStats; line: string };

/** Each team's top passer, rusher, receiver and defender so far. */
export function leadersOf(box: BoxScore, team: string): Leader[] {
  const mine = Object.values(box.players).filter((p) => p.team === team);
  const top = (score: (p: PlayerStats) => number) => mine.filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a))[0];
  const out: Leader[] = [];
  const pass = top((p) => p.passAtt);
  if (pass) out.push({ label: "Passing", p: pass, line: `${pass.passCmp}/${pass.passAtt}, ${pass.passYds} yds${pass.passTd ? `, ${pass.passTd} TD` : ""}${pass.passInt ? `, ${pass.passInt} INT` : ""}` });
  const rush = top((p) => p.rushYds + p.rushAtt * 0.1);
  if (rush) out.push({ label: "Rushing", p: rush, line: `${rush.rushAtt} car, ${rush.rushYds} yds${rush.rushTd ? `, ${rush.rushTd} TD` : ""}` });
  const rec = top((p) => p.recYds + p.rec * 0.1);
  if (rec) out.push({ label: "Receiving", p: rec, line: `${rec.rec} rec, ${rec.recYds} yds${rec.recTd ? `, ${rec.recTd} TD` : ""}` });
  const def = top((p) => p.tackles + p.sacks * 3 + p.defInt * 4 + p.forcedFumbles * 3 + p.defTd * 6);
  if (def) out.push({ label: "Defense", p: def, line: [`${def.tackles} tkl`, def.sacks ? `${def.sacks} sk` : "", def.defInt ? `${def.defInt} INT` : "", def.forcedFumbles ? `${def.forcedFumbles} FF` : ""].filter(Boolean).join(", ") });
  return out;
}

/** The leaders, team by team. */
export function Leaders({ game, box, who, onPlayer }: { game: GameResult; box: BoxScore; who: PlayerLookup; onPlayer: (id: string) => void }) {
  const t = useTheme();
  const name = (id: string) => {
    try {
      return displayName(who(id));
    } catch {
      return id;
    }
  };
  return (
    <View style={{ padding: 12, gap: 10 }}>
      {[game.away, game.home].map((team) => {
        const list = leadersOf(box, team);
        return (
          <Card key={team} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Swatch abbr={team} size={22} />
              <Text style={{ color: t.text, fontWeight: "800" }}>{team}</Text>
            </View>
            {list.length === 0 ? <Text style={{ color: t.muted }}>Nothing yet.</Text> : null}
            {list.map((l) => (
              <Pressable key={l.label} onPress={() => onPlayer(l.p.id)} accessibilityRole="link" style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 2 }}>
                <Text style={{ width: 74, color: t.muted, fontSize: 12 }}>{l.label}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>{name(l.p.id)}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{l.line}</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        );
      })}
    </View>
  );
}

/** After the final whistle: the result, how it swung, the turning points, and who starred. */
export function Recap({
  game,
  box,
  who,
  chances,
  pregame,
  feed,
  width,
  onPlay,
  onPlayer,
  finish,
  report,
}: {
  game: GameResult;
  box: BoxScore;
  who: PlayerLookup;
  chances: number[];
  pregame: number;
  feed: FeedRow[];
  width: number;
  onPlay: (index: number) => void;
  onPlayer: (id: string) => void;
  finish?: { label: string; onPress: () => void };
  /** A game you coached: how your calls went. */
  report?: CoachingReport | null;
}) {
  const t = useTheme();
  const winner = game.winner;
  const loser = winner === game.home ? game.away : game.home;
  // Turning points: the plays that moved the win chance most.
  const swings = useMemo(() => {
    const rows = new Map(feed.filter((r) => r.kind === "play").map((r) => [r.index, r]));
    return chances
      .map((w, i) => ({ i, d: Math.abs(w - (i === 0 ? pregame : chances[i - 1]!)) }))
      .filter((x) => x.i < chances.length - 1 && rows.has(x.i) && game.plays[x.i]!.event.kind !== "timeout" && game.plays[x.i]!.event.kind !== "penalty")
      .sort((a, b) => b.d - a.d)
      .slice(0, 3)
      .sort((a, b) => a.i - b.i)
      .map((x) => ({ ...x, row: rows.get(x.i)! }));
  }, [chances, pregame, feed, game]);
  const star = [...leadersOf(box, winner ?? game.home), ...leadersOf(box, loser)][0];
  const name = (id: string) => {
    try {
      return displayName(who(id));
    } catch {
      return id;
    }
  };
  return (
    <View style={{ padding: 12, gap: 10 }}>
      {finish ? (
        <Pressable onPress={finish.onPress} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: t.accent, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: t.onAccent, fontWeight: "800", fontSize: 16 }}>{finish.label}</Text>
        </Pressable>
      ) : null}
      <Card style={{ gap: 8 }}>
        <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Final{game.overtime ? " (OT)" : ""}</Text>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>
          {winner ? `${winner} beat ${loser}, ${game.score[winner]}-${game.score[loser]}` : `${game.away} and ${game.home} tie, ${game.score[game.home]}-${game.score[game.away]}`}
        </Text>
        {star ? (
          <Pressable onPress={() => onPlayer(star.p.id)} accessibilityRole="link">
            <Text style={{ color: t.muted }}>
              Star of the game: <Text style={{ color: t.text, fontWeight: "700" }}>{name(star.p.id)}</Text> ({star.p.team}), {star.line}
            </Text>
          </Pressable>
        ) : null}
        <FlowChart game={game} chances={chances} pregame={pregame} upto={chances.length - 1} width={width - 48} />
      </Card>
      {report ? <CallsCard report={report} /> : null}
      {swings.length ? (
        <Card style={{ gap: 6 }}>
          <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Turning points</Text>
          {swings.map(({ i, d, row }) =>
            row.kind === "play" ? (
              <Pressable key={i} onPress={() => onPlay(i)} accessibilityRole="button" style={{ paddingVertical: 4 }}>
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  {game.plays[i]!.quarter <= 4 ? `Q${periodLabel(game.plays[i]!.quarter)}` : periodLabel(game.plays[i]!.quarter)} {row.clock} · {row.team} · win chance swung {Math.round(d * 100)} points
                </Text>
                <Text style={{ color: t.text }}>{row.text}</Text>
              </Pressable>
            ) : null,
          )}
        </Card>
      ) : null}
    </View>
  );
}

/** "12 plays, 71 yards (5.9 a play), 4 first downs". */
function lineText(l: PlayLine): string {
  if (l.plays === 0) return "none";
  const extra = [l.touchdowns ? `${l.touchdowns} TD` : "", l.turnovers ? `${l.turnovers} turnover${l.turnovers === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
  return `${l.plays} play${l.plays === 1 ? "" : "s"}, ${l.yards} yds (${(l.yards / l.plays).toFixed(1)} a play), ${l.firstDowns} first down${l.firstDowns === 1 ? "" : "s"}${extra ? `, ${extra}` : ""}`;
}

/** How a coached game's calls went: the snaps you changed against the ones you left to your coaches. */
function CallsCard({ report: r }: { report: CoachingReport }) {
  const t = useTheme();
  const row = (label: string, text: string) => (
    <Text style={{ color: t.text }}>
      <Text style={{ color: t.muted }}>{label}: </Text>
      {text}
    </Text>
  );
  return (
    <Card style={{ gap: 6 }}>
      <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Your calls</Text>
      <Text style={{ color: t.text, fontWeight: "700" }}>
        {r.changed === 0 ? `You took your coaches' call all ${r.calls} times.` : `You changed ${r.changed} of ${r.calls} calls from your coaches'.`}
      </Text>
      {r.offense.mine.plays ? row("Your offensive calls", lineText(r.offense.mine)) : null}
      {r.offense.mine.plays ? row("Your coaches' calls", lineText(r.offense.coaches)) : null}
      {r.defense.mine.plays ? row("Against your defenses", lineText(r.defense.mine)) : null}
      {r.defense.mine.plays ? row("Against the coordinator's", lineText(r.defense.coaches)) : null}
      {r.fourthDowns.tried ? row("Went for it on 4th", `${r.fourthDowns.converted} of ${r.fourthDowns.tried} converted`) : null}
      {r.tries.twoPoint ? row("Went for two", `${r.tries.made} of ${r.tries.twoPoint} good`) : null}
      {r.tries.kickedInstead ? row("Kicked when the chart said go for two", String(r.tries.kickedInstead)) : null}
      {r.timeouts ? row("Timeouts you called", String(r.timeouts)) : null}
    </Card>
  );
}
