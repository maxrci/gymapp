import { state, saveSettings, wipe } from '../store.js';
import { idx, weekStreaks } from '../stats.js';
import { pageHead } from '../components.js';
import { icon, formDialog, confirmDialog, toast, sheet } from '../ui.js';
import { esc, num, fmtVolume, fmtDate, fmtClock, fmtRelDay, DAY, sum } from '../utils.js';
import { importCSVFlow, exportCSV, exportBackup, restoreBackup, routinesFromHistory } from '../actions.js';
import { APP_VERSION } from '../version.js';
import { applyTheme, ACCENTS } from '../theme.js';
import { profileStats } from '../gamification.js';
import { fighterSVG } from '../fighter.js';
import { openAvatarEditor } from '../avatar.js';
import { openBodyweight } from '../bwEditor.js';
import { bwLog } from '../body.js';
import { groupSection, groupHandlers } from '../group.js';
import { loggedIn, resetCursor, account } from '../sync.js';
import { openTickets, ticketBadge } from '../tickets.js';
import { showOnboarding } from '../onboarding.js';
import { testPrSound } from '../fx.js';
import { openCoachSetup } from '../coach/setup.js';
import { openStrava, stravaText } from '../strava.js';

let persisted = null;

export function profileView({ section = '' } = {}) {
  const s = state.settings;
  const { asc, wStats, ex } = idx();
  const st = weekStreaks();
  const totalVol = sum(asc, (w) => wStats.get(w.id).volume);
  const totalH = sum(asc, (w) => wStats.get(w.id).duration) / 3600;
  const backupAge = s.lastBackup ? (Date.now() - s.lastBackup) / DAY : Infinity;
  const backupWarn = state.workouts.length && backupAge > 14;

  const row = (act, ic, label, value = '', danger = false) => `<button class="set-item ${danger ? 'danger' : ''}" data-act="${act}">
    <span class="si-ic">${icon(ic)}</span><span class="si-l">${esc(label)}</span><span class="si-v">${value}</span>${icon('right', 'muted')}</button>`;
  const toggle = (key, ic, label, extra = '') => `<label class="set-item">
    <span class="si-ic">${icon(ic)}</span><span class="si-l">${esc(label)}${extra}</span>
    <input type="checkbox" class="switch" data-toggle="${key}" ${s[key] ? 'checked' : ''}></label>`;

  const link = (sec, ic, label, value = '', sub = '') => `<a class="set-item" href="#/settings/${sec}"><span class="si-ic">${icon(ic)}</span><span class="si-l">${esc(label)}${sub ? `<small class="si-sub">${esc(sub)}</small>` : ''}</span><span class="si-v">${value}</span>${icon('right', 'muted')}</a>`;
  const accentName = (ACCENTS.find(([k]) => k === (s.accent || 'blau')) || ACCENTS[0])[1];

  // Unterseiten der Einstellungen
  const SECTIONS = {
    app: ['App personalisieren', `
      <div class="list-label">Darstellung</div>
      <div class="seg" role="radiogroup">
        ${[['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'System']].map(([v, l]) => `<button class="seg-btn ${s.theme === v ? 'on' : ''}" data-theme-set="${v}">${l}</button>`).join('')}
      </div>
      <div class="list-label">Farbprofil</div>
      <div class="set-group"><div class="accent-row">${ACCENTS.map(([k, l, c]) => `<button class="accent-dot ${(s.accent || 'blau') === k ? 'on' : ''}" style="background:${c};color:${c}" data-accent-set="${k}" aria-label="${esc(l)}">${(s.accent || 'blau') === k ? `<span style="color:#fff">${icon('check')}</span>` : ''}</button>`).join('')}</div></div>
      <div class="list-label">Ablenkung</div>
      <div class="set-group">
        ${toggle('simple', 'eye', 'Simple Mode', '<small class="si-sub">Ohne Avatare, Meister und Animationen – schlicht und funktional</small>')}
        ${s.simple ? '' : toggle('introAnim', 'flame', 'Start-Animation beim Öffnen')}
        ${s.simple ? '' : toggle('prEffects', 'trophy', 'PR-Animation & Feuer-Satz')}
      </div>
      <div class="list-label">Funktionen</div>
      <div class="set-group">
        ${toggle('food', 'heart', 'Ernährung tracken', '<small class="si-sub">Essen erfassen (Barcode, Datenbank, Gerichte), Kalorien und Makros – mit Verbrauch aus deinem Training</small>')}
      </div>
      <div class="list-label">Töne</div>
      <div class="set-group">
        ${toggle('prSound', 'volume', 'Rekord-Sound (Musik-Einspieler)')}
        ${toggle('fightMusic', 'bolt', 'Musik bei Arena-Kämpfen')}
        ${toggle('voice', 'info', 'Sprachansagen (Cardio/Mobility)')}
        ${row('soundtest', 'play', 'Rekord-Sound testen')}
      </div>`],
    training: ['Training', `
      <div class="set-group">
        ${row('bw', 'weight', 'Körpergewicht', s.bodyweight ? `${num(s.bodyweight, 1)} kg${bwLog().filter((e) => e.t).length > 1 ? ` · ${bwLog().filter((e) => e.t).length} Einträge` : ''}` : 'nicht gesetzt')}
        ${row('goal', 'target', 'Wochenziel', `${s.weekGoal} Workouts`)}
        ${row('rest', 'timer', 'Standard-Pausenzeit', s.restDefault ? fmtClock(s.restDefault) : 'Aus')}
        ${row('hr', 'target', 'Max. Herzfrequenz', s.hrMax ? `${s.hrMax} bpm` : 'nicht gesetzt')}
        ${toggle('countWarmups', 'flame', 'Aufwärmsätze ins Volumen')}
        ${toggle('keepAwake', 'bolt', 'Bildschirm während Workout an')}
        ${toggle('restSound', 'clock', 'Ton nach Pause')}
      </div>
      <p class="footnote">Das Körpergewicht wird für Klimmzüge, Dips & Co. zum Zusatzgewicht addiert und für die Kraft relativ zum Körpergewicht (× KG) genutzt.</p>`],
    coach: ['AI-Coach', `
      <div class="set-group">
        ${toggle('aiWorkout', 'bolt', 'AI-Coach Workouts', ' <em class="tag demo">DEMO</em><small class="si-sub">Trainingsplan zu deinem Ziel, Gewichtsvorschläge, Erholung, Balance, Ernährung</small>')}
        ${toggle('aiCardio', 'bolt', 'AI-Coach Cardio', ' <em class="tag demo">DEMO</em><small class="si-sub">Ausdauerplan für Distanz & Zielzeit</small>')}
        ${toggle('aiMobility', 'repeat', 'AI-Coach Mobility', ' <em class="tag demo">DEMO</em><small class="si-sub">Beweglichkeit passend zu deinem Training – z. B. Hüfte nach dem Beintag</small>')}
        ${s.aiWorkout || s.aiCardio || s.aiMobility ? `<a class="set-item" href="#/plan"><span class="si-ic">${icon('calendar')}</span><span class="si-l">Trainingsplan & Ziele</span>${icon('right', 'muted')}</a>` : ''}
      </div>`],
    group: ['Gruppen & Privacy', `
      ${groupSection(row)}
      ${loggedIn() ? '' : `<div class="set-group">${toggle('arenaDemo', 'trophy', 'Arena-Demo mit 2 NPCs')}</div>`}`],
    connect: ['Verbindungen', loggedIn() ? `<div class="set-group">${row('strava', 'bolt', 'Strava', esc(stravaText()))}</div>
      <p class="footnote">Strava-Aktivitäten siehst nur du. In der Arena zählen nur die EP.</p>` : '<p class="footnote">Verbindungen brauchen eine Gruppen-Anmeldung (Gruppen & Privacy).</p>'],
    data: ['Daten & Backup', `
      <div class="set-group">
        ${row('import', 'upload', 'CSV importieren')}
        ${row('export', 'download', 'Als CSV exportieren')}
        ${row('backup', 'share', 'Backup erstellen (JSON)', s.lastBackup ? esc(fmtRelDay(s.lastBackup)) : '')}
        ${row('restore', 'repeat', 'Backup wiederherstellen')}
        ${row('routines', 'layers', 'Routinen aus Verlauf erstellen')}
      </div>
      <div class="list-label">Gefahrenzone</div>
      <div class="set-group">${row('wipe', 'trash', 'Alle Daten löschen', '', true)}</div>`],
    help: ['Hilfe & Feedback', `
      <div class="set-group">
        ${row('onboarding', 'info', 'Einführung ansehen')}
        ${row('tickets', 'note', 'Wünsche & Fehler melden', ticketBadge())}
      </div>
      <div class="list-label">Über</div>
      <div class="card about">
        <p><b>Gym</b> v${APP_VERSION} · ${loggedIn() ? 'läuft offline und gleicht sich mit dem Server deiner Gruppe ab.' : 'läuft komplett offline, alle Daten bleiben auf deinem Gerät.'}</p>
        <p class="footnote" data-persist>Speicher wird geprüft…</p>
      </div>`],
  };
  const sec = SECTIONS[section];
  const html = sec ? `${pageHead(sec[0], { back: '#/profile' })}${sec[1]}` : `
    ${pageHead('Profil')}
    <section class="card profile-card">
      <button class="avatar-fig" data-act="avatar" aria-label="Kämpfer anpassen">${fighterSVG(profileStats().stage.index)}<span>${icon('edit', 'xs')} Anpassen</span></button>
      <div class="pc-stats">
        <div><b>${num(asc.length, 0)}</b><small>Workouts</small></div>
        <div><b>${fmtVolume(totalVol)}</b><small>Volumen</small></div>
        <div><b>${num(totalH, 0)} h</b><small>Training</small></div>
      </div>
      ${asc.length ? `<p class="footnote center">Dabei seit ${esc(fmtDate(asc[0].start, { month: 'long', year: 'numeric' }))} · ${st.days} Trainingstage · ${ex.size} Übungen</p>` : ''}
    </section>

    ${backupWarn && !loggedIn() ? `<div class="card warn-card">${icon('info')}<div><b>Backup empfohlen</b><small>${s.lastBackup ? `Letztes Backup ${esc(fmtRelDay(s.lastBackup))}` : 'Noch kein Backup erstellt'}. Deine Daten liegen nur auf diesem Gerät.</small></div><button class="btn primary sm" data-act="backup">Sichern</button></div>` : ''}

    <div class="set-group">
      <a class="set-item" href="#/badges"><span class="si-ic">${icon('medal')}</span><span class="si-l">Level & Abzeichen</span><span class="si-v">Lvl ${profileStats().level}</span>${icon('right', 'muted')}</a>
      <a class="set-item" href="#/history"><span class="si-ic">${icon('clock')}</span><span class="si-l">Verlauf</span><span class="si-v">${num(asc.length, 0)}</span>${icon('right', 'muted')}</a>
    </div>

    <div class="list-label">Einstellungen</div>
    <div class="set-group set-menu">
      ${link('app', 'eye', 'App personalisieren', `${s.simple ? 'Simple · ' : ''}${esc(accentName)}`, 'Darstellung, Farbprofil, Simple Mode, Töne')}
      ${link('training', 'dumbbell', 'Training', '', 'Körpergewicht, Wochenziel, Pausen')}
      ${link('coach', 'bolt', 'AI-Coach', s.aiWorkout || s.aiCardio || s.aiMobility ? 'an' : 'aus', 'Trainingsplan, Ziele, Ernährung')}
      ${link('group', 'users', 'Gruppen & Privacy', loggedIn() ? esc(account().group || '') : '', loggedIn() ? 'Gruppe, Sichtbarkeit, Abmelden' : 'Bei einer Gruppe anmelden')}
      ${loggedIn() ? link('connect', 'share', 'Verbindungen', esc(stravaText()), 'Strava') : ''}
      ${link('data', 'download', 'Daten & Backup', '', 'Import, Export, Backup')}
      ${link('help', 'info', 'Hilfe & Feedback', ticketBadge(), 'Einführung, Wünsche & Fehler, Version')}
    </div>
  `;

  return {
    html,
    mount: async (root) => {
      root.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', async () => {
        const k = el.dataset.toggle;
        await saveSettings({ [k]: el.checked });
        // AI-Coach eingeschaltet → nach Zielen fragen (überspringbar)
        const kind = k === 'aiWorkout' ? 'workout' : k === 'aiCardio' ? 'cardio' : k === 'aiMobility' ? 'mobility' : null;
        if (kind && el.checked && !state.settings.coach?.[kind]) openCoachSetup(kind);
      }));
      root.querySelectorAll('[data-theme-set]').forEach((el) => el.addEventListener('click', () => { applyTheme(el.dataset.themeSet); saveSettings({ theme: el.dataset.themeSet }); }));
      root.querySelectorAll('[data-accent-set]').forEach((el) => el.addEventListener('click', () => saveSettings({ accent: el.dataset.accentSet })));
      const p = root.querySelector('[data-persist]');
      if (!p) return;
      try {
        if (persisted === null && navigator.storage?.persisted) persisted = await navigator.storage.persisted();
        const est = await navigator.storage?.estimate?.();
        p.textContent = `${persisted ? 'Dauerhafter Speicher aktiv' : 'Speicher: Standard'}${est ? ` · ${num(est.usage / 1048576, 1)} MB belegt` : ''}`;
      } catch { p.textContent = ''; }
    },
    handlers: {
      import: importCSVFlow,
      export: exportCSV,
      backup: exportBackup,
      restore: restoreBackup,
      routines: routinesFromHistory,
      ...groupHandlers,
      bw: () => openBodyweight(),
      tickets: () => openTickets(),
      strava: () => openStrava(),
      onboarding: () => showOnboarding(),
      soundtest: () => {
        if (!testPrSound()) return toast('Audio wird auf diesem Gerät nicht unterstützt');
        if (/iPhone|iPad/.test(navigator.userAgent)) toast('Nichts zu hören? Lautlos-Schalter am iPhone prüfen – im Lautlos-Modus spielt iOS keine App-Sounds ab.', 5000);
      },
      avatar: () => openAvatarEditor(),
      rest: async () => {
        const v = await sheet({ title: 'Standard-Pausenzeit', options: [0, 30, 60, 90, 120, 150, 180, 240, 300].map((x) => ({ label: x ? fmtClock(x) : 'Aus', value: String(x), active: x === s.restDefault })) });
        if (v != null) await saveSettings({ restDefault: +v });
      },
      hr: async () => {
        const r = await formDialog({ title: 'Max. Herzfrequenz', fields: [{ name: 'v', label: 'Schläge pro Minute (Faustregel: 220 − Alter)', inputmode: 'numeric', value: s.hrMax ?? '' }] });
        if (!r) return;
        const v = parseInt(r.v, 10);
        await saveSettings({ hrMax: v > 100 && v < 230 ? v : null });
      },
      goal: async () => {
        const v = await sheet({ title: 'Wochenziel – zählt für deine Streak', options: [1, 2, 3, 4, 5, 6, 7].map((x) => ({ label: `${x}`, value: String(x), active: x === s.weekGoal })) });
        if (v) await saveSettings({ weekGoal: +v });
      },
      wipe: async () => {
        if (!(await confirmDialog(loggedIn() ? 'Alle Daten auf diesem Gerät werden gelöscht. Deine Workouts auf dem Gruppen-Server bleiben erhalten und werden beim nächsten Sync wieder geladen.' : 'Alle Workouts, Routinen und Einstellungen werden unwiderruflich gelöscht. Erstelle vorher ein Backup!', 'Alles löschen', true))) return;
        if (!(await confirmDialog('Wirklich sicher?', 'Ja, endgültig löschen', true))) return;
        await wipe();
        if (loggedIn()) resetCursor();
        toast('Alle Daten gelöscht');
      },
    },
  };
}
