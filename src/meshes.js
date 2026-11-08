// Low-poly walking robots. Each body is modelled at unit footprint radius,
// facing local +X, standing on y=0; buildBody scales it to the entity radius.
// Returns a `rig` (legs/arms/torso) that the view animates with a walk cycle.
import * as THREE from 'three';

const TAU = Math.PI * 2;

function mat(color, extra = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.6, metalness: 0.15, ...extra });
  if (!extra.emissive) m.emissive = c.clone().multiplyScalar(0.12);
  m.userData.baseEmissive = m.emissive.clone();
  return m;
}

function edges(mesh, color = 0xffffff, opacity = 0.45) {
  mesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 25),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  ));
  return mesh;
}

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

// A leg hangs from a hip pivot; rotating the pivot about Z swings it fore/aft.
function leg(z, hipY, len, thick, footLen, material, footMat) {
  const pivot = new THREE.Group();
  pivot.position.set(0, hipY, z);
  const shin = box(thick, len, thick, material);
  shin.position.y = -len / 2;
  const foot = box(footLen, thick * 0.55, thick * 1.2, footMat);
  foot.position.set(footLen * 0.2, -len + thick * 0.25, 0);
  pivot.add(shin, foot);
  return pivot;
}

function arm(z, shoulderY, len, thick, material) {
  const pivot = new THREE.Group();
  pivot.position.set(0, shoulderY, z);
  const a = box(thick, len, thick, material);
  a.position.y = -len / 2;
  pivot.add(a);
  return pivot;
}

const builders = {
  // The player's own small droid: rounded, pale, cyan visor.
  droid() {
    const g = new THREE.Group();
    const torso = new THREE.Group();
    const shell = mat(0xd6dde8), dark = mat(0x3a4250), joint = mat(0x5b6576);
    const body = edges(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.85, 8), shell), 0xffffff, 0.35);
    body.position.y = 1.35;
    const head = new THREE.Group();
    head.position.y = 1.78;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.58, 8, 5, 0, TAU, 0, Math.PI / 2), shell);
    const visor = box(0.22, 0.2, 0.8, mat(0x6ff6ff, { emissive: 0x3fd8ff }));
    visor.position.set(0.48, 0.2, 0);
    head.add(dome, visor);
    const pack = box(0.35, 0.5, 0.8, dark);
    pack.position.set(-0.7, 1.4, 0);
    torso.add(body, head, pack);
    const legs = [leg(0.36, 0.95, 0.85, 0.24, 0.5, joint, dark), leg(-0.36, 0.95, 0.85, 0.24, 0.5, joint, dark)];
    const arms = [arm(0.9, 1.6, 0.7, 0.2, joint), arm(-0.9, 1.6, 0.7, 0.2, joint)];
    torso.add(...arms);
    g.add(torso, ...legs);
    return { group: g, rig: { torso, legs, arms, head } };
  },

  // Sentry: compact torso, heavy arms, big pauldrons, red visor slit, arm cannon.
  sentry() {
    const g = new THREE.Group();
    const torso = new THREE.Group();
    const armour = mat(0xb89a64), plate = mat(0xd2b47c), dark = mat(0x3d3426), joint = mat(0x6b5c40);
    const body = edges(box(0.8, 0.72, 0.9, armour), 0xffe6b8, 0.4);
    body.position.y = 1.3;
    const head = new THREE.Group();
    head.position.y = 1.8;
    const skull = edges(box(0.5, 0.34, 0.56, armour), 0xffe6b8, 0.4);
    const visor = box(0.08, 0.1, 0.46, mat(0xff3030, { emissive: 0xff2020 }));
    visor.position.set(0.26, 0.03, 0);
    head.add(skull, visor);
    torso.add(body, head);

    // Chunky arms: upper arm + oversized gauntlet; the right one carries the cannon.
    const bulkyArm = (z, withGun) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.55, z);
      const upper = box(0.34, 0.45, 0.34, joint);
      upper.position.y = -0.22;
      const gauntlet = edges(box(0.5, 0.5, 0.48, armour), 0xffe6b8, 0.35);
      gauntlet.position.y = -0.68;
      pivot.add(upper, gauntlet);
      if (withGun) {
        const barrel = box(0.55, 0.14, 0.14, dark);
        barrel.position.set(0.42, -0.72, 0);
        pivot.add(barrel);
      }
      return pivot;
    };
    const arms = [bulkyArm(0.72, true), bulkyArm(-0.72, false)];
    torso.add(...arms);

    // Pauldrons: low domes riding on each shoulder.
    for (const z of [0.72, -0.72]) {
      const geo = new THREE.SphereGeometry(0.46, 7, 3, 0, TAU, 0, Math.PI / 2);
      geo.scale(1.15, 0.8, 1.05);
      const p = edges(new THREE.Mesh(geo, plate), 0xfff0d0, 0.5);
      p.position.set(0, 1.58, z);
      const rim = box(0.95, 0.08, 0.55, dark);
      rim.position.set(0, 1.56, z);
      torso.add(rim, p);
    }

    const legs = [leg(0.3, 0.95, 0.85, 0.3, 0.6, joint, dark), leg(-0.3, 0.95, 0.85, 0.3, 0.6, joint, dark)];
    g.add(torso, ...legs);
    return { group: g, rig: { torso, legs, arms, head } };
  },
};

export function buildBody(shape, radius) {
  const { group, rig } = (builders[shape] || builders.droid)();
  group.scale.setScalar(radius);
  const mats = [];
  group.traverse((o) => {
    if (o.isMesh && o.material.userData.baseEmissive && !mats.includes(o.material)) mats.push(o.material);
  });
  return { group, mats, rig };
}

// Advance a walk cycle. `speed` is world units/sec actually travelled.
export function animateRig(rig, phase, amount, headTurn = 0) {
  if (rig.head) rig.head.rotation.y = headTurn;
  const swing = Math.sin(phase) * 0.6 * amount;
  rig.legs[0].rotation.z = swing;
  rig.legs[1].rotation.z = -swing;
  if (rig.arms[0]) rig.arms[0].rotation.z = -swing * 0.8;
  if (rig.arms[1]) rig.arms[1].rotation.z = swing * 0.8;
  rig.torso.position.y = Math.abs(Math.cos(phase)) * 0.06 * amount;
}

// Faction ring under every sentry.
export function buildMarker(radius) {
  const geo = new THREE.RingGeometry(radius + 0.06, radius + 0.14, 40);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.position.y = 0.03;
  m.renderOrder = 3;
  return m;
}

// Subtle dashed white ring that marks the player (distinguishes you from what you copied).
export function buildPlayerMarker(radius) {
  const g = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
  });
  const n = 10;
  const r0 = radius + 0.12, r1 = radius + 0.18;
  for (let i = 0; i < n; i++) {
    const geo = new THREE.RingGeometry(r0, r1, 4, 1, (i / n) * TAU, (TAU / n) * 0.55);
    geo.rotateX(-Math.PI / 2);
    g.add(new THREE.Mesh(geo, material));
  }
  g.position.y = 0.035;
  g.renderOrder = 3;
  return g;
}
