import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fetchGames } from "./api";

function respond(body: string, init: ResponseInit) {
  return spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, init));
}

describe("api", () => {
  afterEach(() => mock.restore());

  test("returns the parsed body", async () => {
    respond(JSON.stringify({ games: [] }), { status: 200 });
    expect(await fetchGames()).toEqual({ games: [] });
  });

  test("reports the server's error message", async () => {
    respond(JSON.stringify({ error: "Login required" }), { status: 401 });
    await expect(fetchGames()).rejects.toThrow("Login required");
  });

  test("reports the status when a proxy answers with an HTML error page", async () => {
    respond("<html><body>502 Bad Gateway</body></html>", {
      status: 502,
      statusText: "Bad Gateway",
    });
    await expect(fetchGames()).rejects.toThrow("请求失败（502 Bad Gateway）");
  });

  test("rejects a successful response that isn't JSON", async () => {
    respond("<!doctype html><title>Machia</title>", { status: 200 });
    await expect(fetchGames()).rejects.toThrow("服务器返回了无法识别的响应");
  });
});
