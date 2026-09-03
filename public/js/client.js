import * as THREE from "three";
import {
  ITEM_DEFS,
  NEED_META,
  PLAYER_COLORS,
  STATIONS,
  seatLabel,
  TICK_MS,
} from "./constants.js";
import { encodeBits, lookDir } from "./physics.js";
import { buildCabin, makeCartMesh, makeItemMesh, makePlayerMesh, makePassengerMesh, starfield } from "./world.js";
import { createAudio } from "./audio.js";

const canvas = document.getElementById("view");
const overlay = document.getElementById("overlay");
const menu = document.getElementById("menu");
const lobby = document.getElementById("lobby");
const endPanel = document.getElementById("end");
const hud = document.getElementById("hud");
const errEl = document.getElementById("err");
const nameIn = document.getElementById("nameIn");
const codeIn = document.getElementById("codeIn");
const labelsEl = document.getElementById("labels");

nameIn.value = localStorage.getItem("redeye-name") || "";

const audio = createAudio();
const isTouch = matchMedia("(pointer: coarse)").matches;
const touchControls = document.getElementById("touchControls");
const keys = { f: false, b: false, l: false, r: false, run: false, jump: false };
let yaw = Math.PI;
let pitch = 0;
let pointerLocked = false;
let chatting = false;
let myId = null;
let isHost = false;
let roomCode = null;
let phase = "menu";
let snap = null;
let prevSnap = null;
let snapAt = 0;
let ws = null;
let action = 0;
let preview = true;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);
scene.fog = new THREE.Fog(0x070b14, 14, 32);
scene.add(starfield());
const cabin = buildCabin(scene);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 80);
camera.position.set(0, 1.4, 19.5);
scene.add(camera);
const holdAnchor = new THREE.Group();
holdAnchor.position.set(0.28, -0.24, -0.5);
camera.add(holdAnchor);
let holdMesh = null;
let holdType = null;

const cartMesh = makeCartMesh();
scene.add(cartMesh);
const playerMeshes = new Map();
const paxMeshes = new Map();
const itemMeshes = new Map();
const spillMeshes = [];
const nametags = new Map();

const fireLight = new THREE.PointLight(0xff6b2a, 0, 8, 1.4);
fireLight.position.set(0, 1.4, 19.2);
scene.add(fireLight);

function proto() {
  const p = location.protocol === "https:" ? "wss" : "ws";
  return `${p}://${location.host}`;
}

function showErr(m) {
  errEl.hidden = !m;
  errEl.textContent = m || "";
}

// --- Session / reconnect -------------------------------------------------
// A wifi blip or a laptop going to sleep shouldn't end someone's flight.
// We remember who we were and try to slot back in when the socket drops.
function saveSession() {
  try {
    sessionStorage.setItem("redeye-session", JSON.stringify({ id: myId, code: roomCode }));
  } catch {}
}
function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem("redeye-session") || "null");
  } catch {
    return null;
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem("redeye-session");
  } catch {}
}
function resetToMenu() {
  phase = "menu";
  preview = true;
  document.exitPointerLock();
  hud.hidden = true;
  endPanel.hidden = true;
  lobby.hidden = true;
  menu.hidden = false;
  overlay.style.display = "";
}

let reconnecting = false;
let reconnectAttempts = 0;
let awaitingRejoin = false;

function connect() {
  if (ws && ws.readyState <= 1) return ws;
  ws = new WebSocket(proto());
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
  ws.onopen = () => {
    if (!reconnecting) return;
    reconnecting = false;
    const session = loadSession();
    if (session?.id && session?.code) {
      awaitingRejoin = true;
      send({ t: "rejoin", id: session.id, code: session.code });
    }
  };
  ws.onclose = () => {
    if (phase === "menu") return; // never actually joined a flight
    const session = loadSession();
    if (session?.id && session?.code && reconnectAttempts < 6) {
      reconnecting = true;
      reconnectAttempts++;
      showErr(`Lost the jumpseat connection — reconnecting… (${reconnectAttempts}/6)`);
      setTimeout(() => connect(), 1200);
    } else {
      showErr("Lost the jumpseat connection.");
    }
  };
  return ws;
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function whenOpen(fn) {
  const sock = connect();
  if (sock.readyState === 1) fn();
  else sock.addEventListener("open", fn, { once: true });
}

document.getElementById("createBtn").onclick = () => {
  const name = nameIn.value.trim() || "Crew";
  localStorage.setItem("redeye-name", name);
  audio.resume();
  showErr("");
  whenOpen(() => send({ t: "create", name, duration: "regular", difficulty: "standard" }));
};
document.getElementById("joinBtn").onclick = join;
codeIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") join();
});
function join() {
  const name = nameIn.value.trim() || "Crew";
  localStorage.setItem("redeye-name", name);
  audio.resume();
  showErr("");
  whenOpen(() => send({ t: "join", name, code: codeIn.value.trim().toUpperCase() }));
}

