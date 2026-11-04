// Live tuning panel generated from the config object.

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function buildDebugPanel(root, cfg, { onRestart, onChange, onClose }) {
  root.innerHTML = '';

  const head = el('div', 'dbg-head');
  head.append(el('strong', null, 'TUNING'));
  const restart = el('button', 'btn', 'Restart room');
  const copy = el('button', 'btn', 'JSON');
  const close = el('button', 'btn', 'Close');
  head.append(restart, copy, close);
  root.append(head);
  root.append(el('p', 'dbg-note', 'Edits apply live. Archetype stats apply when the room restarts. "JSON" dumps current values to paste into src/config.js.'));

  const out = el('textarea');
  out.readOnly = true;
  out.classList.add('hidden');
  root.append(out);

  restart.addEventListener('click', () => onRestart?.());
  close.addEventListener('click', () => onClose?.());
  copy.addEventListener('click', () => {
    out.value = JSON.stringify(cfg, null, 2);
    out.classList.toggle('hidden');
    if (!out.classList.contains('hidden')) {
      out.select();
      navigator.clipboard?.writeText(out.value).catch(() => {});
    }
  });

  const walk = (obj, path, container, depth) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (typeof v === 'number') {
        const row = el('label', 'dbg-row');
        row.append(el('span', null, k));
        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'decimal';
        input.value = String(v);
        input.step = Number.isInteger(v) && Math.abs(v) >= 5 ? '1' : '0.05';
        input.addEventListener('input', () => {
          const n = parseFloat(input.value);
          if (Number.isFinite(n)) { obj[k] = n; onChange?.(p); }
        });
        row.append(input);
        container.append(row);
      } else if (v && typeof v === 'object') {
        const d = el('details');
        d.open = depth === 0 && k !== 'archetypes';
        d.append(el('summary', null, k));
        walk(v, p, d, depth + 1);
        container.append(d);
      }
    }
  };
  walk(cfg, '', root, 0);
}
