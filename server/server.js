const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 4000;

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const createDeck = () => {
  const deck = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `c-${Date.now()}-${id++}`, suit, rank });
    }
  }
  return shuffleDeck(deck);
};

const shuffleDeck = (deck) => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const getCardValue = (rank) => {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return parseInt(rank, 10);
};

const scoreFive = (cards) => {
  const values = cards.map((c) => getCardValue(c.rank)).sort((a, b) => b - a);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const byCountDesc = Object.entries(counts)
    .map(([v, c]) => ({ v: Number(v), c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);

  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((v) => values.includes(v))) {
    isStraight = true;
    straightHigh = 5;
  } else {
    for (let i = 0; i <= unique.length - 5; i++) {
      const slice = unique.slice(i, i + 5);
      if (slice[0] - slice[4] === 4) {
        isStraight = true;
        straightHigh = slice[0];
        break;
      }
    }
  }

  if (isStraight && isFlush) {
    return { cat: "Straight Flush", catRank: 9, kickers: [straightHigh] };
  }
  if (byCountDesc[0]?.c === 4) {
    const quad = byCountDesc[0].v;
    const kicker = byCountDesc.find((x) => x.v !== quad)?.v || 0;
    return { cat: "Four of a Kind", catRank: 8, kickers: [quad, kicker] };
  }
  if (byCountDesc[0]?.c === 3 && byCountDesc[1]?.c >= 2) {
    return {
      cat: "Full House",
      catRank: 7,
      kickers: [byCountDesc[0].v, byCountDesc[1].v],
    };
  }
  if (isFlush) {
    return { cat: "Flush", catRank: 6, kickers: values.slice(0, 5) };
  }
  if (isStraight) {
    return { cat: "Straight", catRank: 5, kickers: [straightHigh] };
  }
  if (byCountDesc[0]?.c === 3) {
    const trips = byCountDesc[0].v;
    const kickers = byCountDesc
      .filter((x) => x.v !== trips)
      .map((x) => x.v)
      .sort((a, b) => b - a);
    return {
      cat: "Three of a Kind",
      catRank: 4,
      kickers: [trips, ...kickers.slice(0, 2)],
    };
  }
  if (byCountDesc[0]?.c === 2 && byCountDesc[1]?.c === 2) {
    const pair1 = Math.max(byCountDesc[0].v, byCountDesc[1].v);
    const pair2 = Math.min(byCountDesc[0].v, byCountDesc[1].v);
    const kicker =
      values
        .filter((v) => v !== pair1 && v !== pair2)
        .sort((a, b) => b - a)[0] || 0;
    return { cat: "Two Pair", catRank: 3, kickers: [pair1, pair2, kicker] };
  }
  if (byCountDesc[0]?.c === 2) {
    const pair = byCountDesc[0].v;
    const kickers = values
      .filter((v) => v !== pair)
      .sort((a, b) => b - a);
    return { cat: "Pair", catRank: 2, kickers: [pair, ...kickers.slice(0, 3)] };
  }
  return { cat: "High Card", catRank: 1, kickers: values.slice(0, 5) };
};

const scoreStrengthValue = (score) => {
  const base = 15;
  const kickers = [...score.kickers, 0, 0, 0, 0, 0].slice(0, 5);
  return (
    score.catRank * base ** 5 +
    kickers[0] * base ** 4 +
    kickers[1] * base ** 3 +
    kickers[2] * base ** 2 +
    kickers[3] * base +
    kickers[4]
  );
};

const compareScores = (a, b) => scoreStrengthValue(a) - scoreStrengthValue(b);

const evaluateSeven = (hole, board) => {
  const cards = [...hole, ...board];
  let best = null;
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      for (let c = b + 1; c < cards.length; c++) {
        for (let d = c + 1; d < cards.length; d++) {
          for (let e = d + 1; e < cards.length; e++) {
            const score = scoreFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(score, best) > 0) {
              best = score;
            }
          }
        }
      }
    }
  }
  return best;
};

const recomputePot = (players) => players.reduce((acc, p) => acc + (p.contribution || 0), 0);

