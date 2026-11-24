// Arena: Saison (Fleiß), Ewige Tabelle, Challenges, Mitglieder + Mitglieds-Profil

import { pageHead, emptyState, kpi } from '../components.js';
import { icon, chips, sheet, confirmDialog, toast, overlay } from '../ui.js';
import { esc, num, fmtVolume, fmtDate, fmtRelDay, fmtDurShort, fmtClock } from '../utils.js';
import { fighterSVG, fighterFx, fighterHead } from '../fighter.js';
import { EP_RULES_TEXT } from '../gamification.js';
import { nav } from '../nav.js';
import { cachedGroup, fetchGroup, loggedIn, myId, api, demoOn, srv } from '../sync.js';
import {
  ALLTIME, alltimeValue, CHALLENGE_TYPES, VISIBILITY, STAGE_NAMES, KINGS,
} from '../compete.js';
import { openChallengeEditor } from '../challengeEditor.js';
import { startFight, chooseFight, fightSuggestions, catLabel, fmtCat, kingValue, fmtKing, startKingShowdown } from '../fight.js';
import { exercisesView } from './exercises.js';
import { lineChart, SERIES } from '../charts.js';
import { loginFlow } from '../group.js';

const TABS = [['season', 'Saison'], ['leaders', 'Wer führt?'], ['kings', 'Könige'], ['alltime', 'Ewig'], ['exercises', 'Übungen'], ['challenges', 'Challenges'], ['members', 'Mitglieder']];
const ui = { cat: 'workouts', rel: false, kp: 'season' };
let lastFetch = 0;

const look = (m) => m?.look || {};
const fightBtn = (id) => (id !== myId() ? `<button class="lg-fight" data-fight="${esc(id)}" aria-label="Kampf">${icon('bolt')}</button>` : '');
const head = (m) => `<span class="lg-head">${fighterHead(m?.stage || 0, look(m))}</span>`;
const member = (g, id) => g.members.find((m) => m.id === id);
const nameOf = (g, id) => member(g, id)?.name || 'Unbekannt';
const titleOf = (g, id) => { const t = g.titles?.[id]; return typeof t === 'number' ? { months: t, years: 0 } : t || { months: 0, years: 0 }; };

function refresh(rerender) {
  if (demoOn() || !loggedIn() || Date.now() - lastFetch < 4000) return;
  lastFetch = Date.now();
  fetchGroup().then(() => rerender()).catch(() => {});
}

