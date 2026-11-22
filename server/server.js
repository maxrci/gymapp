// Gym-Server: liefert die App aus und stellt die Gruppen-API bereit.
// Start: node server/server.js   (Konfiguration über Umgebungsvariablen, siehe server/README.md)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { makeApi } from './api.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function config(env = process.env) {
  return {
    port: Number(env.PORT) || 8080,
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || path.join(here, '..', 'data')),
    appDir: path.resolve(env.APP_DIR || path.join(here, '..')),
    publicUrl: env.PUBLIC_URL || '',
    groupName: env.GROUP_NAME || 'Gym',
    // Wo die App liegt, wenn sie nicht vom Server kommt (z. B. https://name.github.io/gymapp) – für Anmelde-Links
    appUrl: env.APP_URL || '',
    // Von welchen Adressen die App die API aufrufen darf (CORS). Standard: alle (Anmeldung läuft über Token, nicht über Cookies)
    allowedOrigins: (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
    version: (fs.readFileSync(path.join(here, '..', 'js', 'version.js'), 'utf8').match(/'([\d.]+)'/) || [])[1] || '?',
  };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.m4a': 'audio/mp4', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
// Nur diese Pfade werden ausgeliefert (keine Daten, kein Server-Code)
const ALLOWED = /^\/(index\.html|manifest\.webmanifest|sw\.js|selfhost\.html|(css|js|icons|sounds)\/[\w./-]+)$/;

function serveStatic(cfg, req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  if (!ALLOWED.test(p) || p.includes('..')) { res.writeHead(404); return res.end('Nicht gefunden'); }
  const file = path.join(cfg.appDir, p);
  if (!file.startsWith(cfg.appDir + path.sep)) { res.writeHead(404); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Nicht gefunden'); }
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', ETag: etag,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    };
    if (p === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function bodyReader(req, limit = 25 * 1024 * 1024) {
  return () => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Anfrage zu groß'), { type: 'body', status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Ungültiges JSON'), { type: 'body', status: 400 })); }
    });
    req.on('error', reject);
  });
}

export function createServer(cfg = config()) {
  const D = openDb(cfg.dataDir);
  const api = makeApi(D, cfg);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      // CORS: die App darf auch von einer anderen Adresse kommen (z. B. GitHub Pages)
      const origin = req.headers.origin;
      if (origin && (cfg.allowedOrigins.includes('*') || cfg.allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return api(req, res, url, bodyReader(req));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(cfg, req, res, url);
  });
  server.on('close', () => D.close());
  return { server, D, cfg };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, D, cfg } = createServer();
  server.listen(cfg.port, cfg.host, () => {
    const users = D.get('SELECT COUNT(*) AS n FROM users').n;
    console.log(`Gym-Server „${cfg.groupName}“ läuft auf Port ${cfg.port} (Daten: ${cfg.dataDir})`);
    if (/login\.tailscale\.com/i.test(cfg.publicUrl)) console.log('ACHTUNG: PUBLIC_URL ist der Tailscale-Freischalt-Link – bitte die https://…ts.net-Adresse eintragen (tailscale funnel status).');
    if (!users) console.log('Noch keine Nutzer. Ersten Admin anlegen:  node server/cli.js admin "Dein Name"');
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
