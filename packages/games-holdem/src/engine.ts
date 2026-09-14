import type {
  GameCreateConfig,
  GameInstance,
  GamePlugin,
  GameResult,
  PlayerResult,
  TickSnapshot,
} from "@machia/game-api";
import {
  bestHand,
  cardId,
  makeDeck,
  shuffle,
  type Card,
} from "./cards";

export const HOLDEM_ACTIONS = [
  "FOLD",
  "CHECK",
  "CALL",
  "RAISE",
  "WAIT",
] as const;

export type HoldemAction = (typeof HOLDEM_ACTIONS)[number];
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "done";

export interface Seat {
  id: number;
  stack: number;
  bet: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  acted: boolean;
}

const START_STACK = 100;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;
const RAISE_SIZE = 4;

export function normalizeHoldemAction(raw: unknown): HoldemAction {
  if (
    typeof raw === "string" &&
    (HOLDEM_ACTIONS as readonly string[]).includes(raw)
  ) {
    return raw as HoldemAction;
  }
  if (raw && typeof raw === "object" && "action" in raw) {
    const a = (raw as { action: unknown }).action;
    if (
      typeof a === "string" &&
      (HOLDEM_ACTIONS as readonly string[]).includes(a)
    ) {
      return a as HoldemAction;
    }
  }
  return "WAIT";
}

export class HoldemEngine implements GameInstance {
  /** Seat count stand-in for board layout. */
  readonly mapSize: number;
  readonly maxTicks: number;
  tick = 0;
  finished = false;

  street: Street = "preflop";
  pot = 0;
  community: Card[] = [];
  seats: Seat[] = [];
  toAct = 0;
  button = 0;
  currentBet = 0;
  lastRaise = BIG_BLIND;
  private deck: Card[] = [];
  private readonly random: () => number;

  constructor(
    config: GameCreateConfig,
    options?: { random?: () => number; button?: number },
  ) {
    const n = config.playerCount;
    if (n < 2 || n > 4) throw new Error("holdem supports 2..4 players");
    this.mapSize = n;
    this.maxTicks = config.maxTicks ?? 200;
    this.random = options?.random ?? Math.random;
    this.button = options?.button ?? 0;
    this.seats = Array.from({ length: n }, (_, id) => ({
      id,
      stack: START_STACK,
      bet: 0,
      hole: [],
      folded: false,
      allIn: false,
      acted: false,
    }));
    this.startHand();
  }

  isAlive(playerId: number): boolean {
    if (this.finished || this.street === "done") return false;
    const s = this.seats[playerId];
    if (!s || s.folded || s.allIn) return false;
    return this.toAct === playerId;
  }

  observation(playerId: number) {
    const self = this.seats[playerId]!;
    return {
      tick: this.tick,
      selfId: playerId,
      mapSize: this.mapSize,
      street: this.street,
      pot: this.pot,
      currentBet: this.currentBet,
      toAct: this.toAct,
      button: this.button,
      community: this.community.map(cardId),
      legal: this.legalActions(playerId),
      self: {
        stack: self.stack,
        bet: self.bet,
        hole: self.hole.map(cardId),
        folded: self.folded,
        allIn: self.allIn,
      },
      seats: this.seats.map((s) => ({
        id: s.id,
        stack: s.stack,
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        // hide others' hole until showdown/done
        hole:
          s.id === playerId || this.street === "showdown" || this.street === "done"
            ? s.hole.map(cardId)
            : s.folded
              ? []
              : ["??", "??"],
      })),
    };
  }

  normalizeAction(raw: unknown): HoldemAction {
    return normalizeHoldemAction(raw);
  }

  startInfo(playerId: number) {
    return {
      mapSize: this.mapSize,
      stack: START_STACK,
      blinds: { sb: SMALL_BLIND, bb: BIG_BLIND },
      seat: playerId,
      button: this.button,
    };
  }

