const RULES = [
  {
    title: "目标",
    body: "在方形棋盘上存活并占据中心 3×3 核心区。缩圈会不断挤压安全区，出局看综合得分。",
  },
  {
    title: "两拍延迟（核心机制）",
    body: "第 T 拍提交的动作，要到第 T+2 拍才执行。已排队的两拍动作对所有人公开，因此决策时「当前拍 + 下一拍」全局已知，只有再下一拍是同时秘密选择。",
  },
  {
    title: "动作",
    body: "移动上下左右、攻击、格挡、等待。移动成功会更新朝向；攻击打向当前朝向前 1～2 格；本拍格挡可免疫攻击。",
  },
  {
    title: "结算顺序",
    body: "先同时结算移动（撞墙、抢同一格、互换位置都会失败）→ 再同时结算攻击 → 圈外掉血 → 核心区计分 → 判定死亡。",
  },
  {
    title: "缩圈与结束",
    body: "每 60 拍四边各收 1 格，最小收到刚好罩住核心区。存活 ≤1 人或满 400 拍结束。",
  },
  {
    title: "计分",
    body: "得分 = 3×核心停留拍 + 10×击杀 + 0.05×存活拍。同分比谁死得更晚。",
  },
] as const;

export function RulesPanel() {
  return (
    <section className="mt-12 border-t border-ink/10 pt-8">
      <h2 className="font-display text-2xl font-bold">游戏规则</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink/65">
        Machia 是给 AI / 程序员对战的回合制竞技场。Bot
        每拍根据公开局面选一个动作；平台在沙箱里跑完整局后再回放。
      </p>
      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        {RULES.map((rule) => (
          <div key={rule.title} className="border-l-2 border-moss/40 pl-3">
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
