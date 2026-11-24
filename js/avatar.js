// Avatar-Editor: Figur, Gesicht, Haarfarbe, Kleidung + Farbe. Vorschau aller Stufen.

import { state, saveSettings } from './store.js';
import { overlay, icon, toast } from './ui.js';
import { esc } from './utils.js';
import { fighterSVG, fighterFx, fighterHead } from './fighter.js';
import { HAIR, COLORS, OUTFITS, FACES, normLook, setLook } from './look.js';
import { SLOTS, visibleItems, itemUnlocked, unlockHint } from './unlocks.js';
import { STAGES, ACHIEVEMENTS, profileStats } from './gamification.js';

export function openAvatarEditor({ above = false, onClose } = {}) {
  let look = normLook(state.settings.avatar);
  let stage = 0;
  const o = overlay('', 'avatar-editor');
  if (above) o.style.zIndex = 230; // z. B. aus dem Onboarding heraus
  if (onClose) { const c = o.close; o.close = () => { c(); onClose(); }; }
  const opt = (group, key, label, inner, on) => `<button class="av-opt ${on ? 'on' : ''}" data-set="${group}" data-v="${esc(key)}" aria-label="${esc(label)}">${inner}<small>${esc(label)}</small></button>`;
  const swatch = (group, key, label, color, on) => `<button class="av-sw ${on ? 'on' : ''}" data-set="${group}" data-v="${esc(key)}" style="--c:${color}" aria-label="${esc(label)}"></button>`;

  const achTitle = (id) => ACHIEVEMENTS.find((a) => a.id === id)?.title || id;
  const LOCK = '<svg class="av-lock" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const itemOpts = (slot) => {
    const cur = look.items[slot];
    const none = `<button class="av-opt ${cur ? '' : 'on'}" data-item="${slot}" data-v="" aria-label="Keins"><span class="av-none">–</span><small>Keins</small></button>`;
    return none + visibleItems().filter((it) => it.slot === slot).map((it) => {
      const ok = itemUnlocked(it.id);
      const prev = { ...look, items: { ...look.items, [slot]: it.id } };
      const img = slot === 'hand' ? `<div class="av-handprev">${fighterSVG(1, { look: { ...look, items: { hat: null, face: null, hand: it.id } } }).replace(/viewBox="0 0 200 260"([\s\S]*?class="f-item" transform="translate\(([\d.]+) ([\d.]+)\))/, (_, rest, x, y) => `viewBox="${(+x - 60).toFixed(1)} ${(+y - 62).toFixed(1)} 120 104"${rest}`)}</div>` : fighterHead(1, prev);
      return `<button class="av-opt av-item ${slot} ${cur === it.id ? 'on' : ''} ${ok ? '' : 'locked'}" data-item="${slot}" data-v="${it.id}" aria-label="${esc(it.label)}${ok ? '' : ' (gesperrt)'}">${img}${ok ? '' : LOCK}<small>${esc(it.label)}</small>${ok ? '' : `<em class="av-hint">${esc(unlockHint(it, achTitle))}</em>`}</button>`;
    }).join('');
  };

  const draw = () => {
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Dein Kämpfer</div><button class="link-btn" data-save>Speichern</button></div>
      <div class="panel-body av-body">
        <div class="av-preview st${stage}">${fighterFx(stage, { look, enter: false })}</div>
        <div class="av-stages">${STAGES.map((s, i) => `<button class="${i === stage ? 'on' : ''}" data-stage="${i}">${i + 1}</button>`).join('')}</div>
        <p class="footnote center">Vorschau: <b>${esc(STAGES[stage].name)}</b>${stage ? ' – höhere Stufen verwandeln deinen Kämpfer automatisch.' : ' – deine Einsteiger-Form.'}</p>

        <div class="list-label">Figur</div>
        <div class="av-grid two">
          ${opt('sex', 'm', 'Männlich', fighterHead(1, { ...look, sex: 'm' }), look.sex === 'm')}
          ${opt('sex', 'f', 'Weiblich', fighterHead(1, { ...look, sex: 'f' }), look.sex === 'f')}
        </div>
        <div class="list-label">Gesicht</div>
        <div class="av-grid three">${FACES.map(([k, l]) => opt('face', k, l, fighterHead(1, { ...look, face: k }), look.face === k)).join('')}</div>
        <div class="list-label">Haarfarbe</div>
        <div class="av-swatches">${HAIR.map(([k, l, c]) => swatch('hair', k, l, c, look.hair === k)).join('')}</div>
        <div class="list-label">Kleidung</div>
        <div class="av-grid four">${OUTFITS.map(([k, l]) => opt('outfit', k, l, fighterSVG(1, { look: { ...look, outfit: k } }), look.outfit === k)).join('')}</div>
        <div class="list-label">Farbe</div>
        <div class="av-swatches">${COLORS.map(([k, l, c]) => swatch('color', k, l, c, look.color === k)).join('')}</div>
        <div class="list-label">Objekte</div>
        ${SLOTS.map(([slot, name]) => `<div class="av-slot">${esc(name)}</div><div class="av-grid av-items">${itemOpts(slot)}</div>`).join('')}
        <button class="btn primary block lg" data-save style="margin-top:18px">Speichern</button>
      </div>`;
  };
  stage = Math.min(profileStats().stage.index, STAGES.length - 1);
  draw();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const st = e.target.closest('[data-stage]');
    if (st) { stage = +st.dataset.stage; return draw(); }
    const itm = e.target.closest('[data-item]');
    if (itm) {
      const slot = itm.dataset.item, id = itm.dataset.v || null;
      if (id && !itemUnlocked(id)) {
        const it = visibleItems().find((x) => x.id === id);
        return toast(`${it.label}: ${unlockHint(it, achTitle)}`);
      }
      const y = o.querySelector('.panel-body')?.scrollTop || 0;
      look = normLook({ ...look, items: { ...look.items, [slot]: id } });
      draw();
      o.querySelector('.panel-body').scrollTop = y;
      return;
    }
    const set = e.target.closest('[data-set]');
    if (set) {
      const y = o.querySelector('.panel-body')?.scrollTop || 0;
      look = normLook({ ...look, [set.dataset.set]: set.dataset.v });
      draw();
      o.querySelector('.panel-body').scrollTop = y;
      return;
    }
    if (e.target.closest('[data-save]')) {
      setLook(look);
      await saveSettings({ avatar: look, avatarUpdated: Date.now() });
      o.close();
      toast('Kämpfer gespeichert');
    }
  });
}
