import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";
import { Room, makeCode } from "./sim.js";
import { TICK_MS, MAX_PLAYERS } from "../public/js/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.static(path.join(root, "public")));
app.use("/vendor/three", express.static(path.join(root, "node_modules/three")));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const rooms = new Map();
const sockets = new Map();

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId = null) {
  const raw = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === 1) p.ws.send(raw);
  }
}

function lanAddrs() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return out;
}

wss.on("connection", (ws) => {
  const meta = { id: null, code: null };
  sockets.set(ws, meta);

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    handle(ws, meta, msg);
  });

  ws.on("close", () => {
    const { id, code } = meta;
    sockets.delete(ws);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || !id) return;
    room.removePlayer(id);
    if (room.players.size === 0) {
      rooms.delete(code);
      return;
    }
    broadcast(room, { t: "lobby", ...room.lobbyState() });
    if (room.phase === "ended" && room.ended) {
      broadcast(room, { t: "end", ...room.ended });
    }
  });
});

function handle(ws, meta, msg) {
  const type = msg.t;
  if (type === "create") {
    let code = makeCode();
    while (rooms.has(code)) code = makeCode();
    const room = new Room(code, msg.duration || "regular");
    const added = room.addPlayer(ws, msg.name);
    if (added.err) return send(ws, { t: "err", m: added.err });
    rooms.set(code, room);
    meta.id = added.id;
    meta.code = code;
    send(ws, { t: "welcome", id: added.id, code, host: true, colorIndex: added.colorIndex, max: MAX_PLAYERS });
    send(ws, { t: "lobby", ...room.lobbyState() });
    return;
  }

  if (type === "join") {
    const code = String(msg.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(ws, { t: "err", m: "No flight with that code. Check the boarding pass." });
    const added = room.addPlayer(ws, msg.name);
    if (added.err) return send(ws, { t: "err", m: added.err });
    meta.id = added.id;
    meta.code = code;
    send(ws, { t: "welcome", id: added.id, code, host: added.host, colorIndex: added.colorIndex, max: MAX_PLAYERS });
    broadcast(room, { t: "lobby", ...room.lobbyState() });
    return;
  }

  const room = rooms.get(meta.code);
  if (!room || !meta.id) return;

  if (type === "ready") room.setReady(meta.id, msg.on);
  if (type === "duration") room.setDuration(meta.id, msg.key);
  if (type === "chat") {
    room.handleChat(meta.id, msg.text);
    for (const ev of room.events) {
      if (ev.kind === "chat") broadcast(room, { t: "chat", from: ev.from, color: ev.color, text: ev.text });
    }
    room.events = room.events.filter((e) => e.kind !== "chat");
    return;
  }
  if (type === "in") {
    room.handleInput(meta.id, msg);
    return;
  }
  if (type === "start") {
    const r = room.start(meta.id);
    if (r?.err) return send(ws, { t: "err", m: r.err });
    broadcast(room, { t: "start", seed: room.seed, duration: room.flightLen });
    return;
  }
  if (type === "again") {
    if (meta.id !== room.hostId) return;
    room.phase = "lobby";
    room.ended = null;
    for (const p of room.players.values()) p.ready = false;
    broadcast(room, { t: "lobby", ...room.lobbyState() });
    return;
  }

  if (type === "ready" || type === "duration") {
    broadcast(room, { t: "lobby", ...room.lobbyState() });
  }
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase !== "flying") continue;
    room.tick();
    const snap = room.snapshot();
    broadcast(room, { t: "snap", s: snap });
    for (const ev of room.events) {
      if (ev.kind === "chat") broadcast(room, { t: "chat", from: ev.from, color: ev.color, text: ev.text });
      else broadcast(room, { t: "ev", e: ev });
    }
    if (room.phase === "ended" && room.ended) {
      broadcast(room, { t: "end", ...room.ended });
    }
  }
}, TICK_MS);

httpServer.listen(PORT, "0.0.0.0", () => {
  const lans = lanAddrs();
  console.log("");
  console.log("  RED-EYE  ·  Night Owl Air flight 413");
  console.log("  ────────────────────────────────────");
  console.log(`  Local   http://localhost:${PORT}`);
  for (const ip of lans) console.log(`  LAN     http://${ip}:${PORT}`);
  console.log("");
  console.log("  Host a flight, share the 4-letter code.");
  console.log("  Up to 5 crew. Same Wi-Fi, or tunnel the port.");
  console.log("");
});
