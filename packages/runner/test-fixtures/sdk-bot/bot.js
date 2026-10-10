// Test fixture: exercises bots/machia.js. Each observation's `mode` picks a behaviour.
const { run } = require("../../../../bots/machia.js");

let startedAs = null;
run({
  start(info) {
    startedAs = info.playerId;
  },
  async act(obs) {
    if (obs.mode === "throw") throw new Error("boom");
    if (obs.mode === "nothing") return undefined;
    if (obs.mode === "slow") await new Promise((r) => setTimeout(r, 50));
    return { tick: obs.tick, startedAs };
  },
});
