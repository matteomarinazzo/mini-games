import { DEPT_KEYS } from './constants.js';

export function applyRegulationChanges(save) {
    const departments = DEPT_KEYS || ['aero', 'chassis', 'power'];

    // Tirage aléatoire de 1 à 2 départements affectés
    const numDepts = Math.floor(Math.random() * 2) + 1;
    const affectedDepts = departments.sort(() => 0.5 - Math.random()).slice(0, numDepts);

    const logs = [];

    save.teams.forEach(team => {
        affectedDepts.forEach(dept => {
            // Variation aléatoire bornée entre -15% et +15%
            const variation = (Math.random() * 0.3) - 0.15;
            const oldValue = team.departmentRatings[dept];
            const newValue = Math.max(1, Math.min(100, Math.floor(oldValue * (1 + variation))));

            team.departmentRatings[dept] = newValue;

            const diff = newValue - oldValue;
            if (diff !== 0) {
                logs.push({ teamId: team.id, teamName: team.name, dept: dept, diff: diff, before: oldValue, after: newValue });
            }
        });
    });

    return { affectedDepts, logs };
}