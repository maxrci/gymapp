// Onboarding: erklärt beim ersten Öffnen die Funktionen. Überspringbar, jederzeit im Profil erneut aufrufbar.

import { state, saveSettings } from './store.js';
import { icon } from './ui.js';
import { esc, num } from './utils.js';
import { fighterSVG, fighterFx } from './fighter.js';
import { mountPose } from './poses.js';
import { STAGES } from './gamification.js';

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let openEl = null;

const bars = `<svg class="onb-chart" viewBox="0 0 200 120" aria-hidden="true">
  ${[38, 62, 48, 80, 70, 96, 88].map((h, i) => `<rect x="${14 + i * 26}" y="${108 - h}" width="16" height="${h}" rx="4" style="animation-delay:${i * 70}ms"/>`).join('')}
  <path d="M14 74 L40 60 L66 66 L92 44 L118 50 L144 26 L170 32" class="onb-line"/>
</svg>`;

function slides() {
  const s = state.settings;
  return [
    {
      key: 'hello', cls: 'hello',
      fig: () => `<div class="onb-fx">${fighterFx(3, { enter: true, powerUp: true })}</div>`,
      title: 'Willkommen im Gym',
      text: 'Dein Trainingstagebuch mit einem Kämpfer, der mit dir stärker wird. Alles läuft offline auf deinem Handy – ohne Konto, ohne Werbung.',
      bullets: [['dumbbell', 'Workouts, Cardio & Mobility tracken'], ['flame', 'Streak halten und deinen Kämpfer verwandeln'], ['trophy', 'Mit Freunden in der Arena antreten']],
    },
    {
      key: 'train', cls: 'train',
      fig: () => '<div class="onb-poses"><div data-pose="ohp" class="p-gym"></div><div data-pose="sprint" class="p-cardio"></div><div data-pose="splits" class="p-mob"></div></div>',
      title: 'Training',
      text: 'Unter „Training“ startest du eine Routine oder ein leeres Workout. Sätze abhaken, der Pausen-Timer läuft automatisch.',
      bullets: [['dumbbell', '<b>Gym:</b> Routinen, Vorschläge aus deinem letzten Mal, Rekord-Erkennung'], ['bolt', '<b>Cardio:</b> frei eintragen, geführte Intervalle oder eigene Einheiten bauen'], ['repeat', '<b>Mobility & Pilates:</b> geführte Routinen oder einfach die Dauer eintragen'], ['calendar', 'Vergessen? Workouts lassen sich auch nachtragen']],
    },
    {
      key: 'streak', cls: 'streak',
      fig: () => `<div class="onb-stages">${[0, 3, 5, 7].map((i) => `<div class="onb-st"><div>${fighterSVG(i, { powerUp: i >= 3 })}</div><small>${esc(STAGES[i].name)}</small></div>`).join('')}</div>`,
      title: 'Streak & Kämpfer',
      text: 'Erreiche dein Wochenziel, dann wächst deine Streak. Je länger sie hält, desto stärker verwandelt sich dein Kämpfer – 8 Stufen bis „Unaufhaltsam“.',
      bullets: [['star', 'EP & Level für Workouts, Sätze, Rekorde sowie 2 EP pro Cardio- und Pilates-Minute'], ['volume', 'Neuer Rekord? Dann gibt’s Power-up und Rekord-Sound']],
      extra: () => `<div class="onb-actions"><button class="btn ghost" data-avatar>${icon('edit', 'xs')} Kämpfer anpassen</button></div>
        <p class="onb-hint">Dein Wochenziel stellst du jederzeit unter Profil → Wochenziel ein.</p>`,
    },
    {
      key: 'stats', cls: 'stats',
      fig: () => bars,
      title: 'Statistik',
      text: 'Sieh, wie du dich entwickelst – von der Woche bis zu allen Jahren.',
      bullets: [['chart', 'Volumen, Kraft-Trends, Rekorde und Kalender'], ['user', 'Kraft im Verhältnis zum Körpergewicht (× KG)'], ['list', 'Jede Übung mit Verlauf, Bestwerten und Wiederholungs-Maxima']],
      extra: () => `<div class="onb-q"><b>Dein Körpergewicht <small>(optional, für × KG)</small></b>
        <div class="onb-bw"><input data-bw inputmode="decimal" placeholder="z. B. 80" value="${s.bodyweight ? num(s.bodyweight, 1) : ''}"><span>kg</span></div></div>`,
    },
    {
      key: 'arena', cls: 'arena',
      fig: () => `<div class="onb-duel"><div>${fighterSVG(4, { powerUp: true })}</div><i>VS</i><div class="flip">${fighterSVG(5, { powerUp: true, look: { sex: 'f', hair: 'lila', outfit: 'gi', color: 'pink', face: 'happy' } })}</div></div>`,
      title: 'Arena',
      text: 'Tritt mit Freunden an: Eine Saison dauert ein Jahr, jeden Monat gibt es einen Monatssieger.',
      bullets: [['trophy', '<b>Könige:</b> Workout, Cardio und Mobility – mit Rennen, Kraft- und Dehn-Duellen'], ['bolt', 'Kämpfe in jeder Disziplin und Übung – wer bessere Werte hat, gewinnt'], ['users', 'Challenges erstellen und Freunde einladen'], ['info', 'Ohne Gruppe kannst du alles mit 2 Demo-Gegnern ausprobieren']],
    },
    {
      key: 'data', cls: 'data',
      fig: () => `<div class="onb-data">${icon('download')}${icon('users')}${icon('sync')}</div>`,
      title: 'Deine Daten',
      text: 'Alles bleibt auf deinem Gerät. Unter „Profil“ kannst du Daten importieren, Backups erstellen und dich bei einer Gruppe anmelden.',
      bullets: [['upload', 'CSV-Import aus anderen Tracking-Apps'], ['share', 'Backups als Datei'], ['key', 'Gruppe: Benutzername & Passwort bekommst du von deinem Admin']],
      extra: () => `<div class="onb-actions"><button class="btn ghost" data-import>${icon('upload', 'xs')} CSV importieren</button><button class="btn ghost" data-login>${icon('key', 'xs')} Bei Gruppe anmelden</button></div>`,
    },
    {
      key: 'strava', cls: 'strava',
      fig: () => `<div class="onb-strava"><span class="o-gm">${icon('watch')}</span><span class="o-st">${icon('bolt')}</span><i>${icon('right')}</i><span class="o-gym">${icon('dumbbell')}</span></div>`,
      title: 'Garmin & Strava verbinden',
      text: 'Läufe, Radtouren & Co. von deiner Garmin-Uhr oder aus Strava landen automatisch in Gym – mit Distanz und Zeit, und sie zählen auch in der Arena.',
      bullets: [['watch', '<b>Garmin:</b> In Garmin Connect unter Einstellungen → Personal API einen Schlüssel erstellen und in Gym einfügen – fertig'], ['bolt', '<b>Strava:</b> Bei Strava eine eigene API-App anlegen, Client-ID und Secret eintragen, einmal anmelden'], ['edit', 'Beides unter Profil → Verbindungen – die App führt dich durch jeden Schritt'], ['info', 'Braucht eine Gruppen-Anmeldung. Strava-Aktivitäten zählen in der Arena nur als EP – sehen kann sie nur du.']],
    },
  ];
}

