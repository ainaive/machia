/** Map gameId to shell/token accent. */
export function gameAccent(
  gameId: string,
): "arena" | "bomber" | "tanks" | "sokoban" | "holdem" | "quoridor" {
  if (
    gameId === "bomber" ||
    gameId === "tanks" ||
    gameId === "sokoban" ||
    gameId === "holdem" ||
    gameId === "quoridor"
  ) {
    return gameId;
  }
  return "arena";
}