export function leagueView({ tab = 'season' }) {
  const tabs = `<div class="tabs scroll">${TABS.map(([k, l]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/arena/${k}">${l}</a>`).join('')}</div>`;
  if (tab === 'exercises') {
    const v = exercisesView({ embed: true });
    const g = loggedIn() || demoOn() ? cachedGroup() : null;
    return { ...v, html: `${pageHead(g?.group || 'Arena')}${g?.demo ? demoBanner() : ''}${tabs}${v.html}` };
  }
  if (!loggedIn() && !demoOn()) {
    return {
      html: pageHead('Arena') + tabs + emptyState('users', 'Keine Gruppe', srv.available
        ? 'Melde dich mit deinem persönlichen Schlüssel an, um mit deiner Gruppe in der Arena anzutreten.'
        : 'Für eine Gruppe mit Freunden braucht ihr einen eigenen Server. Die Arena-Demo mit 2 NPCs kannst du im Profil einschalten.',
      srv.available ? '<button class="btn primary" data-act="login">Mit Schlüssel anmelden</button>' : '<a class="btn primary" href="#/profile">Zum Profil</a>'),
      handlers: { login: () => loginFlow() },
    };
  }
  const g = cachedGroup();
  if (!g) {
    return {
      html: pageHead('Arena') + tabs + '<div class="chart-empty" data-gload>Lade Gruppendaten…</div>',
      mount: (root) => fetchGroup().then(() => window.dispatchEvent(new HashChangeEvent('hashchange'))).catch((e) => {
        const el = root.querySelector('[data-gload]');
        if (el) el.outerHTML = `<section class="card err-card"><b>${icon('info', 'xs')} Gruppendaten konnten nicht geladen werden</b><pre>${esc(e.message)}</pre><div class="row-btns"><button class="btn primary sm" data-err-retry>Erneut versuchen</button></div></section>`;
      }),
    };
  }
  const views = { season, leaders, kings, alltime, challenges, members };
  const v = (views[tab] || season)(g);
  return {
    html: `${pageHead(g.group || 'Arena', { sub: `${g.members.length} Mitglieder` })}${g.demo ? demoBanner() : ''}${tabs}${v.html}`,
    mount: (root) => { v.mount?.(root); },
    handlers: { login: () => loginFlow(), ...(v.handlers || {}) },
    clicks: { ...(v.clicks || {}) },
    onShow: refresh,
  };
}

// DEMO-Hinweis
const demoBanner = () => `<div class="card demo-banner"><span class="demo-tag">DEMO</span>
  <div><b>Arena-Demo mit 2 NPCs</b><small>Kai und Mia sind computergesteuert und trainieren passend zu deinen Werten. ${srv.available
    ? 'Du bist noch nicht bei deiner Gruppe angemeldet – sobald du dich anmeldest, siehst du deine echte Gruppe.'
    : 'Für eine echte Gruppe mit Freunden braucht ihr einen eigenen Server. Abschaltbar unter Profil.'}</small>
  ${srv.available ? '<button class="btn primary sm" data-act="login">Mit Schlüssel anmelden</button>' : ''}</div></div>`;

// ---------------- Saison (1 Jahr, Monate einzeln gewinnen) ----------------
const monthName = (ts, long = true) => fmtDate(ts, { month: long ? 'long' : 'short' });
function rankRows(g, rows, me, sub) {
  return rows.map((r, i) => `<a class="lg-row ${r.id === me ? 'me' : ''}" href="#/member/${esc(r.id)}">
    <span class="lg-rank ${i < 3 && r.points ? `m${i + 1}` : ''}">${i + 1}</span>${head(member(g, r.id))}
    <span class="lg-main"><b>${esc(nameOf(g, r.id))}</b><small>${sub(r)}</small></span>
    <span class="lg-val">${num(r.points, 0)}<small>EP</small></span>${fightBtn(r.id)}</a>`).join('');
}
const leagueRules = () => `Eine Saison dauert ein Kalenderjahr, jeden Monat gibt es einen Monatssieger. ${EP_RULES_TEXT()} Strava-Aktivitäten (ab Verbindung) zählen nur als EP – sehen kann sie nur, wer sie gemacht hat.`;
const rowSub = (r) => `${r.workouts} Workouts${r.minutes ? ` · ${r.minutes} Min. Training` : ''} · ${r.goalWeeks} Wochenziele · ${r.prs} Rekorde${r.wins ? ` · ${r.wins} Siege` : ''}${r.ext ? ` · +${num(r.ext, 0)} EP über Strava` : ''}`;

function openRanking(g, which = 'year') {
  const me = myId();
  const o = overlay('', 'rank-view');
  const draw = () => {
    const s = g.season;
    const rows = which === 'year' ? s.rows : (s.month?.rows || []);
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Rangliste</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <div class="seg two"><button class="seg-btn ${which === 'year' ? 'on' : ''}" data-w="year">Saison ${new Date(s.from).getFullYear()}</button><button class="seg-btn ${which === 'month' ? 'on' : ''}" data-w="month">${esc(monthName(s.month?.from || Date.now()))}</button></div>
        <section class="card">${rankRows(g, rows, me, rowSub)}</section>
        <p class="footnote">${esc(leagueRules())}</p>
      </div>`;
  };
  draw();
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const w = e.target.closest('[data-w]');
    if (w) { which = w.dataset.w; return draw(); }
    const f = e.target.closest('[data-fight]');
    if (f) { e.preventDefault(); return chooseFight(g, me, f.dataset.fight); }
    if (e.target.closest('a[href]')) o.close();
  });
}

// Arena-Kampf: zu jedem Freund eine Kategorie, in der er oder sie vorne liegt
function openFightPicker(g) {
  const me = myId();
  const sug = fightSuggestions(g, me);
  const behind = g.members.filter((m) => m.id !== me && !sug.some((x) => x.friend.id === m.id));
  const o = overlay(`
    <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Arena-Kampf</div><span style="width:40px"></span></div>
    <div class="panel-body">
      <p class="footnote">Für jeden Gegner die Disziplin, in der er oder sie ${g.members.length > 2 ? 'in der Gruppe' : ''} vorne liegt – so hat jeder seine Stärke.</p>
      ${sug.map((x, i) => `<button class="card sug-card" data-sug="${i}">
        <span class="sug-fig">${fighterHead(x.friend.stage || 0, look(x.friend))}</span>
        <span class="sug-main"><b>${esc(x.friend.name)}</b><small>${x.how === 'lead' ? 'führt bei' : 'schlägt dich bei'} <em>${esc(catLabel(x.key, x.rel))}</em></small>
        <small class="muted">${esc(fmtCat(x.key, x.vb, x.rel, g, x.friend.id))} gegen deine ${esc(fmtCat(x.key, x.va, x.rel, g, me))}</small></span>
        <span class="sug-go">${icon('bolt')}</span></button>`).join('')}
      ${behind.length ? `<p class="footnote">${esc(behind.map((m) => m.name).join(', '))} ${behind.length > 1 ? 'liegen' : 'liegt'} gerade überall hinter dir.</p>` : ''}
      <button class="btn ghost block" data-own>${icon('target')} Gegner & Disziplin selbst wählen</button>
    </div>`, 'fight-pick');
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const b = e.target.closest('[data-sug]');
    if (b) { const x = sug[+b.dataset.sug]; return startFight(g, me, x.friend.id, x.key, x.rel); }
    if (e.target.closest('[data-own]')) {
      const others = g.members.filter((m) => m.id !== me);
      const id = others.length === 1 ? others[0].id : await sheet({ title: 'Gegner wählen', options: others.map((m) => ({ label: `${m.name} · ${STAGE_NAMES[m.stage]}`, value: m.id, icon: 'user' })) });
      if (id) chooseFight(g, me, id);
    }
  });
}