const computeSidePots = (players) => {
  const contribs = players.map((p, idx) => ({ idx, amount: p.contribution || 0 }));
  const levels = Array.from(new Set(contribs.map((c) => c.amount).filter((x) => x > 0))).sort((a, b) => a - b);

  let prev = 0;
  const pots = [];
  for (const lvl of levels) {
    const inPot = contribs.filter((c) => c.amount >= lvl).length;
    const potTier = Math.max(0, (lvl - prev) * inPot);
    if (potTier > 0) pots.push(potTier);
    prev = lvl;
  }
  return pots;
};

const isAlive = (player) => !player.folded;

const isActor = (player) => isAlive(player) && !player.allIn;

const countActors = (players) => players.filter((p) => isActor(p)).length;

const countAlive = (players) => players.filter((p) => isAlive(p)).length;

const needsAction = (player, currentBet) => isActor(player) && (!player.hasActed || player.roundContribution < currentBet);

const recomputePendingToAct = (room) => {
  room.pendingToAct = Math.max(0, room.players.filter((p) => needsAction(p, room.currentBet)).length);
};

const nextActionIndex = (from, room) => {
  const players = room.players;
  const pc = players.length;
  if (pc <= 0) return -1;
  for (let step = 1; step <= pc; step++) {
    const idx = (from + step) % pc;
    if (needsAction(players[idx], room.currentBet)) return idx;
  }
  return -1;
};

const resetStreet = (players) =>
  players.map((p) => ({
    ...p,
    roundContribution: 0,
    hasActed: false,
    lastAction: p.folded ? "Fold" : p.allIn ? "All-In" : "",
  }));

const initRoom = (roomId, hostId) => ({
  id: roomId,
  hostId,
  players: [],
  order: [],
  stage: "setup",
  deck: [],
  board: [],
  boardRevealCount: 0,
  pot: 0,
  sidePots: [],
  currentBet: 0,
  minRaise: 0,
  dealerPos: -1,
  activePlayerIndex: 0,
  pendingToAct: 0,
  lastAggressor: -1,
  bigBlind: 100,
  smallBlind: 50,
  winners: [],
});

const buildPublicState = (room, socketId) => {
  const showAll = room.stage === "showdown" || room.stage === "finished";
  return {
    roomId: room.id,
    hostId: room.hostId,
    stage: room.stage,
    board: room.board,
    boardRevealCount: room.boardRevealCount,
    pot: room.pot,
    sidePots: room.sidePots,
    currentBet: room.currentBet,
    minRaise: room.minRaise,
    dealerPos: room.dealerPos,
    activePlayerIndex: room.activePlayerIndex,
    pendingToAct: room.pendingToAct,
    winners: room.winners || [],
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      folded: p.folded,
      allIn: p.allIn,
      contribution: p.contribution,
      roundContribution: p.roundContribution,
      hasActed: p.hasActed,
      lastAction: p.lastAction,
      payout: p.payout || 0,
      hole: showAll || p.id === socketId ? p.hole : [],
    })),
  };
};

const broadcastState = (io, room) => {
  room.players.forEach((p) => {
    io.to(p.id).emit("state", buildPublicState(room, p.id));
  });
};

const findPlayerIndex = (room, socketId) => room.players.findIndex((p) => p.id === socketId);

const finishHandEarly = (room) => {
  const alive = room.players.filter((p) => !p.folded);
  if (alive.length !== 1) return false;
  const winner = alive[0];
  const potValue = recomputePot(room.players);
  winner.stack += potValue;
  winner.payout = potValue;
  room.pot = potValue;
  room.sidePots = computeSidePots(room.players);
  room.boardRevealCount = 5;
  room.stage = "finished";
  room.winners = [room.players.findIndex((p) => p.id === winner.id)].filter((i) => i >= 0);
  return true;
};

