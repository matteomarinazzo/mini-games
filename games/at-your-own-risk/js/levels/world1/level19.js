// N19 : 3 presses (blocs + piques dessous) en cycle ; la 3e est fausse, le sol derrière s'effondre.
const D = '#996b07';
const B = '#feb854';
const X = [220, 380, 540];
const fx = s => s.p.x + 13;

export default {
    name: 'Niveau 19',
    start: { x: 120, y: 368 },
    bounds: [94, 676],
    bg: D,
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 250, w: 600, h: 150, c: B },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            { id: 'g', k: 'gap', x: 600, y: 400, w: 60, h: 200, c: B, on: false },
            ...X.flatMap((x, i) => [
                { id: 'b' + i, k: 'deco', x, y: 0, w: 40, h: 250, c: D, state: "down" },
                { id: 's' + i + '_a', k: 'spike', x: x, y: 250, w: 20, h: 10, d: true, on: true, r: 2 },
                { id: 's' + i + '_b', k: 'spike', x: x + 20, y: 250, w: 20, h: 10, d: true, on: true, r: 2 }
            ])
        ],
        portal: { x: 670, y: 370, w: 30, h: 30 },
        rules: [
            // Pour toutes les presses : cycle perpétuel (haut/bas)
            {
                once: false,
                if: s => !s.f.p2stop,
                do: s => {
                    [0, 1, 2].forEach(i => {
                        const B = s.E['b' + i];
                        const SA = s.E['s' + i + '_a'];
                        const SB = s.E['s' + i + '_b'];

                        if (B.state == "down" && B.y < 140) {
                            if (B.id == "b0") {
                                B.y += 1;
                                SA.y += 1;
                                SB.y += 1;
                            }
                            else if (B.id == "b1") {
                                B.y += 2;
                                SA.y += 2;
                                SB.y += 2;
                            }
                            else {
                                B.y += 10;
                                SA.y += 10;
                                SB.y += 10;
                            }
                        }
                        else if (B.state == "down" && B.y >= 140) {
                            B.state = "up";
                        }
                        else if (B.state == "up" && B.y > 0) {
                            if (B.id == "b0") {
                                B.y -= 1;
                                SA.y -= 1;
                                SB.y -= 1;
                            }
                            else if (B.id == "b1") {
                                B.y -= 2;
                                SA.y -= 2;
                                SB.y -= 2;
                            }
                            else {
                                B.y -= 10;
                                SA.y -= 10;
                                SB.y -= 10;
                            }
                        }
                        else if (B.state == "up" && B.y == 0) {
                            B.state = "down";
                        }
                    });
                }
            },
            // Presse 2 : s'arrête quand le joueur est dessous
            {
                once: false,
                if: s => !s.f.p2stop,
                do: s => {
                    const B2 = s.E['b2'];

                    if (B2.state == "stop") {
                        return;
                    }

                    if (s.p.x >= B2.x) {
                        B2.state = "stop";
                    }

                }
            },
            // Quand le joueur approche du trou, il s'ouvre
            {
                if: s => fx(s) >= 580,
                do: s => {
                    s.E.g.on = true;
                }
            }
        ]
    })
};