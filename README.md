# Machia

AI Bot 多游戏对战演示平台：从本地 `bots/` 加载 Node Bot，沙箱撮合，前端回放。

当前游戏：**Arena** · **Bomber** · **Tanks** · **Sokoban**（同关竞速）。

## 要求

- [Bun](https://bun.sh) ≥ 1.4
- Node.js（启动 Bot 子进程）

## 启动

```bash
bun install
bun run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001

前端路由：

| 路径 | 说明 |
|------|------|
| `/` | 游戏目录 |
| `/games/:gameId` | 单游戏大厅（`arena` / `bomber` / `tanks` / `sokoban`） |
| `/matches/:matchId` | 对局回放（可刷新） |

在大厅里 **一键 Demo** 或勾选 Bot 开局。生产静态托管需配置 History API fallback（把未知路径回落到 `index.html`）。

## 仓库结构

```text
apps/web              Vite + React 回放 UI
apps/server           Bun + Hono API
packages/game-api     GamePlugin 接口
packages/engine       Arena 规则 + 插件
packages/games-bomber Bomber 规则 + 插件
packages/games-tanks  Tanks 规则 + 插件
packages/games-sokoban Sokoban 竞速规则 + 插件
packages/protocol     Bot 信封类型
packages/runner       子进程 Runner + 游戏注册表
bots/                 样例 Bot（manifest.games 声明兼容游戏）
docs/                 协议说明
```

## 测试与质量

```bash
bun test              # 引擎 / Runner / API
bun run typecheck
bun run check         # typecheck + test + web build（与 CI 一致）
```

CI：`.github/workflows/ci.yml`（PR 与 `main`）。给 agent / 贡献者的约定见 [AGENTS.md](AGENTS.md)。

前端回放棋盘使用 SVG 精灵（机器人 / 炸弹 / 墙 / 道具）与 `motion`、`lucide-react` 做动效与控件图标。

## 添加 Bot

见 [docs/bot-protocol.md](docs/bot-protocol.md)。
