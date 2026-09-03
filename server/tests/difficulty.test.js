import assert from "assert";
import { Room } from "../sim.js";

function freshRoom(difficulty) {
  const room = new Room(`TEST-DIFF-${difficulty}`, "short", difficulty);
  const fake = { readyState: 0, send() {} };
  const a = room.addPlayer(fake, "Teal");
  room.start(a.id);
  return room;
}

// Chaos should punish an ignored need harder than calm does.
{
  const calm = freshRoom("calm");
  const chaos = freshRoom("chaos");
  calm.assignNeed(calm.passengers[0], "thirst", 0.01);
  chaos.assignNeed(chaos.passengers[0], "thirst", 0.01);

  const calmMoodBefore = calm.mood;
  const chaosMoodBefore = chaos.mood;
  calm.stepNeeds(0.02, false);
  chaos.stepNeeds(0.02, false);

  const calmLoss = calmMoodBefore - calm.mood;
  const chaosLoss = chaosMoodBefore - chaos.mood;
  assert.ok(chaosLoss > calmLoss, "chaos should cost more mood than calm for the same ignored need");
}

// Chaos should queue director events (turbulence, fires, etc) more often than calm.
{
  const calm = freshRoom("calm");
  const chaos = freshRoom("chaos");
  calm.nextEvent = 0;
  chaos.nextEvent = 0;
  calm.stepDirector(0.02, false);
  chaos.stepDirector(0.02, false);
  assert.ok(chaos.nextEvent < calm.nextEvent, "chaos should schedule the next event sooner than calm");
}

// The host can only change difficulty while the room is still in the lobby.
{
  const room = freshRoom("standard");
  const hostId = room.hostId;
  room.setDifficulty(hostId, "chaos");
  assert.strictEqual(room.difficultyKey, "standard", "difficulty shouldn't change once the flight has started");
}

console.log("difficulty.test ok");
