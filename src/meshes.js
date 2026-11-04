// Low-poly primitive meshes. Every body is modelled at unit footprint radius,
// facing local +X, sitting on y=0; buildBody scales it to the entity radius.
import * as THREE from 'three';

const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(color, extra = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.6, metalness: 0.1, ...extra });
  m.emissive = c.clone().multiplyScalar(0.18);
  m.userData.baseEmissive = m.emissive.clone();
  return m;
}

function edges(mesh, color = 0xffffff, opacity = 0.5) {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 25),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  mesh.add(line);
  return mesh;
}

// Extrude a 2D outline (in game x/y) upward by `depth`.
function flatShape(points, depth) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // shape y -> world -z (= game +y), depth -> world +y
  return g;
}

const builders = {
  // Asteroids-style chevron: dark hull, bright outline.
  arrow() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(flatShape([[1, 0], [-0.75, 0.7], [-0.4, 0], [-0.75, -0.7]], 0.22), mat(0x1c2533));
    edges(m, 0xffffff, 1);
    m.position.y = 0.15;
    g.add(m);
    return g;
  },

  drone() {
    const g = new THREE.Group();
    const coreGeo = new THREE.OctahedronGeometry(0.7, 0);
    coreGeo.scale(1, 0.6, 1);
    const core = edges(new THREE.Mesh(coreGeo, mat(0x6fe0bf)), 0xd8fff2, 0.6);
    core.position.y = 0.55;
    const ringGeo = new THREE.TorusGeometry(0.95, 0.09, 4, 12);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, mat(0x3b8f7a));
    ring.position.y = 0.55;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), mat(0xffffff));
    eye.position.set(0.62, 0.55, 0);
    g.add(core, ring, eye);
    return g;
  },

  sentry() {
    const g = new THREE.Group();
    const body = edges(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.15), mat(0xc9a46a)), 0xffe9c2, 0.45);
    body.position.y = 0.3;
    const tur = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.32, 6), mat(0x8c7146));
    tur.position.y = 0.72;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.16), mat(0x5d4b30));
    barrel.position.set(0.6, 0.72, 0);
    const finL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.2), mat(0x8c7146));
    finL.position.set(-0.35, 0.2, 0.68);
    const finR = finL.clone();
    finR.position.z = -0.68;
    g.add(body, tur, barrel, finL, finR);
    return g;
  },

  rock(seed) {
    const g = new THREE.Group();
    const rnd = mulberry32(seed * 9973 + 17);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const pos = geo.attributes.position;
    const jitter = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!jitter.has(key)) jitter.set(key, 0.78 + rnd() * 0.32);
      const k = jitter.get(key);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.65, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const m = edges(new THREE.Mesh(geo, mat(0x8a7d6b)), 0xd8ccb8, 0.35);
    m.position.y = 0.5;
    m.rotation.y = rnd() * TAU;
    g.add(m);
    return g;
  },

  minion() {
    const g = new THREE.Group();
    const m = edges(new THREE.Mesh(
      flatShape([[1, 0], [0, 0.72], [-0.8, 0.38], [-0.8, -0.38], [0, -0.72]], 0.32),
      mat(0xc77dff),
    ), 0xf1dcff, 0.6);
    m.position.y = 0.12;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), mat(0x8a4fb8));
    fin.rotation.z = -Math.PI / 2;
    fin.position.set(0.1, 0.55, 0);
    g.add(m, fin);
    return g;
  },

  boss() {
    const g = new THREE.Group();
    const base = edges(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 6), mat(0xe0654a)), 0xffd2c4, 0.5);
    base.position.y = 0.3;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 0.45, 6), mat(0xa8402c));
    top.position.y = 0.75;
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat(0xfff1a8, { emissive: 0xffd040 }));
    eye.position.set(0.55, 0.8, 0);
    g.add(base, top, eye);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 4), mat(0xf0a080));
      spike.rotation.z = -Math.PI / 2;
      const holder = new THREE.Group();
      holder.rotation.y = a;
      spike.position.set(0.98, 0.3, 0);
      holder.add(spike);
      g.add(holder);
    }
    const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.3), mat(0x5a2418));
    cannon.position.set(1.05, 0.3, 0);
    g.add(cannon);
    return g;
  },

  box() {
    const g = new THREE.Group();
    const m = edges(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.4), mat(0x888888)));
    m.position.y = 0.4;
    g.add(m);
    return g;
  },
};

export function buildBody(shape, radius, seed = 1) {
  const g = (builders[shape] || builders.box)(seed);
  g.scale.setScalar(radius);
  const mats = [];
  g.traverse((o) => {
    if (o.isMesh && o.material.userData.baseEmissive) mats.push(o.material);
  });
  return { group: g, mats };
}

// Faction ring under every non-player entity.
export function buildMarker(radius) {
  const geo = new THREE.RingGeometry(radius + 0.1, radius + 0.22, 40);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}

// Subtle dashed white ring that marks the player (distinguishes you from what you copied).
export function buildPlayerMarker(radius) {
  const g = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
  });
  const n = 10;
  const r0 = radius + 0.2, r1 = radius + 0.27;
  for (let i = 0; i < n; i++) {
    const geo = new THREE.RingGeometry(r0, r1, 4, 1, (i / n) * TAU, (TAU / n) * 0.55);
    geo.rotateX(-Math.PI / 2);
    g.add(new THREE.Mesh(geo, material));
  }
  g.position.y = 0.025;
  g.renderOrder = 1;
  return g;
}
