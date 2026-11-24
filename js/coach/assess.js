// Einordnung der Ziele: realistisch / ambitioniert / zu ambitioniert – immer nur als Hinweis mit Gegenvorschlag

import { SPLITS, splitFor } from './splits.js';
import { AREAS as MOB_AREAS } from '../programs.js';
import { MOB_TARGETS, SPORTS, LEVELS, body, currentE1rm, cardioBaseline, totalWeeks, fmtDeadline, fmtHms, fmtPace, deadlineIn } from './core.js';
import { num, DAY, fmtKg } from '../utils.js';

export const VERDICTS = {
  done: { label: 'Schon erreicht', cls: 'good' },
  easy: { label: 'Gut machbar', cls: 'good' },
  ok: { label: 'Realistisch', cls: 'good' },
  ambitious: { label: 'Ambitioniert', cls: 'warn' },
  unrealistic: { label: 'Zu ambitioniert', cls: 'crit' },
  info: { label: 'Dein Plan', cls: 'info' },
};

const round = (v, step) => Math.round(v / step) * step;
const months = (g) => Math.max(0.25, (g.deadline - g.start) / (30.4 * DAY));
const weeksFromNow = (w) => deadlineIn(Math.max(1, Math.ceil(w)));
const MAX_WEEKS = 104; // Vorschläge höchstens 2 Jahre in die Zukunft
const verdictOf = (ratio) => (ratio <= 0.35 ? 'easy' : ratio <= 1 ? 'ok' : ratio <= 1.6 ? 'ambitious' : 'unrealistic');

// typische Kraftzuwächse pro Monat (geschätztes 1RM)
const ORM_RATE = { beginner: 0.045, inter: 0.018, adv: 0.007 };
// Muskelaufbau pro Monat (kg Muskelmasse, grobe Richtwerte)
const MUSCLE_KG = { beginner: [0.5, 1], inter: [0.25, 0.5], adv: [0.1, 0.25] };