function season(g) {
  const s = g.season;
  const me = myId();
  const year = new Date(s.from).getFullYear();
  const daysLeft = Math.max(0, Math.ceil((s.to - Date.now()) / 86400000));
  const rows = s.rows;
  const podium = rows.slice(0, 3);
  const order = [1, 0, 2].filter((i) => podium[i]);
  const mon = s.month || { rows: [], from: Date.now() };
  const mTop = mon.rows.filter((r) => r.points > 0);
  const mLeft = Math.max(0, Math.ceil((mon.to - Date.now()) / 86400000));
  const titles = g.members.map((m) => ({ m, t: titleOf(g, m.id) })).filter((x) => x.t.months || x.t.years).sort((a, b) => b.t.years - a.t.years || b.t.months - a.t.months);
  const html = `
    <section class="card season-card tap" data-act="ranking" role="button" tabindex="0">
      <div class="season-top"><div><small>Saison</small><h3>${year}</h3></div><span class="pill">${daysLeft} Tag${daysLeft === 1 ? '' : 'e'} übrig</span></div>
      <div class="podium">${order.map((i) => {
        const r = podium[i]; const m = member(g, r.id);
        return `<div class="pod p${i + 1} ${r.id === me ? 'me' : ''}">
          <div class="pod-fig">${i === 0 ? fighterFx(m?.stage || 0, { look: look(m), enter: nav.entering }) : fighterSVG(m?.stage || 0, { look: look(m) })}</div>
          <b>${esc(m?.name || '')}</b><small>${num(r.points, 0)} EP</small><div class="pod-base">${i + 1}</div></div>`;
      }).join('')}</div>
      <div class="pod-hint">Komplette Rangliste ${icon('right', 'xs')}</div>
    </section>
    ${g.members.length > 1 ? `<button class="btn fight-btn block lg" data-act="fightpick">${icon('bolt')} Arena-Kampf starten</button>` : ''}
    <section class="card">
      <div class="card-title">${icon('calendar')} ${esc(monthName(mon.from))} <small>Monatssieg · noch ${mLeft} Tag${mLeft === 1 ? '' : 'e'}</small></div>
      ${mTop.length ? rankRows(g, mon.rows.slice(0, 3), me, rowSub) : '<p class="footnote">Diesen Monat hat noch niemand gepunktet.</p>'}
      ${mon.rows.length > 3 ? '<button class="link-btn" data-act="rankmonth">Alle anzeigen</button>' : ''}
    </section>
    <section class="card">
      <div class="card-title">${icon('trophy', 'gold')} Monatssieger ${year}</div>
      <div class="month-grid">${(s.months || []).map((x) => `<div class="mg ${x.running ? 'run' : ''} ${x.winners.includes(me) ? 'me' : ''}">
        <small>${esc(monthName(x.from, false))}${x.running ? ' · läuft' : ''}</small>
        ${x.winners.length ? `<span class="lg-head">${fighterHead(member(g, x.winners[0])?.stage || 0, look(member(g, x.winners[0])))}</span><b>${esc(x.winners.map((id) => nameOf(g, id)).join(' & '))}</b><small>${num(x.top[0]?.points || 0, 0)} EP</small>` : '<b class="muted">–</b>'}
      </div>`).join('')}</div>
      <p class="footnote">Das Jahr gewinnt, wer über alle Monate die meisten Punkte holt – nicht, wer die meisten Monate gewinnt.</p>
    </section>
    ${titles.length ? `<section class="card"><div class="card-title">${icon('medal')} Titel</div>
      ${titles.map(({ m, t }) => `<div class="lg-row">${head(m)}<span class="lg-main"><b>${esc(m.name)}</b><small>${t.years ? `${t.years}× Jahressieger · ` : ''}${t.months}× Monatssieger</small></span><span class="lg-val">${t.years ? `${icon('trophy', 'gold')}${t.years}` : t.months}</span></div>`).join('')}
    </section>` : ''}
    ${g.seasons?.length ? `<section class="card"><div class="card-title">Vergangene Saisons</div>
      ${g.seasons.slice(0, 10).map((x) => `<div class="lg-row"><span class="lg-main"><b>Saison ${new Date(x.from).getFullYear()}</b>
        <small>${x.top.map((t, i) => `${i + 1}. ${esc(nameOf(g, t.id))} (${num(t.points, 0)})`).join(' · ')}</small></span>${icon('trophy', 'gold')}</div>`).join('')}
    </section>` : ''}
    <p class="footnote">${esc(leagueRules())}</p>`;
  return {
    html,
    handlers: {
      ranking: () => openRanking(g, 'year'),
      rankmonth: () => openRanking(g, 'month'),
      fightpick: () => openFightPicker(g),
    },
    clicks: { fight: (el) => startFight(g, me, el.dataset.fight, 'season') },
  };
}

