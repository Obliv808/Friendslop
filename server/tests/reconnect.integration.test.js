import assert from "assert";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const PORT = 33000 + ((Math.random() * 2000) | 0);

function waitForMsg(ws, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error("timed out waiting for a matching message"));
    }, timeoutMs);
    function onMsg(buf) {
      const msg = JSON.parse(buf.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(msg);
      }
    }
    ws.on("message", onMsg);
  });
}

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

async function main() {
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });

  try {
    // Give the HTTP/WS server a moment to bind.
    await new Promise((r) => setTimeout(r, 700));

    const ws1 = new WebSocket(`ws://localhost:${PORT}`);
    await waitForOpen(ws1);
    ws1.send(JSON.stringify({ t: "create", name: "Teal", duration: "short" }));
    const welcome = await waitForMsg(ws1, (m) => m.t === "welcome");
    assert.ok(welcome.id && welcome.code, "creating a flight should hand back an id and code");

    // Simulate a dropped connection (wifi blip, tab suspended, etc).
    ws1.terminate();
    await new Promise((r) => setTimeout(r, 300));

    // Reconnect with the same id/code, inside the grace window.
    const ws2 = new WebSocket(`ws://localhost:${PORT}`);
    await waitForOpen(ws2);
    ws2.send(JSON.stringify({ t: "rejoin", id: welcome.id, code: welcome.code }));
    const resumed = await waitForMsg(ws2, (m) => m.t === "welcome");
    assert.strictEqual(resumed.id, welcome.id, "reconnecting should reclaim the same seat, not a new one");
    assert.strictEqual(resumed.resume, true, "server should flag this as a resumed session");
    ws2.close();

    // Rejoining a code that no longer exists should fail cleanly, not hang.
    const ws3 = new WebSocket(`ws://localhost:${PORT}`);
    await waitForOpen(ws3);
    ws3.send(JSON.stringify({ t: "rejoin", id: "p-not-real", code: "ZZZZ" }));
    const err = await waitForMsg(ws3, (m) => m.t === "err");
    assert.ok(err.m, "a bad rejoin should return a readable error");
    ws3.close();

    console.log("reconnect.integration.test ok");
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