document.getElementById("readyBtn").onclick = () => {
  const btn = document.getElementById("readyBtn");
  const on = !btn.classList.contains("on");
  btn.classList.toggle("on", on);
  btn.textContent = on ? "Ready ✓" : "Ready";
  send({ t: "ready", on });
};
document.getElementById("startBtn").onclick = () => send({ t: "start" });
document.getElementById("durSel").onchange = (e) => send({ t: "duration", key: e.target.value });
document.getElementById("diffSel").onchange = (e) => send({ t: "difficulty", key: e.target.value });
document.getElementById("againBtn").onclick = () => {
  if (isHost) send({ t: "again" });
  endPanel.hidden = true;
  lobby.hidden = false;
};

function onMsg(msg) {
  reconnectAttempts = 0;
  if (msg.t === "err") {
    showErr(msg.m);
    if (awaitingRejoin) {
      // The room we were trying to slot back into is gone. No point
      // retrying — send them back to the menu instead of hanging forever.
      awaitingRejoin = false;
      clearSession();
      resetToMenu();
    }
    return;
  }
  awaitingRejoin = false;
  if (msg.t === "welcome") {
    myId = msg.id;
    isHost = msg.host;
    roomCode = msg.code;
    saveSession();
    showErr("");
    document.getElementById("lobbyCode").textContent = msg.code;
    document.getElementById("startBtn").hidden = !isHost;
    document.getElementById("hostControls").hidden = !isHost;
    document.getElementById("metaChip").textContent = `CODE ${msg.code}`;
    if (!msg.resume) {
      menu.hidden = true;
      lobby.hidden = false;
      endPanel.hidden = true;
      phase = "lobby";
    }
    // If resuming, the very next message (lobby/start/end) drives the UI.
  }
  if (msg.t === "lobby") {
    renderLobby(msg);
    if (phase === "ended" || phase === "fly") {
      hud.hidden = true;
      overlay.style.display = "";
      endPanel.hidden = true;
      lobby.hidden = false;
      menu.hidden = true;
      phase = "lobby";
      preview = true;
      canvas.style.cursor = "";
      prevSnap = null;
      snap = null;
      clearFlightMeshes();
      touchControls.hidden = true;
    }
  }
  if (msg.t === "start") {
    beginFlight();
  }
  if (msg.t === "snap") {
    prevSnap = snap;
    snap = msg.s;
    snapAt = performance.now();
  }
  if (msg.t === "ev") handleEvent(msg.e);
  if (msg.t === "chat") pushChat(msg.from, msg.text, msg.color);
  if (msg.t === "end") showEnd(msg);
}

function renderLobby(msg) {
  const list = document.getElementById("crewList");
  list.innerHTML = "";
  for (const p of msg.players) {
    const col = PLAYER_COLORS[p.colorIndex];
    const row = document.createElement("div");
    row.className = "crew";
    row.innerHTML = `<i class="swatch" style="background:${col.css}"></i><b>${escapeHtml(p.name)}</b>
      <span class="tag">${p.host ? "HOST" : ""} ${p.ready ? "READY" : "…"}</span>`;
    list.appendChild(row);
  }
  document.getElementById("metaChip").textContent = `CREW ${msg.players.length}/5 · ${msg.code}`;
  document.getElementById("durSel").value = msg.durationKey;
  if (msg.difficultyKey) document.getElementById("diffSel").value = msg.difficultyKey;
}

function beginFlight() {
  phase = "fly";
  preview = false;
  prevSnap = null;
  snap = null;
  clearFlightMeshes();
  overlay.style.display = "none";
  hud.hidden = false;
  audio.resume();
  if (isTouch) touchControls.hidden = false;
  else canvas.requestPointerLock();
  yaw = Math.PI;
  pitch = 0;
  document.getElementById("chatlog").innerHTML = "";
}

