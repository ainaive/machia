import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { GameInfo, LadderPlayer } from "../api";
import { LadderTable, LadderView } from "./LadderPage";

const player = (username: string, rank: number, rating: number): LadderPlayer => ({
  rank,
  userId: `u_${username}`,
  username,
  rating,
  games: 4,
  wins: 2,
  draws: 1,
  losses: 1,
  contests: 2,
  lastContestAt: "2026-02-01T00:00:00Z",
});

describe("LadderTable", () => {
  test("lists players in the order given, with rank and rating", () => {
    const html = renderToStaticMarkup(
      <LadderTable players={[player("alice", 1, 1532), player("bob", 1, 1532), player("carol", 3, 1436)]} />,
    );
    expect(html.indexOf("alice")).toBeLessThan(html.indexOf("bob"));
    expect(html.indexOf("bob")).toBeLessThan(html.indexOf("carol"));
    expect(html.match(/<tr class="border-t/g)).toHaveLength(3);
    expect(html).toContain(">1532<");
    expect(html).toContain(">1436<");
  });

  test("explains an empty ladder", () => {
    expect(renderToStaticMarkup(<LadderTable players={[]} />)).toContain("还没有已结束的比赛");
  });
});

describe("LadderView", () => {
  const arena: GameInfo = { id: "arena", name: "Arena", description: "", minPlayers: 2, maxPlayers: 4 };
  const view = (props: Parameters<typeof LadderView>[0]) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <LadderView {...props} />
      </MemoryRouter>,
    );

  test("a failed game list doesn't hide the standings", () => {
    const html = view({
      gameId: "arena",
      gamesError: "请求失败（502 Bad Gateway）",
      players: [player("alice", 1, 1516)],
      error: null,
    });
    expect(html).toContain("无法加载游戏列表：请求失败（502 Bad Gateway）");
    expect(html).toContain("alice");
    expect(html).not.toContain("animate-spin");
  });

  test("a failed ladder keeps the game tabs", () => {
    const html = view({ gameId: "arena", games: [arena], gamesError: null, error: "Unknown game" });
    expect(html).toContain('href="/ladder/arena"');
    expect(html).toContain("Unknown game");
    expect(html).not.toContain("<table");
  });

  test("with no game chosen, a failed game list shows its error instead of loading forever", () => {
    const html = view({ gamesError: "请求失败（502 Bad Gateway）", error: null });
    expect(html).toContain("无法加载游戏列表");
    expect(html).not.toContain("animate-spin");
  });
});
