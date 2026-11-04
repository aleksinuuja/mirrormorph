// DOM HUD: room select, bars, fire button, banners, toasts.

const ICON_FIRE = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" width="30" height="30"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ rooms, onSelectRoom, onFire, onBack, onRestart, onToggleDebug }) {
    this.rooms = rooms;
    this.onSelectRoom = onSelectRoom;
    this.cache = {};
    this.toastTimer = 0;

    const list = $('room-list');
    rooms.forEach((r, i) => {
      const b = document.createElement('button');
      b.className = 'room-card';
      b.innerHTML = `<div class="room-num">${i + 1}</div><div><div class="room-name"></div><div class="room-blurb"></div></div>`;
      b.querySelector('.room-name').textContent = r.name;
      b.querySelector('.room-blurb').textContent = r.blurb;
      b.addEventListener('click', () => onSelectRoom(i));
      list.append(b);
    });

    const fire = $('btn-fire');
    fire.innerHTML = ICON_FIRE;
    fire.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); onFire(); });
    $('btn-back').addEventListener('click', onBack);
    $('btn-restart').addEventListener('click', onRestart);
    $('btn-debug').addEventListener('click', onToggleDebug);
  }

  showMenu() {
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    this.hideBanner();
    document.body.classList.remove('timestop');
  }

  showHud() {
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.hideBanner();
  }

  toast(text, ms = 1600) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  banner(title, sub, actions = []) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    const box = $('banner-actions');
    box.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      box.append(b);
    }
    $('banner').classList.remove('hidden');
  }

  hideBanner() {
    $('banner').classList.add('hidden');
  }

  onEvent(type, data, world, roomIndex) {
    switch (type) {
      case 'loaded': this.hideBanner(); break;
      case 'hint': this.toast(data, 2600); break;
      case 'status': this.toast(data, 2000); break;
      case 'morph': this.toast(`◆ ${data.toUpperCase()}`, 1200); break;
      case 'revert': this.toast('REVERTED', 1000); break;
      case 'dead': this.banner('DESTROYED', data); break;
      case 'won': {
        const actions = [
          { label: 'Replay', onClick: () => this.onSelectRoom(roomIndex) },
          { label: 'Rooms', onClick: () => this.onSelectRoom(-1) },
        ];
        if (roomIndex + 1 < this.rooms.length) {
          actions.push({ label: 'Next room', primary: true, onClick: () => this.onSelectRoom(roomIndex + 1) });
        }
        this.banner('ROOM CLEAR', world.room.name, actions);
        break;
      }
    }
  }

  set(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  update(world) {
    if (!world.room) return;
    const p = world.player;
    const pct = (v) => `${Math.max(0, Math.min(1, v)) * 100}%`;

    this.set('hp', pct(p.hp / p.maxHp), (v) => { $('hp-base').style.width = v; });
    this.set('formOn', !!p.form, (v) => $('form-wrap').classList.toggle('hidden', !v));
    if (p.form) {
      this.set('formLabel', p.arch.label.toUpperCase(), (v) => { $('form-label').textContent = v; });
      this.set('formHp', pct(p.formHp / p.formMaxHp), (v) => { $('hp-form').style.width = v; });
    }
    const boss = world.room.goal === 'boss' ? world.entities.find((e) => e.isBoss) : null;
    this.set('bossOn', !!boss, (v) => $('boss-wrap').classList.toggle('hidden', !v));
    if (boss) this.set('bossHp', pct(boss.hp / boss.maxHp), (v) => { $('hp-boss').style.width = v; });

    const mode = world.fire.mode;
    this.set('fireMode', mode, (m) => {
      const b = $('btn-fire');
      b.classList.toggle('selecting', m === 'selecting');
      b.classList.toggle('firing', m === 'firing');
      b.innerHTML = m === 'firing' ? ICON_STOP : ICON_FIRE;
      b.setAttribute('aria-label', m === 'firing' ? 'Stop' : m === 'selecting' ? 'Cancel' : 'Fire');
      document.body.classList.toggle('timestop', m === 'selecting');
    });
    this.set('fireDisabled', mode === 'off' && !world.canFire, (v) => { $('btn-fire').disabled = v; });

    let status = '';
    if (p.alive && p.form) {
      if (p.arch.isBoss) status = 'MIRROR BOSS';
      else if (world.isDisguised()) status = `DISGUISED · ${p.arch.label.toUpperCase()}`;
      else if (p.immovable) status = 'INANIMATE · WAIT IT OUT';
    }
    this.set('status', status, (v) => { $('status').textContent = v; });
  }
}