function showEnd(msg) {
  phase = "ended";
  document.exitPointerLock();
  touchControls.hidden = true;
  hud.hidden = true;
  overlay.style.display = "";
  lobby.hidden = true;
  menu.hidden = true;
  endPanel.hidden = false;
  document.getElementById("endKicker").textContent = msg.win ? "Wheels down" : "Diverted";
  document.getElementById("endTitle").textContent = msg.win ? "You landed it" : "Not this sector";
  document.getElementById("endReason").textContent = msg.reason;
  const el = document.getElementById("endStats");
  el.innerHTML = `<div class="statrow"><b>Crew</b><span>Served</span><span>Wrong</span><span>Spills</span><span>Shoves</span></div>`;
  for (const s of msg.stats || []) {
    const col = PLAYER_COLORS[s.colorIndex]?.css || "#fff";
    el.innerHTML += `<div class="statrow"><b style="color:${col}">${escapeHtml(s.name)}</b><span>${s.served}</span><span>${s.wrong}</span><span>${s.spills}</span><span>${s.shoves}</span></div>`;
  }
  document.getElementById("againBtn").hidden = !isHost;
  audio.land(msg.win);
  audio.setTurbulence(false);
  audio.setCry(false);
  audio.setFire(false);
}

function handleEvent(e) {
  if (!e) return;
  if (e.kind === "ding") audio.ding();
  if (e.kind === "banner" && e.k === "PA") audio.pa();
  if (e.kind === "serve") audio.serve();
  if (e.kind === "spill") audio.spill();
  if (e.kind === "shove") audio.shove();
}

function pushChat(from, text, color) {
  const log = document.getElementById("chatlog");
  const line = document.createElement("div");
  const c = PLAYER_COLORS[color]?.css || "#e7dfd2";
  line.innerHTML = `<b style="color:${c}">${escapeHtml(from)}</b> ${escapeHtml(text)}`;
  log.appendChild(line);
  while (log.children.length > 8) log.removeChild(log.firstChild);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

canvas.addEventListener("click", () => {
  if (phase === "fly") {
    audio.resume();
    if (!isTouch) canvas.requestPointerLock();
  }
});
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener("mousemove", (e) => {
  if (!pointerLocked) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-1.15, Math.min(1.15, pitch));
});

const keymap = {
  KeyW: "f",
  KeyS: "b",
  KeyA: "l",
  KeyD: "r",
  ShiftLeft: "run",
  ShiftRight: "run",
  Space: "jump",
};
document.addEventListener("keydown", (e) => {
  if (chatting) {
    if (e.key === "Escape") closeChat();
    return;
  }
  if (phase === "fly" && (e.key === "Enter" || e.code === "Slash")) {
    e.preventDefault();
    openChat();
    return;
  }
  if (keymap[e.code]) keys[keymap[e.code]] = true;
  if (e.code === "KeyE") action = 1;
  if (e.code === "KeyF") action = 2;
  if (e.code === "KeyG") action = 3;
  if (e.code === "KeyR") action = 4;
  if (e.code === "KeyX") action = 5;
  if (e.code === "KeyC") action = 6;
  if (e.code === "Escape" && pointerLocked) document.exitPointerLock();
});
document.addEventListener("keyup", (e) => {
  if (keymap[e.code]) keys[keymap[e.code]] = false;
});

function openChat() {
  chatting = true;
  if (!isTouch) document.exitPointerLock();
  const form = document.getElementById("chatForm");
  form.hidden = false;
  form.querySelector("input").focus();
}
function closeChat() {
  chatting = false;
  document.getElementById("chatForm").hidden = true;
  if (phase === "fly" && !isTouch) canvas.requestPointerLock();
}
document.getElementById("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const input = document.getElementById("chatIn");
  const text = input.value.trim();
  input.value = "";
  if (text) send({ t: "chat", text });
  closeChat();
};

setInterval(() => {
  if (phase !== "fly" || !ws || ws.readyState !== 1) return;
  send({ t: "in", k: encodeBits(keys), y: yaw, p: pitch, a: action });
  action = 0;
}, 50);