// ---------- Workout-Ziel ----------
export function assessWorkout(g) {
  const lvl = g.level || 'inter';
  const out = { verdict: 'info', lines: [], proposals: [], notes: freqWorkout(g) };
  const W = totalWeeks(g);
  if (g.type === 'orm') {
    const c = g.current || currentE1rm(g.exercise);
    const t = g.target;
    if (!c || !t) { out.lines.push('Ohne aktuelles 1RM kann der Coach dein Ziel noch nicht einordnen.'); return out; }
    if (t <= c) {
      out.verdict = 'done';
      out.lines.push(`Dein geschätztes 1RM liegt schon bei ${fmtKg(c)} – das Ziel ${fmtKg(t)} hast du praktisch erreicht.`);
      const nt = round(c * (1 + ORM_RATE[lvl]) ** months(g), 2.5);
      out.proposals.push({ label: `Neues Ziel: ${fmtKg(nt)}`, sub: `bis ${fmtDeadline(g.deadline)}`, patch: { target: nt } });
      return out;
    }
    const r = ORM_RATE[lvl];
    const need = Math.log(t / c), can = months(g) * Math.log(1 + r);
    out.verdict = verdictOf(need / can);
    const reach = round(c * (1 + r) ** months(g), 2.5);
    out.lines.push(`Aktuell ca. ${fmtKg(c)} → Ziel ${fmtKg(t)} (+${num(((t - c) / c) * 100, 0)} %) in ${W} Wochen.`);
    out.lines.push(`${LEVELS[lvl]} schaffen typischerweise ca. ${num(r * 100, 1)} % pro Monat – bis ${fmtDeadline(g.deadline)} wären das etwa ${fmtKg(reach)}.`);
    if (out.verdict === 'ambitious' || out.verdict === 'unrealistic') {
      const wNeed = (need / Math.log(1 + r)) * 4.35 * 1.05;
      if (wNeed <= MAX_WEEKS) out.proposals.push({ label: `${fmtKg(t)} bis ${fmtDeadline(weeksFromNow(wNeed))}`, sub: 'gleiches Ziel, mehr Zeit', patch: { deadline: weeksFromNow(wNeed) } });
      if (reach > c) out.proposals.push({ label: `${fmtKg(reach)} bis ${fmtDeadline(g.deadline)}`, sub: 'gleiche Zeit, erreichbares Ziel', patch: { target: reach } });
    } else if (out.verdict === 'easy' && reach > t) {
      out.lines.push('Da ist wahrscheinlich noch mehr drin.');
      out.proposals.push({ label: `${fmtKg(reach)} bis ${fmtDeadline(g.deadline)}`, sub: 'etwas mehr wagen', patch: { target: reach } });
    }
    return out;
  }
  if (g.type === 'bw') {
    const c = g.current || body().weight;
    const t = g.target;
    if (!c || !t) { out.lines.push('Trag dein aktuelles Körpergewicht ein, damit der Coach das Ziel einordnen kann.'); return out; }
    const diff = t - c;
    if (Math.abs(diff) < 0.3) { out.verdict = 'done'; out.lines.push('Du bist schon praktisch bei deinem Zielgewicht – der Plan hält es und baut Kraft auf.'); return out; }
    const perWeek = Math.abs(diff) / W;
    const pct = (perWeek / c) * 100;
    const lose = diff < 0;
    const okPct = lose ? 0.7 : lvl === 'beginner' ? 0.5 : 0.3;
    const maxPct = lose ? 1.0 : lvl === 'beginner' ? 0.75 : 0.55;
    out.verdict = pct <= okPct * 0.4 ? 'easy' : pct <= okPct ? 'ok' : pct <= maxPct ? 'ambitious' : 'unrealistic';
    out.lines.push(`${fmtKg(c)} → ${fmtKg(t)}: ${lose ? '−' : '+'}${num(perWeek, 2)} kg pro Woche (${num(pct, 2)} % deines Gewichts).`);
    out.lines.push(lose
      ? 'Gesund und ohne viel Muskelverlust sind etwa 0,5–1 % pro Woche.'
      : `Ohne viel Fettzunahme sind etwa ${lvl === 'beginner' ? '0,25–0,5' : '0,15–0,3'} % pro Woche sinnvoll.`);
    const h = body().height;
    if (lose && h) {
      const bmi = t / (h / 100) ** 2;
      if (bmi < 18.5) {
        out.verdict = 'unrealistic';
        const safe = round(20 * (h / 100) ** 2, 0.5);
        out.lines.push(`Achtung: ${fmtKg(t)} liegt bei deiner Größe unter dem Normalgewicht (BMI ${num(bmi, 1)}).`);
        out.proposals.push({ label: `Ziel ${fmtKg(safe)}`, sub: 'BMI 20 – im gesunden Bereich', patch: { target: safe } });
        return out;
      }
    }
    if (out.verdict === 'ambitious' || out.verdict === 'unrealistic') {
      const rate = (okPct * 0.85 * c) / 100;
      const wNeed = Math.abs(diff) / rate;
      if (wNeed <= MAX_WEEKS) out.proposals.push({ label: `${fmtKg(t)} bis ${fmtDeadline(weeksFromNow(wNeed))}`, sub: `ca. ${num(rate, 2)} kg pro Woche`, patch: { deadline: weeksFromNow(wNeed) } });
      const reach = round(c + Math.sign(diff) * rate * W, 0.5);
      out.proposals.push({ label: `${fmtKg(reach)} bis ${fmtDeadline(g.deadline)}`, sub: 'gleiche Zeit, gesundes Tempo', patch: { target: reach } });
    }
    return out;
  }
  if (g.type === 'muscle') {
    const [a, b] = MUSCLE_KG[lvl];
    const m = months(g);
    out.lines.push(`Als ${LEVELS[lvl]} sind etwa ${num(a, 2)}–${num(b, 2)} kg Muskelmasse pro Monat realistisch – in ${W} Wochen also ca. ${num(a * m, 1)}–${num(b * m, 1)} kg.`);
    out.lines.push('Wichtig dafür: genug Eiweiß und ein leichter Kalorienüberschuss (siehe Ernährung auf der Startseite).');
    return out;
  }
  const r = ORM_RATE[lvl];
  out.lines.push(`Als ${LEVELS[lvl]} kannst du in ${W} Wochen mit etwa +${num(((1 + r) ** months(g) - 1) * 100, 0)} % auf deinen Grundübungen rechnen.`);
  return out;
}

