# Mirrormorph (prototype, iteration 2: stealth)

Top-down stealth with walking robots. Stay close to one of the two patrolling sentries to copy its form, then walk through the guard room disguised as one of them. If a red sight beam touches you undisguised, every sentry is alerted and hunts you.

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
- **Copy a sentry:** stay within range (1.5 tiles) until the clock fills. Get too close (half that range) and an unaware sentry hears you: it stops, shows a **?**, and turns a full circle to look before carrying on.
- **FIRE (droid form):** hold to shoot straight ahead, the way you're facing. Space on desktop.
- **FIRE (sentry form, railgun):** the first press stops you and enters aim mode, where the stick turns your aim. The second press fires a beam that pierces everything in line up to a wall, one-shotting each sentry it passes through. Pressing while it's still recharging exits aim mode.
- Any shot raises the alarm and blows your disguise.

## Rules

- Sentries see in a narrow cone (15°, 8 tiles) that is clipped exactly by walls and cover. Patrollers scan ±30° as they walk.
- While the sentries are unaware, the beam is their only marker. After the alarm the beams vanish and each sentry gets a red ring.
- If any part of you is in a cone while undisguised, the alarm goes off.
- Once alerted, all sentries hunt you through the maze for the rest of the attempt. Dying restarts the level.
- Sentry railguns: a red line tracks you for 1.5 s, then it locks for 0.35 s (it flickers and stops following you), then the beam fires. Sidestep when it locks. A railgun beam does 30 damage and one-shots a sentry. You take half damage from everything, in any form, so a beam does 15 to you and your 40-HP hull takes three hits.
- **Escaping:** stand on the green exit for 3 s. A countdown shows, and stepping off resets it.
- **Emergency door:** a red door in the guard room. When every sentry is destroyed it opens and sends in a new sentry every 3 s, keeping up to 5 alive.
- **Changing shape restores full HP:** a fresh copy starts at the sentry's full HP, and reverting restores your full hull. Fights can go on indefinitely.
- A copied form drains fast (3 HP/s, so a sentry disguise lasts about 10 s). Bumping into robots drains it faster. The tight route is intended: copy the hall patroller near the corridor and go.

## Files

| Path | What |
|---|---|
| `src/level.js` | **The map** as ASCII (legend at the top: blocks, patrol pairs 1–2, 3–4, …) plus posted-sentry sweep settings |
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
