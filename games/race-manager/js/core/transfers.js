/** Marché des transferts : événements différés et contrats signés. */
import { driverOverall, teamOverall } from './validation.js';
import { round2 } from './utils.js';

const dateMs = (d) => Date.parse(`${d}T12:00:00Z`);
const addDays = (d, n) => new Date(dateMs(d) + n * 86400000).toISOString().slice(0, 10);
const seasonOf = (save) => Number(save.season ?? String(save.gameDate).slice(0, 4));
const displayName = (d) => d?.displayName || d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || d?.id || 'Pilote inconnu';
const ensure = (save) => { if (!save.transfers) save.transfers = {}; if (!Array.isArray(save.transfers.scouting)) save.transfers.scouting = []; if (!Array.isArray(save.transfers.offers)) save.transfers.offers = []; if (!Array.isArray(save.transfers.signed)) save.transfers.signed = []; };
export function ensureTransferState(save) { ensure(save); return save.transfers; }
export function driverLabel(driver) { return displayName(driver); }

// V6 : Garde-fou pour compter les pilotes engagés
function countEngagedDrivers(save, teamId, nextSeason, excludeDriverId = null) {
  let count = 0;
  for (const d of save.drivers) {
    if (d.id === excludeDriverId) continue; // Ne pas compter le pilote ciblé (cas renouvellement)
    const isCurrent = d.contract && d.contract.teamId === teamId && Number(d.contract.endSeason) >= nextSeason;
    const isFuture = d.futureContract && d.futureContract.teamId === teamId && Number(d.futureContract.startSeason) === nextSeason;
    if (isCurrent || isFuture) count++;
  }
  return count;
}

export function prospectDriver(save, driverId, date = save.gameDate) {
  ensure(save);
  const d = save.drivers.find((x) => x.id === driverId);
  if (!d) return { ok: false, error: 'Pilote introuvable.' };

  // V6 : Garde-fou prospection
  const nextSeason = seasonOf(save) + 1;
  if (countEngagedDrivers(save, save.playerTeamId, nextSeason, driverId) >= 2) {
    return { ok: false, error: 'Vous avez déjà 2 pilotes engagés pour la saison prochaine.' };
  }

  if (save.transfers.scouting.some((x) => x.driverId === driverId && !x.completed)) return { ok: false, error: 'Une prospection est déjà en cours.' };
  const activeScouting = save.transfers.scouting.filter((x) => !x.completed).length;
  if (activeScouting >= 3) return { ok: false, error: 'Limite de 3 prospections simultanées atteinte.' };
  const entry = { id: `scout-${driverId}-${date}`, driverId, requestedOn: date, dueOn: addDays(date, 7), completed: false };
  save.transfers.scouting.push(entry); return { ok: true, entry };
}

export function offerDriver(save, driverId, slot, salary, years, date = save.gameDate) {
  ensure(save);
  const d = save.drivers.find((x) => x.id === driverId);
  const nSalary = Number(salary); const nYears = Number(years);
  if (!d) return { ok: false, error: 'Pilote introuvable.' };

  // V6 : Garde-fou offre
  const nextSeason = seasonOf(save) + 1;
  if (countEngagedDrivers(save, save.playerTeamId, nextSeason, driverId) >= 2) {
    return { ok: false, error: 'Vous avez déjà 2 pilotes engagés pour la saison prochaine.' };
  }

  if (!Number.isFinite(nSalary) || nSalary < 0 || !Number.isInteger(nYears) || nYears < 1) return { ok: false, error: 'Offre invalide.' };
  if (d.teamId === save.playerTeamId && !d.contract) return { ok: false, error: 'Ce pilote est déjà dans votre écurie.' };
  if (d.futureContract || save.transfers.signed.some((x) => x.driverId === driverId)) return { ok: false, error: 'Ce pilote a déjà signé un contrat en attente.' };
  if (save.transfers.offers.some((x) => x.driverId === driverId && !x.resolved)) return { ok: false, error: 'Une offre est déjà en cours pour ce pilote.' };
  const offer = { id: `offer-${driverId}-${date}`, driverId, targetTeamId: save.playerTeamId, slot: String(slot), salary: nSalary, years: nYears, offeredOn: date, dueOn: addDays(date, 3), resolved: false };
  save.transfers.offers.push(offer); return { ok: true, offer };
}

function acceptanceScore(save, offer, d) {
  const target = save.teams.find((t) => t.id === offer.targetTeamId); const current = save.teams.find((t) => t.id === d.teamId);
  const performanceGap = teamOverall(target) - teamOverall(current);
  const loyaltyPenalty = Math.max(0, Number(d.loyalty ?? d.contract?.loyalty ?? 50) - 50);
  const salaryGain = Number(offer.salary) - Number(d.contract?.salary ?? d.salary ?? 0);
  const timePenalty = Math.max(0, Number(d.contract?.endSeason ?? seasonOf(save) + 1) - seasonOf(save));
  const categoryBonus = d.category === 'F1' ? 8 : 0;
  const raw = 50 + performanceGap * 1.5 - loyaltyPenalty * 0.35 + salaryGain * 4 - timePenalty * 8 + categoryBonus;
  return { performanceGap, loyaltyPenalty, salaryGain, timePenalty, categoryBonus, score: Math.max(0, Math.min(100, Math.round(raw))) };
}

