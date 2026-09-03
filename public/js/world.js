import * as THREE from "three";
import { ROW_COUNT, ROW_Z0, ROW_PITCH, SEAT_X, PLAYER_COLORS, ITEM_DEFS } from "./constants.js";

function box(scene, w, h, d, x, y, z, mat, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = false;
  m.receiveShadow = false;
  scene.add(m);
  return m;
}

function canvasTex(draw, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeMats() {
  const carpet = canvasTex((g, s) => {
    g.fillStyle = "#1b2430";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = i % 3 ? "#243044" : "#151c28";
      g.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, 2, 2);
    }
    g.fillStyle = "#c9a227";
    g.fillRect(s * 0.48, 0, s * 0.04, s);
  }, 256);
  carpet.repeat.set(6, 22);

  const plastic = canvasTex((g, s) => {
    g.fillStyle = "#d8d2c8";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#cfc8bc";
    g.fillRect(0, 0, s, 8);
    g.fillRect(0, s - 8, s, 8);
  });

  const metal = new THREE.MeshStandardMaterial({ color: 0x8a93a0, roughness: 0.35, metalness: 0.6 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.7 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x1f6f6a, roughness: 0.55 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe7dfd2, roughness: 0.8, map: plastic });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121820, roughness: 0.85 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x1e4d4a, roughness: 0.7 });
  const seat2 = new THREE.MeshStandardMaterial({ color: 0x173e3c, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.45, metalness: 0.4, emissive: 0x3a2a00, emissiveIntensity: 0.25 });
  const windowGlow = new THREE.MeshStandardMaterial({
    color: 0x0b1a33,
    emissive: 0x1a3a6a,
    emissiveIntensity: 0.8,
    roughness: 0.3,
  });
  const aisle = new THREE.MeshStandardMaterial({
    color: 0xffcc33,
    emissive: 0xffb703,
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });
  const floor = new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.9, color: 0xffffff });
  return { metal, navy, teal, cream, dark, seat, seat2, gold, windowGlow, aisle, floor };
}

export function buildCabin(scene) {
  const mats = makeMats();

  box(scene, 4.2, 0.08, 22.2, 0, 0, 11, mats.floor);
  box(scene, 4.2, 0.08, 22.2, 0, 2.18, 11, mats.cream);
  box(scene, 0.12, 2.2, 22.2, -2.1, 1.1, 11, mats.navy);
  box(scene, 0.12, 2.2, 22.2, 2.1, 1.1, 11, mats.navy);

  // Cockpit bulkhead + door
  box(scene, 4.2, 2.2, 0.12, 0, 1.1, 0.45, mats.teal);
  box(scene, 0.7, 1.5, 0.08, 0, 0.85, 0.52, mats.dark);
  box(scene, 0.18, 0.04, 0.04, 0.22, 0.85, 0.58, mats.gold);

  // Rear bulkhead
  box(scene, 4.2, 2.2, 0.12, 0, 1.1, 21.5, mats.teal);

  // Windows
  for (let i = 0; i < 12; i++) {
    const z = 1.8 + i * 1.55;
    for (const x of [-2.04, 2.04]) {
      const w = box(scene, 0.06, 0.42, 0.55, x, 1.35, z, mats.windowGlow);
      w.scale.set(1, 1, 1);
      const frame = box(scene, 0.05, 0.52, 0.68, x * 0.99, 1.35, z, mats.cream);
      frame.material = mats.cream;
    }
  }

  // Overhead bins
  for (let i = 0; i < 10; i++) {
    const z = 2.2 + i * 1.7;
    box(scene, 1.15, 0.28, 1.5, -1.45, 1.98, z, mats.cream);
    box(scene, 1.15, 0.28, 1.5, 1.45, 1.98, z, mats.cream);
    box(scene, 0.08, 0.04, 0.4, -1.0, 1.84, z, mats.gold);
    box(scene, 0.08, 0.04, 0.4, 1.0, 1.84, z, mats.gold);
  }

  // Aisle path lights
  for (let z = 2; z < 17; z += 0.7) {
    box(scene, 0.08, 0.02, 0.28, -0.42, 0.05, z, mats.aisle);
    box(scene, 0.08, 0.02, 0.28, 0.42, 0.05, z, mats.aisle);
  }

  // Seats
  const seats = [];
  for (let row = 0; row < ROW_COUNT; row++) {
    const z = ROW_Z0 + row * ROW_PITCH;
    for (let s = 0; s < SEAT_X.length; s++) {
      const x = SEAT_X[s];
      const mat = s % 2 ? mats.seat : mats.seat2;
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.48), mat);
      base.position.y = 0.42;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.1), mat);
      back.position.set(0, 0.72, 0.22);
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.4), mats.metal);
      armL.position.set(-0.23, 0.52, 0);
      const armR = armL.clone();
      armR.position.x = 0.23;
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.04, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2244, emissiveIntensity: 0 })
      );
      light.position.set(0, 1.12, 0.18);
      group.add(base, back, armL, armR, light);
      scene.add(group);
      seats.push({ row, seat: s, group, light, lightMat: light.material });
    }
  }

  // Galley
  box(scene, 1.15, 1.1, 3.4, -1.55, 0.55, 19.6, mats.metal);
  box(scene, 1.15, 1.1, 3.4, 1.55, 0.55, 19.6, mats.metal);
  box(scene, 1.15, 0.08, 3.4, -1.55, 1.12, 19.6, mats.cream);
  box(scene, 1.15, 0.08, 3.4, 1.55, 1.12, 19.6, mats.cream);
  // Coffee machine, fridge, oven blocks
  box(scene, 0.4, 0.55, 0.4, -1.55, 1.42, 18.4, mats.dark);
  box(scene, 0.4, 0.7, 0.45, -1.55, 1.5, 19.2, mats.navy);
  box(scene, 0.45, 0.4, 0.45, -1.55, 1.35, 20.0, mats.dark);
  box(scene, 0.5, 0.55, 0.5, 1.55, 1.42, 18.4, mats.teal);
  box(scene, 0.4, 0.45, 0.25, 1.55, 1.4, 19.2, new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.5 }));
  box(scene, 0.3, 0.4, 0.3, 1.55, 1.35, 20.0, mats.cream);
  box(scene, 0.16, 0.5, 0.16, 1.55, 1.4, 17.6, new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.4 }));

  // Lav door
  box(scene, 0.7, 1.7, 0.08, -1.55, 0.85, 17.55, mats.cream);

  // Ceiling lights
  for (let z = 3; z <= 19; z += 3.2) {
    const lamp = box(scene, 0.7, 0.04, 1.1, 0, 2.12, z, new THREE.MeshStandardMaterial({
      color: 0xffe6c2,
      emissive: 0xffd19a,
      emissiveIntensity: 1.1,
    }));
    const light = new THREE.PointLight(0xffd6a5, 3.2, 8, 1.6);
    light.position.set(0, 1.9, z);
    scene.add(light, lamp);
  }
  const galleyLight = new THREE.PointLight(0xddeeff, 2.4, 7, 1.4);
  galleyLight.position.set(0, 1.9, 19.2);
  scene.add(galleyLight);

  const hemi = new THREE.HemisphereLight(0x4a6a9a, 0x1a120c, 0.55);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x1a2233, 0.45);
  scene.add(amb);

  // Safety cards strip on bulkhead
  box(scene, 1.4, 0.35, 0.02, 0, 1.55, 0.52, mats.gold);

  return { seats, mats };
}

