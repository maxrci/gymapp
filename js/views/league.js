// Arena: Saison (Fleiß), Ewige Tabelle, Challenges, Mitglieder + Mitglieds-Profil

import { pageHead, emptyState, kpi } from '../components.js';
import { icon, chips, sheet, confirmDialog, toast } from '../ui.js';
import { esc, num, fmtVolume, fmtDate, fmtRelDay, fmtDurShort, fmtClock } from '../utils.js';
import { fighterSVG, fighterFx, fighterHead } from '../fighter.js';
import { nav } from '../nav.js';
import { cachedGroup, fetchGroup, loggedIn, myId, api } from '../sync.js';
import {
  ALLTIME, alltimeValue, CHALLENGE_TYPES, LEAGUE_RULES, VISIBILITY, STAGE_NAMES,
} from '../compete.js';
import { openChallengeEditor } from '../challengeEditor.js';
import { startFight, chooseFight } from '../fight.js';

const TABS = [['season', 'Saison'], ['alltime', 'Ewige Tabelle'], ['challenges', 'Challenges'], ['members', 'Mitglieder']];
const ui = { cat: 'workouts', rel: false };
let lastFetch = 0;

const look = (m) => m?.look || {};
const fightBtn = (id) => (id !== myId() ? `<button class="lg-fight" data-fight="${esc(id)}" aria-label="Kampf">${icon('bolt')}</button>` : '');
const head = (m) => `<span class="lg-head">${fighterHead(m?.stage || 0, look(m))}</span>`;
const member = (g, id) => g.members.find((m) => m.id === id);
const nameOf = (g, id) => member(g, id)?.name || 'Unbekannt';


function refresh(rerender) {
  if (Date.now() - lastFetch < 4000) return;
  lastFetch = Date.now();
  fetchGroup().then(() => rerender()).catch(() => {});
}

