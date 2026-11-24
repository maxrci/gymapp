// Die Meister des AI-Coaches: Kraft-Meister (weise & breit, drückt schwer) und Tempo-Meister (blitzschnell)

import { poseFrame, viewBox } from './poses.js';

export const MASTERS = {
  gym: { name: 'Kraft-Meister', pose: 'ohp', plate: 1.7, speed: 0.75, stage: 7 },
  cardio: { name: 'Tempo-Meister', pose: 'sprint', plate: 1, speed: 1.7, stage: 4 },
};
const PERIOD = { ohp: 3000, sprint: 520 };

// Platzhalter fürs HTML – wird über mountMasters() animiert
export const masterSlot = (kind, label = true) => `<div class="master m-${kind}">
  <div class="master-fig" data-master="${kind}"></div>${label ? `<small>${MASTERS[kind].name}</small>` : ''}</div>`;

// Kraft-Meister in der Frontansicht: breites Kreuz, Glatze, langer weißer Bart – drückt die Langhantel über Kopf
const f1 = (v) => v.toFixed(1);
function gymMaster(t) {
  const u = (1 - Math.cos(2 * Math.PI * t)) / 2; // 0 = unten, 1 = oben
  const barY = 70 - u * 30;
  const breath = Math.sin(2 * Math.PI * t) * 0.8;
  const sk = '#e6b58c', skD = '#c99a70', gi = '#5b2a86', giD = '#43205f', gold = '#e2b13c', white = '#f5f5f5';
  const sh = { l: [50, 84 + breath], r: [150, 84 + breath] };
  const hand = { l: [58, barY + 6], r: [142, barY + 6] };
  const elbow = { l: [28 + u * 8, 98 - u * 26], r: [172 - u * 8, 98 - u * 26] };
  const limb = (a, b, w, c) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const plate = (x) => `<rect x="${x - 7}" y="${f1(barY - 20)}" width="14" height="40" rx="4" fill="#34343b"/><rect x="${x - 3}" y="${f1(barY - 14)}" width="6" height="28" rx="2" fill="#4c4c55"/>`;
  return `
    <ellipse cx="100" cy="190" rx="62" ry="7" fill="#000" opacity=".28"/>
    <ellipse class="aura-glow" cx="100" cy="110" rx="${f1(78 + u * 6)}" ry="${f1(92 + u * 5)}" fill="url(#mAura)" opacity="${f1(0.55 + u * 0.35)}"/>
    <!-- Beine -->
    <path d="M72,128 L62,182 L86,184 L98,134 Z" fill="${giD}"/><path d="M128,128 L138,182 L114,184 L102,134 Z" fill="${giD}"/>
    <rect x="54" y="180" width="34" height="9" rx="4" fill="#2a2a30"/><rect x="112" y="180" width="34" height="9" rx="4" fill="#2a2a30"/>
    <!-- Oberkörper: breites V -->
    <path d="M38,${f1(84 + breath)} Q100,${f1(68 + breath)} 162,${f1(84 + breath)} Q156,108 132,132 L68,132 Q44,108 38,${f1(84 + breath)} Z" fill="${gi}"/>
    <path d="M100,${f1(76 + breath)} L84,${f1(84 + breath)} L92,118 L100,108 L108,118 L116,${f1(84 + breath)} Z" fill="${sk}"/>
    <path d="M84,${f1(84 + breath)} L92,118 M116,${f1(84 + breath)} L108,118" stroke="${gold}" stroke-width="3"/>
    <rect x="66" y="124" width="68" height="11" rx="4" fill="${gold}"/><rect x="95" y="122" width="10" height="15" rx="3" fill="#b98d22"/>
    <!-- Arme -->
    ${limb(sh.l, elbow.l, 26, sk)}${limb(elbow.l, hand.l, 20, sk)}${limb(sh.r, elbow.r, 26, sk)}${limb(elbow.r, hand.r, 20, sk)}
    <circle cx="${sh.l[0]}" cy="${f1(sh.l[1])}" r="18" fill="${gi}"/><circle cx="${sh.r[0]}" cy="${f1(sh.r[1])}" r="18" fill="${gi}"/>
    <path d="M${f1(elbow.l[0] - 2)},${f1(elbow.l[1] + 4)} q6,-6 12,-2" stroke="${skD}" stroke-width="2" fill="none"/>
    <path d="M${f1(elbow.r[0] + 2)},${f1(elbow.r[1] + 4)} q-6,-6 -12,-2" stroke="${skD}" stroke-width="2" fill="none"/>
    <!-- Kopf -->
    <rect x="93" y="${f1(66 + breath)}" width="14" height="10" fill="${sk}"/>
    <circle cx="100" cy="${f1(56 + breath)}" r="15" fill="${sk}"/>
    <path d="M84,${f1(60 + breath)} Q76,${f1(46 + breath)} 84,${f1(38 + breath)} Q92,${f1(30 + breath)} 100,${f1(33 + breath)} Q108,${f1(30 + breath)} 116,${f1(38 + breath)} Q124,${f1(46 + breath)} 116,${f1(60 + breath)} Q118,${f1(48 + breath)} 110,${f1(45 + breath)} Q100,${f1(41 + breath)} 90,${f1(45 + breath)} Q82,${f1(48 + breath)} 84,${f1(60 + breath)} Z" fill="${white}" stroke="#dcdcdc" stroke-width=".8"/>
    <path d="M84,${f1(52 + breath)} q-10,4 -8,16 q4,-4 9,-6 Z M116,${f1(52 + breath)} q10,4 8,16 q-4,-4 -9,-6 Z" fill="${white}"/>
    <path d="M92,${f1(36 + breath)} q4,4 2,9 M106,${f1(35 + breath)} q-3,5 0,9" stroke="#dcdcdc" stroke-width="1" fill="none"/>
    <path d="M89,${f1(52 + breath)} l9,1 M111,${f1(52 + breath)} l-9,1" stroke="${white}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M92,${f1(56 + breath)} q3,2 6,0 M102,${f1(56 + breath)} q3,2 6,0" stroke="#3a2a20" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M88,${f1(61 + breath)} Q100,${f1(70 + breath)} 112,${f1(61 + breath)} Q114,${f1(80 + breath)} 106,${f1(96 + breath)} Q101,${f1(108 + breath)} 100,${f1(112 + breath)} Q97,${f1(104 + breath)} 94,${f1(96 + breath)} Q86,${f1(80 + breath)} 88,${f1(61 + breath)} Z" fill="${white}" stroke="#dcdcdc" stroke-width=".8"/>
    <path d="M91,${f1(63 + breath)} Q100,${f1(59 + breath)} 109,${f1(63 + breath)} Q100,${f1(62 + breath)} 91,${f1(63 + breath)} Z" fill="#fff"/>
    <!-- Langhantel -->
    <rect x="14" y="${f1(barY - 2.5)}" width="172" height="5" rx="2.5" fill="#8d8d96"/>
    ${plate(26)}${plate(40)}${plate(160)}${plate(174)}
    <circle cx="${f1(hand.l[0])}" cy="${f1(barY)}" r="7" fill="${sk}"/><circle cx="${f1(hand.r[0])}" cy="${f1(barY)}" r="7" fill="${sk}"/>`;
}

