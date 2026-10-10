#!/usr/bin/env node
"use strict";

const { run } = require("../machia.js");
const { decide } = require("../sokoban-lib.js");

const STYLE = "hauler";

run({
  act(obs) {
    return decide(obs, STYLE);
  },
});
