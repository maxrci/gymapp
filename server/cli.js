// Verwaltung über die Kommandozeile
//   node server/cli.js admin "Name"        ersten Admin anlegen (+ Einmal-Schlüssel)
//   node server/cli.js add "Name"          Mitglied anlegen (+ Einmal-Schlüssel)
//   node server/cli.js key "Name"          neuen Geräte-Schlüssel für vorhandenen Nutzer
//   node server/cli.js users               alle Nutzer anzeigen
//   node server/cli.js backup <Datei>      Datenbank-Sicherung schreiben

import { config } from './server.js';
import { openDb } from './db.js';
import { createInvite, newId, INVITE_DAYS } from './auth.js';

const cfg = config();
const D = openDb(cfg.dataDir);
const [cmd, ...args] = process.argv.slice(2);
const name = args.join(' ').trim();
const base = (cfg.publicUrl || 'https://DEINE-ADRESSE').replace(/\/$/, '');

function printKey(user, inv) {
  console.log(`\nNutzer:     ${user.name}`);
  console.log(`Schlüssel:  ${inv.code}   (einmal gültig, ${INVITE_DAYS} Tage)`);
  console.log(`Link:       ${base}/#/join/${inv.code}\n`);
  if (!cfg.publicUrl) console.log('Tipp: PUBLIC_URL setzen, dann wird der Link vollständig angezeigt.\n');
}

function findUser(n) {
  const u = D.all('SELECT * FROM users WHERE lower(name) = lower(?)', n);
  if (!u.length) { console.error(`Kein Nutzer „${n}“ gefunden.`); process.exit(1); }
  if (u.length > 1) { console.error(`Mehrere Nutzer heißen „${n}“ – bitte in der App verwalten.`); process.exit(1); }
  return u[0];
}

switch (cmd) {
  case 'admin':
  case 'add': {
    if (!name) { console.error('Name fehlt, z. B.: node server/cli.js admin "Max"'); process.exit(1); }
    const user = { id: newId(), name, role: cmd === 'admin' ? 'admin' : 'member' };
    D.run('INSERT INTO users (id, name, role, created) VALUES (?, ?, ?, ?)', user.id, user.name, user.role, Date.now());
    printKey(user, createInvite(D, user.id));
    break;
  }
  case 'key': {
    const user = findUser(name);
    printKey(user, createInvite(D, user.id));
    break;
  }
  case 'users': {
    const rows = D.all(`SELECT u.name, u.role, u.disabled, (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS devices,
      (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id AND i.kind = 'workout' AND i.deleted = 0) AS workouts FROM users u ORDER BY u.created`);
    if (!rows.length) console.log('Noch keine Nutzer.');
    for (const r of rows) console.log(`${r.name.padEnd(24)} ${r.role.padEnd(7)} ${String(r.devices).padStart(2)} Geräte  ${String(r.workouts).padStart(5)} Workouts${r.disabled ? '  (gesperrt)' : ''}`);
    break;
  }
  case 'backup': {
    const file = args[0] || `gymlog-backup-${new Date().toISOString().slice(0, 10)}.db`;
    D.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    console.log(`Sicherung geschrieben: ${file}`);
    break;
  }
  default:
    console.log('Befehle: admin "Name" | add "Name" | key "Name" | users | backup [Datei]');
}
D.close();
