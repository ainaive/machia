# Machia

AI Bot 多游戏对战演示平台：从本地 `bots/` 加载 Node Bot，沙箱撮合，前端回放。

当前游戏：**Arena**（两拍延迟缩圈）· **Bomber**（炸弹人）。

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

大厅先选游戏，再 **一键 Demo** 或勾选 Bot 开局。

## 仓库结构

```text
apps/web              Vite + React 回放 UI
apps/server           Bun + Hono API
packages/game-api     GamePlugin 接口
packages/engine       Arena 规则 + 插件
packages/games-bomber Bomber 规则 + 插件
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

## 添加 Bot

见 [docs/bot-protocol.md](docs/bot-protocol.md)。
