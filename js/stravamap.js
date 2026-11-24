// Strava-Aktivität → Workout in der App (gemeinsam für App und Server)

// Strava-Sportart → Übungsname in der App, mit Distanz?
export const SPORTS = {
  Run: ['Laufen', 1], TrailRun: ['Laufen', 1], VirtualRun: ['Laufband', 1],
  Ride: ['Radfahren', 1], MountainBikeRide: ['Radfahren', 1], GravelRide: ['Radfahren', 1], VirtualRide: ['Radfahren', 1],
  EBikeRide: ['E-Bike', 1], EMountainBikeRide: ['E-Bike', 1], Velomobile: ['Radfahren', 1], Handcycle: ['Handbike', 1],
  InlineSkate: ['Inliner', 1], RollerSki: ['Inliner', 1], IceSkate: ['Eislaufen', 1], Skateboard: ['Longboard', 1],
  Swim: ['Schwimmen', 1], Walk: ['Gehen', 1], Hike: ['Wandern', 1], Wheelchair: ['Rollstuhl', 1], Snowshoe: ['Schneeschuhwandern', 1],
  Rowing: ['Rudern', 1], VirtualRow: ['Rudermaschine', 1], Canoeing: ['Kanu', 1], Kayaking: ['Kajak', 1], StandUpPaddling: ['SUP', 1],
  Surfing: ['Surfen', 0], Kitesurf: ['Kitesurfen', 0], Windsurf: ['Windsurfen', 0], Sail: ['Segeln', 1],
  AlpineSki: ['Ski alpin', 1], BackcountrySki: ['Skitour', 1], NordicSki: ['Langlauf', 1], Snowboard: ['Snowboard', 1],
  Elliptical: ['Crosstrainer', 0], StairStepper: ['Stepper', 0], Yoga: ['Yoga', 0], Pilates: ['Pilates', 0],
  Soccer: ['Fußball', 0], Tennis: ['Tennis', 0], Badminton: ['Badminton', 0], Squash: ['Squash', 0], Padel: ['Padel', 0],
  Pickleball: ['Pickleball', 0], TableTennis: ['Tischtennis', 0], Racquetball: ['Racquetball', 0], Basketball: ['Basketball', 0],
  Volleyball: ['Volleyball', 0], Golf: ['Golf', 1], RockClimbing: ['Klettern', 0], Crossfit: ['Crossfit', 0],
  HighIntensityIntervalTraining: ['HIIT', 0], Workout: ['Cardio', 0],
  WeightTraining: null, // Krafttraining hat bei Strava keine Sätze – wird in der App erfasst
};

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function sportOf(a) {
  return has(SPORTS, a.sport_type) ? SPORTS[a.sport_type] : has(SPORTS, a.type) ? SPORTS[a.type] : [String(a.sport_type || a.type || 'Cardio').replace(/[^\wäöüÄÖÜß -]/g, '').slice(0, 40) || 'Cardio', 0];
}
// connectedAt: Aktivitäten von davor sind Historie (nur private Statistik, keine EP)
export function stravaWorkout(a, connectedAt = 0) {
  const map = sportOf(a);
  if (!map) return null;
  const start = Date.parse(a.start_date);
  if (!Number.isFinite(start)) return null;
  const [name, withDist] = map;
  const aid = String(a.id ?? '').replace(/\D/g, '');
  if (!aid) return null;
  const sec = Math.max(0, Math.min(86400, Math.round(Number(a.moving_time) || Number(a.elapsed_time) || 0)));
  if (!sec) return null;
  const elapsed = Math.max(sec, Math.min(86400, Math.round(Number(a.elapsed_time) || sec)));
  const km = withDist && Number(a.distance) > 0 ? Math.round(Number(a.distance)) / 1000 : null;
  const notes = [a.average_heartrate ? `Ø ${Math.round(a.average_heartrate)} bpm` : '', a.total_elevation_gain > 5 ? `${Math.round(a.total_elevation_gain)} hm` : '', a.average_watts ? `Ø ${Math.round(a.average_watts)} W` : ''].filter(Boolean).join(' · ');
  const w = {
    id: `strava-${aid}`, title: String(a.name || name).trim().slice(0, 120) || name, start, end: start + elapsed * 1000, source: 'strava',
    description: `Von Strava · https://www.strava.com/activities/${aid}`,
    exercises: [{ name, notes, supersetId: null, sets: [{ type: 'normal', weight: null, reps: null, distance: km, duration: sec, rpe: null }] }],
  };
  if (start < connectedAt) w.hist = true;
  return w;
}
