import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LadderPlayer } from "../api";
import { LadderTable } from "./LadderPage";

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
