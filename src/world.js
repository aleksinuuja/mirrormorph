// Game simulation: robots, vision & detection, morphing, firing, sentry AI, collisions.
// Pure logic; talks to the View through add/remove/effect calls and reports
// notable moments through `emit(type, data)`.
import { config } from './config.js';
import { Grid, angleDiff } from './grid.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
let nextId = 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const turnToward = (cur, target, maxStep) => cur + clamp(angleDiff(cur, target), -maxStep, maxStep);
const cloneWeapons = (ws, randomCd = false) => (ws || []).map((w) => ({ ...w, cd: randomCd ? Math.random() / w.rate : 0 }));

export class World {
  constructor(view, emit) {
    this.view = view;
    this.emit = emit || (() => {});
    this.room = null;
    this.entities = [];
    this.bullets = [];
    this.input = { x: 0, y: 0 };
    this.fire = { mode: 'off', target: null, manual: false };
    this.charge = { target: null, t: 0, inRange: false, behind: false };
  }

  // ======================================================== setup
  load(level) {
    this.view.clear();
    this.room = level;
    const g = this.grid = new Grid(level);
    this.W = g.W;
    this.H = g.H;
    this.walls = g.solids;
    this.entities = [];
    this.bullets = [];
    this.alerted = false;
    this.freezeTimer = 0;
    this.seenTimer = 0;
    this.field = null;
    this.fieldTimer = 0;
    this.fieldTile = -1;
    this.state = 'playing'; // 'playing' | 'won' | 'dead'
    this.stateTimer = 0;
    this.time = 0;
    this.input = { x: 0, y: 0 };
    this.fire = { mode: 'off', target: null, manual: false };
    this.charge = { target: null, t: 0, inRange: false, behind: false };

    if (g.exitTiles.length) {
      let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
      for (const { c, r } of g.exitTiles) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
      this.exit = { x: c0, y: g.H - 1 - r1, w: c1 - c0 + 1, h: r1 - r0 + 1 };
    } else this.exit = null;

    this.view.buildLevel(g, this.exit);

    g.posted.forEach((pos, i) => {
      const s = level.posted?.[i] || { facing: -90, arc: 90, period: 5, phase: 0 };
      this.spawnSentry(pos, {
        mode: 'posted',
        baseAngle: s.facing * DEG,
        arcHalf: (s.arc * DEG) / 2,
        period: s.period,
        phase: s.phase,
      });
    });
    for (let d = 1; d <= 8; d += 2) {
      const a = g.patrolPoints[String(d)], b = g.patrolPoints[String(d + 1)];
      if (!a || !b) continue;
      this.spawnSentry(a, {
        mode: 'patrol', patrol: [a, b], pIdx: 1, pState: 'walk', pTimer: 0,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        scanPhase: d, // patrollers scan out of sync
      });
    }
    this.spawnPlayer(g.start || g.center(1, 1));
    for (const e of this.entities) this.updateCone(e);
    this.emit('loaded', level);
    if (level.hint) this.emit('hint', level.hint);
  }

  spawnSentry(pos, extra) {
    const a = config.archetypes.sentry;
    const e = {
      id: nextId++, type: 'sentry', arch: a, isPlayer: false,
      x: pos.x, y: pos.y, angle: extra.baseAngle ?? -Math.PI / 2,
      radius: a.radius, speed: a.speed, mass: a.mass ?? 1,
      hp: a.hp, maxHp: a.hp,
      weapons: cloneWeapons(a.weapons, true),
      home: { x: pos.x, y: pos.y },
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      strafeTimer: 1 + Math.random() * 2,
      cone: null, flash: 0, alive: true,
      ...extra,
    };
    this.entities.push(e);
    this.view.addEntity(e);
    return e;
  }

  spawnPlayer(pos) {
    const a = config.archetypes.base;
    this.player = {
      id: 0, isPlayer: true, type: 'base', arch: a, form: null, lookSeed: 1,
      x: pos.x, y: pos.y, angle: -Math.PI / 2,
      radius: a.radius, speed: a.speed, mass: a.mass ?? 1,
      weapons: cloneWeapons(a.weapons),
      hp: a.hp, maxHp: a.hp, formHp: 0, formMaxHp: 0,
      contactRobot: false, contactWall: false, flash: 0, alive: true,
    };
    this.view.addEntity(this.player);
  }