// Häufigkeit & Split – nur Hinweise, deine Wahl zählt
export function freqWorkout(g, cardioPerWeek = 0) {
  const notes = [];
  const n = g.perWeek;
  const lvl = g.level || 'inter';
  if (n <= 1) notes.push({ text: 'Mit 1 Workout pro Woche geht es langsam voran – 2 Einheiten bringen fast doppelt so viel.', proposals: [{ label: '2 Workouts pro Woche', patch: { perWeek: 2 } }] });
  if (lvl === 'beginner' && n >= 6) notes.push({ text: `${n} Workouts pro Woche sind für den Einstieg viel – Muskeln und Sehnen brauchen Erholung.`, proposals: [{ label: '4 Workouts pro Woche', patch: { perWeek: 4 } }] });
  else if (n >= 7) notes.push({ text: 'Ganz ohne Ruhetag steigt das Verletzungsrisiko – ein freier Tag pro Woche hilft beim Wachsen.', proposals: [{ label: '6 Workouts pro Woche', patch: { perWeek: 6 } }] });
  const split = g.split && g.split !== 'auto' ? g.split : null;
  if (split) {
    const days = SPLITS[split].days.length;
    if (n < days) {
      const every = Math.round((days / n) * 7);
      const better = splitFor(n, lvl);
      notes.push({
        text: `Der ${SPLITS[split].label} hat ${days} Trainingstage – bei ${n} Workouts pro Woche kommt jeder Muskel nur etwa alle ${every} Tage dran. Geht trotzdem, wenn es dir Spaß macht!`,
        proposals: better !== split ? [{ label: `${SPLITS[better].label} statt ${SPLITS[split].label}`, patch: { split: better } }] : [],
      });
    }
  }
  const total = n + cardioPerWeek;
  if (cardioPerWeek && (total > 9 || (lvl === 'beginner' && total > 6))) {
    notes.push({ text: `Zusammen mit Cardio sind das ${total} Einheiten pro Woche – das ist viel. Achte auf Schlaf und Ruhetage.`, proposals: [{ label: `${Math.max(1, n - 1)} Workouts pro Woche`, patch: { perWeek: Math.max(1, n - 1) } }] });
  }
  return notes;
}

// ---------- Cardio-Ziel ----------
// Zeit, die du heute für die Zieldistanz bräuchtest (Riegel-Formel aus deiner längsten Einheit)
export function predictTime(g) {
  const S = SPORTS[g.sport];
  const b = g.baseline || cardioBaseline(g.sport);
  if (b?.km > 0 && b.sec > 0) return b.sec * (g.distance / b.km) ** S.exp;
  const v = S.speed[g.level || 'inter'];
  return (g.distance / v) * 3600 * (g.distance > 15 ? 1.05 : 1);
}
// Distanz, die die längste Einheit im Plan erreichen soll
export function peakLong(g) {
  const D = g.distance;
  if (g.sport !== 'run') return D;
  return D <= 12 ? D : D <= 21.1 ? D * 0.9 : Math.max(19, D * 0.75);
}
const TIME_RATE = { beginner: 0.012, inter: 0.006, adv: 0.003 }; // Zeitgewinn pro Woche