const resolveShowdown = (room) => {
  const potValue = recomputePot(room.players);
  room.pot = potValue;
  room.sidePots = computeSidePots(room.players);

  const moneyWinners = new Set();

  const contribs = room.players.map((p, idx) => ({ idx, amount: p.contribution || 0 }));
  const levels = Array.from(new Set(contribs.map((c) => c.amount).filter((x) => x > 0))).sort((a, b) => a - b);

  let prev = 0;
  for (const lvl of levels) {
    const inPot = contribs.filter((c) => c.amount >= lvl).length;
    const potTier = Math.max(0, (lvl - prev) * inPot);
    prev = lvl;
    if (potTier <= 0) continue;

    const eligible = contribs
      .filter((c) => c.amount >= lvl)
      .map((c) => c.idx)
      .filter((idx) => isAlive(room.players[idx]));

    if (eligible.length === 0) continue;

    let bestIdxs = [eligible[0]];
    let bestScore = evaluateSeven(room.players[eligible[0]].hole, room.board);

    for (const idx of eligible.slice(1)) {
      const s = evaluateSeven(room.players[idx].hole, room.board);
      const cmp = compareScores(s, bestScore);
      if (cmp > 0) {
        bestScore = s;
        bestIdxs = [idx];
      } else if (cmp === 0) {
        bestIdxs.push(idx);
      }
    }

    const share = Math.floor(potTier / bestIdxs.length);
    let remainder = potTier % bestIdxs.length;

    for (const w of bestIdxs) {
      const bonus = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      const payout = share + bonus;
      room.players[w].stack += payout;
      room.players[w].payout = (room.players[w].payout || 0) + payout;
      moneyWinners.add(w);
    }
  }

  room.winners = Array.from(moneyWinners);
  room.boardRevealCount = 5;
  room.stage = "finished";
};

const advanceStage = (room) => {
  const nextStreetPlayers = resetStreet(room.players);

  if (room.stage === "river") {
    room.stage = "showdown";
    resolveShowdown(room);
    return;
  }

  let nextStage = "flop";
  let reveal = 3;

  if (room.stage === "preflop") {
    nextStage = "flop";
    reveal = 3;
  } else if (room.stage === "flop") {
    nextStage = "turn";
    reveal = 4;
  } else if (room.stage === "turn") {
    nextStage = "river";
    reveal = 5;
  }

  room.boardRevealCount = reveal;
  room.stage = nextStage;
  room.players = nextStreetPlayers;
  room.currentBet = 0;
  room.minRaise = room.bigBlind;
  room.lastAggressor = -1;

  recomputePendingToAct(room);

  if (countActors(room.players) < 2) {
    advanceStage(room);
    return;
  }

  const postFlopStart =
    room.players.length === 2
      ? room.dealerPos
      : (room.dealerPos + 1) % room.players.length;
  const startActor = needsAction(room.players[postFlopStart], room.currentBet)
    ? postFlopStart
    : nextActionIndex(postFlopStart, room);
  room.activePlayerIndex = startActor === -1 ? 0 : startActor;
};

const applyActionAndAdvance = (room, actorIdx, actionLabel, isRaise) => {
  const potValue = recomputePot(room.players);
  room.pot = potValue;
  room.sidePots = computeSidePots(room.players);

  if (finishHandEarly(room)) return;

  if (isRaise) {
    room.players.forEach((p, idx) => {
      if (idx !== actorIdx && isActor(p)) p.hasActed = false;
    });
  }

  recomputePendingToAct(room);

  const roundOver = room.pendingToAct <= 0;
  if (!roundOver) {
    const nextIdx = nextActionIndex(actorIdx, room);
    room.activePlayerIndex = nextIdx === -1 ? 0 : nextIdx;
  } else {
    advanceStage(room);
  }

  if (actionLabel) {
    room.players[actorIdx].lastAction = actionLabel;
  }
};

