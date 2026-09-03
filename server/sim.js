import {
  MAX_PLAYERS,
  TICK_DT,
  ITEM_DEFS,
  NEED_META,
  ROW_COUNT,
  SEAT_X,
  STATIONS,
  CART_DOCK,
  FLIGHT_SECONDS,
  DIFFICULTY,
  PAX_FIRST,
  PAX_SHIRTS,
  PLAYER_COLORS,
  seatLabel,
  seatWorld,
  makeCode,
} from "../public/js/constants.js";
import { buildObstacles, stepMover, decodeBits, lookDir, clamp } from "../public/js/physics.js";

export { makeCode };

const ACTIONS = { none: 0, use: 1, throw: 2, drop: 3, shove: 4, emote: 5, stow: 6 };
const LIQUIDS = new Set(["coffee", "water", "soda", "wine"]);

const PA = [
  "This is your captain. The weather is 'character building.' Cabin crew, you have the floor. Try not to lose it.",
  "A reminder that the aisle is not a racetrack. Unless it is. It kind of is.",
  "We have reached cruising altitude. Please keep the screaming to a conversational volume.",
  "If you are a passenger reading this over someone's shoulder: sit down. If you are crew: sit them down.",
  "Night Owl Air thanks you for choosing the airline named after a bird that cannot actually fly that well.",
  "Mild turbulence expected. That's what we call it when the cart learns about gravity.",
  "There is no manager on this aircraft. There is only the galley and the consequences.",
  " lavatory is occupied. It has been occupied. It will remain occupied. Bring extra barf bags.",
  "Crew, a passenger would like to speak to whoever is in charge. That is, unfortunately, you.",
  "We are on time, which on a red-eye means we are all making a series of poor decisions together.",
  "Fasten seatbelts. Not because of weather. Because of you people.",
  "This is your captain. I have a very normal amount of confidence in the cabin crew. A normal amount.",
];

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8);
}

export class Room {
  constructor(code, durationKey = "regular", difficultyKey = "standard") {
    this.code = code;
    this.durationKey = FLIGHT_SECONDS[durationKey] ? durationKey : "regular";
    this.difficultyKey = DIFFICULTY[difficultyKey] ? difficultyKey : "standard";
    this.players = new Map();
    this.hostId = null;
    this.phase = "lobby";
    this.tickN = 0;
    this.events = [];
    this.chat = [];
    this.boxes = buildObstacles();
    this.resetSim();
  }

  resetSim() {
    this.timeLeft = FLIGHT_SECONDS[this.durationKey];
    this.flightLen = this.timeLeft;
    this.mood = 72;
    this.seatbelt = false;
    this.fire = 0;
    this.turbulence = 0;
    this.cry = 0;
    this.banner = null;
    this.bannerT = 0;
    this.nextEvent = 12;
    this.nextNeed = 2.5;
    this.paIndex = 0;
    this.items = [];
    this.passengers = [];
    this.cart = {
      x: CART_DOCK.x,
      z: CART_DOCK.z,
      yaw: 0,
      vx: 0,
      vz: 0,
      slots: [null, null, null, null, null, null],
    };
    this.spills = [];
    this.ended = null;
    this.itemSeq = 1;
    this.seed = (Math.random() * 1e9) | 0;
    this.stationCycle = {};
  }

  addPlayer(ws, name) {
    if (this.phase !== "lobby") return { err: "Flight already left the gate." };
    if (this.players.size >= MAX_PLAYERS) return { err: "Cabin crew is full (5)." };
    const id = uid("p");
    const colorIndex = this.nextColor();
    const p = {
      id,
      ws,
      name: String(name || "Crew").slice(0, 16),
      colorIndex,
      ready: false,
      connected: true,
      x: 0,
      y: 0,
      z: 15.2 + this.players.size * 0.35,
      yaw: Math.PI,
      pitch: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      slip: 0,
      item: null,
      emote: 0,
      lastIn: { bits: 0, yaw: Math.PI, pitch: 0, a: 0 },
      stats: { served: 0, wrong: 0, spills: 0, shoves: 0, thrown: 0 },
    };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    return { id, colorIndex, host: this.hostId === id };
  }