// ---------------- Könige ----------------
// ---------- Wer führt? Führende je Bereich + Verlauf aller (Farbe gehört zur Person, nicht zum Rang) ----------
const LEADER_CATS = [
  ['xp', 'EP', 'flame', (v) => `${num(v, 0)} EP`, 'sum'],
  ['workouts', 'Workouts', 'dumbbell', (v) => num(v, 0), 'sum'],
  ['km', 'Cardio-Kilometer', 'bolt', (v) => `${num(v, 1)} km`, 'sum'],
  ['bench', 'Bankdrücken (1RM)', 'weight', (v) => `${num(v, 1)} kg`, 'best'],
  ['squat', 'Kniebeuge (1RM)', 'weight', (v) => `${num(v, 1)} kg`, 'best'],
  ['deadlift', 'Kreuzheben (1RM)', 'weight', (v) => `${num(v, 1)} kg`, 'best'],
  ['ohp', 'Schulterdrücken (1RM)', 'weight', (v) => `${num(v, 1)} kg`, 'best'],
];
function leaders(g) {
  const T = g.trends;
  if (!T) return { html: emptyState('chart', 'Noch keine Verläufe', 'Der Server ist noch auf einer älteren Version.') };
  const color = (id) => SERIES[Math.max(0, g.members.findIndex((m) => m.id === id)) % SERIES.length];
  const seriesOf = (key) => (T[key] || T.lifts?.[key] || {});
  const cards = LEADER_CATS.map(([key, label, ic, fmt, mode]) => {
    const per = seriesOf(key);
    // Monat (Summen) bzw. aktueller Bestwert
    const rows = g.members.map((m) => {
      const arr = per[m.id] || [];
      const v = mode === 'best' ? (arr[arr.length - 1] || 0) : (arr[arr.length - 1] || 0);
      return { m, v };
    }).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    if (!rows.length) return '';
    const lead = rows[0];
    return `<section class="card ld-card">
      <div class="ld-head"><span class="ld-ic">${icon(ic, 'xs')}</span><b>${esc(label)}</b><small>${mode === 'best' ? 'Bestwert' : 'diesen Monat'}</small></div>
      <div class="ld-lead"><div class="ld-fig">${fighterHead(lead.m.stage || 0, look(lead.m))}</div><div><small>Führt</small><b>${esc(lead.m.name)}</b><span>${esc(fmt(lead.v))}</span></div></div>
      <div class="ld-rows">${rows.slice(0, 6).map((r, i) => `<div class="ld-row"><span class="ld-dot" style="background:${color(r.m.id)}"></span><span class="ld-n">${i + 1}. ${esc(r.m.name)}${r.m.id === myId() ? ' (du)' : ''}</span><b>${esc(fmt(r.v))}</b></div>`).join('')}</div>
      <div class="ld-chart" data-ld="${key}"></div>
    </section>`;
  }).join('');
  return {
    html: `<p class="footnote">Wer gerade wo vorne liegt – und wie sich alle in den letzten 12 Monaten entwickelt haben. Es zählt nur, was in der App getrackt wurde.</p>${cards || emptyState('chart', 'Noch keine Daten', 'Sobald trainiert wird, erscheinen hier die Führenden.')}`,
    mount: (root) => {
      for (const host of root.querySelectorAll('[data-ld]')) {
        const key = host.dataset.ld;
        const cat = LEADER_CATS.find(([k]) => k === key);
        const per = seriesOf(key);
        const series = g.members.map((m) => ({
          name: m.name, color: color(m.id),
          points: (per[m.id] || []).map((y, i) => (y == null ? null : { x: T.months[i], y })).filter(Boolean),
        })).filter((s) => s.points.some((p) => p.y > 0));
        if (series.length) lineChart(host, { series, height: 150, yFmt: (v) => cat[3](v), area: false, yZero: cat[4] === 'sum' });
      }
    },
  };
}