  step(actions: Record<number, unknown>): TickSnapshot {
    if (this.finished) throw new Error("game already finished");
    const events: Array<Record<string, unknown>> = [];
    const executed: Record<number, HoldemAction> = {};

    if (this.street === "showdown") {
      this.payoutShowdown(events);
      this.street = "done";
      this.finished = true;
    } else if (this.street !== "done") {
      const actor = this.seats[this.toAct]!;
      let action = this.normalizeAction(actions[this.toAct]);
      const legal = this.legalActions(this.toAct);
      if (!legal.includes(action) || action === "WAIT") {
        // Auto-check/call/fold for invalid/WAIT
        if (legal.includes("CHECK")) action = "CHECK";
        else if (legal.includes("CALL")) action = "CALL";
        else action = "FOLD";
      }
      executed[this.toAct] = action;
      this.applyAction(actor, action, events);
      this.advanceAfterAction(events);
    }

    for (const s of this.seats) {
      if (s.id !== this.toAct) executed[s.id] ??= "WAIT";
    }

    const snapshot: TickSnapshot = {
      tick: this.tick,
      executed,
      submitted: { ...executed },
      events,
      street: this.street,
      pot: this.pot,
      currentBet: this.currentBet,
      toAct: this.toAct,
      button: this.button,
      community: this.community.map(cardId),
      players: this.seats.map((s) => ({
        id: s.id,
        stack: s.stack,
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        alive: !s.folded,
        hole: s.hole.map(cardId),
      })),
    };

    this.tick += 1;
    if (this.tick >= this.maxTicks && !this.finished) {
      if (this.street !== "done") {
        this.street = "showdown";
        this.payoutShowdown(events);
        this.street = "done";
      }
      this.finished = true;
    }
    if (this.street === "done") this.finished = true;

    return snapshot;
  }

  results(): GameResult {
    const scored: PlayerResult[] = this.seats.map((s) => ({
      playerId: s.id,
      score: s.stack,
      rank: 0,
      survivalTicks: this.tick,
      deathTick: s.folded ? this.tick : null,
      kills: 0,
    }));
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((r, i) => {
      r.rank = i + 1;
    });
    return { ticks: this.tick, results: scored };
  }

  private startHand() {
    this.deck = shuffle(makeDeck(), this.random);
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.lastRaise = BIG_BLIND;
    this.street = "preflop";
    for (const s of this.seats) {
      s.bet = 0;
      s.folded = false;
      s.allIn = false;
      s.acted = false;
      s.hole = [this.deck.pop()!, this.deck.pop()!];
    }
    const n = this.seats.length;
    const sb = (this.button + 1) % n;
    const bb = (this.button + 2) % n;
    this.postBlind(this.seats[sb]!, SMALL_BLIND);
    this.postBlind(this.seats[bb]!, BIG_BLIND);
    this.currentBet = BIG_BLIND;
    this.toAct = (bb + 1) % n;
    this.skipToNextActor();
  }

  private postBlind(seat: Seat, amount: number) {
    const pay = Math.min(amount, seat.stack);
    seat.stack -= pay;
    seat.bet += pay;
    this.pot += pay;
    if (seat.stack === 0) seat.allIn = true;
  }

  private legalActions(playerId: number): HoldemAction[] {
    if (this.toAct !== playerId) return ["WAIT"];
    if (this.street === "done" || this.street === "showdown") return ["WAIT"];
    const s = this.seats[playerId]!;
    if (s.folded || s.allIn) return ["WAIT"];
    const out: HoldemAction[] = ["FOLD"];
    const toCall = this.currentBet - s.bet;
    if (toCall <= 0) out.push("CHECK");
    else if (s.stack > 0) out.push("CALL");
    if (s.stack > toCall) out.push("RAISE");
    return out;
  }

  private applyAction(
    seat: Seat,
    action: HoldemAction,
    events: Array<Record<string, unknown>>,
  ) {
    const toCall = this.currentBet - seat.bet;
    if (action === "FOLD") {
      seat.folded = true;
      seat.acted = true;
      events.push({ type: "fold", playerId: seat.id });
      return;
    }
    if (action === "CHECK") {
      seat.acted = true;
      events.push({ type: "check", playerId: seat.id });
      return;
    }
    if (action === "CALL") {
      const pay = Math.min(toCall, seat.stack);
      seat.stack -= pay;
      seat.bet += pay;
      this.pot += pay;
      if (seat.stack === 0) seat.allIn = true;
      seat.acted = true;
      events.push({ type: "call", playerId: seat.id, amount: pay });
      return;
    }
    if (action === "RAISE") {
      const callPay = Math.min(toCall, seat.stack);
      seat.stack -= callPay;
      seat.bet += callPay;
      this.pot += callPay;
      const raisePay = Math.min(RAISE_SIZE, seat.stack);
      seat.stack -= raisePay;
      seat.bet += raisePay;
      this.pot += raisePay;
      const raisedTo = seat.bet;
      this.lastRaise = Math.max(BIG_BLIND, raisedTo - this.currentBet);
      this.currentBet = raisedTo;
      if (seat.stack === 0) seat.allIn = true;
      seat.acted = true;
      for (const o of this.seats) {
        if (o.id !== seat.id && !o.folded && !o.allIn) o.acted = false;
      }
      events.push({
        type: "raise",
        playerId: seat.id,
        to: raisedTo,
      });
    }
  }

