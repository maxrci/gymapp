// Anmelde-Link: #/login?server=…&user=…   (alter Weg: #/join/SCHLÜSSEL)

import { pageHead } from '../components.js';
import { icon, toast } from '../ui.js';
import { esc } from '../utils.js';
import { srv, loggedIn, account, redeemCode, loginPassword, parseServerInput, serverUrl } from '../sync.js';
import { deviceGuess } from '../group.js';
import { fighterFx } from '../fighter.js';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iPhone|iPad/.test(navigator.userAgent);

function already() {
  return { html: `${pageHead('Anmeldung', { back: '#/' })}<section class="card join-card">
    <p>Dieses Gerät ist bereits als <b>${esc(account().user?.name || '')}</b> angemeldet.</p>
    <a class="btn primary block" href="#/arena">Zur Arena</a></section>` };
}

// Benutzername + Passwort
export function loginView({ server = '', user = '' }) {
  if (loggedIn()) return already();
  const srvAddr = server || serverUrl();
  const sameOrigin = !srvAddr && srv.available;
  const iosHint = isIOS() && !isStandalone() ? `<div class="card hint">
      <div class="card-title">${icon('download')} Erst installieren</div>
      <p>Auf dem iPhone hat die installierte App einen eigenen Speicher. Tippe in Safari auf <b>Teilen</b> ${icon('share', 'xs')} → <b>„Zum Home-Bildschirm“</b>, öffne die App und melde dich dort unter <b>Profil → Gruppe</b> an${srvAddr ? ' – mit dieser Server-Adresse' : ''}:</p>
      ${srvAddr ? `<div class="key-box sm"><b>${esc(srvAddr)}</b></div><button class="btn ghost block sm" data-copysrv>${icon('copy', 'xs')} Server-Adresse kopieren</button>` : ''}
      <p class="footnote">Du kannst dich auch direkt hier im Browser anmelden – dann aber nur im Browser.</p>
    </div>` : '';
  const html = `
    ${pageHead('Anmeldung')}
    <section class="card join-card">
      <div class="join-fig">${fighterFx(3, { enter: true })}</div>
      <h3>${esc(srv.info?.group || 'Gym-Gruppe')}</h3>
      <p>Melde dich mit den Zugangsdaten von deinem Gruppen-Admin an. Pro Gerät nur einmal – danach bleibst du angemeldet.</p>
      <form data-login>
        ${sameOrigin ? '' : `<label class="field"><span>Server-Adresse</span><input name="server" value="${esc(srvAddr)}" placeholder="https://gym.example.de" autocomplete="off" autocapitalize="none" inputmode="url"></label>`}
        <label class="field"><span>Benutzername</span><input name="username" value="${esc(user)}" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span>Passwort</span><input name="password" type="password" autocomplete="current-password"></label>
        <label class="field"><span>Name dieses Geräts</span><input name="device" value="${esc(deviceGuess())}" autocomplete="off"></label>
        <button class="btn primary block lg" type="submit">Anmelden</button>
      </form>
    </section>
    ${iosHint}`;
  return {
    html,
    mount: (root) => {
      root.querySelector('[data-copysrv]')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(srvAddr); toast('Kopiert'); } catch { toast('Kopieren nicht möglich'); }
      });
      root.querySelector('[data-login]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const btn = f.querySelector('button');
        const p = f.elements.server ? parseServerInput(f.elements.server.value) : { server: '' };
        if (f.elements.server && !p.server) return toast('Bitte die Server-Adresse angeben');
        btn.disabled = true;
        try {
          const r = await loginPassword(p.server, f.elements.username.value.trim(), f.elements.password.value, f.elements.device.value);
          toast(`Willkommen, ${r.user.name}!`);
          location.hash = '#/arena';
        } catch (err) { toast(err.message, 4500); btn.disabled = false; }
      });
    },
  };
}

// Alter Weg: Einmal-Schlüssel
export function joinView({ code = '' }) {
  if (loggedIn()) return already();
  const html = `
    ${pageHead('Einladung')}
    <section class="card join-card">
      <div class="join-fig">${fighterFx(3, { enter: true })}</div>
      <h3>${esc(srv.info?.group || 'Gym-Gruppe')}</h3>
      <p>Melde dieses Gerät mit deinem Einmal-Schlüssel an.</p>
      <form data-join>
        <label class="field"><span>Schlüssel</span><input name="code" value="${esc(code)}" autocomplete="off" autocapitalize="characters"></label>
        <label class="field"><span>Name dieses Geräts</span><input name="device" value="${esc(deviceGuess())}" autocomplete="off"></label>
        <button class="btn primary block lg" type="submit">Anmelden</button>
      </form>
    </section>`;
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
