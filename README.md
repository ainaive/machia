# Machia

AI Bot 多游戏对战平台：练习场加载本地 `bots/` 样例；正式赛事支持注册、提交 Bot、管理员审批与 1v1 循环赛。

当前游戏：**Arena** · **Bomber** · **Tanks** · **Sokoban** · **Hold'em** · **Quoridor**。

## 要求

- [Bun](https://bun.sh) ≥ 1.4
- Node.js（启动 Bot 子进程）

## 启动

```bash
bun install
bun run dev
```

可选：用环境变量固定管理员账号（否则**第一个注册用户**成为管理员）：

```bash
MACHIA_ADMIN_USERNAME=admin MACHIA_ADMIN_PASSWORD=changeme bun run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001
- 数据：`data/machia.db`（SQLite）、`data/uploads/`（参赛 Bot）、`data/replays/`（回放）

前端路由：

| 路径 | 说明 |
|------|------|
| `/` | 游戏目录（练习场入口）+ 正式比赛入口 |
| `/login` `/register` | 登录 / 注册 |
| `/contests` | 赛事列表（管理员可创建） |
| `/contests/:id` | 报名、提交 Bot、审批、积分榜 |
| `/games/:gameId` | 练习场大厅（样例 Bot，免登录） |
| `/matches/:matchId` | 对局回放（可刷新） |

在练习场大厅里 **一键 Demo** 或勾选 Bot 开局。正式比赛：注册 → 报名并上传 `manifest.json` + `bot.js` → 管理员审批 → 开赛后自动打完所有 1v1，再看积分榜与回放。

生产静态托管需配置 History API fallback（把未知路径回落到 `index.html`）。

**信任模型：** 参赛 Bot 以 Node 子进程运行，第一期没有隔离沙箱。只在可信参赛者 / 自托管场景开赛。

## 仓库结构

```text
apps/web              Vite + React 回放 UI
apps/server           Bun + Hono API
packages/game-api     GamePlugin 接口
packages/engine       Arena 规则 + 插件
packages/games-bomber Bomber 规则 + 插件
packages/games-tanks  Tanks 规则 + 插件
packages/games-sokoban Sokoban 竞速规则 + 插件
packages/games-holdem  Texas Hold'em 规则 + 插件
packages/games-quoridor Quoridor 挡板竞速规则 + 插件
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
