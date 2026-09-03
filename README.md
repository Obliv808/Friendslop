# RED-EYE

A 1–5 player **friendslop** cabin-crew game. You are the Night Owl Air crew on red-eye flight 413. Serve drinks, shove your friends, put out the galley fire, and land before the passengers unionize.

Inspired by the chaotic co-op spirit of *Dear Passengers* — not a clone: original setting, systems, and jokes.

## Play

```bash
git clone https://github.com/Obliv808/Friendslop.git
cd Friendslop
npm install
npm start
```

Open **http://localhost:3000**

Friends on the same Wi-Fi use the **LAN** address printed in the terminal (e.g. `http://192.168.x.x:3000`). Host clicks **Open a flight**, reads the 4-letter code out loud, everyone else joins. Host hits **Push back**.

Over the internet: tunnel the port (`ngrok http 3000`, Tailscale, etc.) and share that URL plus the code.

If someone's connection drops mid-flight (wifi blip, phone locks), the app keeps their seat warm for ~20 seconds and slots them right back in when they reconnect — no need to rejoin the room manually.

## Crew duties

Keep cabin mood above zero until wheels down.

| Need | Grab from | Notes |
|---|---|---|
| Drink | Coffee maker / fridge (cycles water, soda, box wine) | Left galley |
| Meal | Oven | Stops after seatbelt sign |
| Blanket / pillow / headphones / barf bag | Linens cupboard | Right galley |
| First aid | Med kit | Critical — ignore twice and you divert |
| Warm bottle | Bottle warmer | Bassinet emergency |
| Extinguisher | Starboard wall | Galley fire |
| Trash | Empty hands on the seat | |

**E** use / serve / pick up · **F** throw · **G** drop · **R** shove · **C** stow cart · **X** salute · **Enter** chat · **Shift** run (not during the seatbelt sign, you animal)

On a phone or tablet, a virtual stick and drag-to-look zone plus one-tap action buttons appear automatically — no keyboard needed.

The cart is a weapon, a storage unit, and a lawsuit. Walk into it to push. Load it with **E**. Stow it in the galley with **C** before landing.

## Round length & difficulty

Host picks block time in the lobby: 3 / 4.5 / 6.5 minutes. Short enough that a wipe is funny, long enough for a fire *and* a Karen.

Host also picks a difficulty, which scales how often events and passenger needs fire and how hard mistakes hit cabin mood:

| Difficulty | Feel |
|---|---|
| Calm hop | Fewer events, forgiving mood hits — good for a first flight |
| Standard red-eye | The baseline experience |
| Chaos from hell | Frequent events, unforgiving mood hits — for crews who know the routine |

## Stack

Browser client (Three.js) + Node WebSocket sim. Authoritative server, 20 Hz, with client-side snapshot interpolation for smooth movement. No accounts, no installs for players — just the URL.

## Tests

```bash
npm test
```

Runs the sim smoke test plus unit tests for serving, hazards, room lifecycle, difficulty scaling, and a real end-to-end reconnect test that boots the server and drives it over an actual WebSocket.
