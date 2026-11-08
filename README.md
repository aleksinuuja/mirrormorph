# Mirrormorph (prototype, iteration 2: stealth)

Top-down stealth with walking robots. Sneak up behind a sentry to copy its form, then walk through the guard room disguised as one of them. If a red sight beam touches you undisguised, every sentry is alerted and hunts you.

Play: https://aleksinuuja.github.io/mirrormorph/ (add `?debug` to open the tuning panel)

## Run locally

ES modules need a web server (opening `index.html` directly won't work):

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

To try it on a phone on the same Wi-Fi, run `python3 -m http.server 8765 --bind 0.0.0.0` and open `http://<your-mac-ip>:8765`.

## Controls

- **Move:** touch anywhere and hold. A virtual joystick appears under your finger. Holding still keeps walking, and releasing stops. On desktop you can also use WASD or the arrow keys.
- **Copy a sentry:** stay within range *behind* it (inside its rear 120° arc) until the clock fills. The range circle turns red if you're beside or in front of it.
- **FIRE:** stops time so you can tap a target. Firing is an attack: it raises the alarm and blows any disguise. Space toggles FIRE/STOP on desktop.

## Rules

- Sentries see in a narrow cone (15°, 8 tiles) that is clipped exactly by walls and cover.
- If any part of you is in a cone while undisguised, the alarm goes off.
- Once alerted, all sentries hunt you through the maze for the rest of the attempt. Dying restarts the level.
- A copied form drains over time. Bumping into robots drains it faster.

## Files

| Path | What |
|---|---|
| `src/level.js` | **The map** as ASCII (legend at the top) plus posted-sentry sweep settings |
| `src/config.js` | **All tunable values**: vision, patrol, morph, AI, controls, camera, robot stats |
| `src/grid.js` | Map parsing, collision rects, line of sight, vision-cone geometry, path distance field |
| `src/world.js` | Game logic: detection, alert, morphing, firing, sentry AI, collisions |
| `src/view.js`, `src/meshes.js` | Three.js rendering, robot meshes and walk cycle, vision cones, follow camera |
| `src/joystick.js` | Floating virtual joystick |
| `src/ui.js`, `src/debug.js` | HUD, title screen, live tuning panel |

The tuning panel (sliders icon) edits `config` live. **JSON** dumps the current values so you can paste them back into `config.js`.

## Deploy

GitHub Pages serves `main` / root. There's no build step: push and it deploys. Three.js loads from the jsDelivr CDN (pinned to 0.160.0).

## Not done yet

- The auto-shooting overhaul (deferred).
- Player-side fog of war: only the sentries' sight is modelled, and you can always see the whole lit corridor around you.
