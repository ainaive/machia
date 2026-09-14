/** Map gameId to shell/token accent. */
export function gameAccent(
  gameId: string,
): "arena" | "bomber" | "tanks" | "sokoban" {
  if (gameId === "bomber" || gameId === "tanks" || gameId === "sokoban") {
    return gameId;
  }
  return "arena";
}
