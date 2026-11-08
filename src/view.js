// Three.js rendering. Game coordinates (x, y) with y = north map to world (x, 0, -y).
// The camera follows the player from above with a slight tilt.
import * as THREE from 'three';
import { config } from './config.js';
import { buildBody, animateRig, buildMarker, buildPlayerMarker } from './meshes.js';

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(0xffffff);
const CONE_MAX_TRIS = 400;

export const FACTION_COLORS = { hostile: 0xff4545, friendly: 0x3f8cff, neutral: 0xffc93a };

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material && !o.material.userData.shared) o.material.dispose();
  });
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020305);
    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 200);
    this.camera.up.set(0, 0, -1); // screen-up = north

    this.scene.add(new THREE.HemisphereLight(0xcfdcff, 0x101018, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(-4, 10, 5);
    this.scene.add(sun);

    this.levelGroup = new THREE.Group();
    this.coneGroup = new THREE.Group();
    this.entityGroup = new THREE.Group();
    this.bulletGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.scene.add(this.levelGroup, this.coneGroup, this.entityGroup, this.bulletGroup, this.fxGroup, this.overlayGroup);

    this.objs = new Map();
    this.bulletGeo = new THREE.SphereGeometry(1, 6, 4);
    this.bulletGeo.userData.shared = true;
    this.bulletMats = {};
    for (const [k, c] of Object.entries({ player: 0xe8fbff, hostile: 0xff6b3d })) {
      this.bulletMats[k] = new THREE.MeshBasicMaterial({ color: c });
      this.bulletMats[k].userData.shared = true;
    }
    this.coneMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e, side: THREE.DoubleSide, depthWrite: false });
    this.coneMat.userData.shared = true;
    this.qMat = this.makeQuestionMaterial();
    this.particleGeo = new THREE.BoxGeometry(1, 1, 1);
    this.particleGeo.userData.shared = true;
    this.particleMats = new Map();
    this.fx = [];
    this.time = 0;
    this.level = null;
    this.camTarget = new THREE.Vector3();
    this.camSnap = true;

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ndc = new THREE.Vector2();
    this.hit = new THREE.Vector3();

    this.buildOverlays();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  makeQuestionMaterial() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = 'bold 104px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 14;
    g.strokeStyle = '#06080d';
    g.strokeText('?', 64, 70);
    g.fillStyle = '#ffc93a';
    g.fillText('?', 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    m.userData.shared = true;
    return m;
  }

  // ---------- camera ----------
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyCameraConfig() {
    this.camera.fov = config.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(target, dt) {
    const goal = new THREE.Vector3(target.x, 0, -target.y);
    if (this.camSnap) { this.camTarget.copy(goal); this.camSnap = false; }
    else this.camTarget.lerp(goal, 1 - Math.exp(-config.camera.follow * dt));
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const across = config.camera.viewTiles / 2;
    const d = this.camera.aspect < 1 ? across / (t * this.camera.aspect) : across / t;
    const dir = new THREE.Vector3(0, 1, config.camera.tilt).normalize();
    this.camera.position.copy(this.camTarget).addScaledVector(dir, d);
    this.camera.lookAt(this.camTarget);
  }

  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.ground, this.hit)) return null;
    return { x: this.hit.x, y: -this.hit.z };
  }

  // ---------- level ----------
  clear() {
    for (const o of this.objs.values()) this.disposeObj(o);
    this.objs.clear();
    for (const m of [...this.bulletGroup.children]) this.bulletGroup.remove(m);
    for (const f of this.fx) { this.fxGroup.remove(f.m); if (f.kind === 'r') disposeTree(f.m); }
    this.fx = [];
    this.camSnap = true;
  }

  buildLevel(grid, exit) {
    this.level = grid;
    for (const c of [...this.levelGroup.children]) { this.levelGroup.remove(c); disposeTree(c); }
    const { W, H } = grid;

    // Floor: one dark tile per walkable cell, slightly inset so a faint grid shows.
    const floorCells = [], wallCells = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (grid.isWall(c, r)) wallCells.push([c, r]);
        else floorCells.push([c, r]);
      }
    }
    const m4 = new THREE.Matrix4();
    const floorGeo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    const floor = new THREE.InstancedMesh(floorGeo, new THREE.MeshBasicMaterial({ color: 0x0b0e14 }), floorCells.length);
    floorCells.forEach(([c, r], i) => floor.setMatrixAt(i, m4.makeTranslation(c + 0.5, 0, -(H - 1 - r + 0.5))));
    this.levelGroup.add(floor);

    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0x1b2131, flatShading: true, roughness: 0.9 }), wallCells.length);
    wallCells.forEach(([c, r], i) => walls.setMatrixAt(i, m4.makeTranslation(c + 0.5, 0.5, -(H - 1 - r + 0.5))));
    this.levelGroup.add(walls);

    // Crisp outline along every wall face that borders the floor.
    const pts = [];
    for (const s of grid.segments) pts.push(s.x1, 1.002, -s.y1, s.x2, 1.002, -s.y2);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.levelGroup.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3f4d6b })));

    // Cover: pillars and slabs.
    const coverMat = new THREE.MeshStandardMaterial({ color: 0x2a3244, flatShading: true, roughness: 0.8 });
    const coverEdge = new THREE.LineBasicMaterial({ color: 0x6a7ea6, transparent: true, opacity: 0.8 });
    coverMat.userData.shared = coverEdge.userData.shared = true;
    this.disposables = [coverMat, coverEdge];
    for (const o of grid.obstacles) {
      const h = o.kind === 'pillar' ? 1.1 : 0.7;
      const geo = new THREE.BoxGeometry(o.w, h, o.h);
      const m = new THREE.Mesh(geo, coverMat);
      m.position.set(o.x + o.w / 2, h / 2, -(o.y + o.h / 2));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), coverEdge));
      this.levelGroup.add(m);
    }

    this.exitMesh = null;
    if (exit) {
      const geo = new THREE.PlaneGeometry(exit.w, exit.h).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3dffa8, transparent: true, opacity: 0.3, depthWrite: false }));
      m.position.set(exit.x + exit.w / 2, 0.01, -(exit.y + exit.h / 2));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3dffa8 })));
      this.levelGroup.add(m);
      this.exitMesh = m;
    }
  }

  // ---------- overlays (morph range, charge clock, fire reticle) ----------
  buildOverlays() {
    const circlePts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU;
      circlePts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    this.rangeLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(circlePts),
      new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45 }),
    );
    this.sectorMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.sector = new THREE.Mesh(new THREE.BufferGeometry(), this.sectorMat);
    this.sectorLen = -1;
    this.armMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.arm = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]),
      this.armMat,
    );
    this.chargeRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.08, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.reticle = new THREE.Group();
    const retMat = new THREE.MeshBasicMaterial({ color: 0xff4545, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.RingGeometry(1, 1.12, 6, 1, i * (TAU / 4) + 0.25, TAU / 4 - 0.5);
      g.rotateX(-Math.PI / 2);
      this.reticle.add(new THREE.Mesh(g, retMat));
    }
    for (const o of [this.rangeLine, this.sector, this.arm, this.chargeRing, this.reticle]) {
      o.visible = false;
      o.renderOrder = 4;
      this.overlayGroup.add(o);
    }
  }

  // ---------- entities ----------
  addEntity(e) {
    const root = new THREE.Group();
    const { group, mats, rig } = buildBody(e.arch.shape, e.radius);
    root.add(group);
    const marker = e.isPlayer ? buildPlayerMarker(e.radius) : buildMarker(e.radius);
    root.add(marker);
    let bar = null, barFill = null, cone = null, qmark = null;
    if (!e.isPlayer) {
      bar = new THREE.Group();
      const w = 0.8;
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.08).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x202838, depthWrite: false }));
      const fillGeo = new THREE.PlaneGeometry(w, 0.08).rotateX(-Math.PI / 2).translate(w / 2, 0, 0);
      barFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xe6eefc, depthWrite: false }));
      barFill.position.set(-w / 2, 0.002, 0);
      bar.add(bg, barFill);
      bar.position.set(0, 0.05, -(e.radius + 0.3));
      bar.visible = false;
      root.add(bar);
      qmark = new THREE.Sprite(this.qMat);
      qmark.scale.setScalar(0.6);
      qmark.position.set(e.radius + 0.25, 1.3, -(e.radius + 0.25));
      qmark.renderOrder = 10;
      qmark.visible = false;
      root.add(qmark);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONE_MAX_TRIS * 9), 3));
      geo.setDrawRange(0, 0);
      cone = new THREE.Mesh(geo, this.coneMat);
      cone.frustumCulled = false;
      cone.renderOrder = 1;
      this.coneGroup.add(cone);
    }
    this.entityGroup.add(root);
    this.objs.set(e.id, {
      root, body: group, mats, rig, marker, bar, barFill, cone, qmark,
      fac: null, flashing: false, lastX: e.x, lastY: e.y, phase: 0, walk: 0,
    });
  }

  setEntityShape(e) {
    const o = this.objs.get(e.id);
    if (!o) return;
    o.root.remove(o.body); disposeTree(o.body);
    const { group, mats, rig } = buildBody(e.arch.shape, e.radius);
    o.root.add(group);
    Object.assign(o, { body: group, mats, rig, flashing: false });
    o.root.remove(o.marker); disposeTree(o.marker);
    o.marker = e.isPlayer ? buildPlayerMarker(e.radius) : buildMarker(e.radius);
    o.root.add(o.marker);
    o.fac = null;
  }

  disposeObj(o) {
    this.entityGroup.remove(o.root);
    disposeTree(o.root);
    if (o.cone) { this.coneGroup.remove(o.cone); o.cone.geometry.dispose(); }
  }

  removeEntity(e) {
    const o = this.objs.get(e.id);
    if (!o) return;
    this.disposeObj(o);
    this.objs.delete(e.id);
  }

  addBullet(b) {
    const m = new THREE.Mesh(this.bulletGeo, this.bulletMats[b.side] || this.bulletMats.hostile);
    m.scale.setScalar(b.radius * (b.side === 'player' ? 1.3 : 1.1));
    m.position.set(b.x, 0.55, -b.y);
    b.mesh = m;
    this.bulletGroup.add(m);
  }

  removeBullet(b) {
    if (b.mesh) this.bulletGroup.remove(b.mesh);
  }

  writeCone(o, e) {
    const pos = o.cone.geometry.attributes.position;
    const arr = pos.array;
    const pts = e.cone || [];
    const n = Math.min(pts.length / 2 - 1, CONE_MAX_TRIS);
    let k = 0;
    for (let i = 0; i < n; i++) {
      arr[k++] = e.x; arr[k++] = 0.012; arr[k++] = -e.y;
      arr[k++] = pts[i * 2]; arr[k++] = 0.012; arr[k++] = -pts[i * 2 + 1];
      arr[k++] = pts[i * 2 + 2]; arr[k++] = 0.012; arr[k++] = -pts[i * 2 + 3];
    }
    pos.needsUpdate = true;
    o.cone.geometry.setDrawRange(0, Math.max(0, n) * 3);
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
      const s = 0.05 + Math.random() * 0.1;
      m.scale.setScalar(s);
      m.position.set(x, 0.5, -y);
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random());
      const life = 0.45 + Math.random() * 0.5;
      this.fxGroup.add(m);
      this.fx.push({ kind: 'p', m, vx: Math.cos(a) * v, vy: 2 + Math.random() * 3, vz: -Math.sin(a) * v, life, max: life, s });
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
        if (f.m.position.y < 0.04) { f.m.position.y = 0.04; f.vy *= -0.4; f.vx *= 0.6; f.vz *= 0.6; }
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
    const frozen = world.freezeTimer > 0;
    const simDt = frozen ? 0 : dt;
    const p = world.player;

    // Vision cones show only while the sentries are unaware; once alerted they hunt instead.
    this.coneGroup.visible = !world.alerted;

    for (const e of world.entities.concat([p])) {
      const o = this.objs.get(e.id);
      if (!o) continue;
      o.root.position.set(e.x, 0, -e.y);
      o.body.rotation.y = e.angle;

      // Walk cycle driven by actual distance travelled.
      const moved = Math.hypot(e.x - o.lastX, e.y - o.lastY);
      o.lastX = e.x; o.lastY = e.y;
      const speed = simDt > 0 ? moved / simDt : 0;
      const target = Math.min(1, speed / 1.2);
      if (simDt > 0) o.walk += (target - o.walk) * Math.min(1, simDt * 10);
      o.phase += moved * (Math.PI / (e.radius * 1.7));
      if (o.rig) animateRig(o.rig, o.phase, o.walk, e.gaze != null ? e.gaze - e.angle : 0);

      const flashing = e.flash > 0;
      if (flashing !== o.flashing) {
        o.flashing = flashing;
        for (const m of o.mats) m.emissive.copy(flashing ? WHITE : m.userData.baseEmissive);
      }
      if (e.isPlayer) {
        o.marker.rotation.y = this.time * 0.8;
      } else {
        // The beam is the tell while they're unaware; the red ring appears once they hunt you.
        o.marker.visible = world.alerted;
        if (o.qmark) {
          o.qmark.visible = !!e.investigating && !world.alerted;
          if (o.qmark.visible) o.qmark.position.y = 1.3 + Math.sin(this.time * 6) * 0.06;
        }
        const fac = world.factionOf(e);
        if (fac !== o.fac) { o.fac = fac; o.marker.material.color.setHex(FACTION_COLORS[fac]); }
        const frac = e.hp / e.maxHp;
        o.bar.visible = frac < 0.999 && frac > 0;
        if (o.bar.visible) o.barFill.scale.x = Math.max(0.001, frac);
        if (!world.alerted) this.writeCone(o, e);
      }
    }

    for (const b of world.bullets) if (b.mesh) b.mesh.position.set(b.x, 0.55, -b.y);

    // Morph range + charge clock
    const c = world.charge;
    const range = config.morph.range;
    const showRange = p.alive && !p.form && world.state === 'playing';
    this.rangeLine.visible = showRange;
    if (showRange) {
      // Range is measured to a target's edge; draw it for a typical (sentry-sized) target.
      const r = range + config.archetypes.sentry.radius;
      this.rangeLine.position.set(p.x, 0.04, -p.y);
      this.rangeLine.scale.setScalar(r);
      this.rangeLine.material.opacity = c.target ? 0.8 : 0.35;
    }
    const charging = showRange && !!c.target && (c.t > 0 || c.inRange);
    this.sector.visible = this.arm.visible = this.chargeRing.visible = charging;
    if (charging) {
      const r = range + config.archetypes.sentry.radius;
      const L = Math.min(1, c.t) * TAU;
      if (Math.abs(L - this.sectorLen) > 0.01) {
        this.sector.geometry.dispose();
        this.sector.geometry = new THREE.CircleGeometry(1, 48, Math.PI / 2 - L, Math.max(L, 0.0001)).rotateX(-Math.PI / 2);
        this.sectorLen = L;
      }
      const state = c.inRange ? 0xbfe8ff : 0xffa060; // orange = draining
      this.sectorMat.color.setHex(state);
      this.armMat.color.setHex(c.inRange ? 0xffffff : state);
      this.sector.position.set(p.x, 0.045, -p.y);
      this.sector.scale.setScalar(r);
      this.arm.position.set(p.x, 0.05, -p.y);
      this.arm.scale.setScalar(r);
      this.arm.rotation.y = Math.PI / 2 - L; // clock hand: starts at 12, sweeps clockwise
      const t = c.target;
      this.chargeRing.position.set(t.x, 0.05, -t.y);
      this.chargeRing.scale.setScalar(t.radius + 0.25 + Math.sin(this.time * 8) * 0.04);
      this.chargeRing.material.color.setHex(state);
    } else {
      this.sectorLen = -1;
    }

    if (this.exitMesh) this.exitMesh.material.opacity = 0.22 + 0.12 * Math.sin(this.time * 3);

    this.updateCamera(p, dt);
    this.updateFx(simDt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