export function leagueView({ tab = 'season' }) {
  if (!loggedIn()) {
    return { html: pageHead('Arena') + emptyState('users', 'Keine Gruppe', 'Melde dich mit deinem persönlichen Schlüssel an (Profil → Gruppe), um in der Arena anzutreten.', '<a class="btn primary" href="#/profile">Zum Profil</a>') };
  }
  const g = cachedGroup();
  const tabs = `<div class="tabs scroll">${TABS.map(([k, l]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/arena/${k}">${l}</a>`).join('')}</div>`;
  if (!g) {
    return {
      html: pageHead('Arena') + tabs + '<div class="chart-empty">Lade Gruppendaten…</div>',
      mount: () => fetchGroup().then(() => window.dispatchEvent(new HashChangeEvent('hashchange'))).catch((e) => toast(e.message)),
    };
  }
  const views = { season, alltime, challenges, members };
  const v = (views[tab] || season)(g);
  return {
    html: `${pageHead(g.group || 'Arena', { sub: `${g.members.length} Mitglieder` })}${tabs}${v.html}`,
    mount: (root) => { v.mount?.(root); },
    handlers: { ...(v.handlers || {}) },
    clicks: { ...(v.clicks || {}) },
    onShow: refresh,
  };
}

// ---------------- Saison ----------------
function season(g) {
  const s = g.season;
  const me = myId();
  const month = fmtDate(s.from, { month: 'long', year: 'numeric' });
  const daysLeft = Math.max(0, Math.ceil((s.to - Date.now()) / 86400000));
  const rows = s.rows;
  const podium = rows.slice(0, 3);
  const order = [1, 0, 2].filter((i) => podium[i]);
  const titles = Object.entries(g.titles || {}).sort((a, b) => b[1] - a[1]);
  const html = `
    <section class="card season-card">
      <div class="season-top"><div><small>Saison</small><h3>${esc(month)}</h3></div><span class="pill">${daysLeft} Tag${daysLeft === 1 ? '' : 'e'} übrig</span></div>
      <div class="podium">${order.map((i) => {
        const r = podium[i]; const m = member(g, r.id);
        return `<a class="pod p${i + 1} ${r.id === me ? 'me' : ''}" href="#/member/${esc(r.id)}">
          <div class="pod-fig">${i === 0 ? fighterFx(m?.stage || 0, { look: look(m), enter: nav.entering }) : fighterSVG(m?.stage || 0, { look: look(m) })}</div>
          <b>${esc(m?.name || '')}</b><small>${num(r.points, 0)} P</small><div class="pod-base">${i + 1}</div></a>`;
      }).join('')}</div>
    </section>
    ${g.members.length > 1 ? `<button class="btn fight-btn block lg" data-act="fightpick">${icon('bolt')} Arena-Kampf starten</button>` : ''}
    <section class="card">
      <div class="card-title">Rangliste</div>
      ${rows.map((r, i) => `<a class="lg-row ${r.id === me ? 'me' : ''}" href="#/member/${esc(r.id)}">
        <span class="lg-rank">${i + 1}</span>${head(member(g, r.id))}
        <span class="lg-main"><b>${esc(nameOf(g, r.id))}</b><small>${r.workouts} Workouts · ${r.goalWeeks} Wochenziele · ${r.prs} Rekorde${r.wins ? ` · ${r.wins} Siege` : ''}</small></span>
        <span class="lg-val">${num(r.points, 0)}<small>P</small></span>${fightBtn(r.id)}</a>`).join('')}
      <p class="footnote">${esc(LEAGUE_RULES)}</p>
    </section>
    ${titles.length ? `<section class="card"><div class="card-title">${icon('trophy', 'gold')} Saison-Titel</div>
      ${titles.map(([id, n]) => `<div class="lg-row">${head(member(g, id))}<span class="lg-main"><b>${esc(nameOf(g, id))}</b></span><span class="lg-val">${n}×</span></div>`).join('')}
    </section>` : ''}
    ${g.seasons?.length ? `<section class="card"><div class="card-title">Vergangene Saisons</div>
      ${g.seasons.slice(0, 12).map((x) => `<div class="lg-row"><span class="lg-main"><b>${esc(fmtDate(x.from, { month: 'long', year: 'numeric' }))}</b>
        <small>${x.top.map((t, i) => `${i + 1}. ${esc(nameOf(g, t.id))} (${num(t.points, 0)})`).join(' · ')}</small></span>${icon('trophy', 'gold')}</div>`).join('')}
    </section>` : ''}`;
  return {
    html,
    handlers: {
      fightpick: async () => {
        const others = g.members.filter((m) => m.id !== me);
        const id = others.length === 1 ? others[0].id : await sheet({ title: 'Gegner wählen', options: others.map((m) => ({ label: `${m.name} · ${STAGE_NAMES[m.stage]}`, value: m.id, icon: 'user' })) });
        if (id) chooseFight(g, me, id);
      },
    },
    clicks: { fight: (el) => startFight(g, me, el.dataset.fight, 'season') },
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
      ${head(m)}<span class="lg-main"><b>${esc(m.name)}${m.role === 'admin' ? ' <em class="tag">Admin</em>' : ''}</b>
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
      ${kpi('Saison-Titel', `${g.titles?.[id] || 0}`, null, 'trophy')}
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
      ${w.prs ? `<span class="mw-pr">${icon('trophy', 'xs')} ${w.prs}</span>` : ''}
    </div>
    <div class="mw-meta"><span>${icon('clock', 'xs')} ${fmtDurShort(w.dur)}</span>${w.vol ? `<span>${icon('weight', 'xs')} ${fmtVolume(w.vol)}</span>` : ''}${w.km ? `<span>${num(w.km, 1)} km</span>` : ''}<span>${w.sets || 0} Sätze</span></div>
    <div class="mw-ex">${(w.ex || []).map((x) => `<span>${x.s ? `${x.s}× ` : ''}${esc(x.n)}</span>`).join('')}</div>
    ${w.exercises ? `<div class="mw-sets">${w.exercises.map((e) => {
      const t = (w.ex || []).find((x) => x.n === e.name)?.t;
      return `<div class="mw-e"><b>${esc(e.name)}</b>${e.sets.map((s, i) => `<div class="dset"><span class="set-badge sm t-${esc(s.type || 'normal')}">${s.type === 'warmup' ? 'W' : i + 1}</span><span class="dset-v">${esc(sets(s, t))}</span></div>`).join('')}</div>`;
    }).join('')}</div><button class="link-btn sm mw-toggle" data-wopen="1">Sätze anzeigen</button>` : ''}
  </section>`;
}
