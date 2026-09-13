import type { Direction, Position, Rect } from "./types";

export function centerCoord(mapSize: number): number {
  return (mapSize - 1) / 2;
}

export function coreRect(mapSize: number): Rect {
  const mid = centerCoord(mapSize);
  return {
    minX: mid - 1,
    minY: mid - 1,
    maxX: mid + 1,
    maxY: mid + 1,
  };
}

export function fullMapRect(mapSize: number): Rect {
  return { minX: 0, minY: 0, maxX: mapSize - 1, maxY: mapSize - 1 };
}

/** Max inset so safe zone still covers the 3x3 core. */
export function maxSafeInset(mapSize: number): number {
  const mid = centerCoord(mapSize);
  return mid - 1;
}

export function safeRectForTick(mapSize: number, tick: number): Rect {
  const inset = Math.min(Math.floor(tick / 60), maxSafeInset(mapSize));
  return {
    minX: inset,
    minY: inset,
    maxX: mapSize - 1 - inset,
    maxY: mapSize - 1 - inset,
  };
}

export function inRect(pos: Position, rect: Rect): boolean {
  return (
    pos.x >= rect.minX &&
    pos.x <= rect.maxX &&
    pos.y >= rect.minY &&
    pos.y <= rect.maxY
  );
}

/**
 * 8 rotationally symmetric spawn slots (edge mids + corners), clockwise from top mid.
 * For N players, take slots floor(i * 8 / N).
 */
export function spawnSlots(mapSize: number): Position[] {
  const mid = centerCoord(mapSize);
  const last = mapSize - 1;
  return [
    { x: mid, y: 0 },
    { x: last, y: 0 },
    { x: last, y: mid },
    { x: last, y: last },
    { x: mid, y: last },
    { x: 0, y: last },
    { x: 0, y: mid },
    { x: 0, y: 0 },
  ];
}

export function spawnPositions(playerCount: number, mapSize: number): Position[] {
  const slots = spawnSlots(mapSize);
  const positions: Position[] = [];
  for (let i = 0; i < playerCount; i++) {
    positions.push({ ...slots[Math.floor((i * 8) / playerCount)]! });
  }
  return positions;
}

export function facingTowardCenter(pos: Position, mapSize: number): Direction {
  const mid = centerCoord(mapSize);
  const dx = mid - pos.x;
  const dy = mid - pos.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) return "RIGHT";
    if (dx < 0) return "LEFT";
  }
  if (dy > 0) return "DOWN";
  if (dy < 0) return "UP";
  return "DOWN";
}

export function dirDelta(dir: Direction): Position {
  switch (dir) {
    case "UP":
      return { x: 0, y: -1 };
    case "DOWN":
      return { x: 0, y: 1 };
    case "LEFT":
      return { x: -1, y: 0 };
    case "RIGHT":
      return { x: 1, y: 0 };
  }
}

export function actionToDirection(
  action: "MOVE_UP" | "MOVE_DOWN" | "MOVE_LEFT" | "MOVE_RIGHT",
): Direction {
  switch (action) {
    case "MOVE_UP":
      return "UP";
    case "MOVE_DOWN":
      return "DOWN";
    case "MOVE_LEFT":
      return "LEFT";
    case "MOVE_RIGHT":
      return "RIGHT";
  }
}

export function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}