  private advanceAfterAction(events: Array<Record<string, unknown>>) {
    const active = this.seats.filter((s) => !s.folded);
    if (active.length === 1) {
      const winner = active[0]!;
      winner.stack += this.pot;
      events.push({
        type: "win",
        playerId: winner.id,
        pot: this.pot,
        reason: "fold",
      });
      this.pot = 0;
      this.street = "done";
      this.finished = true;
      return;
    }

    if (this.bettingRoundComplete()) {
      this.collectBets();
      this.dealNextStreet(events);
      return;
    }

    this.toAct = (this.toAct + 1) % this.seats.length;
    this.skipToNextActor();
  }

  private bettingRoundComplete(): boolean {
    const contenders = this.seats.filter((s) => !s.folded && !s.allIn);
    if (contenders.length === 0) return true;
    if (contenders.some((s) => !s.acted)) return false;
    return contenders.every((s) => s.bet === this.currentBet || s.allIn);
  }

  private collectBets() {
    for (const s of this.seats) {
      s.bet = 0;
      s.acted = false;
    }
    this.currentBet = 0;
    this.lastRaise = BIG_BLIND;
  }

  private dealNextStreet(events: Array<Record<string, unknown>>) {
    if (this.street === "preflop") {
      this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
      this.street = "flop";
      events.push({ type: "deal", street: "flop", cards: this.community.map(cardId) });
    } else if (this.street === "flop") {
      this.community.push(this.deck.pop()!);
      this.street = "turn";
      events.push({
        type: "deal",
        street: "turn",
        cards: [cardId(this.community[3]!)],
      });
    } else if (this.street === "turn") {
      this.community.push(this.deck.pop()!);
      this.street = "river";
      events.push({
        type: "deal",
        street: "river",
        cards: [cardId(this.community[4]!)],
      });
    } else if (this.street === "river") {
      this.street = "showdown";
      events.push({ type: "showdown" });
      return;
    }

    // first to act: left of button among active
    this.toAct = (this.button + 1) % this.seats.length;
    this.skipToNextActor();
  }

  private skipToNextActor() {
    const n = this.seats.length;
    for (let i = 0; i < n; i++) {
      const s = this.seats[this.toAct]!;
      if (!s.folded && !s.allIn) return;
      this.toAct = (this.toAct + 1) % n;
    }
  }

  private payoutShowdown(events: Array<Record<string, unknown>>) {
    const alive = this.seats.filter((s) => !s.folded);
    if (alive.length === 0) return;
    if (alive.length === 1) {
      alive[0]!.stack += this.pot;
      events.push({
        type: "win",
        playerId: alive[0]!.id,
        pot: this.pot,
        reason: "fold",
      });
      this.pot = 0;
      return;
    }
    const scored = alive.map((s) => ({
      seat: s,
      score: bestHand(s.hole, this.community),
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]!.score;
    const winners = scored.filter((s) => s.score === best);
    const share = Math.floor(this.pot / winners.length);
    let rem = this.pot - share * winners.length;
    for (const w of winners) {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      w.seat.stack += share + extra;
      events.push({
        type: "win",
        playerId: w.seat.id,
        pot: share + extra,
        hand: w.score,
        reason: "showdown",
      });
    }
    this.pot = 0;
  }
}

export const holdemPlugin: GamePlugin = {
  id: "holdem",
  name: "Hold'em",
  description: "德州扑克：底牌 + 公共牌，下注轮次，比牌型 · 一局一手",
  minPlayers: 2,
  maxPlayers: 4,
  create(config) {
    return new HoldemEngine(config);
  },
};
