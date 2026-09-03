import { CABIN, ROW_COUNT, ROW_Z0, ROW_PITCH, SEAT_X } from "./constants.js";

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

export function facingXZ(yaw) {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Seat + galley obstacle AABBs on the XZ plane. */
export function buildObstacles() {
  const boxes = [];
  const seatW = 0.48;
  const seatD = 0.52;
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let s = 0; s < SEAT_X.length; s++) {
      const x = SEAT_X[s];
      const z = ROW_Z0 + row * ROW_PITCH;
      boxes.push({
        minX: x - seatW / 2,
        maxX: x + seatW / 2,
        minZ: z - seatD / 2,
        maxZ: z + seatD / 2 + 0.12,
      });
    }
  }
  // Galley counters, left and right, with a walkable center.
  boxes.push({ minX: -2.08, maxX: -0.92, minZ: 17.9, maxZ: 21.4 });
  boxes.push({ minX: 0.92, maxX: 2.08, minZ: 17.9, maxZ: 21.4 });
  // Cockpit bulkhead / lav bump.
  boxes.push({ minX: -2.08, maxX: -0.55, minZ: 0.4, maxZ: 1.35 });
  boxes.push({ minX: 0.55, maxX: 2.08, minZ: 0.4, maxZ: 1.15 });
  return boxes;
}

export function collideRadius(p, boxes, radius = 0.22) {
  p.x = clamp(p.x, CABIN.minX + radius, CABIN.maxX - radius);
  p.z = clamp(p.z, CABIN.minZ + radius, CABIN.maxZ - radius);

  for (const b of boxes) {
    const nx = clamp(p.x, b.minX, b.maxX);
    const nz = clamp(p.z, b.minZ, b.maxZ);
    let dx = p.x - nx;
    let dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 === 0) {
      const left = p.x - b.minX;
      const right = b.maxX - p.x;
      const up = p.z - b.minZ;
      const down = b.maxZ - p.z;
      const m = Math.min(left, right, up, down);
      if (m === left) p.x = b.minX - radius;
      else if (m === right) p.x = b.maxX + radius;
      else if (m === up) p.z = b.minZ - radius;
      else p.z = b.maxZ + radius;
      continue;
    }
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      p.x += dx * push;
      p.z += dz * push;
    }
  }
}

export function stepMover(p, input, dt, boxes, extra = {}) {
  const running = !!(input.run && !p.slip && !extra.seatbeltLock);
  const speed = p.slip ? 1.6 : running ? 5.05 : 3.05;
  const fwd = facingXZ(p.yaw);
  const right = { x: Math.cos(p.yaw), z: Math.sin(p.yaw) };

  let ix = 0;
  let iz = 0;
  if (input.f) {
    ix += fwd.x;
    iz += fwd.z;
  }
  if (input.b) {
    ix -= fwd.x;
    iz -= fwd.z;
  }
  if (input.l) {
    ix -= right.x;
    iz -= right.z;
  }
  if (input.r) {
    ix += right.x;
    iz += right.z;
  }
  const len = Math.hypot(ix, iz);
  if (len > 0.001) {
    ix /= len;
    iz /= len;
  }

  const wishX = ix * speed;
  const wishZ = iz * speed;
  const accel = p.slip ? 6 : 16;
  const k = 1 - Math.exp(-accel * dt);
  p.vx += (wishX - p.vx) * k;
  p.vz += (wishZ - p.vz) * k;

  if (extra.impulse) {
    p.vx += extra.impulse.x;
    p.vz += extra.impulse.z;
  }

  if (input.jump && p.y <= 0.02 && p.vy <= 0.01) p.vy = 3.4;
  p.vy -= 16 * dt;
  p.y += p.vy * dt;
  if (p.y < 0) {
    p.y = 0;
    p.vy = 0;
  }
  if (p.y > 0.85) {
    p.y = 0.85;
    p.vy = 0;
  }

  p.x += p.vx * dt;
  p.z += p.vz * dt;
  collideRadius(p, boxes);

  p.yaw = input.yaw;
  p.pitch = clamp(input.pitch, -1.15, 1.15);
  p.running = running && len > 0.1;
}

export function decodeBits(bits) {
  return {
    f: !!(bits & 1),
    b: !!(bits & 2),
    l: !!(bits & 4),
    r: !!(bits & 8),
    run: !!(bits & 16),
    jump: !!(bits & 32),
  };
}

export function encodeBits(k) {
  let b = 0;
  if (k.f) b |= 1;
  if (k.b) b |= 2;
  if (k.l) b |= 4;
  if (k.r) b |= 8;
  if (k.run) b |= 16;
  if (k.jump) b |= 32;
  return b;
}
