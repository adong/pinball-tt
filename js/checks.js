/* TT Pinball: the headless checks, the same in Node (node tools/check.js) and in the page (game.check()).
   Each check also runs a sabotaged version that must FAIL, to prove the check can catch what it looks for.
     soak       the ball never escapes the table or passes through anything: hundreds of balls at top speed and at
                twice top speed, flippers flapping, every step's path checked against every wall, post, bumper and
                target, and every flipper. Sabotage: a mover without the swept test (move, then push out of overlaps).
     autopilot  the autopilot keeps a ball alive a long time (NORMAL, no ball saver). Sabotage: a bot that never flips.
     targets    every target can be hit: bumpers, slingshots, drop and standup targets, the spinner, the three top
                lanes and every ramp, all hit by the autopilot. Sabotage: a wall put in front of one target.
     scoring    each thing scores what it should (bumper, drop target, the bank, ramp, spinner, lit target, MULTIBALL
                and its jackpot) and 2 players take turns, 3 balls each. Sabotage: bumpers scoring nothing.
     framerate  the same launch (and the autopilot playing on) ends the same at 30, 60 and 120 frames a second.
                Sabotage: stepping by the frame time instead of fixed steps.
     plunger    every plunger power puts the ball in play. */
(function (root) {
  'use strict';
  const PB = root.PB;
  const { DT, R } = PB;

  function insidePoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // the closest the segment p0-p1 comes to the point c
  function segPointDist(x0, y0, x1, y1, cx, cy) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / l2)) : 0;
    return Math.hypot(x0 + dx * u - cx, y0 + dy * u - cy);
  }
  // the closest two segments come to each other
  function segSegDist(a, b, c, d, e, f, g, h) {
    const cross = (px, py, qx, qy) => px * qy - py * qx;
    const d1 = cross(c - a, d - b, e - a, f - b), d2 = cross(c - a, d - b, g - a, h - b);
    const d3 = cross(g - e, h - f, a - e, b - f), d4 = cross(g - e, h - f, c - e, d - f);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
    return Math.min(segPointDist(a, b, c, d, e, f), segPointDist(a, b, c, d, g, h), segPointDist(e, f, g, h, a, b), segPointDist(e, f, g, h, c, d));
  }

  // a free spot for a test ball: inside the table, clear of everything, not in a ramp mouth or the shooter lane
  function freeSpot(sim, rng) {
    for (let k = 0; k < 500; k++) {
      const x = 0.6 + rng() * 18.8, y = 2 + rng() * 42;
      if (!insidePoly(x, y, sim.geo.outline)) continue;
      let ok = true;
      for (const s of sim.geo.shapes) {
        const d = s.k === 'circ' ? Math.hypot(x - s.x, y - s.y) : PB.segDist(x, y, s);
        if (d < R + s.r + 0.15) { ok = false; break; }
      }
      for (const f of sim.flippers) if (PB.flipDist(f, f.rest, x, y) < R + 0.3 || Math.hypot(x - f.px, y - f.py) < f.len + 1.2) ok = false;
      for (const r of sim.geo.ramps) {
        const [L0, R0, L1, R1] = r.mouth;
        if (insidePoly(x, y, [L0, L1, R1, R0])) ok = false;
      }
      if (x > 17.8 && y > 30 && y < 34) ok = false; // the lane's gate corner
      if (ok) return [x, y];
    }
    return [10, 18];
  }

  // ------------------------------------------------------------------ soak: never escapes, never passes through
  function soak(o) {
    const fails = [];
    let steps = 0, pieces = 0;
    for (const def of PB.TABLES) {
      for (const easy of [true, false]) {
        const sim = new PB.Sim(def, { easy, seed: 11, noSaver: true, vmax: o.vmax });
        const rng = PB.mulberry(o.seed + def.id.length * 7 + (easy ? 1 : 0));
        if (o.naive) sim.sweep = naiveSweep;
        for (let n = 0; n < o.balls; n++) {
          sim.balls.length = 0;
          sim.queue = 0;
          sim.state = 'play';
          for (const d of sim.geo.drops) d.on = true;
          const [x, y] = freeSpot(sim, rng);
          const a = rng() * Math.PI * 2, v = o.vmax * (0.6 + 0.4 * rng());
          const b = sim.newBall();
          b.x = x; b.y = y; b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
          let flapL = 0, flapR = 0;
          for (let i = 0; i < o.secs / DT && sim.balls.length; i++) {
            if (i % 24 === 0) { flapL = rng() < 0.5; flapR = rng() < 0.5; }
            // keep it fast: a kick back up to speed now and then
            if (i % 120 === 0 && !b.ramp) { const k = o.vmax / (Math.hypot(b.vx, b.vy) || 1); if (k > 1.5) { b.vx = (rng() - 0.5) * o.vmax; b.vy = o.vmax * (0.4 + 0.6 * rng()); } }
            const px = b.x, py = b.y, wasRamp = !!b.ramp;
            sim.step(DT, { left: flapL, right: flapR });
            steps++;
            if (!sim.balls.length) break;
            if (!isFinite(b.x) || !isFinite(b.y)) { fails.push(`${def.id}: NaN`); break; }
            if (wasRamp || b.ramp) continue;
            pieces++;
            if (!insidePoly(b.x, b.y, sim.geo.outline)) { fails.push(`${def.id}${easy ? ' easy' : ''}: escaped at ${b.x.toFixed(2)},${b.y.toFixed(2)}`); break; }
            let bad = null;
            for (const s of sim.geo.shapes) {
              if (!s.on || s.one) continue;
              const d = s.k === 'circ' ? segPointDist(px, py, b.x, b.y, s.x, s.y) : segSegDist(px, py, b.x, b.y, s.ax, s.ay, s.bx, s.by);
              if (d < R + s.r - 0.03) { bad = `${s.kind}${s.id ? ' ' + s.id : ''} by ${(R + s.r - d).toFixed(3)}`; break; }
            }
            for (const f of sim.flippers) {
              const d = PB.flipDist(f, f.ang, b.x, b.y);
              if (d < R - 0.06) bad = `flipper ${f.side} by ${(R - d).toFixed(3)}`;
            }
            if (bad) { fails.push(`${def.id}${easy ? ' easy' : ''}: went into ${bad} at ${b.x.toFixed(2)},${b.y.toFixed(2)}`); break; }
          }
          if (fails.length > 4) return { fails, steps, pieces };
        }
      }
    }
    return { fails, steps, pieces };
  }

  // the sabotage: move first, then push out of whatever the ball ended up overlapping (no swept test)
  function naiveSweep(b, dt) {
    const px = b.x, py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (this.crossings(b, px, py)) return;
    for (const s of this.geo.shapes) {
      if (!s.on || s.one) continue;
      let cx, cy;
      if (s.k === 'circ') { cx = s.x; cy = s.y; } else {
        const u = Math.max(0, Math.min(s.len, (b.x - s.ax) * s.dx + (b.y - s.ay) * s.dy));
        cx = s.ax + s.dx * u; cy = s.ay + s.dy * u;
      }
      const mx = b.x - cx, my = b.y - cy, d = Math.hypot(mx, my), rr = R + s.r;
      if (d < rr && d > 1e-9) {
        const nx = mx / d, ny = my / d;
        b.x = cx + nx * rr; b.y = cy + ny * rr;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) this.respond(b, s, nx, ny, 0, 0);
      }
    }
  }

  // ------------------------------------------------------------------ the autopilot keeps the ball alive
  function lifetimes(def, o) {
    const lives = [];
    for (let g = 0; g < o.games; g++) {
      const sim = new PB.Sim(def, { easy: o.easy, seed: 100 + g, noSaver: true });
      const bot = new PB.Bot(sim, { seed: 200 + g, lazy: o.lazy, tune: o.tune });
      let launched = null;
      for (let i = 0; i < o.limit / DT * o.balls && sim.state !== 'over'; i++) {
        const before = sim.state;
        sim.step(DT, bot.input(DT));
        if (before === 'ready' && sim.state === 'play') launched = sim.t;
        if (before === 'play' && sim.state === 'drain') { lives.push(sim.t - launched); if (lives.length % o.balls === 0 && g < o.games) break; }
        if (sim.state === 'play' && launched !== null && sim.t - launched > o.limit) { lives.push(o.limit); break; }
      }
    }
    lives.sort((a, b) => a - b);
    return { lives, median: lives[Math.floor(lives.length / 2)], mean: lives.reduce((a, b) => a + b, 0) / lives.length };
  }

  // ------------------------------------------------------------------ every target can be hit
  function targetIds(sim) {
    const g = sim.geo;
    return [...g.bumpers.map((b) => b.id), ...g.slings.map((s) => s.id), ...g.drops.map((d) => d.id), ...g.standups.map((s) => s.id),
      'spinner', 'lane0', 'lane1', 'lane2', ...g.ramps.map((r) => 'ramp-' + r.id)];
  }
  function coverage(def, o) {
    const hits = {};
    let ids = null, t = 0;
    for (let g = 0; t < o.secs; g++) {
      const sim = new PB.Sim(def, { easy: o.easy, seed: 300 + g });
      if (o.block) {
        // the sabotage: a box of walls built round the first standup target
        const s = sim.geo.standups[0], base = sim.geo.shapes.find((x) => x.k === 'seg');
        const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
        const at = (a, n) => [mx + s.dx * a + s.nx * n, my + s.dy * a + s.ny * n];
        const box = [at(-1.4, -0.9), at(-1.4, 0.8), at(1.4, 0.8), at(1.4, -0.9)];
        for (let i = 0; i < 3; i++) {
          const [ax, ay] = box[i], [bx, by] = box[i + 1], len = Math.hypot(bx - ax, by - ay);
          sim.geo.shapes.push(Object.assign({}, base, {
            ax, ay, bx, by, len, dx: (bx - ax) / len, dy: (by - ay) / len, nx: -(by - ay) / len, ny: (bx - ax) / len, r: 0.1, kind: 'wall', id: null, one: false, on: true,
            minx: Math.min(ax, bx) - 0.1, maxx: Math.max(ax, bx) + 0.1, miny: Math.min(ay, by) - 0.1, maxy: Math.max(ay, by) + 0.1,
          }));
        }
      }
      ids = ids || targetIds(sim);
      const bot = new PB.Bot(sim, { seed: 400 + g });
      while (sim.state !== 'over' && t < o.secs) {
        sim.step(DT, bot.input(DT));
        t += DT;
        sim.events.length = 0;
      }
      for (const k in sim.hits) hits[k] = (hits[k] || 0) + sim.hits[k];
    }
    const missing = ids.filter((id) => !hits[id]);
    return { hits, ids, missing };
  }

  // ------------------------------------------------------------------ scoring and turns
  function scoring(o = {}) {
    const fails = [];
    const S = PB.SCORE;
    const saved = S.bumper;
    if (o.sabotage) S.bumper = 0;
    try {
      const def = PB.TABLES[0];
      const fresh = () => { const sim = new PB.Sim(def, { easy: false, seed: 5, noSaver: true }); sim.balls.length = 0; sim.state = 'play'; return sim; };
      const shoot = (sim, x, y, vx, vy, secs, until) => {
        const b = sim.newBall();
        b.x = x; b.y = y; b.vx = vx; b.vy = vy;
        const evs = [];
        for (let i = 0; i < secs / DT; i++) {
          const before = sim.player().score;
          sim.step(DT, {});
          for (const ev of sim.events) { ev.delta = sim.player().score - before; evs.push(ev); }
          sim.events.length = 0;
          if (until && evs.some(until)) break;
        }
        return { b, evs };
      };
      // a bumper: +100 each time it fires
      {
        const sim = fresh(), bu = sim.geo.bumpers[2];
        const { evs } = shoot(sim, bu.x, bu.y - 3, 0, 12, 1, (e) => e.type === 'bumper');
        const ev = evs.find((e) => e.type === 'bumper');
        if (!ev) fails.push('bumper: never hit');
        else if (ev.delta !== S.bumper || sim.player().score !== saved) fails.push(`bumper: scored ${sim.player().score}, not ${saved}`);
      }
      // drop targets: +500 each, and the bank bonus with the third (plus a MULTIBALL light)
      {
        const sim = fresh();
        let total = 0;
        sim.geo.drops.forEach((d, i) => {
          const mx = (d.ax + d.bx) / 2, my = (d.ay + d.by) / 2;
          const { evs } = shoot(sim, mx + d.nx * 2, my + d.ny * 2, -d.nx * 10, -d.ny * 10 + 2, 1, (e) => e.type === 'drop');
          sim.balls.length = 0;
          if (d.on) fails.push(`${d.id}: did not drop`);
          total += S.drop + (i === sim.geo.drops.length - 1 ? S.bank : 0);
          if (i === sim.geo.drops.length - 1 && !evs.some((e) => e.type === 'bank')) fails.push('drop bank: no bonus');
        });
        if (sim.player().score !== total) fails.push(`drops: scored ${sim.player().score}, not ${total}`);
        if (sim.mb.lights !== 1) fails.push(`drops: MULTIBALL lights ${sim.mb.lights}, not 1`);
      }
      // a ramp: a strong shot goes all the way (+2000), a weak one rolls back out (nothing)
      for (const def2 of PB.TABLES) {
        for (const r of new PB.Sim(def2, {}).geo.ramps) {
          const sim = new PB.Sim(def2, { easy: false, seed: 5, noSaver: true });
          sim.balls.length = 0; sim.state = 'play';
          const { evs } = shoot(sim, r.at[0] - r.ux * 1.2, r.at[1] - r.uy * 1.2, r.ux * 52, r.uy * 52, 4, (e) => e.type === 'ramp');
          if (!evs.some((e) => e.type === 'ramp' && e.id === r.id) || sim.player().score < S.ramp) fails.push(`${def2.id} ${r.id}: a strong shot did not make it (${sim.player().score})`);
          const sim2 = new PB.Sim(def2, { easy: false, seed: 5, noSaver: true });
          sim2.balls.length = 0; sim2.state = 'play';
          const w = shoot(sim2, r.at[0] - r.ux * 1.2, r.at[1] - r.uy * 1.2, r.ux * 16, r.uy * 16, 3, (e) => e.type === 'rampBack');
          if (!w.evs.some((e) => e.type === 'rampBack')) fails.push(`${def2.id} ${r.id}: a weak shot did not roll back`);
        }
      }
      // the spinner: up the orbit lane, 100 a half turn
      {
        const sim = fresh();
        shoot(sim, 0.9, 24.5, 0, 30, 2.5);
        const sc = sim.player().score;
        if (!sim.hits.spinner || sc < S.spin * 2 || sc % S.spin !== 0 && !sim.hits.lane0 && !sim.hits.lane1) fails.push(`spinner: scored ${sc}`);
      }
      // the companion: treat, ball saver, a lit target worth 5000 more
      {
        const sim = new PB.Sim(def, { easy: false, seed: 5 });
        sim.balls.length = 0; sim.state = 'play';
        sim.callBuddy();
        for (let i = 0; i < 2 / DT; i++) sim.step(DT, {});
        if (sim.saverT < 8 || !sim.lit) fails.push(`companion: saver ${sim.saverT.toFixed(1)} s, lit ${sim.lit && sim.lit.id}`);
        else {
          const s = sim.lit, before = sim.player().score;
          const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
          shoot(sim, mx + s.nx * 2, my + s.ny * 2, -s.nx * 10, -s.ny * 10 + 2, 1, (e) => e.type === 'litHit');
          const got = sim.player().score - before, want = (s.kind === 'drop' ? S.drop : S.standup) + S.lit;
          if (got < want) fails.push(`lit target: scored ${got}, not ${want}`);
        }
        // a drained ball while the saver is on comes back
        sim.events.length = 0;
        const b = sim.newBall(); b.x = 10; b.y = 1.5; b.vx = 0; b.vy = -10;
        for (let i = 0; i < 0.2 / DT; i++) sim.step(DT, {});
        if (!sim.events.some((e) => e.type === 'saved')) fails.push('ball saver: did not save');
      }
      // MULTIBALL: lit, then a ramp starts it; two more balls come out; a ramp then is a jackpot
      {
        const sim = fresh();
        for (let i = 0; i < sim.D.mbNeed; i++) sim.light();
        const r = sim.geo.ramps[0];
        shoot(sim, r.at[0] - r.ux * 1.2, r.at[1] - r.uy * 1.2, r.ux * 52, r.uy * 52, 4, (e) => e.type === 'multiball');
        for (let i = 0; i < 3 / DT; i++) sim.step(DT, {});
        if (!sim.mb.on || sim.balls.length + sim.queue < 3) fails.push(`multiball: on ${sim.mb.on}, balls ${sim.balls.length}`);
        const before = sim.player().score;
        sim.balls.length = 0; sim.queue = 0; sim.autoPlunge = false;
        sim.balls.push({ id: 99, x: 3, y: 30, vx: 0, vy: 0, z: 0, ramp: null, still: 0, roll: 0 });
        shoot(sim, r.at[0] - r.ux * 1.2, r.at[1] - r.uy * 1.2, r.ux * 52, r.uy * 52, 4, (e) => e.type === 'jackpot');
        if (sim.player().score - before < S.jackpot) fails.push(`jackpot: scored ${sim.player().score - before}`);
      }
      // 2 players take turns, 3 balls each, then the game is over
      {
        const sim = new PB.Sim(def, { easy: true, seed: 5, noSaver: true, players: ['teddy', 'tommy'] });
        const order = [];
        for (let k = 0; k < 7 && sim.state !== 'over'; k++) {
          order.push(sim.player().id + sim.player().ball);
          sim.balls.length = 0;
          sim.state = 'play';
          const b = sim.newBall(); b.x = 10; b.y = 1.5; b.vy = -10;
          for (let i = 0; i < 2 / DT; i++) sim.step(DT, {});
        }
        const want = 'teddy1 tommy1 teddy2 tommy2 teddy3 tommy3';
        if (order.join(' ') !== want || sim.state !== 'over') fails.push(`turns: ${order.join(' ')} (${sim.state})`);
      }
    } finally {
      S.bumper = saved;
    }
    return fails;
  }

  // ------------------------------------------------------------------ the same at 30, 60 and 120 fps
  function framerate(o = {}) {
    const run = (fps) => {
      const sim = new PB.Sim(PB.TABLES[1], { easy: false, seed: 9 });
      const bot = new PB.Bot(sim, { seed: 9 });
      const runner = new PB.Runner(sim);
      const frames = Math.round(o.secs * fps);
      for (let i = 0; i < frames; i++) {
        if (o.sabotage) { sim.step(1 / fps, bot.input(1 / fps)); continue; }
        runner.advance(1 / fps, () => bot.input(DT));
      }
      const b = sim.balls[0];
      return `${sim.state} score ${sim.players[0].score} ball ${sim.players[0].ball} ` + (b ? `${b.x},${b.y}` : 'none');
    };
    const r = [30, 60, 120].map(run);
    return { same: r[0] === r[1] && r[1] === r[2], r };
  }

  // ------------------------------------------------------------------ every plunger power puts the ball in play
  function plunger() {
    const fails = [];
    for (const def of PB.TABLES) {
      for (let p = 0; p <= 1.0001; p += 0.1) {
        const sim = new PB.Sim(def, { easy: false, seed: 5, noSaver: true });
        const b = sim.balls[0];
        sim.fire(b, p);
        let out = false;
        for (let i = 0; i < 6 / DT && !out; i++) { sim.step(DT, {}); if (b.x < PB.LANE_X0 - 0.6 && b.y < 30) out = true; }
        if (!out) fails.push(`${def.id} power ${p.toFixed(1)}: still at ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
      }
    }
    return fails;
  }

  PB.checks = {
    soak, lifetimes, coverage, scoring, framerate, plunger, insidePoly,
    run(o = {}) {
      const quick = !!o.quick, lines = [], fails = [];
      const say = (ok, name, text) => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${text}`); if (!ok) fails.push(name); };
      const sab = (failed, name, text) => { lines.push(`${failed ? 'PASS' : 'FAIL'}  ${name} (sabotage must fail): ${text}`); if (!failed) fails.push(name + ' sabotage'); };
      const t0 = Date.now();
      // soak
      const nb = quick ? 10 : 40;
      for (const vmax of [PB.VMAX, PB.VMAX * 2]) {
        const r = soak({ balls: nb, secs: 5, vmax, seed: 1 });
        say(!r.fails.length, `soak at ${vmax}`, r.fails.length ? r.fails.slice(0, 3).join('; ') : `${nb * 6} balls, ${r.pieces.toLocaleString('en-US')} path pieces checked, nothing escaped or passed through`);
      }
      const bad = soak({ balls: Math.min(nb, 12), secs: 4, vmax: PB.VMAX * 2, seed: 1, naive: true });
      sab(bad.fails.length > 0, 'soak', bad.fails.length ? bad.fails[0] : 'the move-then-push-out mover was never caught');
      // autopilot
      const all = [];
      const per = PB.TABLES.map((def) => { const r = lifetimes(def, { games: quick ? 2 : 4, balls: 3, limit: 240, easy: false }); all.push(...r.lives); return `${def.id} ${r.mean.toFixed(0)} s`; });
      const mean = all.reduce((a, b) => a + b, 0) / all.length;
      say(mean >= 45, 'autopilot', `a ball lasts ${mean.toFixed(0)} s on average over ${all.length} balls (${per.join(', ')}; NORMAL, no ball saver; needs 45 s)`);
      const lazy = lifetimes(PB.TABLES[0], { games: 2, balls: 3, limit: 240, easy: false, lazy: true });
      sab(lazy.mean < 45, 'autopilot', `a bot that never flips: ${lazy.mean.toFixed(1)} s on average`);
      // targets
      for (const def of PB.TABLES) {
        for (const easy of [true, false]) {
          const r = coverage(def, { secs: quick ? 600 : 1500, easy });
          say(!r.missing.length, `targets ${def.id} ${easy ? 'EASY' : 'NORMAL'}`, r.missing.length ? `never hit: ${r.missing.join(', ')}` : `all ${r.ids.length} hit (fewest: ${r.ids.map((id) => [id, r.hits[id]]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([a, b]) => `${a} ${b}`).join(', ')})`);
        }
      }
      const blk = coverage(PB.TABLES[0], { secs: quick ? 200 : 400, easy: true, block: true });
      sab(blk.missing.includes('standup0'), 'targets', blk.missing.length ? `never hit: ${blk.missing.join(', ')} (the boxed-in standup0 must be one)` : 'everything was still hit');
      // scoring
      const sf = scoring();
      say(!sf.length, 'scoring', sf.length ? sf.join('; ') : 'bumper, drop targets and bank, ramps (and roll-backs), spinner, lit target, ball saver, MULTIBALL and jackpot, 2-player turns');
      const sb = scoring({ sabotage: true });
      sab(sb.length > 0, 'scoring', sb[0] || 'nothing noticed');
      // frame rate
      const fr = framerate({ secs: quick ? 20 : 60 });
      say(fr.same, 'framerate', fr.same ? `same at 30, 60 and 120 fps: ${fr.r[0]}` : fr.r.join(' | '));
      const fs = framerate({ secs: 20, sabotage: true });
      sab(!fs.same, 'framerate', fs.r.join(' | '));
      // plunger
      const pf = plunger();
      say(!pf.length, 'plunger', pf.length ? pf.join('; ') : 'every power from 0 to 1 on every table puts the ball in play');
      lines.push(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      return { ok: !fails.length, lines, fails };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
