import { DEPT_KEYS } from './constants.js';

export function applyRegulationChanges(save) {
    const departments = DEPT_KEYS || ['aero', 'chassis', 'power'];

    // 1 ou 2 départements affectés
    const numDepts = Math.floor(Math.random() * 2) + 1;
    const affectedDepts = [...departments].sort(() => 0.5 - Math.random()).slice(0, numDepts);

    const logs = [];

    save.teams.forEach((team) => {
        affectedDepts.forEach((dept) => {
            // Variation aléatoire bornée [-15%, +15%]
            const variation = (Math.random() * 0.30) - 0.15;
            const oldValue = team.departmentRatings[dept];
            const newValue = Math.max(1, Math.min(100, Math.round(oldValue * (1 + variation))));

            team.departmentRatings[dept] = newValue;

            const diff = newValue - oldValue;
            logs.push({
                teamId: team.id,
                teamName: team.name,
                dept,
                diff,
                before: oldValue,
                after: newValue,
            });
        });
    });

    return { affectedDepts, logs };
}