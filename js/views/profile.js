import { state, saveSettings, wipe } from '../store.js';
import { idx, weekStreaks } from '../stats.js';
import { pageHead } from '../components.js';
import { icon, formDialog, confirmDialog, toast, sheet } from '../ui.js';
import { esc, num, fmtVolume, fmtDate, fmtClock, fmtRelDay, DAY, sum } from '../utils.js';
import { importCSVFlow, exportCSV, exportBackup, restoreBackup, routinesFromHistory } from '../actions.js';
import { APP_VERSION } from '../version.js';

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
      <div class="avatar-lg">${icon('user')}</div>
      <div class="pc-stats">
        <div><b>${num(asc.length, 0)}</b><small>Workouts</small></div>
        <div><b>${fmtVolume(totalVol)}</b><small>Volumen</small></div>
        <div><b>${num(totalH, 0)} h</b><small>Training</small></div>
      </div>
      ${asc.length ? `<p class="footnote center">Dabei seit ${esc(fmtDate(asc[0].start, { month: 'long', year: 'numeric' }))} · ${st.days} Trainingstage · ${ex.size} Übungen</p>` : ''}
    </section>

    ${backupWarn ? `<div class="card warn-card">${icon('info')}<div><b>Backup empfohlen</b><small>${s.lastBackup ? `Letztes Backup ${esc(fmtRelDay(s.lastBackup))}` : 'Noch kein Backup erstellt'}. Deine Daten liegen nur auf diesem Gerät.</small></div><button class="btn primary sm" data-act="backup">Sichern</button></div>` : ''}

    <div class="list-label">Training</div>
    <div class="set-group">
      ${row('bw', 'weight', 'Körpergewicht', s.bodyweight ? `${num(s.bodyweight, 1)} kg` : 'nicht gesetzt')}
      ${row('rest', 'timer', 'Standard-Pausenzeit', s.restDefault ? fmtClock(s.restDefault) : 'Aus')}
      ${row('goal', 'target', 'Wochenziel', `${s.weekGoal} Workouts`)}
      ${toggle('countWarmups', 'flame', 'Aufwärmsätze ins Volumen')}
      ${toggle('keepAwake', 'bolt', 'Bildschirm während Workout an')}
      ${toggle('restSound', 'clock', 'Ton nach Pause')}
    </div>
    <p class="footnote">Das Körpergewicht wird für Klimmzüge, Dips & Co. zum Zusatzgewicht addiert (1RM und Volumen).</p>

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
      <p><b>GymLog</b> v${APP_VERSION} · läuft komplett offline, alle Daten bleiben auf deinem Gerät.</p>
      <p class="footnote" data-persist>Speicher wird geprüft…</p>
    </div>
  `;

  return {
    html,
    mount: async (root) => {
      root.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => saveSettings({ [el.dataset.toggle]: el.checked })));
      const p = root.querySelector('[data-persist]');
      try {
        if (persisted === null && navigator.storage?.persisted) persisted = await navigator.storage.persisted();
        const est = await navigator.storage?.estimate?.();
        p.textContent = `${persisted ? '✓ Dauerhafter Speicher aktiv' : 'Speicher: Standard'}${est ? ` · ${num(est.usage / 1048576, 1)} MB belegt` : ''}`;
      } catch { p.textContent = ''; }
    },
    handlers: {
      import: importCSVFlow,
      export: exportCSV,
      backup: exportBackup,
      restore: restoreBackup,
      routines: routinesFromHistory,
      bw: async () => {
        const r = await formDialog({ title: 'Körpergewicht', fields: [{ name: 'v', label: 'Gewicht in kg (leer = aus)', type: 'text', inputmode: 'decimal', value: s.bodyweight ?? '' }] });
        if (!r) return;
        const v = parseFloat(String(r.v).replace(',', '.'));
        await saveSettings({ bodyweight: isNaN(v) || v <= 0 ? null : v });
      },
      rest: async () => {
        const v = await sheet({ title: 'Standard-Pausenzeit', options: [0, 30, 60, 90, 120, 150, 180, 240, 300].map((x) => ({ label: x ? fmtClock(x) : 'Aus', value: String(x), active: x === s.restDefault })) });
        if (v != null) await saveSettings({ restDefault: +v });
      },
      goal: async () => {
        const v = await sheet({ title: 'Workouts pro Woche', options: [1, 2, 3, 4, 5, 6, 7].map((x) => ({ label: `${x}`, value: String(x), active: x === s.weekGoal })) });
        if (v) await saveSettings({ weekGoal: +v });
      },
      wipe: async () => {
        if (!(await confirmDialog('Alle Workouts, Routinen und Einstellungen werden unwiderruflich gelöscht. Erstelle vorher ein Backup!', 'Alles löschen', true))) return;
        if (!(await confirmDialog('Wirklich sicher?', 'Ja, endgültig löschen', true))) return;
        await wipe();
        toast('Alle Daten gelöscht');
      },
    },
  };
}
