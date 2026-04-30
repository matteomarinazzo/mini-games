// ============================================================
// ROCKETEER - Physics Engine
// ============================================================

const Physics = (() => {
    // Constants
    const G = 6.674e-11;
    const EARTH_MASS = 5.972e24;
    const EARTH_RADIUS = 6371000;
    const SEA_LEVEL_PRESSURE = 101325;
    const SCALE_HEIGHT = 8500;
    const SIM_DT = 1 / 60;

    // Atmosphere model
    function atmosphereDensity(altitude) {
        if (altitude < 0) return 1.225;
        if (altitude > 70000) return 0;
        return 1.225 * Math.exp(-altitude / SCALE_HEIGHT);
    }

    function atmospherePressure(altitude) {
        if (altitude < 0) return SEA_LEVEL_PRESSURE;
        if (altitude > 70000) return 0;
        return SEA_LEVEL_PRESSURE * Math.exp(-altitude / SCALE_HEIGHT);
    }

    // Gravity at altitude
    function gravity(altitude) {
        const r = EARTH_RADIUS + Math.max(0, altitude);
        return G * EARTH_MASS / (r * r);
    }

    // Drag force magnitude: F = 0.5 * rho * v^2 * Cd * A
    function dragForce(velocity, altitude, dragCoeff, crossSection) {
        const rho = atmosphereDensity(altitude);
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const drag = 0.5 * rho * speed * speed * dragCoeff * crossSection;
        return drag;
    }

    // ISP -> exhaust velocity
    function exhaustVelocity(isp) {
        return isp * 9.80665;
    }

    // Tsiolkovsky rocket equation: dv = ve * ln(m0/m1)
    function deltaV(wetMass, dryMass, isp) {
        if (dryMass <= 0 || wetMass <= dryMass) return 0;
        return exhaustVelocity(isp) * Math.log(wetMass / dryMass);
    }

    // Thrust force based on throttle, altitude (accounting for nozzle back-pressure)
    function effectiveThrust(engineThrust, throttle, altitude, isp) {
        // Simple model: thrust slightly reduced in atmosphere
        const pressureFactor = 1 - 0.1 * (atmospherePressure(altitude) / SEA_LEVEL_PRESSURE);
        return engineThrust * throttle * pressureFactor;
    }

    function referencePoint(x, y, angle = 0, bottomOffset = 0) {
        const refX = x + Math.sin(angle) * bottomOffset;
        const refY = y - Math.cos(angle) * bottomOffset;
        return { x: refX, y: refY };
    }

    function step(state, rocket, inputs, dt) {
        dt = dt || SIM_DT;
        const altitude = state.y; // Center-of-mass height used for atmosphere/gravity

        // --- Gravity ---
        const g = gravity(altitude);
        const ax_grav = 0;
        const ay_grav = -g;

        // --- Thrust & Torque ---
        let ax_thrust = 0, ay_thrust = 0;
        let torque_thrust = 0;
        let hasThrust = false;

        if (inputs.throttle > 0 && rocket.engines.length > 0) {
            rocket.engines.forEach(eng => {
                if (!eng.active) return;

                // Check if this engine's group has fuel
                const group = (state.fuelGroups || []).find(g => g.id === eng.fuelGroupId);
                if (group && group.fuelMass > 0) {
                    const thrust = effectiveThrust(eng.thrust, inputs.throttle, altitude, eng.isp);
                    const ve = exhaustVelocity(eng.isp);
                    const mdot = thrust / ve;

                    const gimbal = inputs.gimbalAngle || 0;
                    const thrustAngle = state.angle + gimbal;

                    // Force components
                    const fx = thrust * Math.sin(thrustAngle);
                    const fy = thrust * Math.cos(thrustAngle);

                    ax_thrust += fx / state.mass;
                    ay_thrust += fy / state.mass;

                    // Torque: r x F
                    // eng.localX is precalculated relative to Mass Center (CoM)
                    // In Canvas: engine on Left (dx < 0) pushes nose Right (Clockwise = Positive)
                    // So torque = - (eng.localX * fy)
                    const dx = eng.localX || 0;
                    torque_thrust -= (fy * dx) / (state.mass * 8); // Scaled moment of inertia

                    const fuelUsed = mdot * dt;
                    group.fuelMass = Math.max(0, group.fuelMass - fuelUsed);
                    hasThrust = true;
                }
            });
        }

        // --- Aerodynamic Drag ---
        const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
        let ax_drag = 0, ay_drag = 0;
        if (speed > 0.01) {
            const drag = dragForce(
                { x: state.vx, y: state.vy },
                altitude,
                rocket.totalDrag,
                rocket.crossSection
            );
            // Drag opposes velocity
            ax_drag = -(drag / state.mass) * (state.vx / speed);
            ay_drag = -(drag / state.mass) * (state.vy / speed);
        }

        // Torque / Rotation
        let angularAccel = 0;

        // Manual rotation
        let isManualTurning = inputs.rotateLeft || inputs.rotateRight;
        let rotAuthority = 1.2;

        if (inputs.rotateLeft) angularAccel -= rotAuthority;
        if (inputs.rotateRight) angularAccel += rotAuthority;

        // Apply engine torque
        angularAccel += torque_thrust;

        // Detect SAS activation and lock target angle
        if (inputs.sasEnabled && !state.sasWasEnabled) {
            state.sasTargetAngle = state.angle;
        }
        state.sasWasEnabled = inputs.sasEnabled;

        // Natural damping (always active)
        angularAccel -= state.angularVel * 0.8;

        // Aerodynamic torque damping (fins stabilize, proportional to air density)
        if (speed > 1 && altitude < 60000) {
            const airFactor = atmosphereDensity(altitude) / 1.225;
            const aeroDamp = -(state.angularVel) * 1.5 * airFactor;
            angularAccel += aeroDamp;
        }

        // Clamp angular acceleration to prevent crazy spin
        angularAccel = Math.max(-8, Math.min(8, angularAccel));

        // --- Integrate ---
        const ax = ax_grav + ax_thrust + ax_drag;
        const ay = ay_grav + ay_thrust + ay_drag;

        let newVx = state.vx + ax * dt;
        let newVy = state.vy + ay * dt;
        let newX = state.x + state.vx * dt;
        let newY = state.y + state.vy * dt;

        let newAngularVel = state.angularVel + angularAccel * dt;
        let newAngle = state.angle + state.angularVel * dt;

        // --- Launchpad Clamps / Ground Support ---
        // If on the ground and not taking off with high thrust, keep perfectly stable and upright
        const groundY = state.bottomOffset || 0;
        const isOnPad = (state.y <= groundY + 0.1 && newVy <= 0.5);
        const isTakingOff = (hasThrust && ay_thrust > Math.abs(ay_grav) * 1.001); // 0.1% margin to prevent micro-lifting

        if (isOnPad && !isTakingOff) {
            newVy = 0;
            newVx *= 0.5; // Friction
            newY = groundY;

            // "Clamps" keep it vertical and stop rotation
            newAngularVel = 0;
            newAngle = 0;
        }

        // Consume fuel & update mass
        const newFuelMass = (state.fuelGroups || []).reduce((s, g) => s + g.fuelMass, 0);
        const dryMass = state.mass - state.fuelMass;
        const newMass = Math.max(dryMass, dryMass + newFuelMass);

        const refPoint = referencePoint(newX, newY, newAngle, state.bottomOffset || 0);
        const currentAltitude = Math.max(0, refPoint.y);

        const newState = {
            x: newX,
            y: newY,
            vx: newVx,
            vy: newVy,
            angle: newAngle,
            angularVel: newAngularVel,
            sasTargetAngle: state.sasTargetAngle,
            sasWasEnabled: state.sasWasEnabled,
            mass: newMass,
            fuelMass: newFuelMass,
            fuelGroups: state.fuelGroups,
            time: state.time + dt,
            altitude: currentAltitude,
            bottomOffset: state.bottomOffset,
            speed: Math.sqrt(newVx * newVx + newVy * newVy),
            ax, ay,
            hasThrust,
            crashed: false
        };

        // Ground collision / crash detection
        // On ne vérifie que si la fusée descend (vy < 0) et touche le sol
        // Ground collision / crash detection
        if (state.vy < 0 && newY <= (state.bottomOffset || 0)) {
            const impactSpeed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);

            // Conversion de l'angle en degrés pour faciliter le calcul
            const angleDeg = Math.abs(state.angle * 180 / Math.PI) % 360;
            // On vérifie si la fusée est "droite" (proche de 0°, 360° ou -360°)
            const isVertical = angleDeg < 15 || angleDeg > 345;

            // CRASH SI :
            // 1. Trop rapide (> 20 m/s)
            // 2. OU pas assez droite (> 15° d'inclinaison)
            if (impactSpeed > 20 || !isVertical) {
                newState.crashed = true;

                if (navigator.vibrate) {
                    // 200ms de vibration, 100ms de pause, 500ms de grosse vibration
                    navigator.vibrate([200, 100, 500]);
                }
            } else {
                // Atterrissage réussi : on remet l'angle pile à 0 pour qu'elle tienne debout
                newState.angle = 0;
                newState.landed = true;
            }

            // Physique au sol
            newState.y = state.bottomOffset || 0;
            newState.vy = 0;
            newState.vx *= 0.2;
            newState.angularVel = 0;
            newState.speed = Math.abs(newState.vx);
        }


        return newState;
    }

    // Calculate orbit info
    function orbitInfo(state) {
        const r = EARTH_RADIUS + state.y;
        const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
        const circularSpeed = Math.sqrt(G * EARTH_MASS / r);
        const escapeSpeed = circularSpeed * Math.sqrt(2);

        // Orbital energy
        const kineticEnergy = 0.5 * speed * speed;
        const potentialEnergy = -G * EARTH_MASS / r;
        const specificEnergy = kineticEnergy + potentialEnergy;

        return {
            speed,
            circularSpeed,
            escapeSpeed,
            isOrbiting: specificEnergy >= 0 || speed > circularSpeed * 0.95,
            specificEnergy,
            apoapsis: specificEnergy < 0 ? (-G * EARTH_MASS / (2 * specificEnergy)) - EARTH_RADIUS : Infinity
        };
    }

    // Distance from launch site
    function distanceFromOrigin(state, originX, originY) {
        const refPoint = referencePoint(state.x, state.y, state.angle || 0, state.bottomOffset || 0);
        const dx = refPoint.x - originX;
        const dy = refPoint.y - originY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Format distance for display
    function formatDistance(meters) {
        if (meters < 1000) return `${Math.round(meters)} m`;
        if (meters < 1e6) return `${(meters / 1000).toFixed(1)} km`;
        if (meters < 1e9) return `${(meters / 1e6).toFixed(2)} Mm`;
        return `${(meters / 1e9).toFixed(3)} Gm`;
    }

    function formatSpeed(ms) {
        if (ms < 1000) return `${Math.round(ms)} m/s`;
        return `${(ms / 1000).toFixed(2)} km/s`;
    }

    function formatAltitude(m) {
        if (m < 1000) return `${Math.round(m)} m`;
        if (m < 1e6) return `${(m / 1000).toFixed(1)} km`;
        return `${(m / 1e6).toFixed(2)} Mm`;
    }

    function stepGhost(g, dt) {
        const distSq = g.x * g.x + (g.y + EARTH_RADIUS) * (g.y + EARTH_RADIUS);
        const dist = Math.sqrt(distSq);
        const forceG = (G * EARTH_MASS) / (dist * dist);

        // Direction to center
        const dx = -g.x / dist;
        const dy = -(g.y + EARTH_RADIUS) / dist;

        const ax = dx * forceG;
        const ay = dy * forceG;

        const next_vx = g.vx + ax * dt;
        const next_vy = g.vy + ay * dt;
        const next_x = g.x + next_vx * dt;
        const next_y = g.y + next_vy * dt;

        return { x: next_x, y: next_y, vx: next_vx, vy: next_vy };
    }

    function stepDebris(d, dt) {
        // Simple gravity + ground collision
        const next_vx = d.vx;
        const next_vy = d.vy - 9.81 * dt;
        let next_x = d.x + next_vx * dt;
        let next_y = d.y + next_vy * dt;
        let next_angle = d.angle + d.angularVel * dt;
        let next_angularVel = d.angularVel;

        // Ground collision
        if (next_y < 0) {
            next_y = 0;
            if (Math.abs(next_vy) > 0.5) {
                return {
                    ...d,
                    x: next_x, y: 0,
                    vx: next_vx * 0.5,
                    vy: Math.abs(next_vy) * 0.2,
                    angle: next_angle,
                    angularVel: next_angularVel * 0.5
                };
            } else {
                return {
                    ...d,
                    x: next_x, y: 0,
                    vx: next_vx * 0.8,
                    vy: 0,
                    angle: next_angle,
                    angularVel: next_angularVel * 0.8
                };
            }
        }
        return {
            ...d,
            x: next_x, y: next_y,
            vx: next_vx, vy: next_vy,
            angle: next_angle,
            angularVel: next_angularVel
        };
    }

    return {
        step,
        orbitInfo,
        distanceFromOrigin,
        formatDistance,
        formatSpeed,
        formatAltitude,
        stepGhost,
        stepDebris,
        atmosphereDensity,
        gravity,
        EARTH_RADIUS
    };
})();