function frame(kind, t) {
  const M = MASTERS[kind];
  const opts = { master: kind, plate: M.plate };
  if (kind !== 'cardio') return gymMaster(t);
  // Nachbilder für den Geschwindigkeits-Eindruck
  const ghost = (dt, op, dx) => `<g opacity="${op}" transform="translate(${dx},0)">${poseFrame(M.pose, (t - dt + 1) % 1, M.stage, null, { ...opts, noShadow: true })}</g>`;
  return `${ghost(0.24, 0.12, -26)}${ghost(0.12, 0.22, -13)}${poseFrame(M.pose, t, M.stage, null, opts)}`;
}

export function mountMasters(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-master]').forEach((host) => {
    const kind = host.dataset.master;
    const M = MASTERS[kind];
    const vb = kind === 'gym' ? [0, 10, 200, 190] : viewBox(M.pose).split(' ').map(Number);
    if (kind === 'cardio') { vb[0] -= 30; vb[2] += 30; vb[1] -= 15; vb[3] += 15; }
    host.innerHTML = `<svg class="pose master-svg" viewBox="${vb.join(' ')}" aria-hidden="true">
      <defs><radialGradient id="mAura"><stop offset="0" stop-color="#ffd86b" stop-opacity=".55"/><stop offset=".6" stop-color="#e2b13c" stop-opacity=".18"/><stop offset="1" stop-color="#e2b13c" stop-opacity="0"/></radialGradient></defs>
      ${kind === 'cardio' ? `<g class="speedlines">${[40, 70, 100, 130, 160].map((y, i) => `<line x1="${vb[0] + 4}" y1="${y}" x2="${vb[0] + 40 + (i % 2) * 18}" y2="${y}"/>`).join('')}</g>` : '<g class="aura"></g>'}
      <g class="mf"></g></svg>`;
    const g = host.querySelector('.mf');
    g.innerHTML = frame(kind, 0.25);
    if (reduce) return;
    let phase = 0, prev = performance.now(), last = 0;
    const loop = (now) => {
      if (!host.isConnected) return;
      phase = (phase + ((now - prev) * M.speed) / PERIOD[M.pose]) % 1;
      prev = now;
      if (now - last > 33) { last = now; g.innerHTML = frame(kind, phase); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
