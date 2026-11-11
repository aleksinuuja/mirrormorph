// DOM HUD: title screen, bars, fire button, alarm flash, banners, toasts.

const ICON_FIRE = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/></svg>';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ level, onPlay, onMenu, onFirePress, onFireRelease, onRestart, onToggleDebug }) {
    this.onPlay = onPlay;
    this.onMenu = onMenu;
    this.cache = {};
    this.toastTimer = 0;

    const list = $('room-list');
    const b = document.createElement('button');
    b.className = 'room-card';
    b.innerHTML = '<div class="room-num">▶</div><div><div class="room-name"></div><div class="room-blurb"></div></div>';
    b.querySelector('.room-name').textContent = level.name;
    b.querySelector('.room-blurb').textContent = level.blurb;
    b.addEventListener('click', onPlay);
    list.append(b);

    const fire = $('btn-fire');
    fire.innerHTML = ICON_FIRE;
    // Hold to fire. Pointer capture keeps the release even if the thumb slides off.
    fire.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      fire.setPointerCapture?.(ev.pointerId);
      fire.classList.add('firing');
      onFirePress();
    });
    const release = () => { fire.classList.remove('firing'); onFireRelease(); };
    fire.addEventListener('pointerup', release);
    fire.addEventListener('pointercancel', release);
    fire.addEventListener('lostpointercapture', release);
    $('btn-back').addEventListener('click', onMenu);
    $('btn-restart').addEventListener('click', onRestart);
    $('btn-debug').addEventListener('click', onToggleDebug);
  }

  showMenu() {
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    this.hideBanner();
    document.body.classList.remove('alerted');
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

  flashAlarm() {
    const f = $('alarm-flash');
    f.classList.remove('go');
    void f.offsetWidth; // restart the CSS animation
    f.classList.add('go');
  }

  onEvent(type, data) {
    switch (type) {
      case 'loaded': this.hideBanner(); break;
      case 'hint': this.toast(data, 3800); break;
      case 'status': this.toast(data, 2000); break;
      case 'morph': this.toast(`◆ ${data.toUpperCase()}`, 1200); break;
      case 'revert': this.toast('FORM LOST', 1200); break;
      case 'door': this.toast('EMERGENCY DOOR OPEN', 2200); break;
      case 'alert': this.flashAlarm(); this.toast(`ALERT · ${String(data).toUpperCase()}`, 2200); break;
      case 'dead': this.banner('DESTROYED', data); break;
      case 'won':
        this.banner('ESCAPED', 'You made it out.', [
          { label: 'Menu', onClick: this.onMenu },
          { label: 'Play again', primary: true, onClick: this.onPlay },
        ]);
        break;
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

    this.set('fireDisabled', !world.canFire, (v) => { $('btn-fire').disabled = v; });
    const w = world.weapon;
    this.set('aiming', !!world.aiming, (v) => $('btn-fire').classList.toggle('aiming', v));
    this.set('rail', !!w && w.kind === 'rail', (v) => $('btn-fire').classList.toggle('rail', v));
    this.set('cooling', !!w && w.kind === 'rail' && w.cd > 0, (v) => $('btn-fire').classList.toggle('cooling', v));
    this.set('alerted', !!world.alerted, (v) => document.body.classList.toggle('alerted', v));

    const hold = world.exitTimer > 0 && world.state === 'playing' ? Math.max(0, world.exitHold - world.exitTimer) : 0;
    this.set('exitCount', hold > 0 ? hold.toFixed(1) : '', (v) => {
      const el = $('exit-count');
      el.textContent = v;
      el.classList.toggle('hidden', !v);
    });

    let status = '';
    if (p.alive) {
      if (world.aiming) status = 'RAILGUN · STICK AIMS · FIRE SHOOTS';
      else if (world.alerted) status = 'ALERT · ALL SENTRIES HUNTING';
      else if (world.isDisguised()) status = `DISGUISED · ${p.arch.label.toUpperCase()}`;
    }
    this.set('status', status, (v) => { $('status').textContent = v; });
  }
}