// --- Touch controls: virtual stick, drag-to-look, tap-to-act buttons ---
if (isTouch) {
  const joyZone = document.getElementById("joyZone");
  const joyStick = document.getElementById("joyStick");
  const lookZone = document.getElementById("lookZone");
  const JOY_RADIUS = 44;
  let joyPointerId = null;
  let joyCenter = { x: 0, y: 0 };

  function updateJoy(cx, cy) {
    const dx = cx - joyCenter.x;
    const dy = cy - joyCenter.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, JOY_RADIUS);
    const ang = Math.atan2(dy, dx);
    const nx = Math.cos(ang) * clampedDist;
    const ny = Math.sin(ang) * clampedDist;
    joyStick.style.transform = `translate(${nx}px, ${ny}px) translate(-50%, -50%)`;
    const dead = dist < JOY_RADIUS * 0.22;
    const edge = JOY_RADIUS * 0.18;
    keys.f = !dead && dy < -edge;
    keys.b = !dead && dy > edge;
    keys.l = !dead && dx < -edge;
    keys.r = !dead && dx > edge;
  }
  function endJoy(e) {
    if (e.pointerId !== joyPointerId) return;
    joyPointerId = null;
    keys.f = keys.b = keys.l = keys.r = false;
    joyStick.style.transform = "translate(-50%, -50%)";
  }
  joyZone.addEventListener("pointerdown", (e) => {
    if (joyPointerId !== null) return;
    joyPointerId = e.pointerId;
    joyZone.setPointerCapture(e.pointerId);
    const r = joyZone.getBoundingClientRect();
    joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    updateJoy(e.clientX, e.clientY);
  });
  joyZone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyPointerId) return;
    updateJoy(e.clientX, e.clientY);
  });
  joyZone.addEventListener("pointerup", endJoy);
  joyZone.addEventListener("pointercancel", endJoy);

  let lookPointerId = null;
  let lookLast = { x: 0, y: 0 };
  lookZone.addEventListener("pointerdown", (e) => {
    if (lookPointerId !== null) return;
    lookPointerId = e.pointerId;
    lookZone.setPointerCapture(e.pointerId);
    lookLast = { x: e.clientX, y: e.clientY };
  });
  lookZone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== lookPointerId) return;
    const dx = e.clientX - lookLast.x;
    const dy = e.clientY - lookLast.y;
    lookLast = { x: e.clientX, y: e.clientY };
    yaw -= dx * 0.0044;
    pitch = Math.max(-1.15, Math.min(1.15, pitch - dy * 0.0044));
  });
  function endLook(e) {
    if (e.pointerId !== lookPointerId) return;
    lookPointerId = null;
  }
  lookZone.addEventListener("pointerup", endLook);
  lookZone.addEventListener("pointercancel", endLook);

  document.querySelectorAll(".tbtn[data-act]").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      audio.resume();
      action = Number(btn.dataset.act);
    });
  });
  const runBtn = document.getElementById("tRun");
  runBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    keys.run = true;
    runBtn.classList.add("on");
  });
  runBtn.addEventListener("pointerup", () => {
    keys.run = false;
    runBtn.classList.remove("on");
  });
  runBtn.addEventListener("pointercancel", () => {
    keys.run = false;
    runBtn.classList.remove("on");
  });
  document.getElementById("tChat").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (phase === "fly") openChat();
  });
}

function findP(list, id) {
  return list.find((p) => p.id === id);
}

// --- Snapshot interpolation --------------------------------------------
// The server is authoritative and only broadcasts a snapshot once per tick
// (every TICK_MS). The render loop runs much faster than that, so without
// smoothing every remote entity would visibly snap between positions. We
// keep the last two snapshots and interpolate between them.
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function interpVec(cur, prevList, t) {
  if (!prevList || t >= 1) return cur;
  const prev = prevList.find((x) => x.id === cur.id);
  if (!prev) return cur;
  return {
    x: lerp(prev.x, cur.x, t),
    y: lerp(prev.y ?? 0, cur.y ?? 0, t),
    z: lerp(prev.z, cur.z, t),
  };
}
function interpCart(cur, prev, t) {
  if (!prev || t >= 1) return cur;
  return {
    x: lerp(prev.x, cur.x, t),
    z: lerp(prev.z, cur.z, t),
    yaw: lerpAngle(prev.yaw || 0, cur.yaw || 0, t),
  };
}
function clearFlightMeshes() {
  for (const m of paxMeshes.values()) scene.remove(m);
  paxMeshes.clear();
  for (const m of itemMeshes.values()) scene.remove(m);
  itemMeshes.clear();
}

