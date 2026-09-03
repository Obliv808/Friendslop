import assert from "assert";
import { Room } from "../sim.js";

// Lobby -> flying -> a stable, well-formed snapshot.
{
  const room = new Room("TEST-LIFE", "short");
  const fake = { readyState: 0, send() {} };
  const a = room.addPlayer(fake, "Teal");
  const b = room.addPlayer(fake, "Coral");
  assert.ok(a.id && b.id, "both players should get ids");

  const started = room.start(a.id);
  assert.ok(started.ok, "the host should be able to start the flight");

  for (let i = 0; i < 80; i++) room.tick();
  const snap = room.snapshot();
  assert.strictEqual(snap.pax.length, 24, "should always spawn 24 passengers");
  assert.strictEqual(typeof snap.mood, "number");
  assert.ok(!Number.isNaN(snap.mood), "mood should never be NaN");
  assert.strictEqual(snap.players.length, 2);
}

// A disconnected player is held in place (not booted) and can reclaim their seat.
{
  const room = new Room("TEST-RECONNECT", "short");
  const fake = { readyState: 0, send() {} };
  const a = room.addPlayer(fake, "Teal");
  room.start(a.id);
  const p = room.players.get(a.id);
  p.lastIn = { bits: 1, yaw: 0, pitch: 0, a: 0 };

  room.markDisconnected(a.id);
  assert.strictEqual(p.connected, false);
  assert.strictEqual(room.players.size, 1, "a disconnected player should stay in the room");
  assert.strictEqual(p.lastIn.bits, 0, "input should freeze on disconnect so they don't drift");

  const reclaimed = room.reconnect(a.id, { readyState: 1, send() {} });
  assert.ok(reclaimed, "reconnect should find the held seat");
  assert.strictEqual(reclaimed.connected, true);
}

console.log("lifecycle.test ok");
