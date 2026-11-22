import { pageHead } from '../components.js';
import { profileStats, achievements, STAGES, EP_RULES } from '../gamification.js';
import { fighterSVG, fighterFx } from '../fighter.js';
import { nav } from '../nav.js';
import { esc, num } from '../utils.js';
import { icon } from '../ui.js';
import { openAvatarEditor } from '../avatar.js';

export function badgesView() {
  const P = profileStats();
  const ach = achievements();
  const done = ach.filter((a) => a.done);
  const groups = [['Meilensteine', ach.filter((a) => a.tier != null)], ['Spezial', ach.filter((a) => a.tier == null)]];
  const html = `
    ${pageHead('Level & Abzeichen', { back: '#/profile' })}
    <section class="card level-card">
      <div class="lv-ring" style="--p:${Math.round(P.levelProgress * 100)}"><b>${P.level}</b><small>Level</small></div>
      <div><b>${num(P.xp, 0)} EP</b><small>Noch ${num(P.xpToNext, 0)} EP bis Level ${P.level + 1}</small>
      <small class="muted">EP: ${esc(EP_RULES)}</small>${P.enduranceEp ? `<small class="muted">Davon aus Cardio & Pilates: ${num(P.enduranceEp, 0)} EP (${num(P.mins.cardio, 0)} + ${num(P.mins.pilates, 0)} Min.)</small>` : ''}</div>
    </section>
    <h2 class="section-title">Killstreaks <button class="link-btn sm" data-act="avatar">${icon('edit', 'xs')} Kämpfer anpassen</button></h2>
    <div class="stage-row">${STAGES.map((st, i) => `<div class="stage ${i <= P.stage.index ? 'got' : ''} ${i === P.stage.index ? 'cur' : ''}">
      ${i === P.stage.index ? fighterFx(i, { enter: nav.entering }) : fighterSVG(i)}<b>${esc(st.name)}</b><small>${st.min ? `${st.min}+ Wo. · +${num(st.ep, 0)} EP` : 'Start'}</small></div>`).join('')}</div>
    <p class="footnote">Deine Killstreak sind die Wochen in Folge, in denen du dein Wochenziel (${P.st.goal} Workouts) erreichst. Längste Streak: ${P.st.longest} Wochen.</p>
    <h2 class="section-title">Abzeichen <small class="muted">${done.length}/${ach.length}</small></h2>
    ${groups.map(([t, list]) => `<div class="list-label">${t}</div><div class="badge-grid">${list.map((a) => `
      <div class="badge ${a.done ? 'done' : ''}">
        <span class="b-ic">${icon(a.icon)}</span><b>${esc(a.title)}</b><small>${esc(a.desc)}</small>
        ${a.done ? '' : `<div class="bar"><i style="width:${Math.round(a.progress * 100)}%"></i></div>`}
      </div>`).join('')}</div>`).join('')}
  `;
  return { html, handlers: { avatar: () => openAvatarEditor() } };
}