export function makeCartMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.95, 0.62),
    new THREE.MeshStandardMaterial({ color: 0xc5cdd6, metalness: 0.45, roughness: 0.4 })
  );
  body.position.y = 0.55;
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  handle.position.set(0, 1.05, -0.34);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.08, 0.64),
    new THREE.MeshStandardMaterial({ color: 0x1f6f6a })
  );
  stripe.position.y = 0.9;
  g.add(body, handle, stripe);
  return g;
}

export function makeItemMesh(type) {
  const def = ITEM_DEFS[type] || ITEM_DEFS.coffee;
  const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55 });
  const g = new THREE.Group();
  let mesh;
  switch (def.hold) {
    case "cup":
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 10), mat);
      break;
    case "can":
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10), mat);
      break;
    case "tray":
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.14), mat);
      break;
    case "tank":
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 10), mat);
      mesh.rotation.z = 0.15;
      break;
    case "bottle":
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 8), mat);
      break;
    case "kit":
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), mat);
      break;
    case "cans":
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 12), mat);
      mesh.rotation.x = Math.PI / 2;
      break;
    default:
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), mat);
  }
  g.add(mesh);
  return g;
}

export function makePlayerMesh(colorIndex, isLocal) {
  const col = PLAYER_COLORS[colorIndex] || PLAYER_COLORS[0];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: col.hex, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.55, 4, 8), bodyMat);
  body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.y = 1.22;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.08, 12), dark);
  hat.position.y = 1.36;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), dark);
  brim.position.y = 1.32;
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.02), new THREE.MeshStandardMaterial({ color: 0xc9a227 }));
  tie.position.set(0, 0.95, 0.16);
  g.add(body, head, hat, brim, tie);
  if (isLocal) {
    body.visible = false;
    head.visible = false;
    hat.visible = false;
    brim.visible = false;
    tie.visible = false;
  }
  g.userData.head = head;
  return g;
}

export function makePassengerMesh(shirt) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 0.28, 3, 6),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.7 })
  );
  body.position.y = 0.72;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.7 })
  );
  head.position.y = 1.02;
  const arm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.035, 0.18, 3, 5),
    new THREE.MeshStandardMaterial({ color: shirt })
  );
  arm.position.set(0.16, 0.85, 0);
  g.add(body, head, arm);
  g.userData.arm = arm;
  g.userData.body = body;
  return g;
}

export function starfield() {
  const geo = new THREE.BufferGeometry();
  const n = 600;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 80;
    pos[i * 3 + 1] = Math.random() * 30 + 2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })
  );
}
