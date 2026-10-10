#!/usr/bin/env node
"use strict";

const { run } = require("../machia.js");
const { decide } = require("../holdem-lib.js");

const STYLE = "maniac";

run({
  act(obs) {
    return decide(obs, STYLE);
  },
});