function kings(g) {
  const me = myId();
  const per = ui.kp;
  const st = g.kings?.[per] || {};
  const PL = [['month', 'Monat'], ['season', 'Saison'], ['all', 'Ewig']];
  const BTN = { race: 'Rennen starten', lift: 'Kraft-Duell starten', stretch: 'Mobility-Duell starten' };
  const LOW = { race: 'Rentner', lift: 'Plattgedrückt', stretch: 'Steif' };
  const html = `
    <div class="filter-row">${chips(PL, per, 'data-kp')}</div>
    ${KINGS.map((k) => {
      const rows = g.members.map((m) => ({ m, v: kingValue(st[m.id], k.key) })).sort((a, b) => b.v - a.v);
      const top = rows[0]?.v || 0;
      const low = rows.length > 1 && rows[rows.length - 1].v < top ? rows[rows.length - 1].v : null;
      const king = top > 0 ? rows[0].m : null;
      return `<section class="card king-card k-${k.key}">
        <div class="king-top">
          <div class="king-fig">${king ? fighterFx(king.stage || 0, { look: look(king) }) : ''}</div>
          <div class="king-info"><small>${icon(k.icon, 'xs')} ${esc(k.label)}</small><h3>${king ? esc(king.name) : 'Noch offen'}</h3>
            ${king ? `<span>${esc(fmtKing(k.key, st[king.id]))}</span>` : '<span class="muted">Noch keine Einheiten im Zeitraum</span>'}</div>
          <span class="king-crown">${icon('trophy')}</span>
        </div>
        ${rows.map((r, i) => `<div class="lg-row ${r.m.id === me ? 'me' : ''}">
          <span class="lg-rank ${i < 3 && r.v ? `m${i + 1}` : ''}">${i + 1}</span>${head(r.m)}
          <span class="lg-main"><b>${esc(r.m.name)}${low != null && r.v === low ? ` <em class="tag">${LOW[k.anim]}</em>` : ''}</b><div class="bar"><i style="width:${top ? Math.max(r.v ? 3 : 0, (r.v / top) * 100) : 0}%"></i></div></span>
          <span class="lg-val sm">${esc(fmtKing(k.key, st[r.m.id]))}</span></div>`).join('')}
        ${g.members.length > 1 ? `<button class="btn ghost block" data-kshow="${k.key}">${icon(k.icon, 'xs')} ${BTN[k.anim]}</button>` : ''}
        <p class="footnote">${esc(k.desc)}${k.key === 'cardio' ? ' Angezeigt als Kilometer-Äquivalent (so weit wärst du bei 75 kg gelaufen) und Ø-Leistung in Watt.' : ''}</p>
      </section>`;
    }).join('')}`;
  return {
    html,
    clicks: {
      kp: (el, rr) => { ui.kp = el.dataset.kp; rr(); },
      kshow: (el) => startKingShowdown(g, el.dataset.kshow, g.members.map((m) => m.id), per),
    },
  };
}

// ---------------- Ewige Tabelle ----------------
function alltime(g) {
  const cat = ALLTIME.find((c) => c.key === ui.cat) || ALLTIME[0];
  const rel = cat.strength && ui.rel;
  const me = myId();
  const rows = g.members.map((m) => ({ m, v: alltimeValue(g.alltime[m.id] || { abs: {}, rel: {} }, cat.key, rel) }))
    .sort((a, b) => b.v - a.v);
  const fmt = (v) => {
    if (!v) return '–';
    if (rel) return `${num(v, 2)} × KG`;
    if (cat.key === 'volume') return fmtVolume(v);
    if (cat.key === 'hours') return `${num(v, 0)} h`;
    if (cat.key === 'km') return `${num(v, 0)} km`;
    if (cat.key === 'streak') return `${v} Wo.`;
    if (cat.strength) return `${num(v, 1)} kg`;
    return num(v, 0);
  };
  const best = rows[0]?.v || 1;
  const html = `
    <div class="chips scroll">${ALLTIME.map((c) => `<button class="chip ${c.key === cat.key ? 'on' : ''}" data-cat="${c.key}">${esc(c.label)}</button>`).join('')}</div>
    ${cat.strength ? `<div class="rel-row"><div class="rel-switch"><button class="${rel ? '' : 'on'}" data-arel="0">kg</button><button class="${rel ? 'on' : ''}" data-arel="1">× KG</button></div></div>` : ''}
    <section class="card">
      <div class="card-title">${esc(cat.label)} <small>${rel ? 'relativ zum Körpergewicht' : cat.strength ? 'bestes geschätztes 1RM' : 'gesamt'}</small></div>
      ${rows.map((r, i) => `<a class="lg-row ${r.m.id === me ? 'me' : ''}" href="#/member/${esc(r.m.id)}">
        <span class="lg-rank ${i < 3 && r.v ? `m${i + 1}` : ''}">${i + 1}</span>${head(r.m)}
        <span class="lg-main"><b>${esc(r.m.name)}</b><div class="bar"><i style="width:${r.v ? Math.max(3, (r.v / best) * 100) : 0}%"></i></div></span>
        <span class="lg-val">${fmt(r.v)}</span>${fightBtn(r.m.id)}</a>`).join('')}
      <p class="footnote">Tippe auf ${icon('bolt', 'xs')}, um jemanden in dieser Kategorie zum Kampf herauszufordern – wer den besseren Wert hat, gewinnt.</p>
      ${cat.strength ? `<p class="footnote">Bestes geschätztes 1RM (Epley) mit der Langhantel aus allen Workouts.${rel ? ' Geteilt durch das Körpergewicht am Tag des Satzes – dafür muss jeder sein Gewicht im Profil eintragen.' : ''}${cat.key === 'big3' ? ' Big 3 = Bankdrücken + Kniebeuge + Kreuzheben.' : ''}</p>` : ''}
    </section>`;
  return {
    html,
    clicks: {
      cat: (el, rr) => { ui.cat = el.dataset.cat; rr(); },
      arel: (el, rr) => { ui.rel = el.dataset.arel === '1'; rr(); },
      fight: (el) => startFight(g, me, el.dataset.fight, cat.key, rel),
    },
  };
}

