/** Map gameId to shell/token accent. */
export function gameAccent(
  gameId: string,
): "arena" | "bomber" | "tanks" | "sokoban" | "holdem" {
  if (
    gameId === "bomber" ||
    gameId === "tanks" ||
    gameId === "sokoban" ||
    gameId === "holdem"
  ) {
    return gameId;
  }
  return "arena";
}
