// Avatar-Editor: Figur, Gesicht, Haarfarbe, Kleidung + Farbe. Vorschau aller Stufen.

import { state, saveSettings } from './store.js';
import { overlay, icon, toast } from './ui.js';
import { esc } from './utils.js';
import { fighterSVG, fighterFx, fighterHead } from './fighter.js';
import { HAIR, COLORS, OUTFITS, FACES, normLook, setLook } from './look.js';
import { STAGES, profileStats } from './gamification.js';

export function openAvatarEditor() {
  let look = normLook(state.settings.avatar);
  let stage = 0;
  const o = overlay('', 'avatar-editor');
  const opt = (group, key, label, inner, on) => `<button class="av-opt ${on ? 'on' : ''}" data-set="${group}" data-v="${esc(key)}" aria-label="${esc(label)}">${inner}<small>${esc(label)}</small></button>`;
  const swatch = (group, key, label, color, on) => `<button class="av-sw ${on ? 'on' : ''}" data-set="${group}" data-v="${esc(key)}" style="--c:${color}" aria-label="${esc(label)}"></button>`;

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
        <button class="btn primary block lg" data-save style="margin-top:18px">Speichern</button>
      </div>`;
  };
  stage = Math.min(profileStats().stage.index, STAGES.length - 1);
  draw();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const st = e.target.closest('[data-stage]');
    if (st) { stage = +st.dataset.stage; return draw(); }
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
