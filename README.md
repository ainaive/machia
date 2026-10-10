# Machia

AI Bot 多游戏对战平台：练习场加载本地 `bots/` 样例；正式赛事支持邀请码注册、提交 Bot、管理员审批与 1v1 循环赛。

当前游戏：**Arena** · **Bomber** · **Tanks** · **Sokoban** · **Hold'em** · **Quoridor**。

## 要求

- [Bun](https://bun.sh) ≥ 1.4
- Node.js（启动 Bot 子进程）

## 启动

```bash
bun install
bun run dev
```

管理员必须用环境变量种子（注册不再对公众开放，也没有「第一个注册用户变管理员」）：

```bash
MACHIA_ADMIN_EMAIL=admin@localhost \
MACHIA_ADMIN_USERNAME=admin \
MACHIA_ADMIN_PASSWORD=changeme \
MACHIA_PUBLIC_URL=http://localhost:3001 \
bun run dev
```

本地未配 SMTP 时，忘记密码会把重置链接打到 **API 进程日志**。生产请设置 `MACHIA_SMTP_*`（见 [docs/deploy.md](docs/deploy.md)）。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `HOST` / `PORT` | 全部网卡 / `3001` | API 监听地址；生产用 `127.0.0.1`，只让 nginx 对外 |
| `MACHIA_PUBLIC_URL` | `http://localhost:3001` | 对外访问的 origin（重置邮件链接、Cookie、CORS） |
| `MACHIA_AUTH_SECRET` | 本地内置开发密钥 | 会话签名密钥，≥ 32 字符。`MACHIA_PUBLIC_URL` 不是 localhost 时**必填**，否则拒绝启动 |
| `MACHIA_ADMIN_EMAIL` / `_USERNAME` / `_PASSWORD` | — | 启动时种子管理员 |
| `MACHIA_DB` | `data/machia.db` | SQLite 路径 |
| `MACHIA_UPLOADS_DIR` | `data/uploads` | 参赛 Bot 存放目录 |
| `MACHIA_SANDBOX` | `off` | `bwrap`：Bot 在沙箱中运行（生产 unit 默认开启，见 deploy.md） |
| `MACHIA_REPLAYS_DIR` | `data/replays` | 对局回放目录（`bun test` 会自动指向临时目录） |
| `MACHIA_CONTEST_MAX_TICKS` | 各游戏默认 | 赛事对局最大回合数 |
| `MACHIA_AUTH_RATE_LIMIT` | 开启 | 设为 `0` 关闭登录/注册限流（仅测试用） |
| `MACHIA_SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_FROM` | — / `587` | 重置密码邮件；未配置时链接写入日志 |

只有 `MACHIA_PUBLIC_URL` 本身是 localhost 时，才额外信任 `localhost:5173` 等开发 origin。

登录管理员后打开 `/admin/invites` 生成邀请码，把码或 `/register?code=…` 发给参赛者。

- Web: http://localhost:5173
- API: http://localhost:3001
- 数据：`data/machia.db`（SQLite）、`data/uploads/`（参赛 Bot）、`data/replays/`（回放）

前端路由：

| 路径 | 说明 |
|------|------|
| `/` | 游戏目录（练习场入口）+ 正式比赛入口 |
| `/login` `/register` | 登录 / 邀请码注册 |
| `/forgot-password` `/reset-password` | 忘记密码 / 重置密码 |
| `/admin/invites` | 管理员生成、作废邀请码 |
| `/contests` | 赛事列表（管理员可创建） |
| `/contests/:id` | 报名、提交 Bot、审批、积分榜 |
| `/games/:gameId` | 练习场大厅（样例 Bot，免登录） |
| `/matches/:matchId` | 对局回放（可刷新） |

在练习场大厅里 **一键 Demo** 或勾选 Bot 开局。正式比赛：邀请码注册 → 报名并上传 `manifest.json` + `bot.js` → 管理员审批 → 开赛后自动打完所有 1v1（每对交换座位各打一局，两局同一随机种子），再看积分榜与回放。

生产静态托管需配置 History API fallback（把未知路径回落到 `index.html`）。VPS 部署（nginx `:3000` TLS + loopback API）见 [docs/deploy.md](docs/deploy.md)。

**信任模型：** 生产环境（`MACHIA_SANDBOX=bwrap`）中每个 Bot 都在 bubblewrap 沙箱里运行：无网络，只能看到自己的目录（只读），每个 Bot 限 256MB 内存、32 个进程/线程、1 个 CPU，读不到 `data/` 和其他参赛者的文件。本地开发默认不开沙箱，Bot 是普通子进程。部署要求见 [docs/deploy.md](docs/deploy.md#bot-sandbox)。

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

五步上手见 [docs/bot-protocol.md#quick-start](docs/bot-protocol.md#quick-start)：复制样例到 `bots/<名字>/`，用 [`bots/machia.js`](bots/machia.js) SDK 写 `act(obs)`，本地对战，打包上传。不用启动服务器也能本地对战：

```bash
bun run match quoridor quoridor-rush ./my-bot --seed 5   # 样例 id 或 Bot 目录
```

会打印排名、分数与种子，并把回放写入 `data/replays/`（`bun run dev` 时可在 `/matches/<id>` 观看）。

参赛上传只接受扁平文件。`bun run pack <Bot 目录>` 会把 Bot 及其依赖（包括 `machia.js`、样例的 `*-lib.js`、npm 包）打包成一个 `bot.js`，连同规范化的 `manifest.json` 输出到 `dist/bots/<名字>/`，直接上传这两个文件即可。
