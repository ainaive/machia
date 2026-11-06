import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { GameInfo, ReplayPage, ReplaySummary } from "../api";
import { ReplayList } from "./MatchesPage";

const arena: GameInfo = {
  id: "arena",
  name: "Arena",
  description: "",
  minPlayers: 2,
  maxPlayers: 8,
};

function replay(
  id: string,
  gameId: string,
  createdAt: string,
  ranks: [number, number],
): ReplaySummary {
  return {
    id,
    gameId,
    createdAt,
    totalTicks: 42,
    players: [
      { playerId: 0, botId: "a", name: "alice-bot" },
      { playerId: 1, botId: "b", name: "bob-bot" },
    ],
    results: [
      { playerId: 0, score: 1, rank: ranks[0], kills: 0, survivalTicks: 1, deathTick: null },
      { playerId: 1, score: 0, rank: ranks[1], kills: 0, survivalTicks: 1, deathTick: null },
    ],
  };
}

function page(matches: ReplaySummary[], total = matches.length, offset = 0): ReplayPage {
  return { matches, total, limit: 20, offset };
}

function render(p: ReplayPage, gameId = "") {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ReplayList page={p} games={[arena]} gameId={gameId} onGameChange={() => {}} onPageChange={() => {}} />
    </MemoryRouter>,
  );
}

describe("ReplayList", () => {
  test("links each replay, names the winner and shows its game", () => {
    const html = render(
      page([
        replay("m_new", "arena", "2026-01-02T00:00:00Z", [1, 2]),
        replay("m_old", "arena", "2026-01-01T00:00:00Z", [1, 2]),
      ]),
    );
    expect(html.indexOf("m_new")).toBeLessThan(html.indexOf("m_old"));
    expect(html).toContain("alice-bot 胜");
    expect(html).toContain("alice-bot vs bob-bot");
    expect(html).toContain("Arena");
    expect(html).toContain("第 1–2 条，共 2 条");
  });

  test("calls equal first places a draw", () => {
    expect(render(page([replay("m_draw", "arena", "2026-01-01T00:00:00Z", [1, 1])]))).toContain("平局");
  });

  test("explains an empty library and hides the pager", () => {
    const html = render(page([]));
    expect(html).toContain("还没有回放");
    expect(html).not.toContain("下一页");
  });

  test("marks the filtered game as active", () => {
    const html = render(page([replay("m_1", "arena", "2026-01-01T00:00:00Z", [1, 2])]), "arena");
    expect(html).toContain('href="/matches/m_1"');
    expect(html).toContain("Arena");
    expect(html).toContain("bg-moss text-paper");
  });
});
