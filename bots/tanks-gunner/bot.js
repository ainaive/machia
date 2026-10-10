#!/usr/bin/env node
"use strict";

const { run } = require("../machia.js");
const { decide } = require("../tanks-lib.js");

run({
  act(obs) {
    const self = obs.players.find((p) => p.id === obs.selfId);
    if (!self || !self.alive) return "WAIT";
    // Prefer fire when aligned; otherwise hunt
    return decide(obs, self, "hunter");
  },
});
