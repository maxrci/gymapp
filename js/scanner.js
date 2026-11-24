// Barcode-Scanner für Lebensmittel (EAN-13, EAN-8, UPC-A) – ohne fremde Bibliothek:
// 1. eingebaute Erkennung des Geräts (BarcodeDetector), wenn vorhanden
// 2. sonst eigener Decoder: mehrere Bildzeilen → Hell/Dunkel-Läufe → Ziffernmuster → Prüfziffer

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const runsOf = (bits) => { const r = []; let n = 1; for (let i = 1; i <= bits.length; i++) { if (bits[i] === bits[i - 1]) n++; else { r.push(n); n = 1; } } return r; };
// Laufbreiten je Ziffer: L (links, ungerade), G (links, gerade), R (rechts)
const PAT = { L: L.map(runsOf), G: L.map((b) => runsOf([...b].reverse().join(''))), R: L.map(runsOf) };
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLG', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function checkDigitOk(code) {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const d = code.split('').map(Number);
  const c = d.pop();
  let s = 0;
  for (let i = d.length - 1, k = 0; i >= 0; i--, k++) s += d[i] * (k % 2 === 0 ? 3 : 1);
  return (10 - (s % 10)) % 10 === c;
}

// beste Ziffer für 4 Laufbreiten
function matchDigit(w, sets) {
  const tot = w[0] + w[1] + w[2] + w[3];
  if (!tot) return null;
  const n = w.map((x) => (x * 7) / tot);
  let best = null;
  for (const set of sets) {
    PAT[set].forEach((p, digit) => {
      const err = Math.abs(n[0] - p[0]) + Math.abs(n[1] - p[1]) + Math.abs(n[2] - p[2]) + Math.abs(n[3] - p[3]);
      if (!best || err < best.err) best = { digit, set, err };
    });
  }
  return best && best.err < 1.6 ? best : null;
}
const guardOk = (runs, i, k, mod) => { for (let j = 0; j < k; j++) { const r = runs[i + j] / mod; if (r < 0.45 || r > 1.9) return false; } return true; };

// Läufe (abwechselnd hell/dunkel, beginnend mit dunkel) → Code
function decodeRuns(runs) {
  for (let i = 1; i + 43 <= runs.length; i += 2) { // i = Index eines dunklen Laufs (Startzeichen 1-0-1)
    const mod = (runs[i] + runs[i + 1] + runs[i + 2]) / 3;
    if (!mod || runs[i - 1] < mod * 2.5 || !guardOk(runs, i, 3, mod)) continue;
    // EAN-13 / UPC-A
    if (i + 59 <= runs.length) {
      const left = [], par = [];
      let ok = true;
      for (let k = 0; k < 6 && ok; k++) { const m = matchDigit(runs.slice(i + 3 + k * 4, i + 7 + k * 4), ['L', 'G']); if (!m) ok = false; else { left.push(m.digit); par.push(m.set); } }
      const mid = i + 27;
      if (ok && guardOk(runs, mid, 5, mod)) {
        const right = [];
        for (let k = 0; k < 6 && ok; k++) { const m = matchDigit(runs.slice(mid + 5 + k * 4, mid + 9 + k * 4), ['R']); if (!m) ok = false; else right.push(m.digit); }
        const first = PARITY.indexOf(par.join(''));
        if (ok && first >= 0 && guardOk(runs, mid + 29, 3, mod)) {
          const code = `${first}${left.join('')}${right.join('')}`;
          if (checkDigitOk(code)) return code;
        }
      }
    }
    // EAN-8
    const l8 = [];
    let ok8 = true;
    for (let k = 0; k < 4 && ok8; k++) { const m = matchDigit(runs.slice(i + 3 + k * 4, i + 7 + k * 4), ['L']); if (!m) ok8 = false; else l8.push(m.digit); }
    const mid8 = i + 19;
    if (ok8 && guardOk(runs, mid8, 5, mod)) {
      const r8 = [];
      for (let k = 0; k < 4 && ok8; k++) { const m = matchDigit(runs.slice(mid8 + 5 + k * 4, mid8 + 9 + k * 4), ['R']); if (!m) ok8 = false; else r8.push(m.digit); }
      if (ok8 && guardOk(runs, mid8 + 21, 3, mod)) { const code = `${l8.join('')}${r8.join('')}`; if (checkDigitOk(code)) return code; }
    }
  }
  return null;
}

// eine Bildzeile (Helligkeiten) → Läufe; Schwelle aus dem lokalen Minimum/Maximum
function rowRuns(lum) {
  const n = lum.length;
  const s = new Float32Array(n);
  for (let x = 0; x < n; x++) s[x] = (lum[Math.max(0, x - 1)] + 2 * lum[x] + lum[Math.min(n - 1, x + 1)]) / 4;
  const win = Math.max(16, Math.round(n / 8));
  const runs = [];
  let cur = null, len = 0;
  for (let x = 0; x < n; x++) {
    let lo = 255, hi = 0;
    for (let k = Math.max(0, x - win); k < Math.min(n, x + win); k += 2) { if (s[k] < lo) lo = s[k]; if (s[k] > hi) hi = s[k]; }
    const dark = hi - lo < 30 ? false : s[x] < (lo + hi) / 2;
    if (cur === null) { cur = dark; len = 1; } else if (dark === cur) len++; else { runs.push({ dark: cur, len }); cur = dark; len = 1; }
  }
  runs.push({ dark: cur, len });
  // beginnend mit einem hellen Lauf (Ruhezone), dann abwechselnd
  if (runs[0]?.dark) runs.unshift({ dark: false, len: 0 });
  return runs.map((r) => r.len);
}

