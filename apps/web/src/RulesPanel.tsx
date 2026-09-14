const ARENA_RULES = [
  {
    title: "目标",
    body: "在方形棋盘上存活并占据中心 3×3 核心区。缩圈会不断挤压安全区，出局看综合得分。",
  },
  {
    title: "两拍延迟（核心机制）",
    body: "第 T 拍提交的动作，要到第 T+2 拍才执行。已排队的两拍动作对所有人公开。",
  },
  {
    title: "动作",
    body: "移动、攻击、格挡、等待。攻击打向朝向前 1～2 格；本拍格挡免疫攻击。",
  },
  {
    title: "缩圈与计分",
    body: "每 60 拍缩圈。得分 = 3×核心停留 + 10×击杀 + 0.05×存活拍。",
  },
] as const;

const BOMBER_RULES = [
  {
    title: "目标",
    body: "在砖墙迷宫里用炸弹淘汰对手。存活到最后，或靠击杀与拆墙拿高分。",
  },
  {
    title: "即时动作",
    body: "移动、放炸弹、等待——本拍提交本拍生效（没有 Arena 的两拍延迟）。",
  },
  {
    title: "炸弹与连锁",
    body: "炸弹约 3 拍后十字爆炸（含放置拍倒计时）；火力初始 1。炸到未爆弹会连锁。软墙可毁，硬墙永久。",
  },
  {
    title: "道具与计分",
    body: "拆墙可能掉火力/弹数。得分 = 50×击杀 + 5×拆墙 + 0.1×存活拍。",
  },
  {
    title: "残局缩圈",
    body: "只剩两人时进入加时：约每 18 拍外圈变致死区，最多约 90 拍决出胜负，避免无限拉扯。",
  },
] as const;

const TANKS_RULES = [
  {
    title: "目标",
    body: "在硬墙迷宫里开坦克互射。最后存活者获胜；也可靠击杀拿高分。",
  },
  {
    title: "即时动作",
    body: "MOVE_* 会转向并尝试前进一格；FIRE 沿当前朝向发射；WAIT。本拍提交本拍生效。",
  },
  {
    title: "子弹",
    body: "每辆坦克同时最多一发子弹；子弹每拍前进一格，撞墙消失，命中即死（1 命）。",
  },
  {
    title: "计分",
    body: "得分 = 50×击杀 + 0.1×存活拍。",
  },
] as const;

const SOKOBAN_RULES = [
  {
    title: "目标",
    body: "所有人拿到同一张推箱子关卡的独立副本。谁先把全部箱子推上目标点谁领先。",
  },
  {
    title: "动作",
    body: "MOVE_* / WAIT。走到箱子上会尝试沿同方向推动；撞墙或另一箱子则失败。",
  },
  {
    title: "竞速",
    body: "每人盘面互不影响。完成后停止行动；全员完成或到达 maxTicks 结算。",
  },
  {
    title: "计分",
    body: "通关：10000 − 10×完成拍 − 步数。未通关：100×已入目标箱数 + 0.1×存活拍。",
  },
] as const;

const HOLDEM_RULES = [
  {
    title: "目标",
    body: "一局一手德州扑克。用底牌 + 公共牌组成最大五张牌型，赢得底池。最终按剩余筹码排名。",
  },
  {
    title: "流程",
    body: "发底牌 → 翻前下注 → 翻牌三张 → 转牌 → 河牌 → 摊牌。每人轮到时行动（顺序下注，不是同时）。",
  },
  {
    title: "动作",
    body: "FOLD / CHECK / CALL / RAISE（固定加注额）。非法或 WAIT 会自动 CHECK/CALL/FOLD。",
  },
  {
    title: "盲注",
    body: "起始筹码 100；小盲 1 / 大盲 2。",
  },
] as const;

const RULES_BY_GAME: Record<string, readonly { title: string; body: string }[]> =
  {
    arena: ARENA_RULES,
    bomber: BOMBER_RULES,
    tanks: TANKS_RULES,
    sokoban: SOKOBAN_RULES,
    holdem: HOLDEM_RULES,
  };

export function RulesPanel({ gameId }: { gameId: string }) {
  const rules = RULES_BY_GAME[gameId] ?? ARENA_RULES;
  return (
    <section className="mt-12 border-t border-ink/10 pt-8">
      <h2 className="font-display text-2xl font-bold">游戏规则</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink/65">
        Machia 是多游戏 AI 对战平台。Bot 通过 stdin/stdout
        按拍决策；不同游戏有各自的签名机制。
      </p>
      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        {rules.map((rule) => (
          <div
            key={rule.title}
            className="rounded-md border border-ink/8 bg-paper/40 px-3 py-3 border-l-[3px] border-l-moss/50"
          >
            <dt className="font-display text-sm font-bold tracking-wide text-moss">
              {rule.title}
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink/75">{rule.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