// ---------------- Challenges ----------------
export function challengeValueText(c, v) {
  const T = CHALLENGE_TYPES[c.type] || { unit: '' };
  if (c.relative && T.rel) return `${num(v, 2)} × KG`;
  if (T.unit === 'kg') return c.type === 'exE1rm' ? `${num(v, 1)} kg` : fmtVolume(v);
  return `${num(v, T.dec || 0)} ${T.unit}`;
}
const period = (c) => `${fmtDate(c.start, { day: 'numeric', month: 'short' })} – ${fmtDate(c.end - 1, { day: 'numeric', month: 'short' })}`;

function challengeCard(g, c) {
  const me = myId();
  const T = CHALLENGE_TYPES[c.type] || { label: c.type };
  const mine = c.members.find((m) => m.id === me);
  const joined = c.members.filter((m) => m.status === 'joined');
  const top = joined[0]?.value || 0;
  const left = c.status === 'running' ? Math.ceil((c.end - Date.now()) / 86400000) : 0;
  const invited = c.members.filter((m) => m.status === 'invited');
  const sub = `${esc(T.label)}${c.exercise ? `: ${esc(c.exercise)}` : ''}${c.relative ? ' · × KG' : ''}`;
  const head2 = c.status === 'finished' && c.winners.length
    ? `<div class="ch-win">${c.winners.slice(0, 2).map((id) => `<div class="ch-win-fig">${fighterSVG(member(g, id)?.stage || 0, { look: look(member(g, id)), powerUp: true })}</div>`).join('')}
        <div><small>Gewonnen von</small><b>${c.winners.map((id) => esc(nameOf(g, id))).join(' & ')}</b></div></div>` : '';
  return `<section class="card ch-card ch-${c.status}">
    <div class="ch-top">
      <div class="ch-t"><b>${esc(c.title)}</b><small>${sub}</small><small>${period(c)}${left ? ` · noch ${left} Tag${left === 1 ? '' : 'e'}` : c.status === 'upcoming' ? ' · startet bald' : ''}</small></div>
      <button class="icon-btn" data-chmenu="${esc(c.id)}" aria-label="Optionen">${icon('more')}</button>
    </div>
    ${head2}
    ${mine?.status === 'invited' && c.status !== 'finished' ? `<div class="ch-invite"><span>${esc(nameOf(g, c.creator))} hat dich eingeladen</span>
      <button class="btn ghost sm" data-chresp="${esc(c.id)}" data-v="0">Ablehnen</button><button class="btn primary sm" data-chresp="${esc(c.id)}" data-v="1">Annehmen</button></div>` : ''}
    ${joined.map((m, i) => `<div class="ch-row ${m.id === me ? 'me' : ''}">
      <span class="lg-rank ${c.status === 'finished' && c.winners.includes(m.id) ? 'm1' : ''}">${i + 1}</span>${head(member(g, m.id))}
      <span class="lg-main"><b>${esc(nameOf(g, m.id))}</b><div class="bar"><i style="width:${top ? Math.max(2, (m.value / top) * 100) : 0}%"></i></div></span>
      <span class="lg-val">${challengeValueText(c, m.value)}</span></div>`).join('')}
    ${invited.length ? `<small class="ch-wait">Eingeladen: ${invited.map((m) => esc(nameOf(g, m.id))).join(', ')}</small>` : ''}
    ${!mine && c.status !== 'finished' ? `<button class="btn ghost block sm" data-chresp="${esc(c.id)}" data-v="1">Mitmachen</button>` : ''}
  </section>`;
}

