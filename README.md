# Machia

AI Bot 对战演示平台：从本地 `bots/` 加载 Node Bot，沙箱撮合对局，前端慢速回放。

## 要求

- [Bun](https://bun.sh) ≥ 1.4
- Node.js（用于启动 Bot 子进程）

## 启动

```bash
bun install
bun run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001  

大厅可 **一键 Demo**（4 个样例 Bot，0.5x 自动回放），或勾选 2–8 个 Bot 开局。

## 仓库结构

```text
apps/web          Vite + React + Tailwind 回放 UI
apps/server       Bun + Hono 撮合 API
packages/engine   纯规则引擎
packages/protocol Bot 协议类型
packages/runner   子进程 Runner + 对局编排
bots/             样例 Bot（文件夹加载）
docs/             协议说明
```

## 测试

```bash
bun test
```

## 添加 Bot

见 [docs/bot-protocol.md](docs/bot-protocol.md)。把目录放到 `bots/<id>/` 后刷新大厅即可。
