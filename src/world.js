// Game simulation: entities, morphing, firing, stealth, AI, collisions.
// Pure logic; talks to the View through a few add/remove/effect calls and
// reports notable moments through `emit(type, data)`.
import { config } from './config.js';

const TAU = Math.PI * 2;
let nextId = 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function turnToward(cur, target, maxStep) {
  return cur + clamp(angleDiff(cur, target), -maxStep, maxStep);
}
function cloneWeapons(ws, randomCd = false) {
  return (ws || []).map((w) => ({ ...w, cd: randomCd ? Math.random() / w.rate : 0 }));
}

export class World {
  constructor(view, emit) {
    this.view = view;
    this.emit = emit || (() => {});
    this.room = null;
    this.entities = [];
    this.bullets = [];
    this.fire = { mode: 'off', target: null, manual: false };
    this.charge = { target: null, t: 0, inRange: false };
  }

  // ======================================================== setup
  load(room) {
    this.view.clear();
    this.room = room;
    this.W = room.width;
    this.H = room.height;
    this.walls = [
      { x: -1, y: -1, w: this.W + 2, h: 1 },
      { x: -1, y: this.H, w: this.W + 2, h: 1 },
      { x: -1, y: 0, w: 1, h: this.H },
      { x: this.W, y: 0, w: 1, h: this.H },
      ...room.walls.map(([x, y, w, h]) => ({ x, y, w, h })),
    ];
    this.entities = [];
    this.bullets = [];
    this.coverBlown = {};
    this.state = 'playing'; // 'playing' | 'won' | 'dead'
    this.stateTimer = 0;
    this.time = 0;
    this.steering = false;
    this.fire = { mode: 'off', target: null, manual: false };
    this.charge = { target: null, t: 0, inRange: false };
    this.view.buildRoom(room, this.walls);
    for (const d of room.entities) this.spawn(d);
    this.spawnPlayer(room.playerStart);
    this.emit('loaded', room);
    if (room.hint) this.emit('hint', room.hint);
  }

  spawn(d) {
    const a = config.archetypes[d.type];
    if (!a) { console.warn('Unknown entity type', d.type); return null; }
    const e = {
      id: nextId++, type: d.type, arch: a, isPlayer: false,
      x: d.x, y: d.y, angle: d.angle ?? -Math.PI / 2,
      radius: a.radius, speed: a.speed, hp: a.hp, maxHp: a.hp,
      weapons: cloneWeapons(a.weapons, true),
      baseFaction: d.faction || 'neutral',
      cohort: d.cohort || null,
      aggro: d.aggro ?? config.ai.aggroRange,
      engaged: false,
      home: { x: d.x, y: d.y },
      patrol: d.patrol || null, patrolIdx: 0,
      wander: d.wander || null, wanderTarget: null, wanderTimer: 0,
      minion: !!d.minion, believesPlayer: false, provoked: false,
      isBoss: !!a.isBoss,
      immovable: a.kind === 'object' || a.speed <= 0,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      strafeTimer: 1 + Math.random() * 2,
      orbitPhase: Math.random() * TAU,
      flash: 0, alive: true,
    };
    this.entities.push(e);
    this.view.addEntity(e);
    return e;
  }

  spawnPlayer(pos) {
    const a = config.archetypes.base;
    this.player = {
      id: 0, isPlayer: true, type: 'base', arch: a, form: null, lookSeed: 1,
      x: pos.x, y: pos.y, angle: Math.PI / 2,
      radius: a.radius, speed: a.speed, weapons: cloneWeapons(a.weapons),
      hp: a.hp, maxHp: a.hp, formHp: 0, formMaxHp: 0,
      target: { x: pos.x, y: pos.y },
      immovable: false, contact: false, flash: 0, alive: true,
    };
    this.view.addEntity(this.player);
  }

  // ======================================================== input API
  setMoveTarget(x, y) {
    const p = this.player;
    p.target.x = clamp(x, 0, this.W);
    p.target.y = clamp(y, 0, this.H);
    this.steering = true;
  }