function challenges(g) {
  const me = myId();
  const list = g.challenges || [];
  const inv = list.filter((c) => c.status !== 'finished' && c.members.some((m) => m.id === me && m.status === 'invited'));
  const running = list.filter((c) => c.status === 'running' && !inv.includes(c));
  const upcoming = list.filter((c) => c.status === 'upcoming' && !inv.includes(c));
  const done = list.filter((c) => c.status === 'finished').sort((a, b) => b.end - a.end);
  const sec = (t, l) => (l.length ? `<h2 class="section-title">${t}</h2>${l.map((c) => challengeCard(g, c)).join('')}` : '');
  const html = `
    <button class="btn primary block lg" data-act="newch">${icon('plus')} Challenge erstellen</button>
    ${sec('Einladungen', inv)}${sec('Laufend', running)}${sec('Demnächst', upcoming)}${sec('Beendet', done.slice(0, 15))}
    ${!list.length ? emptyState('trophy', 'Noch keine Challenges', 'Erstelle die erste Challenge und lade andere aus der Gruppe ein – Übungen, Workouts, Cardio oder Mobility.') : ''}`;
  const after = (rr) => fetchGroup().then(rr).catch((e) => toast(e.message));
  return {
    html,
    handlers: { newch: (_, rr) => openChallengeEditor(g, () => after(rr)) },
    clicks: {
      chresp: async (el, rr) => {
        try { await api('POST', `/api/challenges/${el.dataset.chresp}/respond`, { accept: el.dataset.v === '1' }); toast(el.dataset.v === '1' ? 'Du bist dabei!' : 'Abgelehnt'); after(rr); } catch (e) { toast(e.message); }
      },
      chmenu: async (el, rr) => {
        const c = list.find((x) => x.id === el.dataset.chmenu);
        if (!c) return;
        const canEdit = c.creator === me || g.members.find((m) => m.id === me)?.role === 'admin';
        const isIn = c.members.some((m) => m.id === me && m.status === 'joined');
        const opts = [];
        if (isIn && c.status !== 'finished') opts.push({ label: 'Weitere einladen', value: 'invite', icon: 'users' });
        if (canEdit && c.status !== 'finished') opts.push({ label: 'Jetzt beenden', value: 'end', icon: 'check' });
        if (isIn && c.status !== 'finished' && c.creator !== me) opts.push({ label: 'Austreten', value: 'leave', icon: 'logout' });
        if (canEdit) opts.push({ label: 'Löschen', value: 'del', icon: 'trash', danger: true });
        if (!opts.length) return toast('Keine Aktionen verfügbar');
        const v = await sheet({ title: c.title, options: opts });
        try {
          if (v === 'invite') {
            const others = g.members.filter((m) => !c.members.some((x) => x.id === m.id));
            if (!others.length) return toast('Alle sind schon eingeladen');
            const pick = await sheet({ title: 'Wen einladen?', options: [{ label: 'Alle', value: '*', icon: 'users' }, ...others.map((m) => ({ label: m.name, value: m.id, icon: 'user' }))] });
            if (!pick) return;
            await api('POST', `/api/challenges/${c.id}/invite`, { users: pick === '*' ? others.map((m) => m.id) : [pick] });
            toast('Eingeladen');
          }
          if (v === 'end' && await confirmDialog('Challenge jetzt beenden? Der aktuelle Stand zählt.', 'Beenden')) await api('POST', `/api/challenges/${c.id}/end`);
          if (v === 'leave') await api('POST', `/api/challenges/${c.id}/respond`, { accept: false });
          if (v === 'del' && await confirmDialog('Challenge endgültig löschen?', 'Löschen', true)) await api('DELETE', `/api/challenges/${c.id}`);
          if (v) after(rr);
        } catch (e) { toast(e.message); }
      },
    },
  };
}

// ---------------- Mitglieder ----------------
const visLabel = (v) => VISIBILITY.find(([k]) => k === v)?.[1] || '';
function members(g) {
  const me = myId();
  const html = `<div class="set-group">${g.members.map((m) => `<a class="lg-row mem ${m.id === me ? 'me' : ''}" href="#/member/${esc(m.id)}">
      ${head(m)}<span class="lg-main"><b>${esc(m.name)}${m.npc ? ' <em class="tag demo">NPC</em>' : m.role === 'admin' && !g.demo ? ' <em class="tag">Admin</em>' : ''}</b>
      <small>${esc(STAGE_NAMES[m.stage])} · ${m.streak} Wo. Streak · diese Woche ${m.thisWeek}/${m.goal}</small>
      <small>${m.lastWorkout ? `Zuletzt ${esc(fmtRelDay(m.lastWorkout))}` : 'Noch kein Workout'} · ${icon('eye', 'xs')} ${esc(visLabel(m.visibility))}</small></span>${fightBtn(m.id) || icon('right', 'muted')}</a>`).join('')}</div>`;
  return { html, clicks: { fight: (el) => chooseFight(g, me, el.dataset.fight) } };
}