const startHand = (room, buyIn, bigBlind) => {
  if (room.stage !== "setup" && room.stage !== "finished") {
    return { ok: false, error: "Hand already in progress." };
  }
  if (room.players.length < 2) return { ok: false, error: "At least 2 players required." };
  if (room.players.length > 6) return { ok: false, error: "Max 6 players per room." };

  room.bigBlind = Math.max(1, Math.floor(bigBlind || room.bigBlind || 100));
  room.smallBlind = Math.max(1, Math.floor(room.bigBlind / 2));

  room.deck = createDeck();
  room.board = [];
  room.boardRevealCount = 0;

  room.players = room.players.map((p) => ({
    ...p,
    hole: [room.deck.pop(), room.deck.pop()],
    contribution: 0,
    roundContribution: 0,
    folded: false,
    allIn: false,
    hasActed: false,
    lastAction: "",
    payout: 0,
    stack: typeof p.stack === "number" ? p.stack : Math.max(1, Math.floor(buyIn || 1000)),
  }));

  room.winners = [];

  room.deck.pop();
  const flop = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
  room.deck.pop();
  const turn = room.deck.pop();
  room.deck.pop();
  const river = room.deck.pop();
  room.board = [...flop, turn, river];

  const playerCount = room.players.length;
  room.dealerPos = playerCount > 0 ? (room.dealerPos + 1) % playerCount : 0;

  const sbIndex = playerCount === 2 ? room.dealerPos : (room.dealerPos + 1) % playerCount;
  const bbIndex = playerCount === 2 ? (room.dealerPos + 1) % playerCount : (room.dealerPos + 2) % playerCount;

  const postChips = (idx, amount) => {
    const p = room.players[idx];
    if (!p) return;
    const a = Math.max(0, Math.floor(amount));
    if (a <= 0) return;
    const pay = Math.min(a, Math.floor(p.stack));
    p.stack -= pay;
    p.contribution += pay;
    p.roundContribution += pay;
    if (p.stack <= 0) p.allIn = true;
  };

  postChips(sbIndex, room.smallBlind);
  room.players[sbIndex].lastAction = `SB $${room.smallBlind}`;
  postChips(bbIndex, room.bigBlind);
  room.players[bbIndex].lastAction = `BB $${room.bigBlind}`;

  room.players = room.players.map((p) => ({ ...p, hasActed: false }));
  room.stage = "preflop";

  const openingBet = Math.max(...room.players.map((p) => p.roundContribution));
  room.currentBet = openingBet;
  room.minRaise = room.bigBlind;
  room.lastAggressor = -1;

  const startIdxRequest = (bbIndex + 1) % playerCount;
  const firstActor = needsAction(room.players[startIdxRequest], room.currentBet)
    ? startIdxRequest
    : nextActionIndex(startIdxRequest, room);

  room.activePlayerIndex = firstActor === -1 ? 0 : firstActor;
  recomputePendingToAct(room);
  room.pot = recomputePot(room.players);
  room.sidePots = computeSidePots(room.players);

  return { ok: true };
};

const server = http.createServer();
const io = require("socket.io")(process.env.PORT || 4000, {
    cors: {
        origin: "*",
    }
});

const rooms = new Map();

const getRoomsSummary = () =>
  Array.from(rooms.values()).map((room) => {
    const host = room.players.find((p) => p.id === room.hostId);
    return {
      roomId: room.id,
      hostName: host?.name || "",
      playerCount: room.players.length,
      stage: room.stage,
    };
  });

const broadcastRooms = () => {
  io.emit("rooms", getRoomsSummary());
};