export function assessCardio(g) {
  const S = SPORTS[g.sport];
  const lvl = g.level || 'inter';
  const W = totalWeeks(g);
  const out = { verdict: 'ok', lines: [], proposals: [], notes: freqCardio(g) };
  const b = g.baseline || cardioBaseline(g.sport);
  const startKm = b?.km || g.distance * (lvl === 'beginner' ? 0.3 : lvl === 'inter' ? 0.45 : 0.6);
  const peak = peakLong(g);
  // Umfang: lange Einheit steigt um höchstens ~10 % pro Woche (plus Entlastungswochen)
  const distWeeks = startKm >= peak ? 0 : (Math.log(peak / startKm) / Math.log(1.1)) * 1.33 + 1;
  let ratio = distWeeks / Math.max(1, W - 1);
  const pred = predictTime(g);
  if (b) out.lines.push(`Deine längste Einheit zuletzt: ${num(b.km, 1)} km in ${fmtHms(b.sec)} (${fmtPace(g.sport, b.km / (b.sec / 3600))}).`);
  else out.lines.push(`Noch keine ${S.label}-Einheit mit Distanz im Verlauf – der Coach rechnet mit typischen Werten für ${LEVELS[lvl]}.`);
  if (distWeeks > 0) out.lines.push(`Von ${num(startKm, 1)} km auf ${num(peak, 1)} km als längste Einheit brauchst du gut ${Math.ceil(distWeeks)} Wochen (max. ~10 % mehr pro Woche).`);
  let needWeeks = distWeeks;
  if (g.time) {
    const need = Math.log(pred / g.time);
    const can = W * Math.log(1 + TIME_RATE[lvl]);
    out.lines.push(`${num(g.distance, 1)} km würdest du heute in etwa ${fmtHms(pred)} schaffen – Ziel: ${fmtHms(g.time)} (${fmtPace(g.sport, g.distance / (g.time / 3600))}).`);
    if (need <= 0) {
      if (distWeeks <= 0) out.verdict = 'done';
    } else {
      ratio = Math.max(ratio, need / Math.min(can, Math.log(1.2) * (W / 26 + 0.5)));
      needWeeks = Math.max(needWeeks, need / Math.log(1 + TIME_RATE[lvl]));
    }
    const reachT = Math.max(g.time, round(pred / (1 + TIME_RATE[lvl]) ** W, 60));
    if (out.verdict !== 'done') out.verdict = verdictOf(ratio);
    if (out.verdict === 'ambitious' || out.verdict === 'unrealistic') {
      if (needWeeks * 1.05 + 1 <= MAX_WEEKS) out.proposals.push({ label: `${num(g.distance, 1)} km in ${fmtHms(g.time)} bis ${fmtDeadline(weeksFromNow(needWeeks * 1.05 + 1))}`, sub: 'gleiches Ziel, mehr Zeit', patch: { deadline: weeksFromNow(needWeeks * 1.05 + 1) } });
      if (reachT > g.time + 30) out.proposals.push({ label: `${num(g.distance, 1)} km in ${fmtHms(reachT)} bis ${fmtDeadline(g.deadline)}`, sub: 'gleiche Zeit, etwas langsamer', patch: { time: reachT } });
      else {
        const rk = round(Math.min(peak, startKm * 1.1 ** ((W - 1) / 1.33)), 0.5);
        const rt = round(g.time * (rk / g.distance) ** S.exp, 60);
        if (rk > startKm && rk < g.distance) out.proposals.push({ label: `${num(rk, 1)} km in ${fmtHms(rt)} bis ${fmtDeadline(g.deadline)}`, sub: 'gleiche Zeit, kürzere Strecke im gleichen Tempo', patch: { distance: rk, time: rt } });
      }
    } else if (out.verdict === 'easy' && need > 0 && reachT < g.time - 120) {
      out.proposals.push({ label: `${num(g.distance, 1)} km in ${fmtHms(reachT)}`, sub: 'da geht wohl noch mehr', patch: { time: reachT } });
    } else if (out.verdict === 'done') {
      out.lines.push('Das schaffst du vermutlich schon heute!');
      out.proposals.push({ label: `${num(g.distance, 1)} km in ${fmtHms(round(pred / (1 + TIME_RATE[lvl]) ** W, 60))}`, sub: 'schnellere Zielzeit', patch: { time: round(pred / (1 + TIME_RATE[lvl]) ** W, 60) } });
    }
  } else {
    out.verdict = startKm >= peak ? 'done' : verdictOf(ratio);
    if (out.verdict === 'ambitious' || out.verdict === 'unrealistic') {
      if (distWeeks * 1.05 + 1 <= MAX_WEEKS) out.proposals.push({ label: `${num(g.distance, 1)} km bis ${fmtDeadline(weeksFromNow(distWeeks * 1.05 + 1))}`, sub: 'gleiches Ziel, mehr Zeit', patch: { deadline: weeksFromNow(distWeeks * 1.05 + 1) } });
      const reach = round(Math.min(peak, startKm * 1.1 ** ((W - 1) / 1.33)), 0.5);
      if (reach > startKm) out.proposals.push({ label: `${num(reach, 1)} km bis ${fmtDeadline(g.deadline)}`, sub: 'gleiche Zeit, kürzere Strecke', patch: { distance: reach } });
    }
  }
  return out;
}

