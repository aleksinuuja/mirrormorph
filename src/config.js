// All tunable values live here. The in-game tuning panel (sliders icon) edits
// this object live; "JSON" there dumps the current values to paste back.
//
// Units: tiles (1 tile = 1 world unit), seconds, degrees where noted, HP.

export const config = {
  controls: {
    joystickRadius: 60,     // px the knob can travel from the base
    deadzone: 0.12,         // fraction of the radius ignored around the centre
  },

  player: {
    hitFlash: 0.12,         // seconds an entity flashes white when hit
  },

  vision: {
    fov: 15,                // degrees, full width of every sentry's cone
    range: 8,               // tiles
    detectionGrace: 0,      // seconds you can stay in a beam before the alarm (0 = instant)
    alertFreeze: 0.3,       // seconds the game freezes when the alarm goes off
  },

  patrol: {
    speedMult: 0.6,         // patrol walking speed as a fraction of the archetype's speed
    turnRate: 1.2,          // radians/sec when turning around at a patrol end
    endPause: 0.5,          // seconds standing still after turning
  },

  morph: {
    range: 1.5,             // tiles from the target's edge
    rearArc: 120,           // degrees behind the target where charging works
    chargeTime: 2.0,        // seconds in range + behind to complete the clock
    drainTime: 1.5,         // seconds for a full clock to drain to zero
    formDrainPerSec: 0.8,   // form HP lost per second while morphed
    contactDps: 3,          // form HP/sec lost while pushing into another robot
    wallContactDps: 0,      // form HP/sec lost while pushing into walls/cover
    revertSearchRadius: 1.5,// how far to look for free space when reverting; none = explode
  },

  fire: {
    selectRadius: 0.8,      // tap tolerance around an entity's edge during time-stop
  },

  ai: {
    fireRateMult: 0.6,      // AI fires at this fraction of the archetype's rate (player gets full)
    aimError: 0.15,         // radians of random aim error for AI shots
    turnRate: 4.0,          // radians/sec AI turns while hunting
    huntShootRange: 7,      // alerted sentries shoot when they can see you within this range
    pathRefresh: 0.4,       // seconds between path updates while hunting
  },

  bullets: {
    life: 2.0,
    radius: 0.08,
  },

  camera: {
    fov: 40,
    tilt: 0.45,             // 0 = straight down; higher = more 3D perspective
    viewTiles: 12,          // tiles visible across the narrow side of the screen
    follow: 8,              // camera catch-up speed
  },

  // Every robot type. Copying a robot copies all of this.
  // Archetype edits apply when the level restarts.
  archetypes: {
    base: {
      label: 'Mirror', shape: 'droid',
      radius: 0.32, hp: 20, speed: 3.6, mass: 1,
      weapons: [{ pattern: 'single', rate: 1, damage: 5, bulletSpeed: 10 }],
    },
    sentry: {
      label: 'Sentry', shape: 'sentry',
      radius: 0.4, hp: 30, speed: 2.6, mass: 4, preferredRange: 4,
      weapons: [{ pattern: 'single', rate: 1.2, damage: 2, bulletSpeed: 8 }],
    },
  },
};