function syncPlayers(s, prev, t) {
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    let m = playerMeshes.get(p.id);
    if (!m) {
      m = makePlayerMesh(p.colorIndex, p.id === myId);
      scene.add(m);
      playerMeshes.set(p.id, m);
      if (p.id !== myId) {
        const tag = document.createElement("div");
        tag.className = "nametag";
        labelsEl.appendChild(tag);
        nametags.set(p.id, tag);
      }
    }
    const pos = interpVec(p, prev?.players, t);
    m.position.set(pos.x, pos.y, pos.z);
    let yaw = p.yaw;
    const prevP = prev?.players.find((x) => x.id === p.id);
    if (prevP && t < 1) yaw = lerpAngle(prevP.yaw, p.yaw, t);
    m.rotation.y = yaw;
    if (p.id !== myId) {
      const tag = nametags.get(p.id);
      if (tag) {
        tag.textContent = p.item ? `${p.name} · ${ITEM_DEFS[p.item]?.label || p.item}` : p.name;
        project(m.position.clone().setY(pos.y + 1.55), tag);
      }
    }
    if (p.emote > 0 && m.userData.head) {
      m.userData.head.rotation.z = Math.sin(performance.now() / 80) * 0.2;
    }
  }
  for (const [id, m] of playerMeshes) {
    if (!seen.has(id)) {
      scene.remove(m);
      playerMeshes.delete(id);
      nametags.get(id)?.remove();
      nametags.delete(id);
    }
  }
}

