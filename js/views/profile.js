import { state, saveSettings, wipe } from '../store.js';
import { idx, weekStreaks } from '../stats.js';
import { pageHead } from '../components.js';
import { icon, formDialog, confirmDialog, toast, sheet } from '../ui.js';
import { esc, num, fmtVolume, fmtDate, fmtClock, fmtRelDay, DAY, sum } from '../utils.js';
import { importCSVFlow, exportCSV, exportBackup, restoreBackup, routinesFromHistory } from '../actions.js';
import { APP_VERSION } from '../version.js';
import { applyTheme } from '../theme.js';
import { profileStats } from '../gamification.js';
import { fighterSVG } from '../fighter.js';
import { openAvatarEditor } from '../avatar.js';
import { openBodyweight } from '../bwEditor.js';
import { bwLog } from '../body.js';
import { groupSection, groupHandlers } from '../group.js';
import { loggedIn, resetCursor } from '../sync.js';

let persisted = null;

export function profileView() {
  const s = state.settings;
  const { asc, wStats, ex } = idx();
  const st = weekStreaks();
  const totalVol = sum(asc, (w) => wStats.get(w.id).volume);
  const totalH = sum(asc, (w) => wStats.get(w.id).duration) / 3600;
  const backupAge = s.lastBackup ? (Date.now() - s.lastBackup) / DAY : Infinity;
  const backupWarn = state.workouts.length && backupAge > 14;

  const row = (act, ic, label, value = '', danger = false) => `<button class="set-item ${danger ? 'danger' : ''}" data-act="${act}">
    <span class="si-ic">${icon(ic)}</span><span class="si-l">${esc(label)}</span><span class="si-v">${value}</span>${icon('right', 'muted')}</button>`;
  const toggle = (key, ic, label) => `<label class="set-item">
    <span class="si-ic">${icon(ic)}</span><span class="si-l">${esc(label)}</span>
    <input type="checkbox" class="switch" data-toggle="${key}" ${s[key] ? 'checked' : ''}></label>`;

  const html = `
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

    ${groupSection(row)}

    ${backupWarn && !loggedIn() ? `<div class="card warn-card">${icon('info')}<div><b>Backup empfohlen</b><small>${s.lastBackup ? `Letztes Backup ${esc(fmtRelDay(s.lastBackup))}` : 'Noch kein Backup erstellt'}. Deine Daten liegen nur auf diesem Gerät.</small></div><button class="btn primary sm" data-act="backup">Sichern</button></div>` : ''}

    <div class="list-label">Darstellung</div>
    <div class="seg" role="radiogroup">
      ${[['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'System']].map(([v, l]) => `<button class="seg-btn ${s.theme === v ? 'on' : ''}" data-theme-set="${v}">${l}</button>`).join('')}
    </div>

    <div class="list-label">Motivation & AI</div>
    <div class="set-group">
      <a class="set-item" href="#/badges"><span class="si-ic">${icon('medal')}</span><span class="si-l">Level & Abzeichen</span><span class="si-v">Lvl ${profileStats().level}</span>${icon('right', 'muted')}</a>
      ${toggle('aiMode', 'bolt', 'AI-Mode (Vorschläge & Analyse)')}
      ${toggle('introAnim', 'flame', 'Start-Animation beim Öffnen')}
      ${toggle('prEffects', 'trophy', 'PR-Animation & Feuer-Satz')}
      ${toggle('prSound', 'flame', 'Power-up-Sound bei PR')}
      ${toggle('voice', 'info', 'Sprachansagen (Cardio/Mobility)')}
      ${row('hr', 'target', 'Max. Herzfrequenz', s.hrMax ? `${s.hrMax} bpm` : 'nicht gesetzt')}
    </div>

    <div class="list-label">Training</div>
    <div class="set-group">
      ${row('bw', 'weight', 'Körpergewicht', s.bodyweight ? `${num(s.bodyweight, 1)} kg${bwLog().filter((e) => e.t).length > 1 ? ` · ${bwLog().filter((e) => e.t).length} Einträge` : ''}` : 'nicht gesetzt')}
      ${row('rest', 'timer', 'Standard-Pausenzeit', s.restDefault ? fmtClock(s.restDefault) : 'Aus')}
      ${row('goal', 'target', 'Wochenziel', `${s.weekGoal} Workouts`)}
      ${toggle('countWarmups', 'flame', 'Aufwärmsätze ins Volumen')}
      ${toggle('keepAwake', 'bolt', 'Bildschirm während Workout an')}
      ${toggle('restSound', 'clock', 'Ton nach Pause')}
    </div>
    <p class="footnote">Das Körpergewicht wird für Klimmzüge, Dips & Co. zum Zusatzgewicht addiert und für die Kraft relativ zum Körpergewicht (× KG) genutzt.</p>

    <div class="list-label">Daten</div>
    <div class="set-group">
      ${row('import', 'upload', 'CSV importieren')}
      ${row('export', 'download', 'Als CSV exportieren')}
      ${row('backup', 'share', 'Backup erstellen (JSON)', s.lastBackup ? esc(fmtRelDay(s.lastBackup)) : '')}
      ${row('restore', 'repeat', 'Backup wiederherstellen')}
      ${row('routines', 'layers', 'Routinen aus Verlauf erstellen')}
    </div>
    <div class="list-label">Gefahrenzone</div>
    <div class="set-group">${row('wipe', 'trash', 'Alle Daten löschen', '', true)}</div>

    <div class="list-label">Über</div>
    <div class="card about">
      <p><b>GymLog</b> v${APP_VERSION} · ${loggedIn() ? 'läuft offline und gleicht sich mit dem Server deiner Gruppe ab.' : 'läuft komplett offline, alle Daten bleiben auf deinem Gerät.'}</p>
      <p class="footnote" data-persist>Speicher wird geprüft…</p>
    </div>
  `;

  return {
    html,
    mount: async (root) => {
      root.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => saveSettings({ [el.dataset.toggle]: el.checked })));
      root.querySelectorAll('[data-theme-set]').forEach((el) => el.addEventListener('click', () => { applyTheme(el.dataset.themeSet); saveSettings({ theme: el.dataset.themeSet }); }));
      const p = root.querySelector('[data-persist]');
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
