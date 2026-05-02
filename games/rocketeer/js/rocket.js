// ============================================================
// ROCKETEER - Rocket Model
// ============================================================

const Rocket = (() => {
    const BUILDER_UNIT_IN_METERS = 0.1;

    function toWorldUnits(value) {
        return value * BUILDER_UNIT_IN_METERS;
    }

    function toBuilderUnits(value) {
        return value / BUILDER_UNIT_IN_METERS;
    }

    // Group parts by connectivity (adjacency) - TANKS ONLY
    function findConnectedGroups(parts) {
        const groups = [];
        const visited = new Set();
        const tanks = parts.filter(p => PARTS_CATALOG[p.partId]?.category === 'tank');

        for (const p of tanks) {
            if (visited.has(p.id)) continue;
            const group = [];
            const queue = [p];
            visited.add(p.id);

            while (queue.length > 0) {
                const curr = queue.shift();
                group.push(curr);

                // Find neighbor tanks
                const def = PARTS_CATALOG[curr.partId];
                for (const other of tanks) {
                    if (visited.has(other.id)) continue;
                    const oDef = PARTS_CATALOG[other.partId];

                    // Check if they touch
                    const touch = (Math.abs(curr.x - other.x) <= (def.width + oDef.width) / 2 + 2) &&
                        (Math.abs(curr.y - other.y) <= (def.height + oDef.height) / 2 + 2);

                    if (touch) {
                        visited.add(other.id);
                        queue.push(other);
                    }
                }
            }
            groups.push(group);
        }
        return groups;
    }

    // Build physics rocket from placed parts
    function buildFromParts(placedParts, bonusUpgrades = {}) {
        if (!placedParts || placedParts.length === 0) return null;

        // Connectivity and Fuel Groups
        const connections = getConnections(placedParts);
        const tankGroups = findConnectedGroups(placedParts);
        const fuelGroups = [];

        // 1. Calculate Bonuses First
        let fuelBonus = 1.0;
        let thrustBoost = 1.0;
        let sasBoost = 1.0;
        let rewardMultiplier = 1.0;

        for (const pp of placedParts) {
            const def = PARTS_CATALOG[pp.partId];
            if (!def || def.category !== 'bonus') continue;
            const lvl = bonusUpgrades[pp.partId] || 0;
            if (def.bonus?.fuelBonus) fuelBonus *= (def.bonus.fuelBonus + lvl * 0.25);
            if (def.bonus?.thrustBoost) thrustBoost *= (def.bonus.thrustBoost + lvl * 0.25);
            if (def.bonus?.sasBoost) sasBoost *= (def.bonus.sasBoost + lvl * 0.25);
            if (def.bonus?.rewardMultiplier) rewardMultiplier *= (def.bonus.rewardMultiplier + lvl * 0.25);
        }

        // 2. Calculate Totals with Bonuses
        let totalMass = 0;
        let totalFuelMass = 0;
        let totalDrag = 0;
        let maxWidth = 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let sumMX = 0, sumMY = 0;

        for (const pp of placedParts) {
            const def = PARTS_CATALOG[pp.partId];
            if (!def) continue;

            const fuelM = (def.fuelMass || 0) * (pp.config?.fuelRatio ?? 1) * fuelBonus;
            const dryM = (def.mass || 0) - (def.fuelMass || 0);
            const m = dryM + fuelM;

            totalMass += m;
            totalFuelMass += fuelM;
            sumMX += pp.x * m;
            sumMY += pp.y * m;

            totalDrag += def.dragCoeff * (def.width * def.height) / 10000;
            maxWidth = Math.max(maxWidth, def.width);

            minX = Math.min(minX, pp.x - def.width / 2);
            maxX = Math.max(maxX, pp.x + def.width / 2);
            minY = Math.min(minY, pp.y - def.height / 2);
            maxY = Math.max(maxY, pp.y + def.height / 2);
        }

        // Determine Primary Cockpit
        const cockpitParts = placedParts.filter(p => PARTS_CATALOG[p.partId]?.category === 'cockpit');
        const primaryCockpit = cockpitParts.find(p => p.config?.isMain) || cockpitParts[0];
        const hasCockpit = !!primaryCockpit;

        const comX = totalMass > 0 ? sumMX / totalMass : (minX + maxX) / 2;
        const comY = totalMass > 0 ? sumMY / totalMass : (minY + maxY) / 2;

        tankGroups.forEach((group, idx) => {
            const totalFuel = group.reduce((s, p) => {
                const def = PARTS_CATALOG[p.partId];
                const ratio = p.config?.fuelRatio ?? 1;
                return s + (def.fuelMass || 0) * ratio;
            }, 0);
            const boostedFuel = totalFuel * fuelBonus;
            fuelGroups.push({
                id: group[0].id,
                parts: group.map(p => p.id),
                tanks: group.map(p => p.id),
                totalFuelMass: boostedFuel,
                fuelMass: boostedFuel,
                name: group[0].partId
            });
        });

        // Engines and RCS/SAS already have boosters from first pass
        const engines = [];
        let totalRCSThrust = 0;

        for (const pp of placedParts) {
            const def = PARTS_CATALOG[pp.partId];
            if (!def) continue;

            if (def.category === 'engine') {
                // Find which tank group this engine is attached to
                const group = fuelGroups.find(g => (g.tanks || []).some(tid => connections.get(pp.id)?.includes(tid)));
                engines.push({
                    partInstanceId: pp.id,
                    partId: pp.partId,
                    thrust: def.thrust * thrustBoost,
                    isp: def.isp * thrustBoost, // Boost ISP so extra thrust doesn't consume more fuel
                    gimbal: def.gimbal || 0,
                    active: false,
                    fuelGroupId: group ? group.id : null,
                    x: pp.x, y: pp.y,
                    localX: toWorldUnits(pp.x - comX)
                });
            }
            if (def.rcsThrust) totalRCSThrust += def.rcsThrust;
        }

        return {
            totalMass, rcsThrust: totalRCSThrust,
            totalFuelMass, fuelGroups,
            totalDrag,
            crossSection: Math.pow(maxWidth * BUILDER_UNIT_IN_METERS, 2),
            engines,
            hasCockpit,
            placedParts,
            sasBoost,
            fuelBonus,
            rewardMultiplier,
            _centerX: (minX + maxX) / 2,
            _centerY: (minY + maxY) / 2,
            _comX: comX,
            _comY: comY,
            _bottomOffset: toWorldUnits(maxY - comY) // Distance from CoM to rocket base in world meters
        };
    }

    // Create initial physics state from rocket
    function initialState(rocket, launchX, launchY, bottomOffset = 0) {
        return {
            x: launchX || 0,
            y: launchY || 0,
            vx: 0,
            vy: 0,
            angle: 0, // pointing up
            angularVel: 0,
            mass: rocket.totalMass,
            fuelMass: rocket.totalFuelMass,
            fuelGroups: JSON.parse(JSON.stringify(rocket.fuelGroups || [])),
            time: 0,
            altitude: 0,
            bottomOffset: bottomOffset, // Relative altitude reference
            speed: 0,
            ax: 0,
            ay: 0,
            hasThrust: false,
            crashed: false,
            outOfFuel: false,
            stage: 0,
            sasTargetAngle: 0,
            sasWasEnabled: false,
        };
    }

    function getConnections(parts) {
        const connections = new Map();
        parts.forEach(p => connections.set(p.id, []));

        for (let i = 0; i < parts.length; i++) {
            for (let j = i + 1; j < parts.length; j++) {
                const p1 = parts[i], p2 = parts[j];
                const d1 = PARTS_CATALOG[p1.partId], d2 = PARTS_CATALOG[p2.partId];
                if (!d1 || !d2) continue;

                const dx = Math.abs(p1.x - p2.x);
                const dy = Math.abs(p1.y - p2.y);
                const combinedWidth = (d1.width + d2.width) / 2;
                const combinedHeight = (d1.height + d2.height) / 2;

                // Tighter box-touch check (5px) to prevent bypassing decouplers
                if (dx <= combinedWidth + 5 && dy <= combinedHeight + 5) {
                    connections.get(p1.id).push(p2.id);
                    connections.get(p2.id).push(p1.id);
                }
            }
        }
        return connections;
    }

    function getDisconnectedParts(placedParts, rootId) {
        if (!rootId) return [];
        const connections = getConnections(placedParts);
        const connectedToRoot = new Set();
        const stack = [rootId];
        connectedToRoot.add(rootId);
        while (stack.length > 0) {
            const currId = stack.pop();
            const neighbors = connections.get(currId) || [];
            for (const nextId of neighbors) {
                if (!connectedToRoot.has(nextId)) {
                    connectedToRoot.add(nextId);
                    stack.push(nextId);
                }
            }
        }
        return placedParts.filter(p => !connectedToRoot.has(p.id));
    }

    // Calculate total build cost of placed parts
    function totalBuildPrice(placedParts) {
        let total = 0;
        for (const pp of placedParts) {
            const def = PARTS_CATALOG[pp.partId];
            if (def) total += def.buildCost || 0;
        }
        return total;
    }

    // Calculate delta-V for each stage
    function calculateDeltaV(initialPlacedParts, manualStages = [], bonusUpgrades = {}) {
        let currentParts = JSON.parse(JSON.stringify(initialPlacedParts || []));
        let results = [];
        let totalMass = totalMassFromParts(currentParts, bonusUpgrades);

        const root = currentParts.find(p => p.config?.isMain) ||
            currentParts.find(p => PARTS_CATALOG[p.partId]?.category === 'cockpit') ||
            currentParts[0];
        const rootId = root ? root.id : null;

        // Iterate stages from highest index (first to fire) to 0
        for (let i = manualStages.length - 1; i >= 0; i--) {
            const stage = manualStages[i];
            let stageFuel = 0;
            let stageEngines = [];

            const enginesActivated = stage.elements.filter(el => el.type === 'engine').map(el => el.partId);

            for (const engId of enginesActivated) {
                const pp = currentParts.find(p => p.id === engId);
                if (pp) {
                    const def = PARTS_CATALOG[pp.partId];
                    if (def) stageEngines.push(def);
                }
            }

            // Find all fuel connected to these active engines
            const fuelGroups = buildFromParts(currentParts, bonusUpgrades)?.fuelGroups || [];

            let stageFuelIds = new Set();
            for (const engId of enginesActivated) {
                const pp = currentParts.find(p => p.id === engId);
                if (pp) {
                    const connections = getConnections(currentParts);
                    const engineGroup = fuelGroups.find(g => (g.tanks || []).some(tid => connections.get(engId)?.includes(tid)));
                    if (engineGroup) {
                        engineGroup.tanks.forEach(tid => stageFuelIds.add(tid));
                    }
                }
            }

            for (const tankId of stageFuelIds) {
                const pp = currentParts.find(p => p.id === tankId);
                if (pp) {
                    const def = PARTS_CATALOG[pp.partId];
                    if (def) stageFuel += (def.fuelMass || 0) * (pp.config?.fuelRatio ?? 1);
                }
            }

            // Apply fuel bonus to stage fuel
            let fuelBonus = 1.0;
            for (const pp of currentParts) {
                const def = PARTS_CATALOG[pp.partId];
                if (def && def.category === 'bonus' && def.bonus?.fuelBonus) {
                    const lvl = bonusUpgrades[pp.partId] || 0;
                    fuelBonus *= (def.bonus.fuelBonus + lvl * 0.25);
                }
            }
            stageFuel *= fuelBonus;

            const avgIsp = stageEngines.length > 0
                ? stageEngines.reduce((s, e) => s + e.isp, 0) / stageEngines.length
                : 0;

            const dryMass = totalMass - stageFuel;
            const dv = avgIsp > 0 && stageFuel > 0
                ? avgIsp * 9.80665 * Math.log(totalMass / dryMass)
                : 0;

            results.unshift({ stageFuel, avgIsp, dv: Math.round(dv), totalMass, dryMass });

            // Simulate dropping parts
            const decouplerIds = new Set(stage.elements.filter(el => el.type === 'decoupler').map(el => el.partId));
            if (decouplerIds.size > 0) {
                // Remove decouplers
                currentParts = currentParts.filter(p => !decouplerIds.has(p.id));
                // Remove disconnected parts
                const disconnected = getDisconnectedParts(currentParts, rootId);
                const disconnectedIds = new Set(disconnected.map(p => p.id));
                currentParts = currentParts.filter(p => !disconnectedIds.has(p.id));
            }
            totalMass = totalMassFromParts(currentParts, bonusUpgrades);
        }

        return results;
    }

    function totalMassFromParts(placedParts, bonusUpgrades = {}) {
        let fuelBonus = 1.0;
        for (const pp of placedParts) {
            const def = PARTS_CATALOG[pp.partId];
            if (def && def.category === 'bonus' && def.bonus?.fuelBonus) {
                const lvl = bonusUpgrades[pp.partId] || 0;
                fuelBonus *= (def.bonus.fuelBonus + lvl * 0.25);
            }
        }
        return placedParts.reduce((sum, pp) => {
            const def = PARTS_CATALOG[pp.partId];
            if (!def) return sum;
            const fuelM = (def.fuelMass || 0) * (pp.config?.fuelRatio ?? 1) * fuelBonus;
            const dryM = (def.mass || 0) - (def.fuelMass || 0);
            return sum + dryM + fuelM;
        }, 0);
    }

    function dryMassFromParts(placedParts) {
        return placedParts.reduce((sum, pp) => {
            const def = PARTS_CATALOG[pp.partId];
            if (!def) return sum;
            const fuelMass = def.fuelMass || 0;
            const dryMass = (def.mass || 0) - fuelMass;
            return sum + dryMass;
        }, 0);
    }

    // Money reward based on max distance achieved and speed (Distance/Time)
    function calculateReward(maxDistance, time) {
        // Safety check for NaN or undefined
        const dist = maxDistance || 0;
        const t = time || 0;

        // Base: 1 credit per 100m
        const base = dist / 100;

        // Tiered distance bonuses
        let bonus = 0;
        if (dist > 100000) bonus += 500;
        if (dist > 500000) bonus += 2000;
        if (dist > 1000000) bonus += 5000; // 1000 km
        if (dist > 10000000) bonus += 20000; // 10 Mm

        // Logarithmic speed bonus: capped at +10% of the distance reward
        const speed = dist / Math.max(1, t);
        // speedMultiplier starts at 1.0 and goes up to 1.1 (max +10%)
        const speedBonus = Math.log(speed / 100 + 1) * 0.05;
        const speedMultiplier = 1 + Math.min(0.10, speedBonus);

        const result = (base + bonus) * speedMultiplier;
        return isNaN(result) ? 0 : Math.floor(result);
    }

    return {
        buildFromParts,
        initialState,
        getDisconnectedParts,
        totalBuildPrice,
        calculateDeltaV,
        totalMassFromParts,
        dryMassFromParts,
        calculateReward,
        builderUnitInMeters: BUILDER_UNIT_IN_METERS,
        toWorldUnits,
        toBuilderUnits
    };
})();
