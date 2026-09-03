import { Room } from "./sim.js";

const room = new Room("TEST", "short");
const fake = { readyState: 0, send() {} };
const a = room.addPlayer(fake, "Teal");
const b = room.addPlayer(fake, "Coral");
if (!a.id || !b.id) throw new Error("addPlayer failed");
const started = room.start(a.id);
if (!started.ok) throw new Error(started.err);
room.handleInput(a.id, { k: 1, y: Math.PI, p: 0, a: 1 });
for (let i = 0; i < 80; i++) room.tick();
const snap = room.snapshot();
if (snap.pax.length !== 24) throw new Error("expected 24 passengers, got " + snap.pax.length);
if (typeof snap.mood !== "number" || Number.isNaN(snap.mood)) throw new Error("bad mood");
if (snap.players.length !== 2) throw new Error("player count");
if (room.phase !== "flying" && room.phase !== "ended") throw new Error("phase " + room.phase);
console.log("sim ok — mood", snap.mood.toFixed(1), "items", snap.items.length, "time", snap.timeLeft.toFixed(1));
