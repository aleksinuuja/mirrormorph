# Mirrormorph (prototype)

Puzzle shooter: your ship copies other ships and objects. Three hand-made rooms test whether charging and snapping into forms is fun.

## Run locally

ES modules need a web server (opening `index.html` directly won't work):

```sh
python3 -m http.server 8765
# open http://localhost:8765  (add ?debug to open the tuning panel)
```

To try it on a phone on the same Wi-Fi, run `python3 -m http.server 8765 --bind 0.0.0.0` and open `http://<your-mac-ip>:8765`.

## Controls

- **Drag anywhere:** the ship follows your finger's offset (relative drag). Lift your finger and it holds position.
- **FIRE:** stops time. Tap a target to auto-fire at it. When it dies, the nearest red target is picked automatically. Tap empty space to cancel.
- **STOP:** ceases fire. On desktop, Space toggles FIRE/STOP.
- **Morph:** the first thing to enter your range circle locks on and the clock arm sweeps. A full circle snaps you into a copy of it.

## Files

| Path | What |
|---|---|
| `src/config.js` | **All tunable values** (morph timings, AI, every archetype's stats/weapons) |
| `src/rooms/*.js` | Room data files (format documented at the top of `room1-tunnel.js`) |
| `src/world.js` | Game logic: morphing, firing, stealth, AI, collisions |
| `src/view.js`, `src/meshes.js` | Three.js rendering, low-poly meshes |
| `src/ui.js`, `src/debug.js` | HUD, room select, live tuning panel |

The tuning panel (sliders icon) edits `config` live. **JSON** dumps the current values so you can paste them back into `config.js`.

## Deploy to GitHub Pages

No build step. Push this folder to a repo, then go to Settings → Pages → Deploy from branch → `main` / root. Three.js loads from the jsDelivr CDN (pinned to 0.160.0).

## Prototype decisions (beyond the spec)

- Any entity can be charged, whatever its faction. A lock stays until its timer drains to zero.
- Morphed forms fire the copied weapons. Forms without weapons (drone, rock) can't fire.
- Snapping into a form stops firing, so you don't blow a fresh disguise by accident.
- Morphing into a cohort's type disguises you, unless you've already blown cover with that cohort in this room.
- While disguised, your shots only damage what you targeted.
- Contact damage only counts while you're steering into something. Things bumping into a parked form don't drain it.
- Reverting while the boss copy is active resets the minion split. Morphing into the boss again re-rolls it.
- Goals: rooms 1 and 2 end at the green exit zone, and room 3 ends when the boss dies.