export function shouldOnboard() { return !state.settings.onboarded; }

export function showOnboarding({ start = 0 } = {}) {
  if (openEl) return;
  const list = slides();
  let i = Math.max(0, Math.min(list.length - 1, start));
  let anims = [];
  const o = document.createElement('div');
  o.className = 'onb';
  openEl = o;
  document.body.appendChild(o);
  requestAnimationFrame(() => o.classList.add('open'));

  const stopAnims = () => { anims.forEach((a) => a.stop()); anims = []; };
  const draw = (dir = 0) => {
    stopAnims();
    const x = list[i];
    const last = i === list.length - 1;
    o.innerHTML = `
      <div class="onb-top"><span class="onb-step">${i + 1} / ${list.length}</span><button class="onb-skip" data-skip>${last ? '' : 'Überspringen'}</button></div>
      <div class="onb-slide s-${x.cls} ${dir > 0 ? 'in-r' : dir < 0 ? 'in-l' : ''}">
        <div class="onb-fig">${x.fig()}</div>
        <h2>${esc(x.title)}</h2>
        <p class="onb-text">${esc(x.text)}</p>
        <ul class="onb-list">${x.bullets.map(([ic, t]) => `<li><span>${icon(ic)}</span><div>${t}</div></li>`).join('')}</ul>
        ${x.extra ? x.extra() : ''}
      </div>
      <div class="onb-bottom">
        <div class="onb-dots">${list.map((_, k) => `<i class="${k === i ? 'on' : ''}" data-dot="${k}"></i>`).join('')}</div>
        <div class="onb-nav">
          ${i ? `<button class="btn ghost" data-prev>${icon('left', 'xs')} Zurück</button>` : '<span></span>'}
          <button class="btn primary" data-next>${last ? 'Los geht’s!' : `Weiter ${icon('right', 'xs')}`}</button>
        </div>
      </div>`;
    o.querySelectorAll('[data-pose]').forEach((h) => anims.push(mountPose(h, h.dataset.pose, { stage: 3, speed: reduce() ? 0 : 0.9 })));
  };
  const go = (n) => { const d = n > i ? 1 : -1; i = Math.max(0, Math.min(list.length - 1, n)); draw(d); };
  const finish = async () => {
    const bw = o.querySelector('[data-bw]');
    if (bw) await saveBw(bw.value);
    stopAnims();
    openEl = null;
    o.classList.remove('open');
    setTimeout(() => o.remove(), 300);
    if (!state.settings.onboarded) await saveSettings({ onboarded: Date.now() });
  };
  const saveBw = async (v) => {
    const kg = parseFloat(String(v).replace(',', '.'));
    if (kg > 25 && kg < 350 && kg !== state.settings.bodyweight) {
      const { addBodyweight } = await import('./body.js');
      await addBodyweight(kg);
    }
  };
  draw();

  o.addEventListener('click', async (e) => {
    const t = (sel) => e.target.closest(sel);
    if (t('[data-skip]')) return finish();
    if (t('[data-next]')) {
      const bw = o.querySelector('[data-bw]');
      if (bw) await saveBw(bw.value);
      return i === list.length - 1 ? finish() : go(i + 1);
    }
    if (t('[data-prev]')) return go(i - 1);
    const dot = t('[data-dot]');
    if (dot) return go(+dot.dataset.dot);
    const g = t('[data-goal]');
    if (g) {
      await saveSettings({ weekGoal: +g.dataset.goal });
      o.querySelectorAll('[data-goal]').forEach((b) => b.classList.toggle('on', b === g));
      return;
    }
    if (t('[data-avatar]')) { const { openAvatarEditor } = await import('./avatar.js'); return openAvatarEditor({ above: true, onClose: () => draw() }); }
    if (t('[data-import]')) { await finish(); const { importCSVFlow } = await import('./actions.js'); return importCSVFlow(); }
    if (t('[data-login]')) { await finish(); location.hash = '#/profile'; const { loginFlow } = await import('./group.js'); return loginFlow(); }
  });
  // Wischen
  let sx = null, sy = 0;
  o.addEventListener('pointerdown', (e) => { if (e.target.closest('input,button,.chip')) return; sx = e.clientX; sy = e.clientY; });
  o.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(i + (dx < 0 ? 1 : -1));
  });
  o.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'Escape') finish(); });
}
