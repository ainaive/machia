import type { MatchReplay } from "../api";
import { playerColor } from "../sprites";

function PlayingCard({ id }: { id: string }) {
  const hidden = !id || id === "??";
  const rank = hidden ? "?" : id[0];
  const suit = hidden ? "" : id[1];
  const red = suit === "h" || suit === "d";
  const suitMark =
    suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "s" ? "♠" : suit === "c" ? "♣" : "";
  return (
    <div
      className={`flex h-14 w-10 flex-col justify-between rounded-md border px-1 py-0.5 font-display text-xs font-bold shadow-sm ${
        hidden
          ? "border-ink/30 bg-[#2a4a36] text-paper/40"
          : "border-ink/20 bg-paper text-ink"
      }`}
      style={{ color: hidden ? undefined : red ? "#b33b5a" : "#1a1f16" }}
    >
      <span>{rank}</span>
      <span className="self-center text-base">{hidden ? "✦" : suitMark}</span>
      <span className="self-end rotate-180">{rank}</span>
    </div>
  );
}

export function BoardHoldem({
  replay,
  tickIndex,
}: {
  replay: MatchReplay;
  tickIndex: number;
}) {
  const snap =
    replay.ticks[Math.min(Math.max(tickIndex, 0), replay.ticks.length - 1)];
  const community = (snap?.community as string[] | undefined) ?? [];
  const pot = Number(snap?.pot ?? 0);
  const street = String(snap?.street ?? "preflop");
  const toAct = Number(snap?.toAct ?? -1);
  const players = (snap?.players ?? []) as Array<{
    id: number;
    stack: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
    hole: string[];
  }>;

  return (
    <div className="w-full max-w-xl rounded-xl border-[3px] border-[#2a3328] bg-gradient-to-b from-[#2f5a3d] to-[#1e3a28] p-5 shadow-[0_24px_60px_-18px_rgba(26,31,22,0.65)]">
      <div className="mb-4 flex items-center justify-between text-sm text-paper/80">
        <span className="font-display font-bold uppercase tracking-wide">
          {street}
        </span>
        <span className="rounded-full bg-ink/40 px-3 py-1 font-display font-bold text-core">
          Pot {pot}
        </span>
      </div>

      <div className="mb-6 flex min-h-16 items-center justify-center gap-2">
        {community.length === 0 ? (
          <span className="text-sm text-paper/50">等待公共牌…</span>
        ) : (
          community.map((c, i) => <PlayingCard key={`${c}-${i}`} id={c} />)
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {players.map((p) => {
          const visible = p.hole?.length ? p.hole : ["??", "??"];
          return (
            <div
              key={p.id}
              className={`rounded-lg border px-3 py-2 ${
                p.folded
                  ? "border-ink/20 bg-ink/20 opacity-60"
                  : toAct === p.id
                    ? "border-core bg-paper/15 ring-2 ring-core/40"
                    : "border-paper/20 bg-ink/25"
              }`}
            >
              <div className="mb-2 flex items-center gap-2 text-sm text-paper">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: playerColor(p.id) }}
                />
                <span className="font-display font-bold">P{p.id}</span>
                <span className="text-paper/60">
                  {p.folded ? "弃牌" : p.allIn ? "All-in" : `栈 ${p.stack}`}
                </span>
                {p.bet > 0 && (
                  <span className="ml-auto text-core">注 {p.bet}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                {visible.map((c, i) => (
                  <PlayingCard key={i} id={c} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
