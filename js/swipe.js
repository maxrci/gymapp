// Wischen nach links zum Löschen (wie in iOS-Listen): kurz wischen → „Löschen“-Knopf, weit wischen → sofort löschen.
// Wiederverwendbar für Satz-Zeilen im Training und Listen (z. B. Verlauf).

const OPEN = 88, FULL = 150;

export function swipeToDelete(root, sel, onDelete, label = 'Löschen') {
  let row = null, x0 = 0, y0 = 0, dx = 0, lock = null, openRow = null;
  const btnOf = (r) => {
    let b = r.querySelector(':scope > .swipe-del');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'swipe-del'; b.textContent = label;
      r.appendChild(b);
      r.classList.add('swipe-row');
      r.parentElement?.classList.add('swipe-host');
    }
    return b;
  };
  const move = (r, x, anim) => { r.style.transition = anim ? 'transform .2s ease' : 'none'; r.style.transform = x ? `translateX(${x}px)` : ''; };
  const close = (r) => { if (r) move(r, 0, true); if (openRow === r) openRow = null; };
  const remove = (r) => {
    move(r, -r.offsetWidth - OPEN, true);
    setTimeout(() => { close(r); onDelete(r); }, 180);
  };
  root.addEventListener('touchstart', (e) => {
    const r = e.target.closest(sel);
    if (openRow && openRow !== r && !e.target.closest('.swipe-del')) close(openRow);
    if (!r || e.touches.length > 1) { row = null; return; }
    row = r; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null;
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!row) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!lock) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; lock = Math.abs(mx) > Math.abs(my) * 1.3 ? 'x' : 'y'; if (lock === 'x') btnOf(row); }
    if (lock !== 'x') return;
    e.preventDefault();
    const base = openRow === row ? -OPEN : 0;
    dx = Math.min(0, base + mx);
    move(row, dx > -FULL * 1.6 ? dx : -FULL * 1.6);
  }, { passive: false });
  root.addEventListener('touchend', () => {
    if (!row || lock !== 'x') { row = null; return; }
    const r = row; row = null;
    if (dx < -FULL) remove(r);
    else if (dx < -OPEN / 2) { move(r, -OPEN, true); openRow = r; }
    else close(r);
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.swipe-del');
    if (b) { e.preventDefault(); e.stopPropagation(); const r = b.parentElement; openRow = null; remove(r); }
  }, true);
}
