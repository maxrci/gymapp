// Verwaltung über die Kommandozeile
//   node server/cli.js admin "Name" [benutzer] [passwort]   Admin anlegen
//   node server/cli.js add "Name" [benutzer] [passwort]     Mitglied anlegen
//   node server/cli.js passwd <benutzer> [passwort]         Passwort neu setzen
//   node server/cli.js users                                alle Nutzer anzeigen
//   node server/cli.js backup [Datei]                       Datenbank-Sicherung schreiben
// Ohne Passwort wird ein gut lesbares Zufallspasswort erzeugt (z. B. „kraft-tiger-4827“).

import { config } from './server.js';
import { defaultGroupId, adminAddMember } from './groups.js';
import { openDb } from './db.js';
import { newId, normUser, hashPassword, newPassword, createInvite, INVITE_DAYS } from './auth.js';

const cfg = config();
const D = openDb(cfg.dataDir);
const [cmd, ...args] = process.argv.slice(2);
const server = (cfg.publicUrl || 'https://DEINE-SERVER-ADRESSE').replace(/\/$/, '');
const app = (cfg.appUrl || server).replace(/\/$/, '');

function printAccess(user, username, password) {
  const link = `${app}/#/login?${new URLSearchParams({ ...(app !== server ? { server } : {}), user: username })}`;
  console.log(`\nName:          ${user.name}${user.role === 'admin' ? ' (Admin)' : ''}`);
  console.log(`Benutzername:  ${username}`);
  console.log(`Passwort:      ${password}`);
  console.log(`Server:        ${server}`);
  console.log(`App-Link:      ${link}\n`);
  if (!cfg.publicUrl) console.log('Tipp: PUBLIC_URL (und APP_URL, falls die App von GitHub kommt) setzen, dann stimmen Server und Link.\n');
  warnUrl();
}
// Häufiger Fehler: Freischalt-Link von Tailscale statt der eigentlichen .ts.net-Adresse
function warnUrl() {
  if (/login\.tailscale\.com/i.test(cfg.publicUrl)) {
    console.log('ACHTUNG: PUBLIC_URL ist der Tailscale-Link zum Freischalten von Funnel, nicht die Server-Adresse.');
    console.log('  1. Den Link im Browser öffnen und Funnel erlauben');
    console.log('  2. sudo tailscale funnel --bg 8080   und dann   tailscale funnel status');
    console.log('  3. Die https://…ts.net-Adresse in /etc/gym.env als PUBLIC_URL eintragen, sudo systemctl restart gym\n');
  }
}
const die = (m) => { console.error(m); D.close(); process.exit(1); };
const findUser = (u) => D.get('SELECT * FROM users WHERE username = ?', normUser(u)) || D.get('SELECT * FROM users WHERE lower(name) = lower(?)', u) || die(`Kein Nutzer „${u}“ gefunden.`);

switch (cmd) {
  case 'admin':
  case 'add': {
    const [name, uname, pw] = args;
    if (!name) die('Name fehlt, z. B.: node server/cli.js admin "Max" max');
    const username = normUser(uname || name);
    if (username.length < 2) die('Benutzername zu kurz.');
    if (D.get('SELECT 1 FROM users WHERE username = ?', username)) die(`Benutzername „${username}“ ist schon vergeben.`);
    const password = pw || newPassword();
    if (password.length < 6) die('Passwort zu kurz (mind. 6 Zeichen).');
    const user = { id: newId(), name, role: cmd === 'admin' ? 'admin' : 'member' };
    D.run('INSERT INTO users (id, name, role, created, username, pw_hash) VALUES (?, ?, ?, ?, ?, ?)', user.id, user.name, user.role, Date.now(), username, hashPassword(password));
    // in die erste Gruppe des Servers aufnehmen (gibt es noch keine, entsteht sie beim nächsten Serverstart)
    const gid = defaultGroupId(D);
    if (gid) adminAddMember(D, gid, user.id);
    printAccess(user, username, password);
    break;
  }
  case 'passwd': {
    const [uname, pw] = args;
    if (!uname) die('Benutzername fehlt, z. B.: node server/cli.js passwd lisa');
    const u = findUser(uname);
    const username = u.username || normUser(u.name);
    const password = pw || newPassword();
    if (password.length < 6) die('Passwort zu kurz (mind. 6 Zeichen).');
    D.run('UPDATE users SET pw_hash = ?, username = ? WHERE id = ?', hashPassword(password), username, u.id);
    printAccess(u, username, password);
    break;
  }
  case 'key': { // alter Weg: Einmal-Schlüssel (funktioniert weiterhin)
    const u = findUser(args.join(' '));
    const inv = createInvite(D, u.id);
    console.log(`\nSchlüssel für ${u.name}: ${inv.code} (einmal gültig, ${INVITE_DAYS} Tage)\n${server}/#/join/${inv.code}\n`);
    break;
  }
  case 'countfrom': { // EP zählen erst ab Datum (ältere Workouts nur privat), z. B. countfrom max 2026-11-19
    const [uname, day] = args;
    if (!uname || !day) die('Aufruf: node server/cli.js countfrom BENUTZERNAME JJJJ-MM-TT   (0 = alles)');
    const u = findUser(uname);
    const t = day === '0' ? 0 : new Date(`${day}T00:00:00`).getTime();
    if (day !== '0' && !Number.isFinite(t)) die('Datum bitte als JJJJ-MM-TT angeben.');
    D.run('UPDATE users SET count_from = ? WHERE id = ?', t, u.id);
    console.log(t ? `EP für ${u.name} zählen ab ${new Date(t).toLocaleDateString('de-DE')}. Ältere Workouts bleiben privat sichtbar.` : `EP für ${u.name}: alle in der App getrackten Workouts zählen.`);
    break;
  }
  case 'users': {
    const rows = D.all(`SELECT u.name, u.username, u.role, u.disabled, u.pw_hash IS NOT NULL AS pw, (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS devices,
      (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id AND i.kind = 'workout' AND i.deleted = 0) AS workouts FROM users u ORDER BY u.created`);
    if (!rows.length) console.log('Noch keine Nutzer.');
    for (const r of rows) console.log(`${r.name.padEnd(20)} ${(r.username || '–').padEnd(16)} ${r.role.padEnd(7)} ${String(r.devices).padStart(2)} Geräte  ${String(r.workouts).padStart(5)} Workouts${r.pw ? '' : '  (kein Passwort)'}${r.disabled ? '  (gesperrt)' : ''}`);
    break;
  }
  case 'backup': {
    const file = args[0] || `gymlog-backup-${new Date().toISOString().slice(0, 10)}.db`;
    D.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    console.log(`Sicherung geschrieben: ${file}`);
    break;
  }
  default:
    console.log('Befehle:\n  admin "Name" [benutzer] [passwort]\n  add "Name" [benutzer] [passwort]\n  passwd <benutzer> [passwort]\n  users\n  backup [Datei]');
}
D.close();
