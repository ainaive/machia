# Machia Bot Protocol

Bots are long-lived Node.js processes. The platform talks over **stdin/stdout**, one JSON object per line.

## Quick start

From a clone of this repo (`bun install` first):

1. **Start from a sample** close to what you want, inside `bots/` so the SDK path resolves, and rename it:
   `cp -r bots/turtle bots/my-bot`, then set `name` (and `games`) in `bots/my-bot/manifest.json`.
2. **Write your logic** in `act(obs)` — see [SDK](#sdk) below and your game's section for observation fields and actions.
3. **Play it offline**: `bun run match arena my-bot turtle`. It prints ranks, scores and the seed, and flags any bot that timed out, sent invalid replies or crashed. `--seed N` replays a match exactly; `--ticks N` shortens it. Your bot's stderr (`log(...)`) shows as it plays.
4. **Watch the replay**: with `bun run dev` running, open the printed `/matches/<id>` link. Bots in `bots/` also appear in the local practice lobby.
5. **Package and upload**: `bun run pack bots/my-bot`, then upload `dist/bots/my-bot/manifest.json` and `dist/bots/my-bot/bot.js` on the contest page.

## Layout

```text
bots/<bot-id>/
  manifest.json
  bot.js
```

`manifest.json`:

```json
{
  "name": "My Bot",
  "runtime": "node",
  "entry": "bot.js",
  "games": ["arena"]
}
```

`games` lists which games this bot supports. Omitted → defaults to `["arena"]`.

### SDK

[`bots/machia.js`](../bots/machia.js) handles the protocol for you: it parses messages, calls your `act(observation)` (sync or async), and writes exactly one reply per observation, in order, falling back to `WAIT` if `act` throws or returns nothing. Bots under `bots/` load it as `../machia.js`; elsewhere, copy it next to your `bot.js`. `bun run pack` bundles it into the upload either way.

```js
const { run, log } = require("../machia.js");

run({
  act(obs) {
    log("tick", obs.tick); // stderr only — stdout is for replies
    return "WAIT";
  },
});
```

## Practice vs contest

- **Practice lobby** (`/games/:gameId`) loads sample bots from the server `bots/` directory. No account needed.
- **Contests** (`/contests`) require an invite-code account. Upload the same layout (`manifest.json` + `entry` file, plus optional extra `.js`). Total size ≤ 256KB. `runtime` must be `"node"`. `games` must be an array that includes the contest's game.
- Uploads are **flat**: all files land in one folder, so `entry` must be a bare file name (`bot.js`, not `src/bot.js` or `../x.js`) and `require` only sibling files. If your bot spans several files, uses `../machia.js` or the samples' shared `../<game>-lib.js` helpers, or depends on npm packages, run `bun run pack <botDir>`: it bundles everything into one `bot.js` plus a clean `manifest.json` under `dist/bots/<name>/`, ready to upload (and checks the 256KB limit). The server stores a normalized `manifest.json` (`name`, `runtime`, `entry`, `games`); other fields are dropped.
- An admin reads the uploaded files on the contest page and approves **that exact version** (approval carries a hash of the files, so a re-upload after the review needs a fresh review); you can view your own upload the same way. The hash is checked again before every contest game: if the files on the server ever differ from what was approved, the game fails instead of running unreviewed code. Then the admin starts a **1v1 round-robin**. Every pair plays **twice, swapping seats**, and both games use the same seed (same map / deck), so neither seat nor luck favours either bot. Each game counts as a win, loss or draw (equal ranks are a draw). Ranking: wins, then draws, then sum of match scores.
- On a sandboxed server (`MACHIA_SANDBOX=bwrap`, the production default) every bot runs isolated:
  - **No network.** Not even to the Machia API.
  - **Only its own folder**, read-only, as the working directory (sample bots see `bots/`). `/tmp` is a private scratch space; nothing else of the host is visible.
  - **Limits per bot:** 256MB memory, 32 processes + threads (a Node bot uses about a dozen), 1 CPU. Going over the memory limit kills the bot; the replay shows it as crashed.
- Without the sandbox (local development, or a server that turned it off) bots are plain Node child processes: they can read the server's files and use the network, so a bot could, e.g., read the first game's replay to learn the rematch's shared seed. Approval is then a trust decision.
- The bot's working directory is its own folder. Its environment is minimal: `MACHIA_PLAYER_ID` plus `PATH`, `LANG` and `TZ` when the server has them. Server settings and secrets are not passed through.

## Envelope (all games)

### `game_start`

```json
{
  "type": "game_start",
  "gameId": "arena",
  "playerId": 0,
  "playerCount": 4,
  "mapSize": 19,
  "spawn": { "x": 9, "y": 0 }
}
```

Do not reply. Extra fields depend on the game.

### `observation`

Sent every tick. Shape depends on `gameId`. Reply with:

```json
{ "action": "..." }
```

Timeout (100ms; **1000ms for the first observation**, which also covers process startup) or invalid JSON → game default (`WAIT`).

Write **exactly one line per observation**, in order. stdout is reserved for replies — log to stderr instead (the server keeps the first 8KB per bot). Replies are matched to observations by order, so:

- A reply that arrives after its timeout is discarded; that tick already used the default action, and your next reply answers the next observation.
- Lines written while no observation is outstanding (e.g. after `game_start`) are ignored.
- A reply line over 64KB counts as invalid JSON.
- Skipping a reply or writing extra stdout lines shifts every later reply by one tick.

Each replay records per-bot `stats` — `timeouts`, `invalidReplies`, and `crashed` (the process exited while still being asked for actions) — and the replay viewer flags any bot with problems. Check them first when a bot plays worse than expected.

### `game_end`

```json
{
  "type": "game_end",
  "results": [{ "playerId": 0, "score": 12.5, "rank": 1 }]
}
```

Players the game cannot separate (equal score and tie-breaks) share a rank, e.g. `1, 1, 3`. Seat order never breaks a tie.

Do not reply. The bot is then sent `SIGTERM`; 500ms later it and any processes it started are killed with `SIGKILL`.

### Randomness

Every match runs from a 32-bit seed that the replay records as `seed`; the same seed and the same bot actions replay the same match (Bomber's soft walls and power-ups, Hold'em's deck). Bots are not told the seed.

---

## Arena

Actions: `MOVE_UP` `MOVE_DOWN` `MOVE_LEFT` `MOVE_RIGHT` `ATTACK` `BLOCK` `WAIT`

- Action submitted on tick T executes on T+2; queues are public in every observation.
- Opening two queue slots are `WAIT`.
- Observation includes `players[].queue`, `core`, `safe`, HP, facing.

## Bomber

Actions: `MOVE_UP` `MOVE_DOWN` `MOVE_LEFT` `MOVE_RIGHT` `PLACE_BOMB` `WAIT`

- Actions apply **immediately** (no 2-tick delay).
- Bombs fuse for 4 ticks (countdown starts the placement tick), then explode in a cross; soft walls break; hard walls block.
- Observation includes `tiles`, `bombs` (with `fuse`), `powerups`, player `power` / `bombsLeft`, plus `hazardRing` / `duelTicks` in 1v1 overtime.
- When exactly two players remain: every 18 duel ticks the hazard ring grows (outer empty cells become lethal); duel ends by ~90 ticks if still tied.

## Tanks

Actions: `MOVE_UP` `MOVE_DOWN` `MOVE_LEFT` `MOVE_RIGHT` `FIRE` `WAIT`

- Actions apply **immediately**.
- `MOVE_*` sets facing and attempts to move one cell; blocked by hard walls / other tanks.
- `FIRE` spawns a bullet on the tank (at most one live bullet per owner); bullets advance one cell per tick, vanish on hard walls, kill on hit (1 HP).
- Observation includes `tiles` (`empty`|`hard`), `bullets`, `players[].facing` / `alive`.
- Score = `50 * kills + 0.1 * survivalTicks`.

## Sokoban

Actions: `MOVE_UP` `MOVE_DOWN` `MOVE_LEFT` `MOVE_RIGHT` `WAIT`

- Multiplayer **race**: each player gets an independent copy of the same level.
- Walking into a box pushes it if the cell beyond is free (not wall / box).
- Observation: `cells`, `goals`, `self` (`pos`, `boxes`, `boxesOnGoal`, `done`, `steps`), and `rivals` progress (not full boards).
- Finished players stop receiving actions (`isAlive` false). Match ends when all finished or `maxTicks`.
- Score: solved → `10000 - 10*finishTick - steps`; else `100*boxesOnGoal + 0.1*ticks`.

## Hold'em

Actions: `FOLD` `CHECK` `CALL` `RAISE` `WAIT`

- One hand per match (2–4 seats). Starting stack 100; blinds 1/2; fixed raise size 4.
- **Sequential** betting: only `toAct` must act each tick; `isAlive` is true only for that seat.
- Observation includes private `self.hole`, public `community`, `pot`, `currentBet`, `legal`, and masked rival holes (`??`) until showdown.
- Invalid or `WAIT` on your turn → auto `CHECK`, else `CALL`, else `FOLD`.
- Once nobody can bet (all remaining players all-in, or one player left with nothing to call), the remaining streets are dealt one per tick without asking anyone, then showdown. At `maxTicks` the rest of the board is dealt and hands are compared.
- Score = remaining stack after the hand.

## Quoridor

Actions: `MOVE:N|S|E|W` `JUMP:…` `WALL:H|V:x:y` `WAIT` (or object form `{type,dir}` / `{type,orient,x,y}`)

- 7×7 board (demo); 2–4 players. Reach your opposite edge first.
- **Sequential** turns: only `toAct` is alive each tick (same pattern as Hold'em).
- Orthogonal move, or jump over an adjacent pawn; place length-2 fences that never fully cut any player's path.
- Observation includes `walls`, `legal` (string keys), `self` / `players` with `pos`, `fences`, `goal`.
- Score: finished → `10000 - 10*finishTick`; else distance-based consolation.