function project(pos, el) {
  const v = pos.project(camera);
  if (v.z > 1) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  const x = (v.x * 0.5 + 0.5) * innerWidth;
  const y = (-v.y * 0.5 + 0.5) * innerHeight;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -120%)`;
}

function syncPax(s, prev, t) {
  for (const p of s.pax) {
    let m = paxMeshes.get(p.id);
    if (!m) {
      m = makePassengerMesh(p.shirt);
      scene.add(m);
      paxMeshes.set(p.id, m);
    }
    const pos = interpVec(p, prev?.pax, t);
    m.position.set(pos.x, 0, pos.z);
    m.rotation.y = p.seat < 2 ? Math.PI / 2 : -Math.PI / 2;
    if (p.state === "stand") m.rotation.y = 0;
    const arm = m.userData.arm;
    if (arm) {
      arm.rotation.z = p.call ? -2.2 : -0.3;
      arm.position.y = p.call ? 1.05 : 0.85;
    }
    const seat = cabin.seats.find((x) => x.row === p.row && x.seat === p.seat);
    if (seat) seat.lightMat.emissiveIntensity = p.call ? 2.2 : 0;
  }
}

function syncItems(s, prev, t) {
  const seen = new Set();
  for (const it of s.items) {
    seen.add(it.id);
    let m = itemMeshes.get(it.id);
    if (!m) {
      m = makeItemMesh(it.type);
      m.userData.type = it.type;
      scene.add(m);
      itemMeshes.set(it.id, m);
    }
    const pos = interpVec(it, prev?.items, t);
    m.position.set(pos.x, pos.y, pos.z);
    m.visible = !it.heldBy || it.heldBy !== myId;
  }
  for (const [id, m] of itemMeshes) {
    if (!seen.has(id)) {
      scene.remove(m);
      itemMeshes.delete(id);
    }
  }
}

function syncSpills(s) {
  while (spillMeshes.length < s.spills.length) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 10),
      new THREE.MeshStandardMaterial({ color: 0x5c3d2e, transparent: true, opacity: 0.55, roughness: 0.9 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.06;
    scene.add(mesh);
    spillMeshes.push(mesh);
  }
  spillMeshes.forEach((m, i) => {
    const sp = s.spills[i];
    if (!sp) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.x = sp.x;
    m.position.z = sp.z;
  });
}

function updateHud(s) {
  const t = Math.max(0, s.timeLeft);
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60).toString().padStart(2, "0");
  document.getElementById("clock").textContent = `${m}:${sec}`;
  const mood = Math.round(s.mood);
  document.getElementById("moodNum").textContent = String(mood);
  document.getElementById("moodFill").style.width = `${mood}%`;
  document.getElementById("belt").hidden = !s.seatbelt;
  document.getElementById("firePill").hidden = !(s.fire > 0);
  const banner = document.getElementById("banner");
  if (s.banner) {
    banner.hidden = false;
    banner.textContent = s.banner.text;
    banner.className = "banner " + (s.banner.kind || "");
  } else banner.hidden = true;

  const me = findP(s.players, myId);
  syncHold(me?.item || null);
  const hands = document.getElementById("hands");
  if (me?.item) {
    const def = ITEM_DEFS[me.item];
    hands.textContent = def ? def.label : me.item;
    hands.style.borderColor = def?.css || "";
  } else {
    hands.textContent = "Empty handed";
    hands.style.borderColor = "";
  }

  const calls = document.getElementById("calls");
  const active = s.pax.filter((p) => p.need);
  calls.innerHTML = active
    .slice(0, 8)
    .map((p) => {
      const n = NEED_META[p.need] || { label: p.need, icon: "•", critical: false };
      return `<div class="call ${n.critical ? "crit" : ""}"><b>${seatLabel(p.row, p.seat)}</b> ${n.icon} ${n.label} · ${p.name}</div>`;
    })
    .join("");

  document.getElementById("prompt").textContent = promptFor(s, me);
}

function syncHold(type) {
  if (type === holdType) return;
  holdType = type;
  if (holdMesh) {
    holdAnchor.remove(holdMesh);
    holdMesh = null;
  }
  if (!type) return;
  holdMesh = makeItemMesh(type);
  holdMesh.scale.setScalar(1.6);
  holdAnchor.add(holdMesh);
}

function promptFor(s, me) {
  if (!me) return "";
  const f = lookDir(me.yaw, 0);
  function score(x, z) {
    const dx = x - me.x;
    const dz = z - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1.7 || dist < 0.01) return -999;
    const dot = (dx / dist) * f.x + (dz / dist) * f.z;
    if (dot < 0.25) return -999;
    return dot * 1.4 - dist;
  }
  let best = { s: -1, t: "" };
  for (const p of s.pax) {
    const sc = score(p.x, p.z);
    if (sc > best.s) {
      if (me.item && p.need) best = { s: sc, t: `E  Serve ${p.name} in ${seatLabel(p.row, p.seat)}` };
      else if (p.state === "stand") best = { s: sc, t: `E  Sit ${p.name} down` };
      else if (p.need === "trash") best = { s: sc, t: `E  Collect trash · ${seatLabel(p.row, p.seat)}` };
    }
  }
  for (const st of STATIONS) {
    const sc = score(st.x, st.z);
    if (sc > best.s && !me.item) best = { s: sc, t: `E  ${st.label}` };
  }
  for (const it of s.items) {
    if (it.heldBy || it.slot >= 0) continue;
    const sc = score(it.x, it.z);
    if (sc > best.s && !me.item) best = { s: sc, t: `E  Pick up ${ITEM_DEFS[it.type]?.label || it.type}` };
  }
  const cd = Math.hypot(me.x - s.cart.x, me.z - s.cart.z);
  if (cd < 1.3) {
    if (me.item) return "E  Load cart   ·   C  Stow cart";
    if (s.cart) return "Walk into cart to push   ·   C  Stow";
  }
  return best.t;
}

function cameraFrom(me) {
  const d = lookDir(me.yaw, me.pitch);
  camera.position.set(me.x, me.y + 1.48, me.z);
  camera.lookAt(me.x + d.x, me.y + 1.48 + d.y, me.z + d.z);
}

let previewT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = 0.016;
  previewT += dt;

  if (preview || !snap) {
    const z = 18.5 - (Math.sin(previewT * 0.15) * 0.5 + 0.5) * 14;
    camera.position.set(Math.sin(previewT * 0.12) * 0.25, 1.45, z);
    camera.lookAt(0, 1.1, z - 4);
  } else {
    const t = prevSnap ? Math.min(1, Math.max(0, (now - snapAt) / TICK_MS)) : 1;
    const me = findP(snap.players, myId);
    if (me) {
      const pos = interpVec(me, prevSnap?.players, t);
      cameraFrom({ ...me, x: pos.x, y: pos.y, z: pos.z, yaw, pitch });
    }
    const cart = interpCart(snap.cart, prevSnap?.cart, t);
    cartMesh.position.set(cart.x, 0, cart.z);
    cartMesh.rotation.y = cart.yaw;
    syncPlayers(snap, prevSnap, t);
    syncPax(snap, prevSnap, t);
    syncItems(snap, prevSnap, t);
    syncSpills(snap);
    updateHud(snap);
    audio.setTurbulence(snap.turbulence > 0);
    audio.setCry(snap.cry > 0);
    audio.setFire(snap.fire > 0);
    fireLight.intensity = snap.fire > 0 ? 4 + Math.sin(now / 80) * 1.5 : 0;
    if (holdMesh) {
      holdMesh.rotation.x = Math.sin(now / 280) * 0.08;
      holdMesh.position.y = Math.sin(now / 180) * 0.015;
    }
    if (snap.turbulence > 0) {
      camera.position.x += Math.sin(now / 40) * 0.03;
      camera.position.y += Math.cos(now / 30) * 0.02;
    }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
