#!/usr/bin/env node
"use strict";

/** Simple Hold'em heuristic: pot odds + crude hand strength. */

const RANK = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
};

function parseCard(id) {
  if (!id || id === "??") return null;
  const rankCh = id[0];
  const suit = id[1];
  const rank = RANK[rankCh] || Number(rankCh);
  return { rank, suit };
}

function holeStrength(hole) {
  const cards = hole.map(parseCard).filter(Boolean);
  if (cards.length < 2) return 0.15;
  const [a, b] = cards;
  let s = 0.1;
  if (a.rank === b.rank) s = 0.55 + a.rank / 100;
  else {
    s = (a.rank + b.rank) / 40;
    if (a.suit === b.suit) s += 0.08;
    if (Math.abs(a.rank - b.rank) <= 2) s += 0.05;
  }
  return Math.min(0.95, s);
}

function decide(msg, style = "tight") {
  const legal = msg.legal || [];
  if (!legal.length || (legal.length === 1 && legal[0] === "WAIT")) {
    return "WAIT";
  }
  const strength = holeStrength(msg.self?.hole || []);
  const toCall = Math.max(0, (msg.currentBet || 0) - (msg.self?.bet || 0));
  const pot = msg.pot || 1;
  const potOdds = toCall / (pot + toCall || 1);

  const thresholds = {
    tight: { fold: 0.35, raise: 0.7 },
    loose: { fold: 0.22, raise: 0.55 },
    maniac: { fold: 0.12, raise: 0.4 },
    rock: { fold: 0.45, raise: 0.8 },
  };
  const t = thresholds[style] || thresholds.tight;

  if (legal.includes("CHECK") && strength < t.raise) return "CHECK";
  if (legal.includes("RAISE") && strength >= t.raise) return "RAISE";
  if (legal.includes("CALL") && strength >= Math.max(t.fold, potOdds * 0.9)) {
    return "CALL";
  }
  if (legal.includes("CHECK")) return "CHECK";
  if (legal.includes("FOLD")) return "FOLD";
  if (legal.includes("CALL")) return "CALL";
  return legal[0] || "WAIT";
}

module.exports = { decide };