  holdPosition() {
    const p = this.player;
    p.target.x = p.x;
    p.target.y = p.y;
    this.steering = false;
  }

  get canFire() {
    return this.state === 'playing' && this.player.alive && this.player.weapons.length > 0;
  }

  // FIRE/STOP button
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
    this.attack(best);
    f.target = best;
    f.manual = true;
    f.mode = 'firing';
  }

  // Manually choosing a target counts as attacking it.
  attack(e) {
    if (this.isDisguised()) this.blowCover();
    if (this.factionOf(e) !== 'hostile') this.provoke(e);
  }

  // ======================================================== factions & stealth
  // Faction of an entity relative to the player, right now.
  factionOf(e) {
    if (e.isPlayer) return 'player';
    if (e.isBoss || e.provoked) return 'hostile'; // there can be only one: a boss always attacks
    if (e.baseFaction !== 'hostile') return e.baseFaction;
    const form = this.player?.form;
    if (form) {
      if (e.minion && e.believesPlayer && config.archetypes[form]?.isBoss) return 'friendly';
      if (e.cohort && form === e.type && !this.coverBlown[e.cohort]) return 'neutral'; // disguised
    }
    return 'hostile';
  }

  isDisguised() {
    const form = this.player.form;
    if (!form) return false;
    return this.entities.some((e) => e.alive && e.type === form && e.cohort && !e.isBoss
      && e.baseFaction === 'hostile' && !e.provoked && !this.coverBlown[e.cohort]);
  }

  blowCover() {
    const form = this.player.form;
    let any = false;
    for (const e of this.entities) {
      if (e.type === form && e.cohort && !this.coverBlown[e.cohort]) {
        this.coverBlown[e.cohort] = true;
        any = true;
      }
    }
    if (any) this.emit('status', 'COVER BLOWN');
  }

  provoke(e) {
    e.provoked = true;
    e.believesPlayer = false;
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

    this.time += dt;
    const p = this.player;
    p.flash = Math.max(0, p.flash - dt);

    this.updatePlayerMove(dt);
    for (const e of this.entities) if (e.alive) this.updateAI(e, dt);
    this.resolveCollisions();
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
    if (p.speed > 0) {
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
      if (d > 1e-3) {
        const step = Math.min(d, p.speed * dt);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        if (this.fire.mode !== 'firing' && d > 0.05) p.angle = turnToward(p.angle, Math.atan2(dy, dx), 12 * dt);
      }
    }
    const t = this.fire.target;
    if (this.fire.mode === 'firing' && t && t.alive && p.speed > 0) {
      p.angle = turnToward(p.angle, Math.atan2(t.y - p.y, t.x - p.x), 14 * dt);
    }
  }

  updateCharge(dt) {
    const p = this.player, c = this.charge;
    if (!p.alive || p.form) { c.target = null; c.t = 0; return; } // no charging while morphed
    if (c.target && !c.target.alive) { c.target = null; c.t = 0; }
    const range = config.morph.range;
    if (!c.target) {
      // First valid thing to enter range locks automatically.
      let best = null, bd = Infinity;
      for (const e of this.entities) {
        if (!e.alive) continue;
        const d = dist(p, e) - e.radius;
        if (d <= range && d < bd) { bd = d; best = e; }
      }
      if (best) { c.target = best; c.t = 0; }
    }
    if (!c.target) return;
    c.inRange = dist(p, c.target) - c.target.radius <= range;
    if (c.inRange) {
      c.t += dt / config.morph.chargeTime;
    } else {
      c.t -= dt / config.morph.drainTime; // drains, does not reset
      if (c.t <= 0) { c.t = 0; c.target = null; }
    }
    if (c.t >= 1) this.snapTo(c.target);
  }

  snapTo(t) {
    const p = this.player, a = t.arch;
    p.form = t.type;
    p.type = t.type;
    p.arch = a;
    p.lookSeed = t.id;
    p.radius = a.radius;
    p.speed = a.speed;
    p.immovable = a.kind === 'object' || a.speed <= 0;
    p.weapons = cloneWeapons(a.weapons);
    p.formHp = t.hp;          // copy includes current HP
    p.formMaxHp = t.maxHp;
    p.angle = t.angle;
    p.target.x = p.x; p.target.y = p.y;
    this.steering = false;
    this.charge.target = null;
    this.charge.t = 0;
    this.fire.mode = 'off';   // snapping interrupts fire so you don't blow a fresh disguise
    this.fire.target = null;
    if (a.isBoss) {
      for (const e of this.entities) {
        if (e.minion && !e.provoked) e.believesPlayer = Math.random() < config.ai.minionBelieveChance;
      }
    }
    if (p.immovable) this.pushOutOfWalls(p);
    this.view.setEntityShape(p);
    this.view.ringFx(p.x, p.y, 0xffffff, a.radius * 4 + 1);
    this.view.burst(p.x, p.y, 0xbfe8ff, 10, 3);
    this.emit('morph', a.label);
    if (this.isDisguised()) this.emit('status', `DISGUISED AS ${a.label.toUpperCase()}`);
    if (a.isBoss) this.emit('status', 'TWO BOSSES: THE MINIONS SPLIT');
  }

  updateForm(dt) {
    const p = this.player;
    if (!p.form || !p.alive) return;
    p.formHp -= config.morph.formDrainPerSec * (p.arch.drainMult ?? 1) * dt;
    // Only collisions the player drives into count, so things bumping a parked form don't shed it.
    const pushing = this.steering && !p.immovable && Math.hypot(p.target.x - p.x, p.target.y - p.y) > 0.05;
    if (p.contact && pushing) p.formHp -= config.morph.contactDps * dt;
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
    p.immovable = false;
    p.weapons = cloneWeapons(a.weapons);
    p.formHp = 0;
    for (const e of this.entities) e.believesPlayer = false;
    this.view.setEntityShape(p);
    const spot = this.findFree(p.x, p.y, p.radius, config.morph.revertSearchRadius);
    if (!spot) { this.killPlayer('No room to revert'); return; }
    p.x = spot.x; p.y = spot.y;
    p.target.x = p.x; p.target.y = p.y;
    this.view.ringFx(p.x, p.y, 0x9fd8ff, 2.5);
    this.emit('revert');
  }

  updatePlayerFire(dt) {
    const p = this.player, f = this.fire;
    for (const w of p.weapons) w.cd = Math.max(0, w.cd - dt);
    if (f.mode !== 'firing' || !p.alive) return;
    if (!p.weapons.length) { f.mode = 'off'; f.target = null; return; }
    // Auto-picked targets never include the charge target or non-hostiles.
    if (f.target && f.target.alive && !f.manual
      && (f.target === this.charge.target || this.factionOf(f.target) !== 'hostile')) f.target = null;
    if (!f.target || !f.target.alive) {
      f.target = this.nearestHostile();
      f.manual = false;
      if (!f.target) { f.mode = 'off'; return; }
    }
    for (const w of p.weapons) {
      if (w.cd > 0) continue;
      w.cd = 1 / w.rate;
      const disguised = this.isDisguised();
      if (disguised) this.blowCover();
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

  // ======================================================== AI
  pickAITarget(e, fac) {
    if (!e.weapons.length) return null;
    const p = this.player;
    const reach = e.engaged ? e.aggro * config.ai.disengageMult : e.aggro;
    if (fac === 'hostile') {
      if (p.alive && (e.isBoss || dist(e, p) <= reach)) return p; // red: the player first
      let best = null, bd = Infinity;
      for (const o of this.entities) {
        if (o === e || !o.alive || this.factionOf(o) !== 'friendly') continue;
        const d = dist(e, o);
        if (d <= reach && d < bd) { bd = d; best = o; }
      }
      return best;
    }
    if (fac === 'friendly') {
      let best = null, bd = Infinity;
      for (const o of this.entities) {
        if (o === e || !o.alive || this.factionOf(o) !== 'hostile') continue;
        const d = dist(e, o);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }
    return null;
  }

  updateAI(e, dt) {
    e.flash = Math.max(0, e.flash - dt);
    for (const w of e.weapons) w.cd = Math.max(0, w.cd - dt);
    if (e.immovable && !e.weapons.length) return;

    const fac = this.factionOf(e);
    const tgt = this.pickAITarget(e, fac);
    e.engaged = !!tgt;
    let mx = 0, my = 0, spd = e.speed;

    if (tgt) {
      const dx = tgt.x - e.x, dy = tgt.y - e.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / d, uy = dy / d;
      const pref = e.arch.preferredRange ?? config.ai.strafeDistance;
      const radial = d > pref + 1 ? 1 : d < pref - 1 ? -0.8 : 0;
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = 1.2 + Math.random() * 2; }
      mx = ux * radial - uy * e.strafeDir * 0.7;
      my = uy * radial + ux * e.strafeDir * 0.7;
      const aim = Math.atan2(dy, dx);
      e.angle = turnToward(e.angle, aim, config.ai.turnRate * dt);
      const aligned = Math.abs(angleDiff(e.angle, aim)) < 0.35;
      for (const w of e.weapons) {
        if (w.cd > 0) continue;
        if (w.pattern !== 'ring' && !aligned) continue;
        w.cd = 1 / (w.rate * config.ai.fireRateMult);
        this.shoot(e, w, tgt, fac, config.ai.aimError);
      }
    } else {
      let goal = null;
      if (e.minion) {
        const boss = this.entities.find((b) => b.alive && b.isBoss);
        if (boss) {
          const a = e.orbitPhase + this.time * 0.5;
          goal = { x: boss.x + Math.cos(a) * 3.2, y: boss.y + Math.sin(a) * 3.2 };
        }
      }
      if (!goal && e.patrol) {
        const pt = e.patrol[e.patrolIdx];
        goal = { x: pt[0], y: pt[1] };
        if (Math.hypot(goal.x - e.x, goal.y - e.y) < 0.3) e.patrolIdx = (e.patrolIdx + 1) % e.patrol.length;
        spd *= 0.6;
      }
      if (!goal && e.wander) {
        e.wanderTimer -= dt;
        if (!e.wanderTarget || e.wanderTimer <= 0 || dist(e, e.wanderTarget) < 0.3) {
          const [x0, y0, x1, y1] = e.wander;
          e.wanderTarget = { x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0) };
          e.wanderTimer = 3 + Math.random() * 2;
        }
        goal = e.wanderTarget;
        spd *= 0.6;
      }
      if (!goal) goal = e.home;
      const dx = goal.x - e.x, dy = goal.y - e.y, d = Math.hypot(dx, dy);
      if (d > 0.15) {
        mx = dx / d; my = dy / d;
        if (d < 1) { mx *= d; my *= d; }
        e.angle = turnToward(e.angle, Math.atan2(dy, dx), config.ai.turnRate * dt);
      }
    }

    if (e.immovable) return;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    e.x += mx * spd * dt;
    e.y += my * spd * dt;
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
        side, ownerId: src.id,
        target, onlyTarget,
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
      if (this.pointInWall(b.x, b.y)) {
        b.alive = false;
        this.view.burst(b.x, b.y, 0x8899bb, 3, 2);
        continue;
      }
      if (b.side === 'player') {
        // Player shots hit their target, plus other hostiles unless fired while disguised.
        for (const e of this.entities) {
          if (!e.alive) continue;
          if (e !== b.target && (b.onlyTarget || this.factionOf(e) !== 'hostile')) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius) {
            this.damage(e, b.damage, true);
            b.alive = false;
            break;
          }
        }
      } else {
        if (b.side === 'hostile' && p.alive && Math.hypot(p.x - b.x, p.y - b.y) < p.radius + b.radius) {
          this.damagePlayer(b.damage);
          b.alive = false;
          continue;
        }
        const victim = b.side === 'hostile' ? 'friendly' : b.side === 'friendly' ? 'hostile' : null;
        if (!victim) continue;
        for (const e of this.entities) {
          if (!e.alive || e.id === b.ownerId || this.factionOf(e) !== victim) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius) {
            this.damage(e, b.damage, false);
            b.alive = false;
            break;
          }
        }
      }
    }
    const keep = [];
    for (const b of this.bullets) {
      if (b.alive) keep.push(b);
      else this.view.removeBullet(b);
    }
    this.bullets = keep;
  }

  damage(e, amount, byPlayer) {
    if (!e.alive) return;
    e.hp -= amount;
    e.flash = config.player.hitFlash;
    if (byPlayer && this.factionOf(e) !== 'hostile') this.provoke(e);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    e.alive = false;
    this.view.removeEntity(e);
    this.view.burst(e.x, e.y, e.isBoss ? 0xffb080 : 0xffd0a0, Math.round(12 + e.radius * 14), 4 + e.radius * 2);
    if (e.isBoss) this.view.ringFx(e.x, e.y, 0xff8060, 6);
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
      if (p.hp <= 0) this.killPlayer('Hull destroyed');
    }
  }

  killPlayer(reason) {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    this.view.removeEntity(p);
    this.view.burst(p.x, p.y, 0xffffff, 30, 6);
    this.view.ringFx(p.x, p.y, 0xffffff, 4);
    this.fire.mode = 'off';
    this.fire.target = null;
    this.state = 'dead';
    this.stateTimer = 1.6;
    this.emit('dead', reason);
  }

  // ======================================================== collisions
  pointInWall(x, y) {
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
        // Centre is inside the box: leave by the shortest side.
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
    p.contact = false;
    const all = this.entities.filter((e) => e.alive);
    if (p.alive) all.push(p);

    for (const e of all) {
      if (e.immovable) continue;
      if (this.pushOutOfWalls(e) && e.isPlayer) p.contact = true;
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        if (a.isPlayer || b.isPlayer) p.contact = true;
        const ma = a.immovable ? 0 : 1, mb = b.immovable ? 0 : 1;
        if (ma + mb === 0) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) { dx = 1; dy = 0; d = 1e-6; } else { dx /= d; dy /= d; }
        const overlap = min - d;
        a.x -= dx * overlap * (ma / (ma + mb));
        a.y -= dy * overlap * (ma / (ma + mb));
        b.x += dx * overlap * (mb / (ma + mb));
        b.y += dy * overlap * (mb / (ma + mb));
      }
    }
    // Second wall pass so ship-vs-ship pushes never leave anyone inside a wall.
    for (const e of all) if (!e.immovable) this.pushOutOfWalls(e);
  }

  // Free = inside the room, not overlapping walls or solid objects.
  isFree(x, y, r) {
    if (x - r < 0 || x + r > this.W || y - r < 0 || y + r > this.H) return false;
    for (const w of this.walls) {
      const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
    }
    for (const e of this.entities) {
      if (e.alive && e.immovable && Math.hypot(e.x - x, e.y - y) < e.radius + r) return false;
    }
    return true;
  }

  findFree(x, y, r, maxR) {
    if (this.isFree(x, y, r)) return { x, y };
    for (let rad = 0.1; rad <= maxR + 1e-6; rad += 0.1) {
      const n = Math.max(8, Math.ceil((TAU * rad) / 0.15));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (this.isFree(px, py, r)) return { x: px, y: py };
      }
    }
    return null;
  }

  // ======================================================== goals
  checkGoal() {
    if (this.state !== 'playing' || !this.player.alive) return;
    const r = this.room, p = this.player;
    if (r.goal === 'exit' && r.exit) {
      const e = r.exit;
      if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) this.win();
    } else if (r.goal === 'boss') {
      if (!this.entities.some((e) => e.alive && e.isBoss)) this.win();
    }
  }

  win() {
    this.state = 'won';
    this.fire.mode = 'off';
    this.fire.target = null;
    this.emit('won');
  }
}
