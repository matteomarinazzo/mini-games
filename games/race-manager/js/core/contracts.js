/** Contrats et marché des pilotes. Fonctions sans dépendance au DOM. */
export function getContract(driver) { return driver?.contract ?? null; }
export function isFree(driver) { return !driver?.contract || !driver.contract.teamId; }
export function seasonsRemaining(driver, season) {
  const c = getContract(driver);
  if (!c) return 0;
  return Math.max(0, Number(c.endSeason) - Number(season));
}
export function contractExpiresThisSeason(driver, season) {
  const c = getContract(driver);
  return !!c && Number(c.endSeason) <= Number(season);
}
export function listMarketDrivers(drivers, season) {
  return (drivers || []).filter((d) => isFree(d) || contractExpiresThisSeason(d, season));
}

export function migrateContracts(save, season = save?.season ?? new Date().getFullYear()) {
  if (!save || typeof save !== 'object') return save;
  return { ...save, drivers: (save.drivers || []).map((d) => ({ ...d, contract: d.contract === null ? null : (d.contract && typeof d.contract === 'object' ? { teamId: d.contract.teamId ?? d.teamId, salary: d.contract.salary ?? 0, signingCost: d.contract.signingCost ?? 0, startSeason: d.contract.startSeason ?? season, endSeason: d.contract.endSeason ?? season + 1, loyalty: d.contract.loyalty ?? null } : { teamId: d.teamId, salary: 0, signingCost: 0, startSeason: season, endSeason: season + 1, loyalty: null }) })) };
}

/** Agrège l'affichage à partir du classement déjà calculé par le moteur. */
export function aggregateStandings(save) {
  const teams = new Map((save.teams || []).map((t) => [t.id, t]));
  const drivers = new Map((save.drivers || []).map((d) => [d.id, d]));
  const driverRows = (save.standings?.drivers || []).map((e, i) => {
    const d = drivers.get(e.driverId);
    return { ...e, position: i + 1, name: d?.name ?? e.driverId, teamId: d?.teamId ?? null, team: teams.get(d?.teamId)?.name ?? '—', color: teams.get(d?.teamId)?.color ?? null };
  });
  const leader = driverRows[0]?.points ?? 0;
  const stats = new Map();
  for (const weekend of Object.values(save.weekends || {})) {
    for (const r of weekend?.race?.results || []) {
      const st = stats.get(r.driverId) || { wins: 0, podiums: 0 };
      if (r.position === 1) st.wins++;
      if (r.position <= 3) st.podiums++;
      stats.set(r.driverId, st);
    }
  }
  const driverOutput = driverRows.map((r) => ({ ...r, gap: leader - r.points, ...(stats.get(r.driverId) || { wins: 0, podiums: 0 }) }));
  const teamRows = (save.standings?.teams || []).map((e, i) => ({ ...e, position: i + 1, name: teams.get(e.teamId)?.name ?? e.teamId, color: teams.get(e.teamId)?.color ?? null }));
  const teamLeader = teamRows[0]?.points ?? 0;
  return { drivers: driverOutput, teams: teamRows.map((r) => ({ ...r, gap: teamLeader - r.points })) };
}