  // ======================================================== input API
  // Analog stick: (x, y) with magnitude 0..1, y = up the screen = north.
  setMoveInput(x, y) {
    const m = Math.hypot(x, y);
    this.input.x = m > 1 ? x / m : x;
    this.input.y = m > 1 ? y / m : y;
  }

  get steering() {
    return Math.hypot(this.input.x, this.input.y) > 0.05;
  }

  get canFire() {
    return this.state === 'playing' && this.player.alive && this.player.weapons.length > 0;
  }

  pressFire() {
    const f = this.fire;
    if (f.mode === 'off') {
      if (this.canFire) f.mode = 'selecting';
    } else {
      f.mode = 'off';
      f.target = null;
    }
  }

  // Tap during time-stop. Empty space cancels.
  selectAt(x, y) {
    const f = this.fire;
    let best = null, bd = Infinity;
    for (const e of this.entities) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.radius;
      if (d < config.fire.selectRadius && d < bd) { bd = d; best = e; }
    }
    if (!best) { f.mode = 'off'; f.target = null; return; }
    f.target = best;
    f.manual = true;
    f.mode = 'firing';
    this.alert(this.isDisguised() ? 'Cover blown' : 'You opened fire'); // choosing a target is an attack
  }

  // ======================================================== factions & stealth
  isDisguised() {
    const form = this.player?.form;
    return !!form && !this.alerted && this.entities.some((e) => e.alive && e.type === form);
  }

  factionOf(e) {
    if (e.isPlayer) return 'player';
    if (this.alerted) return 'hostile';
    return this.isDisguised() ? 'neutral' : 'hostile';
  }

  alert(reason) {
    if (this.alerted) return;
    this.alerted = true;
    this.freezeTimer = config.vision.alertFreeze;
    this.field = null;
    this.emit('alert', reason);
  }

  // Can sentry `e` see any part of `p`'s body right now?
  sees(e, p) {
    const half = (config.vision.fov * DEG) / 2;
    const range = config.vision.range;
    const n = 8;
    for (let i = -1; i < n; i++) {
      const px = i < 0 ? p.x : p.x + Math.cos((i / n) * TAU) * p.radius * 0.95;
      const py = i < 0 ? p.y : p.y + Math.sin((i / n) * TAU) * p.radius * 0.95;
      const dx = px - e.x, dy = py - e.y;
      if (dx * dx + dy * dy > range * range) continue;
      if (Math.abs(angleDiff(e.gaze ?? e.angle, Math.atan2(dy, dx))) > half) continue;
      if (this.grid.canSee(e.x, e.y, px, py)) return true;
    }
    return false;
  }

  updateDetection(dt) {
    const p = this.player;
    if (this.alerted || !p.alive) return;
    if (this.isDisguised()) { this.seenTimer = 0; return; }
    let seen = false;
    for (const e of this.entities) if (e.alive && this.sees(e, p)) { seen = true; break; }
    if (seen) {
      this.seenTimer += dt;
      if (this.seenTimer >= config.vision.detectionGrace) this.alert('Spotted');
    } else {
      this.seenTimer = 0;
    }
  }

  updateCone(e) {
    e.cone = this.grid.visionCone(e.x, e.y, e.gaze ?? e.angle, (config.vision.fov * DEG) / 2, config.vision.range);
  }

  // ======================================================== main update
  update(dt) {
    if (!this.room) return;
    if (this.state !== 'playing') {
      this.stateTimer -= dt;
      if (this.state === 'dead' && this.stateTimer <= 0) this.load(this.room);
      return;
    }
    if (this.fire.mode === 'selecting') return; // time is stopped
    if (this.freezeTimer > 0) { this.freezeTimer -= dt; return; } // alarm beat

    this.time += dt;
    const p = this.player;
    p.flash = Math.max(0, p.flash - dt);

    this.updatePlayerMove(dt);
    if (this.alerted) this.updateField(dt);
    for (const e of this.entities) if (e.alive) this.updateAI(e, dt);
    this.resolveCollisions();
    for (const e of this.entities) if (e.alive) this.updateCone(e);
    this.updateDetection(dt);
    this.updateCharge(dt);
    this.updateForm(dt);
    this.updatePlayerFire(dt);
    this.updateBullets(dt);
    this.entities = this.entities.filter((e) => e.alive);
    this.checkGoal();
  }

  // ======================================================== player
  updatePlayerMove(dt) {
    const p = this.player;
    if (!p.alive) return;
    const { x: ix, y: iy } = this.input;
    const m = Math.hypot(ix, iy);
    if (p.speed > 0 && m > 0) {
      p.x += ix * p.speed * dt;
      p.y += iy * p.speed * dt;
      if (this.fire.mode !== 'firing' && m > 0.05) p.angle = turnToward(p.angle, Math.atan2(iy, ix), 14 * dt);
    }
    const t = this.fire.target;
    if (this.fire.mode === 'firing' && t && t.alive) {
      p.angle = turnToward(p.angle, Math.atan2(t.y - p.y, t.x - p.x), 14 * dt);
    }
  }

  updateCharge(dt) {
    const p = this.player, c = this.charge;
    if (!p.alive || p.form) { c.target = null; c.t = 0; return; } // no charging while morphed
    if (c.target && !c.target.alive) { c.target = null; c.t = 0; }
    const range = config.morph.range;
    if (!c.target) {
      let best = null, bd = Infinity;
      for (const e of this.entities) {
        if (!e.alive) continue;
        const d = dist(p, e) - e.radius;
        if (d <= range && d < bd) { bd = d; best = e; }
      }
      if (best) { c.target = best; c.t = 0; }
    }
    if (!c.target) { c.inRange = c.behind = false; return; }
    const t = c.target;
    c.inRange = dist(p, t) - t.radius <= range;
    const fromTarget = Math.atan2(p.y - t.y, p.x - t.x);
    c.behind = Math.abs(angleDiff(t.angle, fromTarget)) >= Math.PI - (config.morph.rearArc * DEG) / 2;
    if (c.inRange && c.behind) {
      c.t += dt / config.morph.chargeTime;
    } else {
      c.t = Math.max(0, c.t - dt / config.morph.drainTime);
      if (c.t <= 0 && !c.inRange) c.target = null;
    }
    if (c.t >= 1) this.snapTo(t);
  }

  snapTo(t) {
    const p = this.player, a = t.arch;
    p.form = t.type;
    p.type = t.type;
    p.arch = a;
    p.lookSeed = t.id;
    p.radius = a.radius;
    p.speed = a.speed;
    p.mass = a.mass ?? 1;
    p.weapons = cloneWeapons(a.weapons);
    p.formHp = t.hp;          // copy includes current HP
    p.formMaxHp = t.maxHp;
    p.angle = t.angle;
    this.charge.target = null;
    this.charge.t = 0;
    this.fire.mode = 'off';   // snapping interrupts fire so you don't blow a fresh disguise
    this.fire.target = null;
    this.view.setEntityShape(p);
    this.view.ringFx(p.x, p.y, 0xffffff, 2.2);
    this.view.burst(p.x, p.y, 0xbfe8ff, 10, 2.5);
    this.emit('morph', a.label);
    if (this.isDisguised()) this.emit('status', `DISGUISED AS ${a.label.toUpperCase()}`);
  }

  updateForm(dt) {
    const p = this.player;
    if (!p.form || !p.alive) return;
    p.formHp -= config.morph.formDrainPerSec * (p.arch.drainMult ?? 1) * dt;
    if (this.steering) {
      if (p.contactRobot) p.formHp -= config.morph.contactDps * dt;
      if (p.contactWall) p.formHp -= config.morph.wallContactDps * dt;
    }
    if (p.formHp <= 0) this.revert();
  }

  revert() {
    const p = this.player, a = config.archetypes.base;
    if (!p.form) return;
    p.form = null;
    p.type = 'base';
    p.arch = a;
    p.lookSeed = 1;
    p.radius = a.radius;
    p.speed = a.speed;
    p.mass = a.mass ?? 1;
    p.weapons = cloneWeapons(a.weapons);
    p.formHp = 0;
    this.view.setEntityShape(p);
    const spot = this.findFree(p.x, p.y, p.radius, config.morph.revertSearchRadius);
    if (!spot) { this.killPlayer('No room to revert'); return; }
    p.x = spot.x;
    p.y = spot.y;
    this.view.ringFx(p.x, p.y, 0x9fd8ff, 1.6);
    this.emit('revert');
  }

  updatePlayerFire(dt) {
    const p = this.player, f = this.fire;
    for (const w of p.weapons) w.cd = Math.max(0, w.cd - dt);
    if (f.mode !== 'firing' || !p.alive) return;
    if (!p.weapons.length) { f.mode = 'off'; f.target = null; return; }
    if (f.target && f.target.alive && !f.manual && f.target === this.charge.target) f.target = null;
    if (!f.target || !f.target.alive) {
      f.target = this.nearestHostile();
      f.manual = false;
      if (!f.target) { f.mode = 'off'; return; }
    }
    for (const w of p.weapons) {
      if (w.cd > 0) continue;
      w.cd = 1 / w.rate;
      const disguised = this.isDisguised();
      this.alert(disguised ? 'Cover blown' : 'You opened fire');
      this.shoot(p, w, f.target, 'player', 0, disguised);
    }
  }

  nearestHostile() {
    const p = this.player;
    let best = null, bd = Infinity;
    for (const e of this.entities) {
      if (!e.alive || e === this.charge.target || this.factionOf(e) !== 'hostile') continue;
      const d = dist(p, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ======================================================== sentry AI
  updateField(dt) {
    const p = this.player;
    if (!p.alive) return;
    const { c, r } = this.grid.tileAt(p.x, p.y);
    const idx = r * this.W + c;
    this.fieldTimer -= dt;
    if (!this.field || (idx !== this.fieldTile && this.fieldTimer <= 0)) {
      this.field = this.grid.distanceField(c, r);
      this.fieldTile = idx;
      this.fieldTimer = config.ai.pathRefresh;
    }
  }

  updateAI(e, dt) {
    e.flash = Math.max(0, e.flash - dt);
    for (const w of e.weapons) w.cd = Math.max(0, w.cd - dt);
    if (this.alerted) this.hunt(e, dt);
    else if (e.mode === 'patrol') this.patrol(e, dt);
    else this.posted(e, dt);
    // Gaze = where the head (and sight cone) points; the patroller scans side to side.
    if (e.mode === 'patrol' && !this.alerted) {
      const P = config.patrol;
      const want = e.pState === 'turn' ? 0 : 1;
      e.scan = (e.scan ?? 0) + (want - (e.scan ?? 0)) * Math.min(1, dt * 3);
      e.gaze = e.angle + e.scan * ((P.scanArc * DEG) / 2) * Math.sin((this.time * TAU) / P.scanPeriod + (e.scanPhase || 0));
    } else {
      e.gaze = e.angle;
    }
  }

  moveToward(e, gx, gy, speed, dt, face = true) {
    const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
    if (d < 1e-4) return d;
    const step = Math.min(d, speed * dt);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
    if (face) e.angle = turnToward(e.angle, Math.atan2(dy, dx), 8 * dt);
    return d - step;
  }

  posted(e, dt) {
    e.angle = e.baseAngle + e.arcHalf * Math.sin(e.phase + (this.time * TAU) / e.period);
    if (dist(e, e.home) > 0.05) this.moveToward(e, e.home.x, e.home.y, e.speed * 0.5, dt, false);
  }

  patrol(e, dt) {
    const pts = e.patrol;
    const P = config.patrol;
    if (e.pState === 'walk') {
      const tgt = pts[e.pIdx];
      const left = this.moveToward(e, tgt.x, tgt.y, e.speed * P.speedMult, dt);
      if (left < 0.02) {
        e.pIdx = (e.pIdx + 1) % pts.length;
        const nxt = pts[e.pIdx];
        e.turnGoal = Math.atan2(nxt.y - e.y, nxt.x - e.x);
        e.pState = 'turn';
      }
    } else if (e.pState === 'turn') {
      // Always turn counter-clockwise, so the cone sweeps across the side lanes.
      const ccw = ((e.turnGoal - e.angle) % TAU + TAU) % TAU;
      const step = P.turnRate * dt;
      if (ccw <= step || ccw > TAU - 1e-3) {
        e.angle = e.turnGoal;
        e.pState = 'wait';
        e.pTimer = P.endPause;
      } else {
        e.angle += step;
      }
    } else {
      e.pTimer -= dt;
      if (e.pTimer <= 0) e.pState = 'walk';
    }
  }

  hunt(e, dt) {
    const p = this.player;
    if (!p.alive) return;
    const d = dist(e, p);
    const los = d < config.ai.huntShootRange && this.grid.canSee(e.x, e.y, p.x, p.y);
    if (los) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const ux = dx / d, uy = dy / d;
      const pref = e.arch.preferredRange ?? 4;
      const radial = d > pref + 0.5 ? 1 : d < pref - 0.5 ? -0.7 : 0;
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = 1 + Math.random() * 1.5; }
      let mx = ux * radial - uy * e.strafeDir * 0.6;
      let my = uy * radial + ux * e.strafeDir * 0.6;
      const m = Math.hypot(mx, my);
      if (m > 1) { mx /= m; my /= m; }
      const huntSpeed = e.speed * config.ai.huntSpeedMult;
      e.x += mx * huntSpeed * dt;
      e.y += my * huntSpeed * dt;
      const aim = Math.atan2(dy, dx);
      e.angle = turnToward(e.angle, aim, config.ai.turnRate * dt);
      if (Math.abs(angleDiff(e.angle, aim)) < 0.3) {
        for (const w of e.weapons) {
          if (w.cd > 0) continue;
          w.cd = 1 / (w.rate * config.ai.fireRateMult);
          this.shoot(e, w, p, 'hostile', config.ai.aimError);
        }
      }
      return;
    }
    // Out of sight: follow the distance field toward the player.
    const g = this.grid, f = this.field;
    if (!f) return;
    const { c, r } = g.tileAt(e.x, e.y);
    const here = f[r * this.W + c];
    let best = null, bd = here >= 0 ? here : Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr;
        if (g.isBlocked(nc, nr)) continue;
        if (dc && dr && (g.isBlocked(c + dc, r) || g.isBlocked(c, r + dr))) continue; // no corner cutting
        const v = f[nr * this.W + nc];
        if (v >= 0 && v < bd) { bd = v; best = { nc, nr }; }
      }
    }
    if (best) {
      const ctr = g.center(best.nc, best.nr);
      this.moveToward(e, ctr.x, ctr.y, e.speed * config.ai.huntSpeedMult, dt);
    } else {
      this.moveToward(e, p.x, p.y, e.speed * config.ai.huntSpeedMult, dt);
    }
  }

  // ======================================================== shooting
  shoot(src, w, target, side, aimError = 0, onlyTarget = false) {
    const base = Math.atan2(target.y - src.y, target.x - src.x) + (Math.random() * 2 - 1) * aimError;
    const n = w.count || 1;
    const angles = [];
    if (w.pattern === 'spread' && n > 1) {
      for (let i = 0; i < n; i++) angles.push(base - w.spread / 2 + (w.spread * i) / (n - 1));
    } else if (w.pattern === 'ring') {
      for (let i = 0; i < n; i++) angles.push(base + (TAU * i) / n);
    } else {
      angles.push(base);
    }
    for (const a of angles) {
      const b = {
        x: src.x + Math.cos(a) * src.radius * 0.9,
        y: src.y + Math.sin(a) * src.radius * 0.9,
        vx: Math.cos(a) * w.bulletSpeed,
        vy: Math.sin(a) * w.bulletSpeed,
        life: config.bullets.life,
        radius: config.bullets.radius,
        damage: w.damage,
        side, ownerId: src.id, target, onlyTarget,
        alive: true,
      };
      this.bullets.push(b);
      this.view.addBullet(b);
    }
  }

  updateBullets(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; continue; }
      if (this.pointInSolid(b.x, b.y)) {
        b.alive = false;
        this.view.burst(b.x, b.y, 0x8899bb, 3, 2);
        continue;
      }
      if (b.side === 'player') {
        for (const e of this.entities) {
          if (!e.alive) continue;
          if (e !== b.target && (b.onlyTarget || this.factionOf(e) !== 'hostile')) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius) {
            this.damage(e, b.damage);
            b.alive = false;
            break;
          }
        }
      } else if (p.alive && Math.hypot(p.x - b.x, p.y - b.y) < p.radius + b.radius) {
        this.damagePlayer(b.damage);
        b.alive = false;
      }
    }
    const keep = [];
    for (const b of this.bullets) {
      if (b.alive) keep.push(b);
      else this.view.removeBullet(b);
    }
    this.bullets = keep;
  }

  damage(e, amount) {
    if (!e.alive) return;
    e.hp -= amount;
    e.flash = config.player.hitFlash;
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    e.alive = false;
    this.view.removeEntity(e);
    this.view.burst(e.x, e.y, 0xffd0a0, 18, 4);
    if (this.charge.target === e) { this.charge.target = null; this.charge.t = 0; }
  }

  damagePlayer(amount) {
    const p = this.player;
    if (!p.alive) return;
    p.flash = config.player.hitFlash;
    if (p.form) {
      p.formHp -= amount;
      if (p.formHp <= 0) this.revert();
    } else {
      p.hp -= amount;
      if (p.hp <= 0) this.killPlayer('Destroyed');
    }
  }

  killPlayer(reason) {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    this.view.removeEntity(p);
    this.view.burst(p.x, p.y, 0xffffff, 30, 5);
    this.view.ringFx(p.x, p.y, 0xffffff, 3);
    this.fire.mode = 'off';
    this.fire.target = null;
    this.state = 'dead';
    this.stateTimer = 1.6;
    this.emit('dead', reason);
  }

  // ======================================================== collisions
  pointInSolid(x, y) {
    for (const w of this.walls) if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    return false;
  }

  pushOutOfWalls(e) {
    let hit = false;
    const r = e.radius;
    for (const w of this.walls) {
      const cx = clamp(e.x, w.x, w.x + w.w), cy = clamp(e.y, w.y, w.y + w.h);
      const dx = e.x - cx, dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= (r - 1e-4) * (r - 1e-4)) continue;
      hit = true;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        e.x += (dx / d) * (r - d);
        e.y += (dy / d) * (r - d);
      } else {
        const left = e.x - w.x, right = w.x + w.w - e.x, down = e.y - w.y, up = w.y + w.h - e.y;
        const m = Math.min(left, right, down, up);
        if (m === left) e.x = w.x - r;
        else if (m === right) e.x = w.x + w.w + r;
        else if (m === down) e.y = w.y - r;
        else e.y = w.y + w.h + r;
      }
    }
    return hit;
  }

  resolveCollisions() {
    const p = this.player;
    p.contactRobot = false;
    p.contactWall = false;
    const all = this.entities.filter((e) => e.alive);
    if (p.alive) all.push(p);
    for (const e of all) if (this.pushOutOfWalls(e) && e.isPlayer) p.contactWall = true;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        if (a.isPlayer || b.isPlayer) p.contactRobot = true;
        const ia = 1 / (a.mass || 1), ib = 1 / (b.mass || 1);
        let d = Math.sqrt(d2);
        if (d < 1e-6) { dx = 1; dy = 0; d = 1e-6; } else { dx /= d; dy /= d; }
        const overlap = min - d;
        a.x -= dx * overlap * (ia / (ia + ib));
        a.y -= dy * overlap * (ia / (ia + ib));
        b.x += dx * overlap * (ib / (ia + ib));
        b.y += dy * overlap * (ib / (ia + ib));
      }
    }
    for (const e of all) this.pushOutOfWalls(e);
  }

  isFree(x, y, r) {
    for (const w of this.walls) {
      const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
    }
    return true;
  }

  findFree(x, y, r, maxR) {
    if (this.isFree(x, y, r)) return { x, y };
    for (let rad = 0.05; rad <= maxR + 1e-6; rad += 0.05) {
      const n = Math.max(8, Math.ceil((TAU * rad) / 0.1));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (this.isFree(px, py, r)) return { x: px, y: py };
      }
    }
    return null;
  }

  // ======================================================== goal
  checkGoal() {
    if (this.state !== 'playing' || !this.player.alive || !this.exit) return;
    const e = this.exit, p = this.player;
    if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) this.win();
  }

  win() {
    this.state = 'won';
    this.fire.mode = 'off';
    this.fire.target = null;
    this.emit('won');
  }
}