export function freqCardio(g, gymPerWeek = 0) {
  const notes = [];
  const n = g.perWeek;
  const lvl = g.level || 'inter';
  const D = g.distance;
  const long = g.sport === 'run' ? D >= 21 : g.sport === 'bike' ? D >= 100 : D >= 40;
  const mid = g.sport === 'run' ? D >= 10 : g.sport === 'bike' ? D >= 50 : D >= 20;
  const min = long ? 3 : mid ? 2 : 1;
  const ideal = long ? 4 : mid ? 3 : 2;
  if (n < min) notes.push({ text: `Für ${num(D, 1)} km reichen ${n} Einheit${n > 1 ? 'en' : ''} pro Woche kaum – der Körper braucht regelmäßige Reize, um die Ausdauer aufzubauen.`, proposals: [{ label: `${ideal} Einheiten pro Woche`, patch: { perWeek: ideal } }] });
  if ((lvl === 'beginner' && n > 4) || n > 6) notes.push({ text: `${n} Cardio-Einheiten pro Woche sind ${lvl === 'beginner' ? 'für den Einstieg ' : ''}sehr viel – Gelenke und Sehnen passen sich langsamer an als die Ausdauer.`, proposals: [{ label: `${Math.max(ideal, lvl === 'beginner' ? 3 : 4)} Einheiten pro Woche`, patch: { perWeek: Math.max(ideal, lvl === 'beginner' ? 3 : 4) } }] });
  const total = n + gymPerWeek;
  if (gymPerWeek && (total > 9 || (lvl === 'beginner' && total > 6))) notes.push({ text: `Zusammen mit dem Krafttraining sind das ${total} Einheiten pro Woche – das ist viel.`, proposals: [{ label: `${Math.max(1, n - 1)} Cardio-Einheiten pro Woche`, patch: { perWeek: Math.max(1, n - 1) } }] });
  return notes;
}

// Kraft + Cardio zusammen: Hinweise zur Abstimmung (ohne Zwang)
export function comboNotes(gw, gc) {
  const notes = [];
  const legSport = ['run', 'walk', 'bike', 'skate', 'row'].includes(gc.sport);
  const legGoal = gw.type === 'orm' && /squat|kniebeuge|beinpresse|kreuzheben|deadlift|hackenschmidt|ausfallschritt|split squat|hip thrust/i.test(gw.exercise || '');
  const longGoal = gc.sport === 'run' ? gc.distance >= 15 : gc.sport === 'bike' ? gc.distance >= 80 : gc.distance >= 30;
  if (legSport) notes.push({ text: 'Kraft und Cardio werden zusammen geplant: kein Beintag direkt vor, nach oder am selben Tag wie lange oder harte Cardio-Einheiten. In der Cardio-Zielwoche werden die Beine geschont.', proposals: [] });
  if (legSport && legGoal && longGoal) notes.push({ text: `Maximalkraft in den Beinen (${gw.exercise}) und ein langes Ausdauerziel bremsen sich gegenseitig etwas. Der Plan nimmt dafür einen Satz Bein-Umfang raus – beides gleichzeitig geht, nur etwas langsamer.`, proposals: [] });
  return notes;
}

// ---------- Mobility-Ziel ----------
// Kein Zeitplan, keine feste Dauer: nur eine Einordnung der Häufigkeit – dein Vorschlag zählt
export function assessMobility(g, { gym = 0, cardio = 0 } = {}) {
  const out = { verdict: 'info', lines: [], proposals: [], notes: [] };
  const n = g.perWeek;
  const lvl = g.level || 'beginner';
  const areas = (g.areas?.length ? g.areas : ['full']).map((a) => MOB_AREAS[a]).join(', ');
  const ideal = Math.min(5, Math.max(lvl === 'beginner' ? 3 : 4, g.areas?.length >= 3 ? 4 : 3));
  out.lines.push(`Schwerpunkt: ${areas}. Der Coach wechselt die Routinen ab und plant kurze Einheiten rund um dein Training.`);
  out.lines.push('Haltezeiten und Runden wachsen sanft mit, nach einer Pause startet es leichter. Alle 4 Wochen gibt es eine leichte Woche.');
  if (n < 2) { out.lines.push('Mit 1 Einheit pro Woche geht es langsam voran – Beweglichkeit wächst mit Regelmäßigkeit.'); out.proposals.push({ label: `${ideal} Einheiten pro Woche`, sub: 'kurz und regelmäßig', patch: { perWeek: ideal } }); }
  else if (n < ideal && (g.target === 'splits' || g.target === 'squat')) { out.lines.push(`Für „${MOB_TARGETS[g.target].label}“ bringen ${ideal} Einheiten pro Woche spürbar mehr.`); out.proposals.push({ label: `${ideal} Einheiten pro Woche`, patch: { perWeek: ideal } }); }
  if (n > 5 && lvl === 'beginner') out.proposals.push({ label: '4 Einheiten pro Woche', sub: 'für den Einstieg reicht das gut', patch: { perWeek: 4 } });
  if (gym || cardio) out.notes.push({ text: 'Mobility wird mit deinem Training abgestimmt: Hüfte und Beine nach dem Beintag, Schulter und Rücken nach Oberkörper-Tagen, Regeneration nach harter Ausdauer. An Trainingstagen gibt es nur eine kurze Einheit.', proposals: [] });
  return out;
}
