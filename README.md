# RED-EYE

A 1–5 player **friendslop** cabin-crew game. You are the Night Owl Air crew on red-eye flight 413. Serve drinks, shove your friends, put out the galley fire, and land before the passengers unionize.

Inspired by the chaotic co-op spirit of *Dear Passengers* — not a clone: original setting, systems, and jokes.

## Play

```bash
cd "C:\GITHUB PROJECTS\Game"
npm install
npm start
```

Open **http://localhost:3000**

Friends on the same Wi-Fi use the **LAN** address printed in the terminal (e.g. `http://192.168.x.x:3000`). Host clicks **Open a flight**, reads the 4-letter code out loud, everyone else joins. Host hits **Push back**.

Over the internet: tunnel the port (`ngrok http 3000`, Tailscale, etc.) and share that URL plus the code.

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

The cart is a weapon, a storage unit, and a lawsuit. Walk into it to push. Load it with **E**. Stow it in the galley with **C** before landing.

## Round length

Host picks block time in the lobby: 3 / 4.5 / 6.5 minutes. Short enough that a wipe is funny, long enough for a fire *and* a Karen.

## Stack

Browser client (Three.js) + Node WebSocket sim. Authoritative server, 20 Hz. No accounts, no installs for players — just the URL.