// ---------------- Mitglieds-Profil ----------------
const feeds = new Map();
export function memberView({ id }) {
  const g = cachedGroup();
  const m = g && member(g, id);
  if (!m) return { html: pageHead('Mitglied', { back: '#/arena/members' }) + emptyState('user', 'Nicht gefunden', 'Dieses Mitglied gibt es nicht (mehr).') };
  const at = g.alltime[id] || { abs: {}, rel: {} };
  const f = feeds.get(id);
  const lifts = ['bench', 'squat', 'deadlift', 'ohp'].filter((k) => at.abs[k]);
  const L = { bench: 'Bankdrücken', squat: 'Kniebeuge', deadlift: 'Kreuzheben', ohp: 'Schulterdrücken' };
  const feedHtml = !f ? '<div class="chart-empty">Lade Workouts…</div>'
    : f.visibility === 'stats' ? `<div class="card hint">${icon('eye')} ${esc(m.name)} teilt nur Zahlen – keine Workouts.</div>`
      : f.workouts.length ? f.workouts.map((w) => memberWorkout(w)).join('') + (f.more ? '<button class="btn ghost block" data-act="morefeed">Mehr laden</button>' : '')
        : '<div class="chart-empty">Noch keine Workouts</div>';
  const html = `
    ${pageHead(m.name, { back: '#/arena/members', sub: `${esc(STAGE_NAMES[m.stage])}${m.role === 'admin' ? ' · Admin' : ''}` })}
    <section class="card hero mem-hero st${m.stage}">
      <div class="hero-fig">${fighterFx(m.stage, { look: look(m), enter: nav.entering })}</div>
      <div class="hero-info">
        <small>Stufe ${m.stage + 1}/8</small><h3>${esc(STAGE_NAMES[m.stage])}</h3>
        <div class="hero-streak">${icon('flame')}<b>${m.streak}</b><span>Wochen Streak</span></div>
        <small class="muted">Längste: ${m.longest} Wo. · Ziel ${m.goal}/Woche</small>
      </div>
    </section>
    ${id !== myId() ? `<button class="btn fight-btn block lg" data-act="fight">${icon('bolt')} ${esc(m.name)} herausfordern</button>` : ''}
    <div class="kpis">
      ${kpi('Workouts', num(at.workouts || 0, 0), null, 'dumbbell')}
      ${kpi('Volumen', fmtVolume(at.volume || 0), null, 'layers')}
      ${kpi('Trainingszeit', `${num(at.hours || 0, 0)} h`, null, 'clock')}
      ${kpi('Titel', `${titleOf(g, id).years ? `${titleOf(g, id).years} J · ` : ''}${titleOf(g, id).months} M`, null, 'trophy')}
    </div>
    ${lifts.length ? `<section class="card"><div class="card-title">Maximalkraft <small>geschätztes 1RM</small></div>
      ${lifts.map((k) => `<div class="pr-row"><div><b>${L[k]}</b>${at.rel[k] ? `<small>${num(at.rel[k], 2)} × Körpergewicht</small>` : ''}</div><span class="pr-val">${num(at.abs[k], 1)} kg</span></div>`).join('')}</section>` : ''}
    <h2 class="section-title">Workouts</h2>
    ${feedHtml}`;
  const load = async (before, rr) => {
    try {
      const r = await api('GET', `/api/members/${encodeURIComponent(id)}/workouts?limit=15${before ? `&before=${before}` : ''}`);
      const prev = before ? feeds.get(id)?.workouts || [] : [];
      feeds.set(id, { visibility: r.visibility, workouts: [...prev, ...r.workouts], more: r.workouts.length === 15 });
      rr();
    } catch (e) { toast(e.message); }
  };
  return {
    html,
    mount: (root) => { if (!f) load(0, () => window.dispatchEvent(new HashChangeEvent('hashchange'))); },
    handlers: { morefeed: (_, rr) => load(f.workouts[f.workouts.length - 1].start, rr), fight: () => chooseFight(g, myId(), id) },
    clicks: { wopen: (el) => el.closest('.mw').classList.toggle('open') },
  };
}

function memberWorkout(w) {
  const sets = (s, t) => {
    if (t === 'cardio' || (!s.weight && !s.reps && (s.distance || s.duration))) return [s.distance ? `${num(s.distance, 2)} km` : '', s.duration ? fmtClock(s.duration) : ''].filter(Boolean).join(' · ');
    return `${s.weight ? `${num(s.weight)} kg × ` : ''}${s.reps ?? 0}`;
  };
  return `<section class="card mw ${w.exercises ? 'full' : ''}">
    <div class="mw-head" ${w.exercises ? 'data-wopen="1"' : ''}>
      <div><b>${esc(w.title || 'Workout')}</b><small>${esc(fmtDate(w.start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</small></div>
      <span class="mw-side">${w.ep ? `<span class="mw-ep">+${num(w.ep, 0)} EP</span>` : ''}${w.prs ? `<span class="mw-pr">${icon('trophy', 'xs')} ${w.prs}</span>` : ''}</span>
    </div>
    <div class="mw-meta"><span>${icon('clock', 'xs')} ${fmtDurShort(w.dur)}</span>${w.vol ? `<span>${icon('weight', 'xs')} ${fmtVolume(w.vol)}</span>` : ''}${w.km ? `<span>${num(w.km, 1)} km</span>` : ''}<span>${w.sets || 0} Sätze</span></div>
    <div class="mw-ex">${(w.ex || []).map((x) => `<span>${x.s ? `${x.s}× ` : ''}${esc(x.n)}</span>`).join('')}</div>
    ${w.exercises ? `<div class="mw-sets">${w.exercises.map((e) => {
      const t = (w.ex || []).find((x) => x.n === e.name)?.t;
      return `<div class="mw-e"><b>${esc(e.name)}</b>${e.sets.map((s, i) => `<div class="dset"><span class="set-badge sm t-${esc(s.type || 'normal')}">${s.type === 'warmup' ? 'W' : i + 1}</span><span class="dset-v">${esc(sets(s, t))}</span></div>`).join('')}</div>`;
    }).join('')}</div><button class="link-btn sm mw-toggle" data-wopen="1">Sätze anzeigen</button>` : ''}
  </section>`;
}
