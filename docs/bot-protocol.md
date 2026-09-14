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
