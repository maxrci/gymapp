// Einladungslink: #/join/SCHLÜSSEL

import { pageHead } from '../components.js';
import { icon, toast } from '../ui.js';
import { esc } from '../utils.js';
import { srv, loggedIn, account, redeemCode } from '../sync.js';
import { deviceGuess } from '../group.js';
import { fighterFx } from '../fighter.js';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iPhone|iPad/.test(navigator.userAgent);

export function joinView({ code = '' }) {
  if (loggedIn()) {
    return { html: `${pageHead('Einladung', { back: '#/' })}<section class="card join-card">
      <p>Dieses Gerät ist bereits als <b>${esc(account().user?.name || '')}</b> angemeldet.</p>
      <a class="btn primary block" href="#/arena">Zur Arena</a></section>` };
  }
  const iosHint = isIOS() && !isStandalone() ? `<div class="card hint">
      <div class="card-title">${icon('download')} Zuerst installieren</div>
      <p>Auf dem iPhone hat die installierte App einen eigenen Speicher. Tippe in Safari auf <b>Teilen</b> ${icon('share', 'xs')} → <b>„Zum Home-Bildschirm“</b>, öffne die App und gib dort unter <b>Profil → Gruppe</b> diesen Schlüssel ein:</p>
      <div class="key-box sm"><b>${esc(code)}</b></div>
      <p class="footnote">Du kannst dich auch direkt hier im Browser anmelden – dann aber nur im Browser.</p>
    </div>` : '';
  const html = `
    ${pageHead('Einladung')}
    <section class="card join-card">
      <div class="join-fig">${fighterFx(3, { enter: true })}</div>
      <h3>${esc(srv.info?.group || 'GymLog-Gruppe')}</h3>
      <p>Du wurdest eingeladen. Melde dieses Gerät mit deinem persönlichen Schlüssel an – ohne Passwort.</p>
      <form data-join>
        <label class="field"><span>Schlüssel</span><input name="code" value="${esc(code)}" autocomplete="off" autocapitalize="characters"></label>
        <label class="field"><span>Name dieses Geräts</span><input name="device" value="${esc(deviceGuess())}" autocomplete="off"></label>
        <button class="btn primary block lg" type="submit">Anmelden</button>
      </form>
    </section>
    ${iosHint}`;
  return {
    html,
    mount: (root) => {
      root.querySelector('[data-join]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const btn = f.querySelector('button');
        btn.disabled = true;
        try {
          const r = await redeemCode(f.elements.code.value, f.elements.device.value);
          toast(`Willkommen, ${r.user.name}!`);
          location.hash = '#/arena';
        } catch (err) { toast(err.message, 4000); btn.disabled = false; }
      });
    },
  };
}
