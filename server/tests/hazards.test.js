import assert from "assert";
import { Room } from "../sim.js";

function freshRoom() {
  const room = new Room("TEST-HAZ", "short");
  const fake = { readyState: 0, send() {} };
  const a = room.addPlayer(fake, "Teal");
  room.start(a.id);
  return { room, player: room.players.get(a.id) };
}

// Spilling a liquid dings mood and the spiller's own stat line.
{
  const { room, player } = freshRoom();
  const moodBefore = room.mood;
  room.spillAt(player.x, player.z, player);
  assert.strictEqual(player.stats.spills, 1, "spill stat should increment");
  assert.ok(room.mood < moodBefore, "mood should drop on a spill");
  assert.strictEqual(room.spills.length, 1, "a spill puddle should exist");
}

// Landing with an active galley fire always fails, regardless of mood.
{
  const { room } = freshRoom();
  room.mood = 95;
  room.fire = 10;
  room.land();
  assert.strictEqual(room.phase, "ended");
  assert.strictEqual(room.ended.win, false, "should not be able to land on fire");
}

// Ignoring a medical call twice diverts the flight outright.
{
  const { room } = freshRoom();
  const pax = room.passengers[0];
  room.assignNeed(pax, "medical", 0.01);

  room.stepNeeds(0.02, false); // first ignore
  assert.strictEqual(pax.ignores, 1);
  assert.strictEqual(room.phase, "flying", "one ignored medical call shouldn't end the flight");

  pax.needT = 0.01;
  room.stepNeeds(0.02, false); // second ignore -> divert
  assert.strictEqual(room.phase, "ended", "a second ignored medical call should divert");
  assert.strictEqual(room.ended.win, false);
}

console.log("hazards.test ok");
