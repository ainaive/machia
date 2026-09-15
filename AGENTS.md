# Machia — Agent Guide

Instructions for humans and coding agents working in this repository.

## Project

Self-hosted AI bot competition platform (Bun workspaces). Bots are long-lived Node processes (stdin/stdout JSON). Matches run server-side; the web app replays them. Practice lobbies use sample bots; contests require accounts, bot upload, admin approval, then a 1v1 round-robin.

- `apps/web` — Vite + React（`/` 目录、`/games/:gameId` 练习场、`/contests` 赛事、`/matches/:id` 回放）
- `apps/server` — Hono API（会话 cookie、SQLite `data/machia.db`、赛事队列）
- `packages/game-api` — `GamePlugin` interfaces
- `packages/engine` — Arena
- `packages/games-bomber` — Bomber
- `packages/games-tanks` — Tanks
- `packages/games-sokoban` — Sokoban race
- `packages/games-holdem` — Texas Hold'em
- `packages/games-quoridor` — Quoridor
- `packages/protocol` — bot envelope types
- `packages/runner` — subprocess runner + game registry
- `bots/` — sample bots (`manifest.json` + `bot.js`)
- `docs/bot-protocol.md` — bot protocol (source of truth for authors)

## Quality bar (required)

Before considering a change done:

1. **`bun run typecheck`** — must pass
2. **`bun test`** — must pass
3. For UI-affecting work: **`bun run --filter @machia/web build`** (or full `bun run check`)

Prefer `bun run check` locally; CI runs the same gates on every PR and `main` push.

## Tests & docs with every change

**Whenever you add or change behavior, update or add tests and docs in the same change.** Do not leave “tests later” or “docs later”.

| Change | Also update |
|--------|-------------|
| Engine / game rules | Unit tests under the package (`*.test.ts`); `docs/bot-protocol.md` if observation/actions/rules change; lobby `RulesPanel` if player-facing |
| Runner / match flow | `packages/runner` tests (registry + `runMatch`) |
| API / matches | `apps/server` tests (`api.test.ts`, `matches.test.ts`, `platform.test.ts`, `standings.test.ts`) |
| Sample bots | Keep demos playable; if protocol or style assumptions change, note in README or protocol docs |
| New game plugin | Register in `packages/runner` registry; API games list; `/games/:gameId` lobby works via API; board + `RulesPanel`; sample bots; protocol appendix; tests for engine + short `runMatch` |
| Breaking protocol | Bump docs clearly; update all sample bots that break |

Add tests that fail for the bug/feature before (or with) the fix. Prefer focused unit tests; use short `maxTicks` for subprocess `runMatch` tests.

## Code style

- Match existing patterns; minimal diffs; no drive-by refactors.
- TypeScript strict; Bun for scripts/tests.
- Do not commit secrets, large generated artifacts, or unrelated lockfile churn.
- Commits: conventional, scoped (`feat:`, `fix:`, `test:`, `docs:`, `ci:`); small focused commits preferred.

## Local commands

```bash
bun install
bun run dev          # web :5173 + api :3001
bun test
bun run typecheck
bun run check        # typecheck + test + web build
```

## Do not

- Skip CI gates or weaken tests to greenwash.
- Change game scoring/rules without tests and protocol/rules copy.
- Add a second game framework — extend `GamePlugin` instead.