export function decideOffer(save, offer) {
  const d = save.drivers.find((x) => x.id === offer.driverId); const c = acceptanceScore(save, offer, d);
  const accepted = c.score >= 50; const reasons = [];
  if (!accepted) {
    if (c.loyaltyPenalty >= 15) reasons.push('trop fidèle à son écurie');
    if (c.performanceGap < 0) reasons.push('votre écurie est moins performante');
    if (c.salaryGain < 0.5) reasons.push('salaire insuffisant');
    if (c.timePenalty > 0) reasons.push(`encore ${c.timePenalty} an${c.timePenalty > 1 ? 's' : ''} de contrat`);
    if (!reasons.length) reasons.push('conditions de l’offre insuffisantes');
  }
  return { accepted, probability: c.score, score: c.score, reasons, components: c };
}

export function applyAcceptedOffer(save, offer, date = save.gameDate) {
  ensure(save); const d = save.drivers.find((x) => x.id === offer.driverId); if (!d) return { ok: false, error: 'Pilote introuvable.' };
  const startSeason = seasonOf(save) + 1; const signed = { ...offer, startSeason, endSeason: startSeason + offer.years - 1, signedOn: date };
  d.futureContract = { teamId: offer.targetTeamId, slot: offer.slot, salary: offer.salary, startSeason, endSeason: signed.endSeason };
  save.transfers.signed.push(signed); return { ok: true, signed };
}

export function replacementCascade(save, oldTeamId, slot, date) {
  const free = save.drivers.filter((d) => !d.teamId && !d.futureContract && d.id !== save.playerTeamId).sort((a, b) => driverOverall(b) - driverOverall(a));
  const recruit = free[0]; if (!recruit) return null;
  recruit.teamId = oldTeamId; recruit.contract = { teamId: oldTeamId, salary: recruit.salary ?? 0, startSeason: seasonOf(save), endSeason: seasonOf(save) + 1, loyalty: recruit.loyalty ?? null };
  return { teamId: oldTeamId, slot: String(slot), replacementId: recruit.id, replacementName: displayName(recruit), date };
}

function applySigned(save, date) {
  ensure(save); const year = Number(String(date).slice(0, 4)); if (!/\d{2}-01-01$/.test(date)) return [];
  const done = []; const pending = save.transfers.signed.filter((x) => Number(x.startSeason) === year);
  for (const signed of pending) {
    const d = save.drivers.find((x) => x.id === signed.driverId); if (!d) continue; const oldTeam = d.teamId; const oldSlot = d.contract?.slot || signed.slot || '1';
    if (oldTeam && oldTeam !== signed.targetTeamId) replacementCascade(save, oldTeam, oldSlot, date);
    const newTeam = save.teams.find((team) => team.id === signed.targetTeamId);
    // V6 : Le paiement des salaires de début d'année est géré dans initNewSeason (progression.js), 
    // on ne déduit plus l'argent ici pour éviter les doubles prélèvements à N+1
    d.teamId = signed.targetTeamId;
    d.contract = { teamId: signed.targetTeamId, salary: signed.salary, startSeason: signed.startSeason, endSeason: signed.endSeason, loyalty: d.contract?.loyalty ?? d.loyalty ?? null, slot: signed.slot };
    delete d.futureContract;
    done.push({ ...signed, oldTeamId: oldTeam });
  }
  save.transfers.signed = save.transfers.signed.filter((x) => !pending.includes(x)); return done;
}

export function processTransferEvents(save, date = save.gameDate) {
  ensure(save); const events = []; const applied = applySigned(save, date);
  for (const signed of applied) events.push({ date, type: 'transfer-start', signed, driverId: signed.driverId });
  for (const sc of save.transfers.scouting.filter((x) => !x.completed && x.dueOn === date)) { sc.completed = true; events.push({ date, type: 'scouting-complete', scouting: sc, driverId: sc.driverId }); }
  for (const offer of save.transfers.offers.filter((x) => !x.resolved && x.dueOn === date)) { const decision = decideOffer(save, offer); offer.resolved = true; offer.decision = decision; if (decision.accepted) applyAcceptedOffer(save, offer, date); events.push({ date, type: 'transfer-response', offer, decision, driverId: offer.driverId }); }
  return events;
}

export function transferEvents(save) { ensure(save); return [...save.transfers.scouting.filter((x) => !x.completed).map((x) => ({ date: x.dueOn, type: 'scouting-complete', scouting: x, driverId: x.driverId })), ...save.transfers.offers.filter((x) => !x.resolved).map((x) => ({ date: x.dueOn, type: 'transfer-response', offer: x, driverId: x.driverId }))]; }
export function driverConfidential(save, driverId) { const d = save.drivers.find((x) => x.id === driverId); return d ? { loyalty: d.loyalty ?? d.contract?.loyalty, contract: d.contract } : null; }