  nextColor() {
    const used = new Set([...this.players.values()].map((p) => p.colorIndex));
    for (let i = 0; i < PLAYER_COLORS.length; i++) if (!used.has(i)) return i;
    return 0;
  }

  markDisconnected(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    p.ws = null;
    // Freeze their input so they don't keep walking/holding a direction
    // while nobody's driving.
    p.lastIn = { bits: 0, yaw: p.yaw, pitch: p.pitch, a: 0 };
  }

  reconnect(id, ws) {
    const p = this.players.get(id);
    if (!p) return null;
    p.connected = true;
    p.ws = ws;
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.item) {
      const it = this.items.find((i) => i.id === p.item);
      if (it) {
        it.heldBy = null;
        it.x = p.x;
        it.y = 0.2;
        it.z = p.z;
      }
    }
    this.players.delete(id);
    if (this.hostId === id) {
      this.hostId = this.players.size ? [...this.players.keys()][0] : null;
    }
    if (this.phase === "flying" && this.players.size === 0) {
      this.phase = "ended";
      this.ended = { win: false, reason: "The entire crew vanished. The passengers ate the peanuts and then each other." };
    }
  }

  setReady(id, on) {
    const p = this.players.get(id);
    if (p && this.phase === "lobby") p.ready = !!on;
  }

  setDuration(id, key) {
    if (id !== this.hostId || this.phase !== "lobby") return;
    if (FLIGHT_SECONDS[key]) this.durationKey = key;
  }

  setDifficulty(id, key) {
    if (id !== this.hostId || this.phase !== "lobby") return;
    if (DIFFICULTY[key]) this.difficultyKey = key;
  }

  diff() {
    return DIFFICULTY[this.difficultyKey] || DIFFICULTY.standard;
  }

  start(id) {
    if (id !== this.hostId) return { err: "Only the captain of the crew can push back." };
    if (this.phase !== "lobby") return { err: "Already in the air." };
    if (this.players.size < 1) return { err: "Need at least one poor soul." };
    this.phase = "flying";
    this.resetSim();
    this.spawnWorld();
    const n = this.players.size;
    let i = 0;
    for (const p of this.players.values()) {
      p.x = ((i - (n - 1) / 2) * 0.45);
      p.z = 16.2;
      p.y = 0;
      p.yaw = Math.PI;
      p.item = null;
      p.stats = { served: 0, wrong: 0, spills: 0, shoves: 0, thrown: 0 };
      i++;
    }
    this.announce("PA", "Cabin crew, doors armed. Night Owl Air flight 413 is yours. Don't make me turn this plane around.");
    return { ok: true };
  }

  spawnWorld() {
    this.passengers = [];
    let n = 0;
    for (let row = 0; row < ROW_COUNT; row++) {
      for (let s = 0; s < SEAT_X.length; s++) {
        const w = seatWorld(row, s);
        this.passengers.push({
          id: n,
          row,
          seat: s,
          x: w.x,
          z: w.z,
          name: PAX_FIRST[n % PAX_FIRST.length],
          shirt: PAX_SHIRTS[n % PAX_SHIRTS.length],
          mood: 58 + ((n * 17) % 28),
          need: null,
          needT: 0,
          ignores: 0,
          call: false,
          state: "seated",
          standT: 0,
          seq: null,
        });
        n++;
      }
    }
    this.items = [];
    const starter = [
      "coffee", "coffee", "water", "soda", "wine", "meal", "meal",
      "blanket", "pillow", "barfbag", "barfbag", "headphones",
      "firstaid", "bottle", "extinguisher",
    ];
    starter.forEach((type, i) => {
      const side = i % 2 === 0 ? -0.35 : 0.35;
      this.spawnItem(type, side, 0.35, 17.0 + (i % 5) * 0.22, null);
    });
  }

  spawnItem(type, x, y, z, heldBy) {
    const it = {
      id: this.itemSeq++,
      type,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      heldBy,
      slot: -1,
    };
    this.items.push(it);
    return it;
  }

  announce(kind, text, ttl = 4.2) {
    this.banner = { kind, text };
    this.bannerT = ttl;
    this.events.push({ kind: "banner", text, k: kind });
  }

  handleInput(id, msg) {
    const p = this.players.get(id);
    if (!p || this.phase !== "flying") return;
    p.lastIn = {
      bits: msg.k | 0,
      yaw: Number(msg.y) || 0,
      pitch: Number(msg.p) || 0,
      a: msg.a | 0,
    };
  }

  handleChat(id, text) {
    const p = this.players.get(id);
    if (!p) return;
    const t = String(text || "").slice(0, 80).trim();
    if (!t) return;
    this.events.push({ kind: "chat", from: p.name, color: p.colorIndex, text: t });
  }

  tick() {
    this.events = [];
    if (this.phase !== "flying") return;
    const dt = TICK_DT;
    this.tickN++;
    this.timeLeft -= dt;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = null;
    }
    if (this.turbulence > 0) this.turbulence = Math.max(0, this.turbulence - dt);
    if (this.cry > 0) this.cry = Math.max(0, this.cry - dt);
    if (this.fire > 0) {
      this.mood -= 2.4 * dt;
      this.fire -= dt;
      if (this.fire <= 0) {
        this.fire = 0;
        this.announce("ok", "Galley fire is out. The smell remains. The smell always remains.");
      }
    }

    const descent = this.timeLeft < 45;
    if (descent && !this.seatbelt) {
      this.seatbelt = true;
      this.announce("PA", "Seatbelt sign is ON. Stow the cart, stop serving hot meals, and try to look employed.");
    }

    this.stepPlayers(dt, descent);
    this.stepCart(dt);
    this.stepItems(dt);
    this.stepPassengers(dt);
    this.stepNeeds(dt, descent);
    this.stepDirector(dt, descent);
    this.stepSpills(dt);

    this.mood = clamp(this.mood, 0, 100);
    if (this.mood <= 0) {
      this.finish(false, "Cabin mood hit zero. The passengers have unionized. You are the in-flight entertainment now.");
      return;
    }
    if (this.timeLeft <= 0) this.land();
  }

  stepPlayers(dt, descent) {
    const list = [...this.players.values()];
    for (const p of list) {
      if (p.slip > 0) p.slip = Math.max(0, p.slip - dt);
      if (p.emote > 0) p.emote = Math.max(0, p.emote - dt);
      const bits = decodeBits(p.lastIn.bits);
      const impulse = { x: 0, z: 0 };
      if (this.turbulence > 0 && Math.random() < 0.08) {
        impulse.x += (Math.random() - 0.5) * 6;
        impulse.z += (Math.random() - 0.5) * 6;
      }
      for (const s of this.spills) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < 0.45 && p.y < 0.1) {
          p.slip = 0.9;
          impulse.x += (Math.random() - 0.5) * 8;
          impulse.z += 2 + Math.random() * 3;
        }
      }
      stepMover(
        p,
        { ...bits, yaw: p.lastIn.yaw, pitch: p.lastIn.pitch },
        dt,
        this.boxes,
        { impulse, seatbeltLock: this.seatbelt && bits.run }
      );

      if (this.fire > 0 && p.z > 17.2 && Math.abs(p.x) > 0.7) {
        p.slip = Math.max(p.slip, 0.4);
      }

      const a = p.lastIn.a;
      p.lastIn.a = 0;
      if (a === ACTIONS.use) this.tryUse(p, descent);
      else if (a === ACTIONS.throw) this.tryThrow(p);
      else if (a === ACTIONS.drop) this.tryDrop(p);
      else if (a === ACTIONS.shove) this.tryShove(p, list);
      else if (a === ACTIONS.emote) p.emote = 1.4;
      else if (a === ACTIONS.stow) this.tryStowCart(p);
    }

    // Soft player-player push.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.46 && d > 0.0001) {
          const push = (0.46 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
        }
      }
    }
  }

  nearest(p, range, filter) {
    const f = lookDir(p.yaw, 0);
    let best = null;
    let bestScore = 0;
    for (const obj of filter) {
      const dx = obj.x - p.x;
      const dz = obj.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.01) continue;
      const ndx = dx / dist;
      const ndz = dz / dist;
      const dot = ndx * f.x + ndz * f.z;
      if (dot < 0.25) continue;
      const score = dot * 1.4 - dist;
      if (!best || score > bestScore) {
        best = obj;
        bestScore = score;
      }
    }
    return best;
  }

  held(p) {
    if (!p.item) return null;
    return this.items.find((i) => i.id === p.item) || null;
  }

  give(p, item) {
    if (p.item) this.tryDrop(p);
    item.heldBy = p.id;
    item.slot = -1;
    p.item = item.id;
    item.vx = item.vz = item.vy = 0;
  }

  tryUse(p, descent) {
    const held = this.held(p);

    if (this.fire > 0 && held && held.type === "extinguisher" && p.z > 16.8) {
      this.fire = 0;
      this.announce("ok", `${p.name} emptied the extinguisher. The galley is a sad, powdery white.`);
      this.items = this.items.filter((i) => i.id !== held.id);
      p.item = null;
      return;
    }

    const pax = this.nearest(
      p,
      1.7,
      this.passengers.filter((x) => x.state === "seated" || x.state === "stand")
    );
    if (pax && held) {
      this.serve(p, pax, held);
      return;
    }
    if (pax && !held && pax.need === "trash") {
      pax.need = null;
      pax.call = false;
      pax.mood = clamp(pax.mood + 8, 0, 100);
      this.mood += 1.4;
      p.stats.served++;
      this.announce("ok", `${p.name} collected a crime scene from ${pax.name} in ${seatLabel(pax.row, pax.seat)}.`);
      return;
    }
    if (pax && pax.state === "stand") {
      pax.state = "seated";
      pax.standT = 0;
      this.announce("ok", `${p.name} sat ${pax.name} back down. For now.`);
      return;
    }

    if (!held) {
      const station = this.nearest(p, 1.5, STATIONS.map((s) => ({ ...s, x: s.x, z: s.z })));
      if (station) {
        if (descent && ["coffee", "fridge", "oven", "warmer"].includes(station.id)) {
          this.announce("warn", "Seatbelt sign. No more catering. Safety, or at least the performance of it.");
          return;
        }
        let type = station.item;
        if (station.cycle) {
          const i = ((this.stationCycle[station.id] || 0) + 1) % station.cycle.length;
          this.stationCycle[station.id] = i;
          type = station.cycle[i];
        }
        const it = this.spawnItem(type, p.x, 1.1, p.z, p.id);
        p.item = it.id;
        this.events.push({ kind: "grab", type });
        return;
      }
    }

    if (!held) {
      const floorItem = this.nearest(
        p,
        1.5,
        this.items.filter((i) => !i.heldBy && i.slot < 0 && i.y < 0.6)
      );
      if (floorItem) {
        this.give(p, floorItem);
        return;
      }
      // Take from cart.
      if (Math.hypot(p.x - this.cart.x, p.z - this.cart.z) < 1.3) {
        const idx = this.cart.slots.findIndex((id) => id != null);
        if (idx >= 0) {
          const it = this.items.find((i) => i.id === this.cart.slots[idx]);
          this.cart.slots[idx] = null;
          if (it) this.give(p, it);
          return;
        }
      }
    } else if (Math.hypot(p.x - this.cart.x, p.z - this.cart.z) < 1.3) {
      const idx = this.cart.slots.findIndex((id) => id == null);
      if (idx >= 0) {
        held.heldBy = null;
        held.slot = idx;
        p.item = null;
        this.cart.slots[idx] = held.id;
        return;
      }
    }

    const other = this.nearest(p, 1.4, [...this.players.values()].filter((o) => o.id !== p.id));
    if (other && held && !other.item) {
      held.heldBy = other.id;
      other.item = held.id;
      p.item = null;
      this.announce("ok", `${p.name} pressed a ${ITEM_DEFS[held.type].label.toLowerCase()} into ${other.name}'s hands.`);
    }
  }

  serve(p, pax, held) {
    const def = ITEM_DEFS[held.type];
    const need = pax.need;
    const ok = need && def.needs.includes(need);
    this.items = this.items.filter((i) => i.id !== held.id);
    p.item = null;
    if (ok) {
      pax.need = null;
      pax.call = false;
      pax.needT = 0;
      pax.ignores = 0;
      pax.mood = clamp(pax.mood + 14, 0, 100);
      this.mood += 2.6;
      p.stats.served++;
      if (need === "baby") this.cry = 0;
      if (need === "drunk") {
        pax.state = "seated";
        pax.standT = 0;
      }
      if (pax.seq && pax.seq.length) {
        const next = pax.seq.shift();
        this.assignNeed(pax, next, 16);
        this.announce("warn", `${pax.name} in ${seatLabel(pax.row, pax.seat)}: "And ANOTHER thing—"`);
      } else {
        this.events.push({ kind: "serve", seat: seatLabel(pax.row, pax.seat), type: held.type });
      }
    } else {
      const moodMul = this.diff().moodMul;
      pax.mood = clamp(pax.mood - 10 * moodMul, 0, 100);
      this.mood -= 3.2 * moodMul;
      p.stats.wrong++;
      this.announce("warn", `${pax.name} in ${seatLabel(pax.row, pax.seat)} did NOT order a ${def.label.toLowerCase()}.`);
      this.spawnItem(held.type, p.x + 0.2, 0.4, p.z, null);
    }
  }

  tryThrow(p) {
    const held = this.held(p);
    if (!held) return;
    const d = lookDir(p.yaw, p.pitch);
    held.heldBy = null;
    held.slot = -1;
    p.item = null;
    held.x = p.x + d.x * 0.45;
    held.y = 1.2 + d.y * 0.2;
    held.z = p.z + d.z * 0.45;
    held.vx = d.x * 7.5 + p.vx;
    held.vy = d.y * 5.5 + 1.4;
    held.vz = d.z * 7.5 + p.vz;
    p.stats.thrown++;
    this.events.push({ kind: "throw", type: held.type });
  }

  tryDrop(p) {
    const held = this.held(p);
    if (!held) return;
    held.heldBy = null;
    held.slot = -1;
    p.item = null;
    held.x = p.x;
    held.y = 0.25;
    held.z = p.z + 0.25;
    held.vx = held.vz = 0;
    held.vy = 0;
  }

  tryShove(p, list) {
    const other = this.nearest(p, 1.35, list.filter((o) => o.id !== p.id));
    if (!other) {
      const pax = this.nearest(p, 1.4, this.passengers.filter((x) => x.state === "stand"));
      if (pax) {
        pax.state = "seated";
        pax.mood -= 6;
        this.mood -= 1;
        this.announce("warn", `${p.name} stuffed ${pax.name} back into ${seatLabel(pax.row, pax.seat)}.`);
      }
      return;
    }
    const f = lookDir(p.yaw, 0);
    other.vx += f.x * 6;
    other.vz += f.z * 6;
    other.vy += 1.6;
    other.slip = 0.35;
    p.stats.shoves++;
    this.events.push({ kind: "shove" });
    if (other.item && Math.random() < 0.45) {
      const held = this.held(other);
      if (held) {
        if (LIQUIDS.has(held.type)) this.spillAt(other.x, other.z, other);
        this.tryDrop(other);
      }
    }
  }

  tryStowCart(p) {
    if (Math.hypot(p.x - this.cart.x, p.z - this.cart.z) > 1.6) return;
    this.cart.x = CART_DOCK.x;
    this.cart.z = CART_DOCK.z;
    this.cart.vx = 0;
    this.cart.vz = 0;
    this.announce("ok", `${p.name} stowed the cart. A rare moment of professionalism.`);
  }

  stepCart(dt) {
    const c = this.cart;
    let pushX = 0;
    let pushZ = 0;
    let n = 0;
    for (const p of this.players.values()) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 0.85) {
        pushX += p.vx;
        pushZ += p.vz;
        n++;
      }
    }
    if (n) {
      c.vx += (pushX / n - c.vx) * 0.35;
      c.vz += (pushZ / n - c.vz) * 0.35;
    }
    if (this.turbulence > 0) {
      c.vz += (Math.random() - 0.35) * 0.9;
      c.vx += (Math.random() - 0.5) * 0.4;
    }
    c.vx *= 0.86;
    c.vz *= 0.86;
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    c.x = clamp(c.x, -0.42, 0.42);
    c.z = clamp(c.z, 2.2, 17.6);
    if (Math.abs(c.vx) + Math.abs(c.vz) > 0.4) {
      c.yaw = Math.atan2(c.vx, -c.vz);
    }
    for (const p of this.players.values()) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 0.5 && Math.hypot(c.vx, c.vz) > 2.2) {
        p.vx += c.vx * 0.6;
        p.vz += c.vz * 0.6;
        p.slip = 0.5;
      }
    }
  }

  stepItems(dt) {
    for (const it of this.items) {
      if (it.heldBy) {
        const p = this.players.get(it.heldBy);
        if (!p) {
          it.heldBy = null;
          continue;
        }
        const d = lookDir(p.yaw, 0);
        it.x = p.x + d.x * 0.38;
        it.y = 1.05;
        it.z = p.z + d.z * 0.38;
        it.vx = it.vy = it.vz = 0;
        if (this.turbulence > 0 && LIQUIDS.has(it.type) && Math.random() < 0.012) {
          this.spillAt(p.x, p.z, p);
          this.tryDrop(p);
        }
        continue;
      }
      if (it.slot >= 0) {
        const col = it.slot % 2;
        const row = (it.slot / 2) | 0;
        it.x = this.cart.x + (col ? 0.16 : -0.16);
        it.y = 0.55 + row * 0.28;
        it.z = this.cart.z + 0.05;
        continue;
      }
      it.vy -= 18 * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      it.vx *= 0.995;
      it.vz *= 0.995;
      if (it.y < 0.08) {
        if (LIQUIDS.has(it.type) && Math.abs(it.vy) > 2.2) {
          this.spillAt(it.x, it.z, null);
          if (Math.random() < 0.55) {
            it._dead = true;
            continue;
          }
        }
        it.y = 0.08;
        it.vy *= -0.25;
        it.vx *= 0.6;
        it.vz *= 0.6;
        if (Math.abs(it.vy) < 0.4) it.vy = 0;
      }
      it.x = clamp(it.x, -1.95, 1.95);
      it.z = clamp(it.z, 0.7, 21.1);

      for (const pax of this.passengers) {
        if (pax.state !== "seated") continue;
        if (Math.hypot(it.x - pax.x, it.z - pax.z) < 0.38 && it.y < 1.2 && Math.hypot(it.vx, it.vz, it.vy) > 2) {
          const moodMul = this.diff().moodMul;
          pax.mood -= 8 * moodMul;
          this.mood -= 2 * moodMul;
          it.vx *= -0.3;
          it.vz *= -0.3;
          this.events.push({ kind: "bonk", seat: seatLabel(pax.row, pax.seat) });
        }
      }
    }
    this.items = this.items.filter((i) => !i._dead);
  }

  spillAt(x, z, player) {
    this.spills.push({ x, z, t: 18 });
    this.mood -= 1.5 * this.diff().moodMul;
    if (player) player.stats.spills++;
    this.events.push({ kind: "spill" });
  }

  stepSpills(dt) {
    for (const s of this.spills) s.t -= dt;
    this.spills = this.spills.filter((s) => s.t > 0);
  }

  assignNeed(pax, type, patience) {
    pax.need = type;
    pax.needT = patience ?? (NEED_META[type].critical ? 22 : 28);
    pax.call = true;
    this.events.push({ kind: "ding", seat: seatLabel(pax.row, pax.seat), need: type });
  }

  stepNeeds(dt, descent) {
    this.nextNeed -= dt;
    const active = this.passengers.filter((p) => p.need).length;
    const crew = Math.max(1, this.players.size);
    const target = descent ? 2 : Math.min(2 + crew, 3 + ((this.flightLen - this.timeLeft) / 80) | 0);

    if (this.nextNeed <= 0 && this.phase === "flying") {
      this.nextNeed = (3.2 + Math.random() * 2.4) * this.diff().needMul;
      if (active < target) {
        const idle = this.passengers.filter((p) => !p.need && p.state === "seated");
        if (idle.length) {
          const pax = pick(idle);
          const pool = descent
            ? ["sick", "comfort", "trash"]
            : ["thirst", "thirst", "hunger", "comfort", "boredom", "trash", "sick"];
          this.assignNeed(pax, pick(pool));
        }
      }
    }

    const moodMul = this.diff().moodMul;
    for (const pax of this.passengers) {
      if (!pax.need) continue;
      pax.needT -= dt;
      if (NEED_META[pax.need]?.critical) this.mood -= 1.1 * dt * moodMul;
      if (pax.need === "baby") this.cry = Math.max(this.cry, 1);
      if (pax.needT <= 0) {
        pax.ignores++;
        pax.mood = clamp(pax.mood - (NEED_META[pax.need]?.critical ? 18 : 9) * moodMul, 0, 100);
        this.mood -= (NEED_META[pax.need]?.critical ? 6 : 2.5) * moodMul;
        if (pax.need === "medical" && pax.ignores >= 2) {
          this.finish(false, `${pax.name} in ${seatLabel(pax.row, pax.seat)} went unresponsive. Flight diverted. HR would like a word.`);
          return;
        }
        pax.needT = NEED_META[pax.need]?.critical ? 16 : 22;
        pax.call = true;
        this.events.push({ kind: "ding", seat: seatLabel(pax.row, pax.seat), need: pax.need });
      }
    }
  }

  stepPassengers(dt) {
    let sum = 0;
    for (const pax of this.passengers) {
      if (pax.state === "stand") {
        pax.standT -= dt;
        const aisleX = pax.seat < 2 ? -0.15 : 0.15;
        pax.x += (aisleX - pax.x) * 0.02;
        if (pax.standT <= 0) {
          pax.state = "seated";
          const w = seatWorld(pax.row, pax.seat);
          pax.x = w.x;
          pax.z = w.z;
        }
      } else {
        const w = seatWorld(pax.row, pax.seat);
        pax.x = w.x;
        pax.z = w.z;
      }
      sum += pax.mood;
    }
    const avg = sum / this.passengers.length;
    this.mood = this.mood * 0.985 + avg * 0.015;
  }

  stepDirector(dt, descent) {
    if (descent) return;
    this.nextEvent -= dt;
    if (this.nextEvent > 0) return;
    const crew = Math.max(1, this.players.size);
    this.nextEvent = (Math.max(8, 16 - crew * 1.2) + Math.random() * 7) * this.diff().eventMul;
    const elapsed = this.flightLen - this.timeLeft;
    const pool = ["pa", "turbulence", "baby", "drunk", "wifi"];
    if (elapsed > 40) pool.push("karen", "bin", "medical");
    if (elapsed > 80) pool.push("fire", "turbulence");
    const ev = pick(pool);
    this.runEvent(ev);
  }

  runEvent(ev) {
    if (ev === "pa") {
      this.announce("PA", PA[this.paIndex % PA.length], 5.5);
      this.paIndex++;
    } else if (ev === "turbulence") {
      this.turbulence = 6 + Math.random() * 4;
      this.seatbelt = true;
      this.announce("warn", "TURBULENCE. Grab the cart. Grab your friends. Grab whatever isn't coffee.");
      setTimeoutSafe(() => {
        if (this.phase === "flying" && this.timeLeft > 50) this.seatbelt = false;
      }, this.turbulence * 1000 + 2000);
    } else if (ev === "baby") {
      const idle = this.passengers.filter((p) => !p.need);
      const pax = pick(idle.length ? idle : this.passengers);
      this.assignNeed(pax, "baby", 24);
      this.cry = 24;
      this.announce("warn", `Bassinet in ${seatLabel(pax.row, pax.seat)} has gone fully feral. Warm bottle. Now.`);
    } else if (ev === "drunk") {
      const pax = pick(this.passengers);
      pax.state = "stand";
      pax.standT = 18;
      this.assignNeed(pax, "drunk", 20);
      this.announce("warn", `${pax.name} is in the aisle explaining their startup. Box wine or a shove, your call.`);
    } else if (ev === "wifi") {
      const idle = this.passengers.filter((p) => !p.need).slice(0, 4);
      for (const p of idle) this.assignNeed(p, "boredom", 20);
      this.announce("warn", "Wi-Fi is down. The cabin has remembered it has thoughts. Distribute headphones.");
    } else if (ev === "karen") {
      const pax = pick(this.passengers);
      pax.seq = ["thirst", "hunger", "comfort"];
      this.assignNeed(pax, pax.seq.shift(), 14);
      this.announce("warn", `${pax.name} in ${seatLabel(pax.row, pax.seat)} would like to speak to the manager. There isn't one.`);
    } else if (ev === "bin") {
      const z = 4 + Math.random() * 10;
      this.spawnItem(pick(["pillow", "blanket", "headphones", "barfbag"]), (Math.random() - 0.5) * 0.6, 1.8, z, null);
      this.announce("warn", "An overhead bin has surrendered. That's a lawsuit in aisle shape.");
    } else if (ev === "medical") {
      const pax = pick(this.passengers);
      this.assignNeed(pax, "medical", 20);
      this.announce("warn", `MEDICAL in ${seatLabel(pax.row, pax.seat)}. ${pax.name} has the vibe of someone who ate the seafood option.`);
    } else if (ev === "fire") {
      this.fire = 28;
      this.announce("warn", "GALLEY FIRE. Extinguisher is on the starboard wall. Yes, that's the right one. Probably.");
    }
  }

  land() {
    const cartStowed = this.cart.z > 16.6 && Math.abs(this.cart.x) < 0.5;
    if (!cartStowed) this.mood -= 12;
    if (this.fire > 0) {
      this.finish(false, "You landed on fire. Technically a landing. Not a good one.");
      return;
    }
    const crit = this.passengers.some((p) => p.need && NEED_META[p.need].critical);
    if (crit) {
      this.finish(false, "Still have a critical call lit. Tower sent you to a different airport, emotionally.");
      return;
    }
    if (this.mood >= 40) {
      const rank =
        this.mood >= 80 ? "Night Owl legends." : this.mood >= 60 ? "Competent-ish." : "You landed. That's the bar.";
      this.finish(true, `Wheels down at Dawn Harbor. Cabin mood ${Math.round(this.mood)}%. ${rank}`);
    } else {
      this.finish(false, `You reached the runway but the reviews will not. Mood ${Math.round(this.mood)}%.`);
    }
  }

  finish(win, reason) {
    this.phase = "ended";
    this.ended = {
      win,
      reason,
      mood: Math.round(this.mood),
      stats: [...this.players.values()].map((p) => ({
        name: p.name,
        colorIndex: p.colorIndex,
        ...p.stats,
      })),
    };
    this.events.push({ kind: "end" });
  }

  lobbyState() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      durationKey: this.durationKey,
      difficultyKey: this.difficultyKey,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        colorIndex: p.colorIndex,
        ready: p.ready,
        host: p.id === this.hostId,
      })),
    };
  }

  snapshot() {
    return {
      t: this.tickN,
      phase: this.phase,
      timeLeft: this.timeLeft,
      mood: this.mood,
      seatbelt: this.seatbelt,
      fire: this.fire,
      turbulence: this.turbulence,
      cry: this.cry,
      banner: this.banner,
      cart: { x: this.cart.x, z: this.cart.z, yaw: this.cart.yaw },
      spills: this.spills.map((s) => ({ x: s.x, z: s.z, t: s.t })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        colorIndex: p.colorIndex,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        item: this.held(p)?.type || null,
        emote: p.emote,
        slip: p.slip,
        running: !!p.running,
      })),
      pax: this.passengers.map((p) => ({
        id: p.id,
        mood: Math.round(p.mood),
        need: p.need,
        call: p.call,
        state: p.state,
        x: p.x,
        z: p.z,
        name: p.name,
        shirt: p.shirt,
        row: p.row,
        seat: p.seat,
      })),
      items: this.items.map((i) => ({
        id: i.id,
        type: i.type,
        x: i.x,
        y: i.y,
        z: i.z,
        heldBy: i.heldBy,
        slot: i.slot,
      })),
    };
  }
}

function setTimeoutSafe(fn, ms) {
  setTimeout(fn, ms);
}
