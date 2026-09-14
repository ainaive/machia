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
- Observation includes `tiles`, `bombs` (with `fuse`), `powerups`, player `power` / `bombsLeft`.
