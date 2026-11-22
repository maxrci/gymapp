// Start-Animation: Der Kämpfer freut sich, dass du zurück bist – dann Kopf in den Nacken, Schrei und Feuer
import { state } from './store.js';
import { weekStreaks } from './stats.js';
import { stageFor } from './gamification.js';
import { fighterSVG } from './fighter.js';

const DURATION = 3000;
let hiddenAt = null;

export function showIntro() {
  if (state.settings.introAnim === false) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.querySelector('.intro')) return;
  const stage = stageFor(weekStreaks().current);
  const el = document.createElement('div');
  el.className = `intro st${stage.index}`;
  el.innerHTML = `
    <div class="in-bg"></div>
    <div class="in-rays"></div>
    <div class="in-fire">${Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 6.6 + (i % 3) * 1.7).toFixed(1)}%;--d:${(1 + (i % 5) * 0.09).toFixed(2)}s;--w:${10 + (i % 4) * 4}%;--s:${(0.75 + (i % 3) * 0.12).toFixed(2)}s"></i>`).join('')}</div>
    <div class="in-flash"></div>
    <div class="in-stage">
      <div class="in-glow"></div>
      <div class="in-fighter">${fighterSVG(stage.index, { intro: true })}</div>
    </div>`;
  document.body.appendChild(el);
  const end = () => {
    if (!el.isConnected) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 420);
  };
  el.addEventListener('click', end);
  setTimeout(end, DURATION);
}

// Erneut zeigen, wenn die App nach mindestens 30 Minuten wieder geöffnet wird
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) { hiddenAt = null; showIntro(); }
});
