#!/usr/bin/env node
"use strict";

const { run } = require("../machia.js");
const { decide } = require("../quoridor-lib.js");

// Fourth demo seat: plays the same style as quoridor-rush.
const STYLE = "rush";

run({
  act(obs) {
    return decide(obs, STYLE);
  },
});
