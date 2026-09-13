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
  "entry": "bot.js"
}
```

## Messages (server → bot)

### `game_start`

```json
{
  "type": "game_start",
  "playerId": 0,
  "mapSize": 19,
  "playerCount": 4,
  "spawn": { "x": 9, "y": 0 }
}
```

Do not reply.

### `observation`

Sent every tick before actions for that tick resolve. Includes everyone’s queued actions for the current and next tick (public 2-tick delay).

Reply with one line:

```json
{ "action": "MOVE_UP" }
```

Valid actions: `MOVE_UP` `MOVE_DOWN` `MOVE_LEFT` `MOVE_RIGHT` `ATTACK` `BLOCK` `WAIT`.

Timeout (default 100ms) or invalid JSON → treated as `WAIT`.

### `game_end`

```json
{
  "type": "game_end",
  "results": [ { "playerId": 0, "score": 12.5, "rank": 1, "...": "..." } ]
}
```

Do not reply. Process will be terminated.

## Rules summary

- Action submitted on tick T executes on tick T+2.
- Queues are public in every observation.
- Opening two queue slots are prefilled with `WAIT`.
- See arena rules in the product plan / engine tests for movement, attack, shrink, and scoring.
