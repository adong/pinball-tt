/* TT Pinball: the three tables (Space, Jungle, Candy) and the builder that turns a table into collision shapes.
   No Three.js here, so it runs in Node for tools/check.js too.

   Units: the playfield is 20 wide (x from 0 at the left to 20 at the right), y runs up the table from the drain
   (y = 0) to the top of the arch (y = 44.8). The ball has a radius of 0.5. The shooter lane is on the right,
   x from 20 to 21.6. Every table shares the lower half (flippers, slingshots, inlanes, outlanes), the arch, the
   shooter lane and its one-way gate, the left orbit lane with its spinner and three rollover lanes at the top.
   The upper playfield is each table's own: bumpers, ramps, drop targets and standup targets. */
(function (root) {
  'use strict';
  const PB = (root.PB = root.PB || {});

  const W = 20, LANE_X0 = 20, LANE_X1 = 21.6, ARC_CX = 10.8, ARC_CY = 34, ARC_R = 10.8;
  const WALL_R = 0.08;
  const PLUNGER_Y = 1.0;              // the plunger's tip, under the ball waiting in the shooter lane
  const DRAIN_Y = 1.0;                // a ball whose centre falls below this (outside the lane) is gone

  // Each table: its theme and its own upper playfield. Ramp paths are [x, y, height] from the mouth to the exit.
  const TABLES = [
    {
      id: 'space', name: 'Space', emoji: '🚀',
      bumpers: [[10.4, 31.2, 1.2], [14.1, 31.6, 1.2], [12.3, 28.0, 1.2]],
      ramps: [{
        id: 'rocket', name: 'ROCKET RAMP', at: [5.2, 23.0], dir: [0.03, 1], width: 2.3,
        path: [[5.2, 23, 0], [5.3, 26, 0.9], [5.6, 29.5, 1.9], [6.5, 33, 2.8], [8.5, 36.5, 3.5], [11.5, 38.6, 3.8],
          [15, 37.6, 3.7], [17.5, 34.5, 3.3], [18.6, 30, 2.7], [18.6, 24, 1.9], [18.2, 18.5, 1.0], [17.75, 15, 0.3], [17.75, 13.6, 0]],
      }],
      drops: [{ x: 8.6, y: 21.2, face: 'down' }, { x: 10.0, y: 21.2, face: 'down' }, { x: 11.4, y: 21.2, face: 'down' }],
      standups: [{ x: 19.25, y: 19.6, face: 'left' }, { x: 19.25, y: 21.8, face: 'left' }],
    },
    {
      id: 'jungle', name: 'Jungle', emoji: '🐒',
      bumpers: [[8.6, 30.6, 1.2], [12.2, 31.4, 1.2], [10.4, 27.6, 1.2]],
      ramps: [
        {
          id: 'vine', name: 'VINE RAMP', at: [4.4, 22.6], dir: [-0.04, 1], width: 2.3,
          path: [[4.4, 22.6, 0], [4.3, 25.8, 0.9], [4.6, 29.4, 1.9], [5.8, 33.2, 2.8], [8.4, 36.8, 3.5], [11.6, 38.8, 3.9],
            [15.2, 37.8, 3.8], [17.6, 34.4, 3.3], [18.6, 29.6, 2.7], [18.6, 24, 1.9], [18.2, 18.5, 1.0], [17.75, 15, 0.3], [17.75, 13.6, 0]],
        },
        {
          id: 'falls', name: 'WATERFALL RAMP', at: [15.6, 22.0], dir: [0.04, 1], width: 2.3,
          path: [[15.6, 22, 0], [15.7, 25.2, 0.9], [15.5, 28.8, 1.8], [14.6, 32.4, 2.6], [12.6, 35.4, 3.1], [9.6, 36.2, 3.3],
            [6.4, 35.2, 3.2], [3.6, 32.2, 2.8], [2.5, 27.2, 2.1], [2.3, 21, 1.2], [2.25, 16, 0.35], [2.25, 13.6, 0]],
        },
      ],
      drops: [{ x: 18.55, y: 16.4, face: 'left' }, { x: 18.55, y: 17.8, face: 'left' }, { x: 18.55, y: 19.2, face: 'left' }],
      standups: [{ x: 2.05, y: 24.0, face: 'right' }, { x: 2.05, y: 26.4, face: 'right' }],
    },
    {
      id: 'candy', name: 'Candy', emoji: '🍭',
      bumpers: [[7.6, 30.2, 1.05], [11.0, 32.4, 1.05], [14.4, 30.2, 1.05], [11.0, 27.9, 1.05]],
      ramps: [{
        id: 'cane', name: 'CANDY CANE RAMP', at: [10.0, 21.6], dir: [0, 1], width: 2.3,
        path: [[10, 21.6, 0], [10, 24.6, 0.9], [9.7, 28.2, 2.0], [8.6, 32.4, 3.0], [6.6, 35.6, 3.6], [4.2, 35.4, 3.6],
          [2.7, 32, 3.1], [2.35, 26.4, 2.2], [2.25, 20, 1.1], [2.25, 15.6, 0.3], [2.25, 13.6, 0]],
      }],
      drops: [{ x: 5.2, y: 19.4, face: 'down' }, { x: 6.6, y: 19.4, face: 'down' }, { x: 15.0, y: 19.4, face: 'down' }],
      standups: [{ x: 19.25, y: 21.0, face: 'left' }, { x: 2.05, y: 25.2, face: 'right' }],
    },
  ];

  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

  function seg(ax, ay, bx, by, o = {}) {
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    const dx = (bx - ax) / len, dy = (by - ay) / len;
    const r = o.r ?? WALL_R;
    return Object.assign({
      k: 'seg', ax, ay, bx, by, len, dx, dy, nx: -dy, ny: dx, r, e: 0.45, kind: 'wall', id: null, on: true,
      minx: Math.min(ax, bx) - r, maxx: Math.max(ax, bx) + r, miny: Math.min(ay, by) - r, maxy: Math.max(ay, by) + r,
    }, o);
  }
  function circ(x, y, r, o = {}) {
    return Object.assign({ k: 'circ', x, y, r, e: 0.45, kind: 'post', id: null, on: true, minx: x - r, maxx: x + r, miny: y - r, maxy: y + r }, o);
  }
  function trig(ax, ay, bx, by, o) {
    const len = Math.hypot(bx - ax, by - ay);
    return Object.assign({ ax, ay, bx, by, len, dx: (bx - ax) / len, dy: (by - ay) / len }, o);
  }
  function poly(out, pts, o) { for (let i = 0; i + 1 < pts.length; i++) out.push(seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], o)); }
  const mirror = (pts) => pts.map(([x, y]) => [W - x, y]);

  // The arch over the top, from the shooter lane (right) round to the left wall.
  function archPoints(n = 28) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      pts.push([ARC_CX + Math.cos(a) * ARC_R, ARC_CY + Math.sin(a) * ARC_R]);
    }
    return pts;
  }

  // A drop or standup target: a short face 1.1 wide. face says which way it looks (where the ball comes from).
  function targetSeg(t, kind, id) {
    const h = 0.55;
    const [ax, ay, bx, by] = t.face === 'down' ? [t.x + h, t.y, t.x - h, t.y] : t.face === 'left' ? [t.x, t.y - h, t.x, t.y + h] : [t.x, t.y + h, t.x, t.y - h];
    // the left normal of a->b points at the ball's side
    return seg(ax, ay, bx, by, { kind, id, e: 0.35, r: 0.12 });
  }

  // flipper settings by difficulty: EASY flippers are longer (the gap between them closes)
  const FLIP = { pivotX: 6.0, pivotY: 5.0, rest: -0.52, up: 0.5, r0: 0.55, r1: 0.28, len: { easy: 3.85, normal: 3.3 } };

  PB.build = function (def, easy) {
    const shapes = [], triggers = [], ramps = [], drops = [], standups = [], bumpers = [], slings = [];
    // ---------------------------------------------------------- the cabinet: outer wall, arch, shooter lane
    const arch = archPoints();
    poly(shapes, [[4, 0], [16, 0]], { kind: 'floor' });
    poly(shapes, [[16, 0], [16, 3.2], [20, 7.6]]);
    poly(shapes, [[4, 0], [4, 3.2], [0, 7.6], [0, ARC_CY]]);
    poly(shapes, arch.slice().reverse().concat([[LANE_X1, 0]]).reverse()); // lane outer wall up, then the arch to the left
    poly(shapes, [[LANE_X0, 0], [LANE_X1, 0]], { kind: 'floor' });
    shapes.push(seg(LANE_X0, PLUNGER_Y, LANE_X1, PLUNGER_Y, { kind: 'plunger', e: 0.2 }));
    poly(shapes, [[LANE_X0, 0], [LANE_X0, 31.2]]); // the shooter lane's inner wall
    // the one-way gate at the top of the lane: a ball going up passes, a ball coming down rolls off it to the left
    shapes.push(seg(LANE_X0 + 0.08, 31.2, LANE_X1, 32.6, { one: true, kind: 'gate', id: 'gate' }));
    // under it, a one-way guide that rolls the ball left into the bumpers (not straight down the right wall)
    shapes.push(seg(16.6, 28.9, LANE_X0 - 0.08, 30.8, { one: true, kind: 'gate', id: 'returnGate' }));
    // ---------------------------------------------------------- the left orbit lane, its spinner and its gate
    poly(shapes, [[1.75, 22.6], [1.75, 31]]);
    triggers.push(trig(0.1, 27, 1.65, 27, { kind: 'spinner', id: 'spinner' }));
    // a ball coming back down the orbit is turned into the playfield; one going up passes through
    shapes.push(seg(0.08, 21.3, 2.1, 19.5, { one: true, kind: 'gate', id: 'orbitGate' }));
    // ---------------------------------------------------------- the lower playfield (left, then mirrored)
    const guide = [[1.4, 12.2], [1.4, 8.7], [5.45, 5.72]];
    const sl = [[3.0, 12.4], [3.0, 9.3], [5.55, 7.45]];
    poly(shapes, guide);
    poly(shapes, mirror(guide));
    for (const side of ['L', 'R']) {
      const p = side === 'L' ? sl : mirror(sl);
      const [A, B, C] = p;
      // A->B (the inlane side) and B->C (the bottom) are rails; C->A is the rubber kicker
      shapes.push(seg(A[0], A[1], B[0], B[1], { kind: 'wall' }));
      shapes.push(seg(B[0], B[1], C[0], C[1], { kind: 'wall' }));
      const k = side === 'L' ? seg(C[0], C[1], A[0], A[1], { kind: 'sling', id: 'sling' + side, kick: 13, kickMin: 3, e: 0.5, r: 0.12 })
        : seg(A[0], A[1], C[0], C[1], { kind: 'sling', id: 'sling' + side, kick: 13, kickMin: 3, e: 0.5, r: 0.12 });
      shapes.push(k);
      slings.push({ id: 'sling' + side, side, pts: p, shape: k });
    }
    // inlane / outlane rollovers (for the lights and the bot's coverage)
    triggers.push(trig(0.1, 10.5, 1.3, 10.5, { kind: 'outlane', id: 'outL', side: 'L' }));
    triggers.push(trig(18.7, 10.5, 19.9, 10.5, { kind: 'outlane', id: 'outR', side: 'R' }));
    triggers.push(trig(1.5, 10.8, 2.9, 10.8, { kind: 'inlane', id: 'inL' }));
    triggers.push(trig(17.1, 10.8, 18.5, 10.8, { kind: 'inlane', id: 'inR' }));
    // ---------------------------------------------------------- the three rollover lanes at the top
    const lanes = [];
    const LX = [7.0, 9.5, 12.0, 14.5];
    for (const x of LX) shapes.push(seg(x, 36.6, x, 38.4, { r: 0.22, kind: 'post' }));
    for (let i = 0; i < 3; i++) {
      const t = trig(LX[i] + 0.3, 37.4, LX[i + 1] - 0.3, 37.4, { kind: 'lane', id: 'lane' + i, index: i });
      triggers.push(t);
      lanes.push(t);
    }
    // ---------------------------------------------------------- the table's own upper playfield
    def.bumpers.forEach(([x, y, r], i) => {
      const b = circ(x, y, r, { kind: 'bumper', id: 'bumper' + i, kick: 17, kickMin: 0.3, e: 0.3 });
      shapes.push(b);
      bumpers.push(b);
    });
    def.drops.forEach((t, i) => {
      const s = targetSeg(t, 'drop', 'drop' + i);
      s.bank = 0;
      shapes.push(s);
      drops.push(s);
      // a backboard behind each target so a dropped one never opens a way out
      const bk = t.face === 'down' ? seg(t.x - 0.6, t.y + 0.55, t.x + 0.6, t.y + 0.55, { r: 0.1 })
        : t.face === 'left' ? seg(t.x + 0.55, t.y - 0.6, t.x + 0.55, t.y + 0.6, { r: 0.1 }) : seg(t.x - 0.55, t.y - 0.6, t.x - 0.55, t.y + 0.6, { r: 0.1 });
      bk.kind = 'back';
      shapes.push(bk);
    });
    def.standups.forEach((t, i) => {
      const s = targetSeg(t, 'standup', 'standup' + i);
      shapes.push(s);
      standups.push(s);
    });
    def.ramps.forEach((rd) => {
      const [ux, uy] = norm(rd.dir[0], rd.dir[1]);
      const px = uy, py = -ux; // to the right of the way in
      const hw = rd.width / 2, deep = 2.0;
      const L0 = [rd.at[0] - px * hw, rd.at[1] - py * hw], R0 = [rd.at[0] + px * hw, rd.at[1] + py * hw];
      const L1 = [L0[0] + ux * deep, L0[1] + uy * deep], R1 = [R0[0] + ux * deep, R0[1] + uy * deep];
      // the mouth: two posts and a pocket behind the entry line (a ball that crosses the line is on the ramp)
      poly(shapes, [L0, L1, R1, R0], { r: 0.16, kind: 'rampWall', id: rd.id });
      // the path, smoothed (Catmull-Rom) and with the distance along it
      const raw = rd.path, dense = [];
      for (let i = 0; i + 1 < raw.length; i++) {
        const p0 = raw[Math.max(0, i - 1)], p1 = raw[i], p2 = raw[i + 1], p3 = raw[Math.min(raw.length - 1, i + 2)];
        for (let k = 0; k < 6; k++) {
          const t = k / 6, t2 = t * t, t3 = t2 * t;
          dense.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
        }
      }
      dense.push(raw[raw.length - 1]);
      const path = [];
      let s = 0;
      dense.forEach(([x, y, z], i) => {
        if (i) s += Math.hypot(x - dense[i - 1][0], y - dense[i - 1][1], z - dense[i - 1][2]);
        path.push({ x, y, z: Math.max(0, z), s });
      });
      const n = path.length;
      const ex = norm(path[n - 1].x - path[n - 2].x, path[n - 1].y - path[n - 2].y);
      const ramp = { id: rd.id, name: rd.name, path, S: s, ux, uy, at: rd.at, width: rd.width, mouth: [L0, R0, L1, R1], exit: { x: path[n - 1].x, y: path[n - 1].y, dx: ex[0], dy: ex[1] } };
      ramps.push(ramp);
      triggers.push(trig(L0[0], L0[1], R0[0], R0[1], { kind: 'ramp', id: 'ramp-' + rd.id, ramp, inx: ux, iny: uy }));
    });
    // ---------------------------------------------------------- the flippers
    const len = easy ? FLIP.len.easy : FLIP.len.normal;
    const flippers = [
      { side: 'L', s: 1, px: FLIP.pivotX, py: FLIP.pivotY },
      { side: 'R', s: -1, px: W - FLIP.pivotX, py: FLIP.pivotY },
    ].map((f) => Object.assign(f, { len, r0: FLIP.r0, r1: FLIP.r1, rest: FLIP.rest, up: FLIP.up, ang: FLIP.rest, w: 0, held: false, e: 0.3, fric: 0.08 }));

    // the outline (for the escape check): the drain, the outer walls, the lane and the arch
    const outline = [[4, 0], [16, 0], [16, 3.2], [20, 7.6], [20, 0], [LANE_X1, 0]].concat(arch, [[0, ARC_CY], [0, 7.6], [4, 3.2]]);
    return { def, shapes, triggers, ramps, drops, standups, bumpers, slings, lanes, flippers, outline, easy: !!easy };
  };

  Object.assign(PB, { TABLES, W, LANE_X0, LANE_X1, ARC_CX, ARC_CY, ARC_R, PLUNGER_Y, DRAIN_Y, WALL_R, FLIP });
})(typeof window !== 'undefined' ? window : globalThis);
