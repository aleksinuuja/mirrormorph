// All tunable values live here. The in-game tuning panel (sliders icon) edits
// this object live; "Copy JSON" there dumps the current values to paste back.
//
// Units: world units (the base ship is ~1 unit wide), seconds, HP.

export const config = {
  player: {
    dragSensitivity: 1.0,   // world units moved per world unit dragged
    hitFlash: 0.12,         // seconds an entity flashes white when hit
  },

  morph: {
    range: 3.0,             // radius of the morph range circle (measured to target's edge)
    chargeTime: 2.5,        // seconds in range to complete the clock sweep
    drainTime: 3.0,         // seconds for a full clock to drain back to zero out of range
    formDrainPerSec: 1.5,   // form HP lost per second while morphed
    contactDps: 12,         // extra form HP lost per second while pushing into walls/things
    revertSearchRadius: 2.0,// how far to look for free space when reverting; none = explode
  },

  fire: {
    selectRadius: 1.2,      // tap tolerance around an entity's edge during time-stop
  },

  ai: {
    fireRateMult: 0.6,      // AI fires at this fraction of the archetype's rate (player gets full)
    aimError: 0.18,         // radians of random aim error for AI shots
    turnRate: 3.0,          // radians/sec AI can turn
    aggroRange: 7,          // default engage distance for hostiles
    disengageMult: 1.5,     // once engaged, keep chasing out to aggro * this
    strafeDistance: 5,      // default distance AI tries to keep from its target
    minionBelieveChance: 0.5, // chance a minion believes the player is the real boss
  },

  bullets: {
    life: 2.5,
    radius: 0.12,
  },

  camera: {
    fov: 40,
    tilt: 0.35,             // 0 = straight down; higher = more 3D perspective
    margin: 1.12,           // extra space around the room when fitting to screen
  },

  // Every ship/object type. Copying a thing copies all of this.
  // Archetype edits apply when a room is (re)started.
  archetypes: {
    base: {
      label: 'Mirror', kind: 'ship', shape: 'arrow',
      radius: 0.5, hp: 20, speed: 9,
      weapons: [{ pattern: 'single', rate: 1, damage: 5, bulletSpeed: 14 }],
    },
    drone: {
      label: 'Drone', kind: 'ship', shape: 'drone',
      radius: 0.28, hp: 24, speed: 7,
      weapons: [],
    },
    sentry: {
      label: 'Sentry', kind: 'ship', shape: 'sentry',
      radius: 0.6, hp: 30, speed: 3.5, preferredRange: 5,
      weapons: [{ pattern: 'single', rate: 1.2, damage: 2, bulletSpeed: 9 }],
    },
    rock: {
      label: 'Rock', kind: 'object', shape: 'rock',
      radius: 0.9, hp: 40, speed: 0,
      weapons: [],
    },
    minion: {
      label: 'Minion', kind: 'ship', shape: 'minion',
      radius: 0.45, hp: 15, speed: 5, preferredRange: 4,
      weapons: [{ pattern: 'single', rate: 1, damage: 2, bulletSpeed: 10 }],
    },
    boss: {
      label: 'Overseer', kind: 'ship', shape: 'boss', isBoss: true,
      radius: 1.3, hp: 250, speed: 2.5, preferredRange: 8,
      weapons: [
        { pattern: 'spread', rate: 0.9, damage: 2, bulletSpeed: 9, count: 5, spread: 0.7 },
        { pattern: 'ring', rate: 0.35, damage: 2, bulletSpeed: 6, count: 18 },
      ],
    },
  },
};
