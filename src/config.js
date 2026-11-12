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
    turnRate: 30,           // radians/sec the hero turns toward the walk direction
    damageTaken: 0.5,       // the hero takes this fraction of all incoming damage, in any form
    aimTurnRate: 40,        // radians/sec the aim follows the stick in railgun aim mode (≈ instant)
  },

  vision: {
    fov: 15,                // degrees, full width of every sentry's cone
    range: 8,               // tiles
    detectionGrace: 0,      // seconds you can stay in a beam before the alarm (0 = instant)
    alertFreeze: 0.3,       // seconds the game freezes when the alarm goes off
  },

  patrol: {
    speedMult: 0.4,         // patrol walking speed as a fraction of the archetype's speed
    scanArc: 60,            // degrees the patroller's head sweeps side to side while walking
    scanPeriod: 4,          // seconds for one full left-right-left scan
    turnRate: 1.2,          // radians/sec when turning around at a patrol end
    endPause: 0.5,          // seconds standing still after turning
  },

  morph: {
    range: 1.5,             // tiles from the target's edge
    chargeTime: 4.0,        // seconds in range to complete the clock
    requireSight: 1,        // 1 = walls and cover block copying (needs a clear line to the target)
    drainTime: 1.5,         // seconds for a full clock to drain to zero
    formDrainPerSec: 3,     // form HP lost per second while morphed
    contactDps: 3,          // form HP/sec lost while pushing into another robot
    wallContactDps: 0,      // form HP/sec lost while pushing into walls/cover
    revertSearchRadius: 1.5,// how far to look for free space when reverting; none = explode
  },

  hearing: {
    rangeFrac: 0.5,         // sentries hear you inside this fraction of the morph range
    turnRate: 2.0,          // radians/sec while turning a full circle to check
    cooldown: 1.0,          // seconds before the same sentry can be startled again
  },

  level: {
    exitHoldTime: 3,        // seconds you must stay on the exit to escape
    doorOpenTime: 1.0,      // seconds the emergency door takes to open
    spawnInterval: 3,       // seconds between reinforcements once the door is open
    maxReinforcements: 5,   // most sentries alive at once from the door
  },

  ai: {
    fireRateMult: 0.6,      // AI fires at this fraction of the archetype's rate (player gets full)
    aimError: 0.15,         // radians of random aim error for AI shots
    turnRate: 4.0,          // radians/sec AI turns while hunting
    huntSpeedMult: 0.6,     // alerted sentries move at this fraction of the archetype's speed
    huntShootRange: 10,     // alerted sentries start aiming when they can see you within this range
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
      radius: 0.32, hp: 40, speed: 3.6, mass: 1,
      weapons: [{ pattern: 'single', rate: 1, damage: 5, bulletSpeed: 10 }],
    },
    sentry: {
      label: 'Sentry', shape: 'sentry',
      radius: 0.4, hp: 30, speed: 2.6, mass: 4, preferredRange: 4,
      // Railgun: sentries aim (tracking) for aimTime, freeze for lockDelay, then fire.
      // The player (in sentry form) fires on the second FIRE press.
      // damage 30 one-shots a sentry; the hero takes half (player.damageTaken), so 40 HP survives two hits.
      weapons: [{ kind: 'rail', damage: 30, aimTime: 1.5, lockDelay: 0.35, cooldown: 1.5, range: 18 }],
    },
  },
};