io.on("connection", (socket) => {
  socket.emit("rooms", getRoomsSummary());

  socket.on("list_rooms", (cb) => {
    if (typeof cb === "function") cb({ ok: true, rooms: getRoomsSummary() });
  });

  socket.on("create_room", ({ name, buyIn }, cb) => {
    const roomId = crypto.randomBytes(3).toString("hex");
    const room = initRoom(roomId, socket.id);
    rooms.set(roomId, room);

    const player = {
      id: socket.id,
      name: name || "Player",
      stack: Math.max(1, Math.floor(buyIn || 1000)),
      hole: [],
      contribution: 0,
      roundContribution: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      lastAction: "",
      payout: 0,
    };

    room.players.push(player);
    room.order.push(socket.id);
    socket.join(roomId);

    if (typeof cb === "function") {
      cb({ ok: true, roomId, playerId: socket.id });
    }

    broadcastState(io, room);
    broadcastRooms();
  });

  socket.on("join_room", ({ roomId, name, buyIn }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof cb === "function") cb({ ok: false, error: "Room not found." });
      return;
    }
    if (room.players.length >= 6) {
      if (typeof cb === "function") cb({ ok: false, error: "Room is full (max 6)." });
      return;
    }

    const player = {
      id: socket.id,
      name: name || "Player",
      stack: Math.max(1, Math.floor(buyIn || 1000)),
      hole: [],
      contribution: 0,
      roundContribution: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      lastAction: "",
      payout: 0,
    };

    room.players.push(player);
    room.order.push(socket.id);
    socket.join(roomId);

    if (typeof cb === "function") cb({ ok: true, roomId, playerId: socket.id });
    broadcastState(io, room);
    broadcastRooms();
  });

  socket.on("leave_room", ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const idx = findPlayerIndex(room, socket.id);
    if (idx >= 0) {
      room.players.splice(idx, 1);
      room.order = room.order.filter((id) => id !== socket.id);
      if (room.hostId === socket.id) {
        room.hostId = room.players[0]?.id || null;
      }
    }
    socket.leave(roomId);
    if (room.players.length === 0) {
      rooms.delete(roomId);
    } else {
      broadcastState(io, room);
    }
    if (typeof cb === "function") cb({ ok: true });
    broadcastRooms();
  });

  socket.on("start_hand", ({ roomId, buyIn, bigBlind }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) {
      if (typeof cb === "function") cb({ ok: false, error: "Only the host can start." });
      return;
    }
    const res = startHand(room, buyIn, bigBlind);
    if (!res.ok) {
      if (typeof cb === "function") cb(res);
      return;
    }
    if (typeof cb === "function") cb({ ok: true });
    broadcastState(io, room);
    broadcastRooms();
  });

  socket.on("action", ({ roomId, action, amount }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const actorIdx = findPlayerIndex(room, socket.id);
    if (actorIdx < 0) return;
    if (room.stage !== "preflop" && room.stage !== "flop" && room.stage !== "turn" && room.stage !== "river") {
      if (typeof cb === "function") cb({ ok: false, error: "Round not active." });
      return;
    }
    if (room.activePlayerIndex !== actorIdx) {
      if (typeof cb === "function") cb({ ok: false, error: "It's not your turn." });
      return;
    }

    const player = room.players[actorIdx];
    if (!player || player.folded || player.allIn) return;

    const toCall = Math.max(0, Math.floor(room.currentBet - player.roundContribution));

    if (action === "fold") {
      player.folded = true;
      player.lastAction = "Fold";
      applyActionAndAdvance(room, actorIdx, "Fold", false);
      broadcastState(io, room);
      if (typeof cb === "function") cb({ ok: true });
      return;
    }

    if (action === "call") {
      const pay = Math.min(toCall, Math.floor(player.stack));
      if (pay > 0) {
        player.stack -= pay;
        player.contribution += pay;
        player.roundContribution += pay;
      }
      if (pay < toCall || player.stack <= 0) player.allIn = true;
      player.lastAction = toCall > 0 ? "Call" : "Check";
      player.hasActed = true;
      applyActionAndAdvance(room, actorIdx, player.lastAction, false);
      broadcastState(io, room);
      if (typeof cb === "function") cb({ ok: true });
      return;
    }

    if (action === "raise") {
      const minRaiseSize = Math.max(room.minRaise || room.bigBlind, room.bigBlind);
      const minTotal = room.currentBet + minRaiseSize;
      let targetTotal = typeof amount === "number" ? Math.floor(amount) : minTotal;
      if (targetTotal < minTotal) targetTotal = minTotal;

      const maxTotal = Math.floor(player.stack + player.roundContribution);
      if (targetTotal > maxTotal) targetTotal = maxTotal;

      const need = Math.max(0, Math.floor(targetTotal - player.roundContribution));
      const pay = Math.min(need, Math.floor(player.stack));
      if (pay > 0) {
        player.stack -= pay;
        player.contribution += pay;
        player.roundContribution += pay;
      }

      const actualBet = player.roundContribution;
      const raiseDiff = actualBet - room.currentBet;
      const isFullRaise = raiseDiff >= minRaiseSize;
      if (actualBet > room.currentBet) {
        room.currentBet = actualBet;
        if (isFullRaise) room.minRaise = raiseDiff;
      }

      if (pay < need || player.stack <= 0) player.allIn = true;
      player.lastAction = player.allIn ? "All-In" : `Raise $${actualBet}`;
      player.hasActed = true;

      applyActionAndAdvance(room, actorIdx, player.lastAction, isFullRaise);
      broadcastState(io, room);
      if (typeof cb === "function") cb({ ok: true });
      return;
    }

    if (typeof cb === "function") cb({ ok: false, error: "Unknown action." });
  });

  socket.on("disconnect", () => {
    rooms.forEach((room, roomId) => {
      const idx = findPlayerIndex(room, socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);
        room.order = room.order.filter((id) => id !== socket.id);
        if (room.hostId === socket.id) {
          room.hostId = room.players[0]?.id || null;
        }
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          broadcastState(io, room);
        }
        broadcastRooms();
      }
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Live poker server running on port ${PORT}`);
});