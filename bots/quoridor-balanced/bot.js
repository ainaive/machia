#!/usr/bin/env node
"use strict";

const { run } = require("../machia.js");
const { decide } = require("../quoridor-lib.js");

const STYLE = "balanced";

run({
  act(obs) {
    return decide(obs, STYLE);
  },
});
