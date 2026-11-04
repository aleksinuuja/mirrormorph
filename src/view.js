// Three.js rendering. Game coordinates are (x, y) on a flat plane with y up the
// screen; they map to world (x, 0, -y). The camera looks down with a slight tilt.
import * as THREE from 'three';
import { config } from './config.js';
import { buildBody, buildMarker, buildPlayerMarker } from './meshes.js';

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(0xffffff);

export const FACTION_COLORS = { hostile: 0xff4545, friendly: 0x3f8cff, neutral: 0xffc93a };

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.userData.shared) o.material.dispose();
  });
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080d);
    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 400);
    this.camera.up.set(0, 0, -1); // screen-up = game +y

    this.scene.add(new THREE.HemisphereLight(0xcfdcff, 0x161822, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(-5, 12, 6);
    this.scene.add(sun);

    this.roomGroup = new THREE.Group();
    this.entityGroup = new THREE.Group();
    this.bulletGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.scene.add(this.roomGroup, this.entityGroup, this.bulletGroup, this.fxGroup, this.overlayGroup);

    this.objs = new Map();
    this.bulletGeo = new THREE.SphereGeometry(1, 6, 4);
    this.bulletMats = {};
    for (const [k, c] of Object.entries({ player: 0xe8fbff, hostile: 0xff6b3d, friendly: 0x74b6ff, neutral: 0xffd76a })) {
      this.bulletMats[k] = new THREE.MeshBasicMaterial({ color: c });
      this.bulletMats[k].userData.shared = true;
    }
    this.particleGeo = new THREE.BoxGeometry(1, 1, 1);
    this.particleMats = new Map();
    this.fx = [];
    this.time = 0;
    this.room = null;

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ndc = new THREE.Vector2();
    this.hit = new THREE.Vector3();

    this.buildOverlays();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- camera ----------
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  }

  applyCameraConfig() {
    this.camera.fov = config.camera.fov;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  }

  fitCamera() {
    if (!this.room) return;
    const W = (this.room.width + 2) * config.camera.margin;
    const H = (this.room.height + 2) * config.camera.margin;
    const cx = this.room.width / 2, cy = this.room.height / 2;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const d = Math.max((H / 2) / t, (W / 2) / (t * this.camera.aspect));
    const dir = new THREE.Vector3(0, 1, config.camera.tilt).normalize();
    // Nudge the view up a little so the top HUD does not cover the room.
    const center = new THREE.Vector3(cx, 0, -cy + 0.03 * H);
    this.camera.position.copy(center).addScaledVector(dir, d);
    this.camera.lookAt(center);
  }

  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.ground, this.hit)) return null;
    return { x: this.hit.x, y: -this.hit.z };
  }

  // ---------- room ----------
  clear() {
    for (const o of this.objs.values()) { this.entityGroup.remove(o.root); disposeTree(o.root); }
    this.objs.clear();
    for (const m of [...this.bulletGroup.children]) this.bulletGroup.remove(m);
    for (const f of this.fx) { this.fxGroup.remove(f.m); if (f.kind === 'r') disposeTree(f.m); }
    this.fx = [];
  }

  buildRoom(room, walls) {
    this.room = room;
    for (const c of [...this.roomGroup.children]) { this.roomGroup.remove(c); disposeTree(c); }
    const W = room.width, H = room.height;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0e1320, roughness: 1 }),
    );
    floor.position.set(W / 2, 0, -H / 2);
    this.roomGroup.add(floor);

    const pts = [];
    for (let x = 1; x < W; x++) pts.push(x, 0.005, 0, x, 0.005, -H);
    for (let y = 1; y < H; y++) pts.push(0, 0.005, -y, W, 0.005, -y);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.roomGroup.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x18202f })));

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x252d3d, flatShading: true, roughness: 0.85 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x55688c, transparent: true, opacity: 0.8 });
    wallMat.userData.shared = edgeMat.userData.shared = true;
    for (const w of walls) {
      const geo = new THREE.BoxGeometry(w.w, 1, w.h);
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(w.x + w.w / 2, 0.5, -(w.y + w.h / 2));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
      this.roomGroup.add(m);
    }

    this.exitMesh = null;
    if (room.exit) {
      const e = room.exit;
      const geo = new THREE.PlaneGeometry(e.w, e.h).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3dffa8, transparent: true, opacity: 0.25, depthWrite: false }));
      m.position.set(e.x + e.w / 2, 0.01, -(e.y + e.h / 2));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3dffa8 })));
      this.roomGroup.add(m);
      this.exitMesh = m;
    }
    this.fitCamera();
  }

  // ---------- overlays (range, charge clock, fire reticle) ----------
  buildOverlays() {
    const circlePts = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      circlePts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    this.rangeLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(circlePts),
      new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45 }),
    );

    this.sectorMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    this.sector = new THREE.Mesh(new THREE.BufferGeometry(), this.sectorMat);
    this.sectorLen = -1;

    this.armMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.arm = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]),
      this.armMat,
    );

    this.linkGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.link = new THREE.Line(this.linkGeo, new THREE.LineDashedMaterial({
      color: 0xbfe8ff, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.7,
    }));

    this.chargeRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );

    this.reticle = new THREE.Group();
    const retMat = new THREE.MeshBasicMaterial({ color: 0xff4545, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.RingGeometry(1, 1.14, 6, 1, i * (TAU / 4) + 0.25, TAU / 4 - 0.5);
      g.rotateX(-Math.PI / 2);
      this.reticle.add(new THREE.Mesh(g, retMat));
    }

    for (const o of [this.rangeLine, this.sector, this.arm, this.link, this.chargeRing, this.reticle]) {
      o.visible = false;
      o.renderOrder = 2;
      this.overlayGroup.add(o);
    }
  }

  // ---------- entities ----------
  addEntity(e) {
    const root = new THREE.Group();
    const { group, mats } = buildBody(e.arch.shape, e.radius, e.lookSeed ?? e.id);
    root.add(group);
    const marker = e.isPlayer ? buildPlayerMarker(e.radius) : buildMarker(e.radius);
    root.add(marker);
    let bar = null, barFill = null;
    if (!e.isPlayer) {
      bar = new THREE.Group();
      const w = Math.max(0.8, e.radius * 1.6);
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x202838, depthWrite: false }));
      const fillGeo = new THREE.PlaneGeometry(w, 0.12).rotateX(-Math.PI / 2).translate(w / 2, 0, 0);
      barFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xe6eefc, depthWrite: false }));
      barFill.position.set(-w / 2, 0.002, 0);
      bar.add(bg, barFill);
      bar.position.set(0, 0.06, -(e.radius + 0.45));
      bar.visible = false;
      root.add(bar);
    }
    this.entityGroup.add(root);
    this.objs.set(e.id, { root, body: group, mats, marker, bar, barFill, fac: null, flashing: false });
  }

  setEntityShape(e) {
    const o = this.objs.get(e.id);
    if (!o) return;
    o.root.remove(o.body); disposeTree(o.body);
    const { group, mats } = buildBody(e.arch.shape, e.radius, e.lookSeed ?? e.id);
    o.root.add(group);
    o.body = group; o.mats = mats; o.flashing = false;
    o.root.remove(o.marker); disposeTree(o.marker);
    o.marker = e.isPlayer ? buildPlayerMarker(e.radius) : buildMarker(e.radius);
    o.root.add(o.marker);
    o.fac = null;
  }

  removeEntity(e) {
    const o = this.objs.get(e.id);
    if (!o) return;
    this.entityGroup.remove(o.root);
    disposeTree(o.root);
    this.objs.delete(e.id);
  }

  addBullet(b) {
    const m = new THREE.Mesh(this.bulletGeo, this.bulletMats[b.side] || this.bulletMats.neutral);
    m.scale.setScalar(b.radius * (b.side === 'player' ? 1.25 : 1));
    m.position.set(b.x, 0.4, -b.y);
    b.mesh = m;
    this.bulletGroup.add(m);
  }

  removeBullet(b) {
    if (b.mesh) this.bulletGroup.remove(b.mesh);
  }

  // ---------- effects ----------
  burst(x, y, color, n = 12, speed = 4) {
    let mat = this.particleMats.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      mat.userData.shared = true;
      this.particleMats.set(color, mat);
    }
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      const s = 0.07 + Math.random() * 0.14;
      m.scale.setScalar(s);
      m.position.set(x, 0.4, -y);
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random());
      const life = 0.45 + Math.random() * 0.5;
      this.fxGroup.add(m);
      this.fx.push({ kind: 'p', m, vx: Math.cos(a) * v, vy: 2 + Math.random() * 4, vz: -Math.sin(a) * v, life, max: life, s });
    }
  }

  ringFx(x, y, color, maxR) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.position.set(x, 0.06, -y);
    this.fxGroup.add(m);
    this.fx.push({ kind: 'r', m, life: 0.5, max: 0.5, maxR });
  }

  updateFx(dt) {
    for (const f of this.fx) {
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      if (f.kind === 'p') {
        f.m.position.x += f.vx * dt;
        f.m.position.y += f.vy * dt;
        f.m.position.z += f.vz * dt;
        f.vy -= 14 * dt;
        if (f.m.position.y < 0.05) { f.m.position.y = 0.05; f.vy *= -0.4; f.vx *= 0.6; f.vz *= 0.6; }
        f.m.rotation.x += 8 * dt; f.m.rotation.y += 6 * dt;
        f.m.scale.setScalar(f.s * k);
      } else {
        f.m.scale.setScalar(0.2 + (1 - k) * f.maxR);
        f.m.material.opacity = 0.9 * k;
      }
    }
    const alive = [];
    for (const f of this.fx) {
      if (f.life > 0) alive.push(f);
      else { this.fxGroup.remove(f.m); if (f.kind === 'r') disposeTree(f.m); }
    }
    this.fx = alive;
  }

  // ---------- per-frame sync ----------
  sync(world, dt) {
    this.time += dt;
    if (!world.room) return;
    const stopped = world.fire.mode === 'selecting';
    const p = world.player;

    for (const e of world.entities.concat([p])) {
      const o = this.objs.get(e.id);
      if (!o) continue;
      o.root.position.set(e.x, 0, -e.y);
      o.body.rotation.y = e.angle;
      const flashing = e.flash > 0;
      if (flashing !== o.flashing) {
        o.flashing = flashing;
        for (const m of o.mats) m.emissive.copy(flashing ? WHITE : m.userData.baseEmissive);
      }
      if (e.isPlayer) {
        o.marker.rotation.y = this.time * 0.8;
      } else {
        const fac = world.factionOf(e);
        if (fac !== o.fac) { o.fac = fac; o.marker.material.color.setHex(FACTION_COLORS[fac]); }
        const frac = e.hp / e.maxHp;
        o.bar.visible = frac < 0.999 && frac > 0;
        if (o.bar.visible) o.barFill.scale.x = Math.max(0.001, frac);
      }
    }

    for (const b of world.bullets) if (b.mesh) b.mesh.position.set(b.x, 0.4, -b.y);

    // Range circle + charge clock
    const c = world.charge;
    const range = config.morph.range;
    const showRange = p.alive && !p.form && world.state === 'playing';
    this.rangeLine.visible = showRange;
    if (showRange) {
      this.rangeLine.position.set(p.x, 0.03, -p.y);
      this.rangeLine.scale.setScalar(range);
      this.rangeLine.material.opacity = c.target ? 0.75 : 0.4;
    }
    const charging = showRange && !!c.target;
    this.sector.visible = this.arm.visible = this.link.visible = this.chargeRing.visible = charging;
    if (charging) {
      const L = Math.min(1, c.t) * TAU;
      if (Math.abs(L - this.sectorLen) > 0.01) {
        this.sector.geometry.dispose();
        this.sector.geometry = new THREE.CircleGeometry(1, 48, Math.PI / 2 - L, Math.max(L, 0.0001)).rotateX(-Math.PI / 2);
        this.sectorLen = L;
      }
      const draining = !c.inRange;
      this.sectorMat.color.setHex(draining ? 0xffa060 : 0xbfe8ff);
      this.armMat.color.setHex(draining ? 0xffa060 : 0xffffff);
      this.sector.position.set(p.x, 0.035, -p.y);
      this.sector.scale.setScalar(range);
      this.arm.position.set(p.x, 0.04, -p.y);
      this.arm.scale.setScalar(range);
      this.arm.rotation.y = Math.PI / 2 - L; // clock hand: starts at 12, sweeps clockwise
      const t = c.target;
      const pos = this.linkGeo.attributes.position;
      pos.setXYZ(0, p.x, 0.04, -p.y);
      pos.setXYZ(1, t.x, 0.04, -t.y);
      pos.needsUpdate = true;
      this.link.computeLineDistances();
      this.chargeRing.position.set(t.x, 0.04, -t.y);
      this.chargeRing.scale.setScalar(t.radius + 0.35 + Math.sin(this.time * 8) * 0.05);
    } else {
      this.sectorLen = -1;
    }

    // Fire reticle
    const ft = world.fire.target;
    this.reticle.visible = world.fire.mode === 'firing' && !!ft && ft.alive;
    if (this.reticle.visible) {
      this.reticle.position.set(ft.x, 0.05, -ft.y);
      this.reticle.scale.setScalar(ft.radius + 0.45);
      this.reticle.rotation.y = this.time * 2;
    }

    if (this.exitMesh) this.exitMesh.material.opacity = 0.18 + 0.12 * Math.sin(this.time * 3);

    this.updateFx(stopped ? 0 : dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