export function decodeImageData(img) {
  const { data, width, height } = img;
  const rows = 21;
  for (let r = 0; r < rows; r++) {
    const y = Math.round(height * (0.2 + (0.6 * r) / (rows - 1)));
    const lum = new Float32Array(width);
    for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; lum[x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; }
    const runs = rowRuns(lum);
    // auch kopfüber: umgedreht muss die Folge wieder mit einem hellen Lauf beginnen
    const rev = runs.slice().reverse();
    const code = decodeRuns(runs) || decodeRuns(runs.length % 2 === 0 ? [0, ...rev] : rev);
    if (code) return code;
  }
  return null;
}
export function decodeCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

export const scannerSupported = () => !!navigator.mediaDevices?.getUserMedia;

let detector;
async function nativeDetector() {
  if (detector !== undefined) return detector;
  detector = null;
  try {
    if ('BarcodeDetector' in window) {
      const f = await window.BarcodeDetector.getSupportedFormats();
      const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((x) => f.includes(x));
      if (want.length) detector = new window.BarcodeDetector({ formats: want });
    }
  } catch { detector = null; }
  return detector;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Vollbild-Scanner → Barcode (Ziffern) oder null
export function scanBarcode({ title = 'Barcode scannen' } = {}) {
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'scan-overlay';
    o.innerHTML = `<div class="scan-top"><button class="scan-x" data-x aria-label="Schließen">✕</button><b>${esc(title)}</b><button class="scan-torch" data-torch hidden aria-label="Licht">💡</button></div>
      <div class="scan-stage"><video playsinline muted autoplay></video><div class="scan-frame"><i></i></div><p class="scan-msg">Barcode in den Rahmen halten</p></div>
      <form class="scan-manual"><input inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="Nummer eingeben" aria-label="Barcode-Nummer"><button>OK</button></form>`;
    document.body.appendChild(o);
    const video = o.querySelector('video');
    const msg = o.querySelector('.scan-msg');
    let stream = null, timer = null, done = false, last = '', torch = false;
    const canvas = document.createElement('canvas');
    const finish = (v) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* egal */ }
      o.remove();
      resolve(v);
    };
    o.querySelector('[data-x]').addEventListener('click', () => finish(null));
    o.querySelector('.scan-manual').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.querySelector('input').value.replace(/\D/g, '');
      if (checkDigitOk(v) || (v.length >= 8 && v.length <= 14)) finish(v); else msg.textContent = 'Bitte die ganze Nummer unter dem Barcode eingeben.';
    });
    const hit = (code) => {
      if (!code || !checkDigitOk(code)) return;
      if (code === last) { try { navigator.vibrate?.(60); } catch { /* egal */ } finish(code.length === 12 ? `0${code}` : code); }
      last = code;
    };
    (async () => {
      if (!scannerSupported()) { msg.textContent = 'Keine Kamera verfügbar – gib die Nummer unten ein.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        msg.textContent = e?.name === 'NotAllowedError'
          ? 'Kein Kamerazugriff. Auf dem iPhone: Einstellungen → Safari (bzw. die App) → Kamera erlauben. Oder Nummer unten eingeben.'
          : 'Kamera nicht verfügbar – gib die Nummer unten ein.';
        return;
      }
      if (done) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* iOS startet trotzdem */ }
      const track = stream.getVideoTracks()[0];
      try {
        if (track.getCapabilities?.().torch) {
          const b = o.querySelector('[data-torch]');
          b.hidden = false;
          b.addEventListener('click', async () => { torch = !torch; try { await track.applyConstraints({ advanced: [{ torch }] }); } catch { /* egal */ } });
        }
      } catch { /* egal */ }
      const det = await nativeDetector();
      timer = setInterval(async () => {
        if (done || video.readyState < 2) return;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw) return;
        if (det) {
          try { const r = await det.detect(video); if (r[0]?.rawValue) hit(r[0].rawValue.replace(/\D/g, '')); } catch { /* weiter */ }
          return;
        }
        // mittleren Bereich ausschneiden und verkleinern
        const cw = Math.min(900, vw), ch = Math.round(cw * 0.45);
        canvas.width = cw; canvas.height = ch;
        const sx = (vw - Math.min(vw, vw * 0.9)) / 2, sy = (vh - (vw * 0.9 * 0.45)) / 2;
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, sx, Math.max(0, sy), vw * 0.9, vw * 0.9 * 0.45, 0, 0, cw, ch);
        hit(decodeCanvas(canvas));
      }, 160);
    })();
  });
}
