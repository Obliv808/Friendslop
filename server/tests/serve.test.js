import assert from "assert";
import { Room } from "../sim.js";

function freshRoom() {
  const room = new Room("TEST-SERVE", "short");
  const fake = { readyState: 0, send() {} };
  const a = room.addPlayer(fake, "Teal");
  room.start(a.id);
  return { room, player: room.players.get(a.id) };
}

// Serving the correct item clears the need, pays out mood, and logs a hit.
{
  const { room, player } = freshRoom();
  const pax = room.passengers[0];
  room.assignNeed(pax, "thirst");
  const item = room.spawnItem("coffee", player.x, 1, player.z, player.id);
  player.item = item.id;
  const moodBefore = room.mood;

  room.serve(player, pax, item);

  assert.strictEqual(pax.need, null, "need should clear on a correct serve");
  assert.strictEqual(player.stats.served, 1, "served stat should increment");
  assert.ok(room.mood > moodBefore, "mood should rise on a correct serve");
}

// Serving the wrong item leaves the need in place and costs mood.
{
  const { room, player } = freshRoom();
  const pax = room.passengers[1];
  room.assignNeed(pax, "hunger");
  const item = room.spawnItem("coffee", player.x, 1, player.z, player.id);
  player.item = item.id;
  const moodBefore = room.mood;

  room.serve(player, pax, item);

  assert.strictEqual(pax.need, "hunger", "need should remain after a wrong serve");
  assert.strictEqual(player.stats.wrong, 1, "wrong stat should increment");
  assert.ok(room.mood < moodBefore, "mood should fall on a wrong serve");
}

console.log("serve.test ok");
