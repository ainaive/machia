# Machia Bot Protocol

Bots are long-lived Node.js processes. The platform talks over **stdin/stdout**, one JSON object per line.

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

## Practice vs contest

- **Practice lobby** (`/games/:gameId`) loads sample bots from the server `bots/` directory. No account needed.
- **Contests** (`/contests`) require an invite-code account. Upload the same layout (`manifest.json` + `entry` file, plus optional extra `.js`). Total size ≤ 256KB. `runtime` must be `"node"`. `games` must include the contest's game.
- An admin reviews the source, then starts a **1v1 round-robin**. Ranking: wins, then draws, then sum of match scores.
- Uploaded bots run as Node child processes. There is no sandbox in v1 — approval is a trust decision. Do not run untrusted contests on a shared machine.

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

Timeout (100ms) or invalid JSON → game default (`WAIT`).

### `game_end`

```json
{
  "type": "game_end",
  "results": [{ "playerId": 0, "score": 12.5, "rank": 1 }]
}
```

Do not reply.

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
- Score = remaining stack after the hand.

## Quoridor

Actions: `MOVE:N|S|E|W` `JUMP:…` `WALL:H|V:x:y` `WAIT` (or object form `{type,dir}` / `{type,orient,x,y}`)

- 7×7 board (demo); 2–4 players. Reach your opposite edge first.
- **Sequential** turns: only `toAct` is alive each tick (same pattern as Hold'em).
- Orthogonal move, or jump over an adjacent pawn; place length-2 fences that never fully cut any player's path.
- Observation includes `walls`, `legal` (string keys), `self` / `players` with `pos`, `fences`, `goal`.
- Score: finished → `10000 - 10*finishTick`; else distance-based consolation.
