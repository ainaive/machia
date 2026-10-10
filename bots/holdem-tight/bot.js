#!/usr/bin/env node
"use strict";

const { run } = require("../machia.js");
const { decide } = require("../holdem-lib.js");

const STYLE = "tight";

run({
  act(obs) {
    return decide(obs, STYLE);
  },
});
