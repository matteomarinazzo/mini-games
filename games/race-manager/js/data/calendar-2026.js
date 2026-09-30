/** Calendrier de référence 2026. Les dates sont les dimanches de Grand Prix. */
export const CALENDAR_2026 = Object.freeze([
  ['australia', 'Grand Prix d’Australie', 'Albert Park, Melbourne', '2026-03-08'],
  ['china', 'Grand Prix de Chine', 'Shanghai International Circuit', '2026-03-15'],
  ['japan', 'Grand Prix du Japon', 'Suzuka International Racing Course', '2026-03-29'],
  ['bahrain', 'Grand Prix de Bahreïn', 'Bahrain International Circuit, Sakhir', '2026-04-12'],
  ['saudi-arabia', 'Grand Prix d’Arabie saoudite', 'Jeddah Corniche Circuit', '2026-04-19'],
  ['miami', 'Grand Prix de Miami', 'Miami International Autodrome', '2026-05-03'],
  ['canada', 'Grand Prix du Canada', 'Circuit Gilles-Villeneuve, Montréal', '2026-05-24'],
  ['monaco', 'Grand Prix de Monaco', 'Circuit de Monaco', '2026-06-07'],
  ['barcelona', 'Grand Prix de Barcelone-Catalogne', 'Circuit de Barcelona-Catalunya', '2026-06-14'],
  ['austria', 'Grand Prix d’Autriche', 'Red Bull Ring, Spielberg', '2026-06-28'],
  ['great-britain', 'Grand Prix de Grande-Bretagne', 'Silverstone Circuit', '2026-07-05'],
  ['belgium', 'Grand Prix de Belgique', 'Circuit de Spa-Francorchamps', '2026-07-19'],
  ['hungary', 'Grand Prix de Hongrie', 'Hungaroring, Budapest', '2026-07-26'],
  ['netherlands', 'Grand Prix des Pays-Bas', 'Circuit Zandvoort', '2026-08-23'],
  ['italy', 'Grand Prix d’Italie', 'Autodromo Nazionale Monza', '2026-09-06'],
  ['spain', 'Grand Prix d’Espagne', 'Circuit de Madrid', '2026-09-13'],
  ['azerbaijan', 'Grand Prix d’Azerbaïdjan', 'Baku City Circuit', '2026-09-26'],
  ['singapore', 'Grand Prix de Singapour', 'Marina Bay Street Circuit', '2026-10-11'],
  ['united-states', 'Grand Prix des États-Unis', 'Circuit of the Americas, Austin', '2026-10-25'],
  ['mexico', 'Grand Prix du Mexique', 'Autódromo Hermanos Rodríguez, Mexico', '2026-11-01'],
  ['brazil', 'Grand Prix de São Paulo', 'Autódromo José Carlos Pace', '2026-11-08'],
  ['las-vegas', 'Grand Prix de Las Vegas', 'Las Vegas Strip Circuit', '2026-11-21'],
  ['qatar', 'Grand Prix du Qatar', 'Lusail International Circuit', '2026-11-29'],
  ['abu-dhabi', 'Grand Prix d’Abou Dabi', 'Yas Marina Circuit', '2026-12-06'],
].map(([id, name, circuit, raceDate], index) => Object.freeze({
  id, name, circuit, raceDate, round: index + 1,
  trainingDates: [-4, -3, -2].map((days) => shiftDate(raceDate, days)),
  qualifyingDate: shiftDate(raceDate, -1),
})));

function shiftDate(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
