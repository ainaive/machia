import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { GameInfo, MyPage } from "../api";
import { MeView } from "./MePage";

const arena: GameInfo = {
  id: "arena",
  name: "Arena",
  description: "",
  minPlayers: 2,
  maxPlayers: 8,
};

const data: MyPage = {
  unread: 1,
  notificationsTotal: 2,
  notifications: [
    {
      id: "n1",
      kind: "entry_approved",
      title: "Bot 已通过审批",
      body: "AliceBot 已通过审批，等待管理员开赛。",
      contestId: "c1",
      entryId: "e1",
      readAt: null,
      createdAt: "2026-01-02T00:00:00Z",
    },
    {
      id: "n2",
      kind: "contest_finished",
      title: "比赛已结束",
      body: "「Arena Cup」已结束，去赛事页查看名次与回放。",
      contestId: "c0",
      entryId: "e0",
      readAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  contests: [
    {
      contest: {
        id: "c1",
        title: "Arena Cup",
        gameId: "arena",
        status: "open",
        createdAt: "2026-01-01T00:00:00Z",
        startedAt: null,
        finishedAt: null,
      },
      entry: {
        id: "e1",
        status: "approved",
        botName: "AliceBot",
        rejectReason: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    },
  ],
};

function render(payload: MyPage) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MeView
        data={payload}
        games={[arena]}
        busy={false}
        loadingMore={false}
        onMarkAllRead={() => {}}
        onLoadMore={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("MeView", () => {
  test("shows unread notices and lets the user mark them all read", () => {
    const html = render(data);
    expect(html).toContain("1 条未读");
    expect(html).toContain("Bot 已通过审批");
    expect(html).toContain('href="/contests/c1"');
    expect(html).toContain("全部标为已读");
  });

  test("shows each entry's status and next action", () => {
    const html = render(data);
    expect(html).toContain("Arena Cup");
    expect(html).toContain("Arena");
    expect(html).toContain("已通过");
    expect(html).toContain("等待开赛");
    expect(html).toContain("AliceBot");
  });

  test("explains empty notifications and entries", () => {
    const html = render({ unread: 0, notifications: [], notificationsTotal: 0, contests: [] });
    expect(html).toContain("还没有通知");
    expect(html).toContain("还没有报名任何赛事");
    expect(html).not.toContain("全部标为已读");
  });

  test("offers to load notices older than the first page", () => {
    const html = render({ ...data, notificationsTotal: 5 });
    expect(html).toContain("加载更早的通知（还有 3 条）");
  });
});
