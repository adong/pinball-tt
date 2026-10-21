/* TT Pinball: the rules and the physics. The ball, the flippers, the plunger, bumpers, slingshots, drop and standup
   targets, the spinner, the rollover lanes, the ramps, MULTIBALL, the ball saver, the TILT nudge, 1 or 2 players
   taking turns, the companion, plus the autopilot (PB.Bot) and the fixed-step runner (PB.Runner).
   No Three.js here, so the same file runs in Node for tools/check.js. js/view.js only draws what happens here.

   Time: the rules always step by DT = 1/240 s, whatever the screen's frame rate (PB.Runner), so the same launch ends
   the same way at 30, 60 or 120 fps.
   Collisions are swept: each step the ball finds the first thing it would touch along its path (a wall, a post, a
   bumper, a target, a flipper), stops there, bounces and carries on with the time that's left, so it can't jump
   through anything however fast it goes. A moving flipper is found by conservative advancement: the ball and the
   flipper close the gap no faster than the ball's speed plus the flipper tip's speed, so stepping by gap / that
   speed can never step past the touch. */
(function (root) {
  'use strict';
  const PB = (root.PB = root.PB || {});

  const DT = 1 / 240;
  const R = 0.5;                       // the ball
  const VMAX = 85;                     // top speed (faster than a flipper's tip, so a flipper never catches the ball again)
  const W_UP = 20, W_DOWN = 13;        // flipper swing speeds, radians a second
  const PLUNGE_MIN = 43, PLUNGE_MAX = 60, PLUNGE_TIME = 1.1;
  const RAMP_VMAX = 40, RAMP_EXIT_MIN = 7, RAMP_EXIT_MAX = 16;
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const DIFF = {
    easy: { g: 22, saver: 20, mbNeed: 2, tiltMax: 6, balls: 3, deadFlippers: false, kickback: 'always', rampG: 0.72, mbOnEntry: true },
    normal: { g: 27, saver: 8, mbNeed: 3, tiltMax: 4, balls: 3, deadFlippers: true, kickback: 'bank', rampG: 0.9, mbOnEntry: false },
  };
  const SCORE = {
    bumper: 100, sling: 10, drop: 500, bank: 5000, standup: 1000, lit: 5000, spin: 100, lane: 300, lanes: 3000,
    inlane: 100, ramp: 2000, jackpot: 10000, treat: 100,
  };

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ swept tests (the ball's centre is a point)
  let NX = 0, NY = 0;

  // first time the point p + v t comes within rr of (cx, cy); 0 if it already touches and is moving in
  function toiCirc(px, py, vx, vy, cx, cy, rr, tmax) {
    const mx = px - cx, my = py - cy;
    const c = mx * mx + my * my - rr * rr;
    const b = mx * vx + my * vy;
    if (c <= 0) {
      if (b < 0) { const d = Math.sqrt(mx * mx + my * my) || 1; NX = mx / d; NY = my / d; return 0; }
      return null;
    }
    if (b >= 0) return null;
    const a = vx * vx + vy * vy;
    const disc = b * b - a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t > tmax) return null;
    const hx = mx + vx * t, hy = my + vy * t, d = Math.hypot(hx, hy) || 1;
    NX = hx / d; NY = hy / d;
    return t < 0 ? 0 : t;
  }

  // a segment with rounded ends (a capsule of radius rr); one-way segments only stop a ball on their normal side
  function toiSeg(px, py, vx, vy, s, rr, tmax) {
    const rx = px - s.ax, ry = py - s.ay;
    const dist = rx * s.nx + ry * s.ny;
    const vn = vx * s.nx + vy * s.ny;
    const side = dist >= 0 ? 1 : -1;
    if (s.one && (dist < 0 || vn >= 0)) return null;
    if (Math.abs(dist) <= rr) {
      const u = rx * s.dx + ry * s.dy;
      if (u >= 0 && u <= s.len) {
        if (vn * side < 0) { NX = s.nx * side; NY = s.ny * side; return 0; }
        return null;
      }
    } else if (vn * side < 0) {
      const t = (side * rr - dist) / vn;
      if (t <= tmax) {
        const u = rx * s.dx + ry * s.dy + (vx * s.dx + vy * s.dy) * t;
        if (u >= 0 && u <= s.len) { NX = s.nx * side; NY = s.ny * side; return t < 0 ? 0 : t; }
      }
    }
    if (s.one) return null;
    const t1 = toiCirc(px, py, vx, vy, s.ax, s.ay, rr, tmax);
    const n1x = NX, n1y = NY;
    const t2 = toiCirc(px, py, vx, vy, s.bx, s.by, rr, t1 === null ? tmax : t1);
    if (t2 !== null) return t2;
    NX = n1x; NY = n1y;
    return t1;
  }

  // ------------------------------------------------------------------ flippers: a tapered capsule turning on its pivot
  const flipAng = (f, tau) => { const a = f.ang + f.w * tau; return a < f.rest ? f.rest : a > f.up ? f.up : a; };
  const flipW = (f, tau) => { const a = f.ang + f.w * tau; return (f.w < 0 && a <= f.rest) || (f.w > 0 && a >= f.up) ? 0 : f.w; };

  // signed distance from (qx, qy) to the flipper at angle ang; leaves the outward normal in NX, NY
  function flipDist(f, ang, qx, qy) {
    const dx = f.s * Math.cos(ang), dy = Math.sin(ang);
    const rx = qx - f.px, ry = qy - f.py;
    const along = rx * dx + ry * dy;
    const perp = -dy * rx + dx * ry;
    const ax = Math.abs(perp), sg = perp >= 0 ? 1 : -1;
    const bb = (f.r0 - f.r1) / f.len, aa = Math.sqrt(1 - bb * bb);
    const k = -bb * ax + aa * along;
    let d, np, na;
    if (k < 0) { const l = Math.hypot(ax, along) || 1; d = l - f.r0; np = ax / l; na = along / l; }
    else if (k > aa * f.len) { const ly = along - f.len, l = Math.hypot(ax, ly) || 1; d = l - f.r1; np = ax / l; na = ly / l; }
    else { d = ax * aa + along * bb - f.r0; np = aa; na = bb; }
    NX = dx * na - dy * np * sg;
    NY = dy * na + dx * np * sg;
    return d;
  }

  // the flipper standing still: two circles and the two straight sides between them, swept exactly
  function toiFlipStatic(px, py, vx, vy, f, ang, tmax) {
    const dx = f.s * Math.cos(ang), dy = Math.sin(ang);
    const tx = f.px + dx * f.len, ty = f.py + dy * f.len;
    let best = null, bx = 0, by = 0;
    let t = toiCirc(px, py, vx, vy, f.px, f.py, f.r0 + R, tmax);
    if (t !== null) { best = t; bx = NX; by = NY; }
    t = toiCirc(px, py, vx, vy, tx, ty, f.r1 + R, best === null ? tmax : best);
    if (t !== null) { best = t; bx = NX; by = NY; }
    const bb = (f.r0 - f.r1) / f.len, aa = Math.sqrt(1 - bb * bb);
    for (const sg of [1, -1]) {
      const nx = dx * bb - dy * aa * sg, ny = dy * bb + dx * aa * sg;
      const ax = f.px + nx * (f.r0 + R), ay = f.py + ny * (f.r0 + R);
      const ex = tx + nx * (f.r1 + R), ey = ty + ny * (f.r1 + R);
      const dist = (px - ax) * nx + (py - ay) * ny;
      const vn = vx * nx + vy * ny;
      if (vn >= 0 || dist < -0.02) continue;
      const tt = dist <= 0 ? 0 : dist / -vn;
      if (tt > (best === null ? tmax : best)) continue;
      const qx = px + vx * tt - ax, qy = py + vy * tt - ay;
      const lx = ex - ax, ly = ey - ay;
      const u = (qx * lx + qy * ly) / (lx * lx + ly * ly);
      if (u < 0 || u > 1) continue;
      best = tt; bx = nx; by = ny;
    }
    NX = bx; NY = by;
    return best;
  }

  // the flipper swinging: conservative advancement (see the top of the file)
  const HIT = { vsx: 0, vsy: 0 };
  function toiFlip(b, f, tau0, tmax) {
    HIT.vsx = HIT.vsy = 0;
    const w0 = flipW(f, tau0);
    if (w0 === 0 && flipW(f, tau0 + tmax) === 0) return toiFlipStatic(b.x, b.y, b.vx, b.vy, f, flipAng(f, tau0), tmax);
    const sp = Math.hypot(b.vx, b.vy);
    const rate = sp + Math.abs(f.w) * (f.len + f.r0) + 1e-9;
    const reach = Math.hypot(b.x - f.px, b.y - f.py) - (f.len + f.r0 + R);
    if (reach > rate * tmax + 0.01) return null;
    let t = 0;
    for (let i = 0; i < 90; i++) {
      const qx = b.x + b.vx * t, qy = b.y + b.vy * t;
      const d = flipDist(f, flipAng(f, tau0 + t), qx, qy) - R;
      if (d < 0.002) {
        const w = flipW(f, tau0 + t) * f.s;
        const cx = qx - NX * R, cy = qy - NY * R;
        const vsx = -w * (cy - f.py), vsy = w * (cx - f.px);
        if ((b.vx - vsx) * NX + (b.vy - vsy) * NY < 0) { HIT.vsx = vsx; HIT.vsy = vsy; return t; }
        t += Math.max(1e-5, tmax / 40);
      } else t += d / rate;
      if (t > tmax) return null;
    }
    return null;
  }

  // ------------------------------------------------------------------ the simulation
  function Sim(def, o = {}) {
    this.def = def;
    this.easy = o.easy !== false;
    this.D = Object.assign({}, DIFF[this.easy ? 'easy' : 'normal'], o.diff || {});
    this.geo = PB.build(def, this.easy);
    this.flippers = this.geo.flippers;
    this.rng = mulberry(o.seed || 1);
    this.players = (o.players || ['teddy']).map((id) => ({ id, score: 0, ball: 1 }));
    this.cur = 0;
    this.buddyId = o.buddy || (this.players[0].id === 'tommy' ? 'teddy' : 'tommy');
    this.noSaver = !!o.noSaver;
    this.vmax = o.vmax || VMAX;
    this.balls = [];
    this.events = [];
    this.hits = {};
    this.t = 0;
    this.steps = 0;
    this.state = 'ready';
    this.stateT = 0;
    this.plunge = 0;
    this.pulling = false;
    this.queue = 0;
    this.autoT = 0;
    this.saverT = 0;
    this.tiltMeter = 0;
    this.tiltT = 0;
    this.warned = false;
    this.nudgeDir = 1;
    this.nudgeKick = 0;           // for the view: the table jumps a little
    this.mb = { lights: 0, ready: false, on: false };
    this.lanesLit = [false, false, false];
    this.lanesT = 0;
    // kickbacks in the outlanes: EASY always (they recharge), NORMAL lit by the drop-target bank (one go each)
    const kb = this.D.kickback === 'always';
    this.kick = { L: kb, R: kb, tL: 0, tR: 0 };
    this.spin = { w: 0, a: 0 };
    this.dropsT = 0;
    this.lit = null;
    this.buddy = null;
    this.hi5Cd = 0;
    this.giftIx = 0;
    this.ballId = 0;
    this.prev = { left: false, right: false, nudge: false };
    this.serve();
  }

  Sim.prototype.player = function () { return this.players[this.cur]; };
  Sim.prototype.emit = function (type, o) { const ev = Object.assign({ type }, o); this.events.push(ev); return ev; };
  Sim.prototype.hit = function (id) { if (id) this.hits[id] = (this.hits[id] || 0) + 1; };
  Sim.prototype.add = function (pts, x, y) {
    if (this.state === 'over') return;
    this.player().score += pts;
    if (x !== undefined) this.emit('points', { pts, x, y });
  };

  // a new ball on the plunger
  Sim.prototype.newBall = function () {
    const b = { id: ++this.ballId, x: (PB.LANE_X0 + PB.LANE_X1) / 2, y: PB.PLUNGER_Y + R + 0.02, vx: 0, vy: 0, z: 0, ramp: null, still: 0, roll: 0 };
    this.balls.push(b);
    return b;
  };
  Sim.prototype.serve = function () {
    this.balls.length = 0;
    this.queue = 0;
    this.newBall();
    this.state = 'ready';
    this.stateT = 0;
    this.plunge = 0;
    this.pulling = false;
    this.tiltT = 0;
    this.tiltMeter = 0;
    this.mb.on = false;
  };

  Sim.prototype.inLane = (b) => b.x > PB.LANE_X0 && b.y < 31;
  Sim.prototype.onPlunger = function () {
    for (const b of this.balls) if (!b.ramp && b.x > PB.LANE_X0 && b.y < PB.PLUNGER_Y + R + 0.2 && Math.abs(b.vy) < 1.5) return b;
    return null;
  };

  Sim.prototype.fire = function (b, power, auto) {
    // scaled by the slope, so a pull sends the ball just as far up the table on EASY as on NORMAL
    b.vy = (PLUNGE_MIN + Math.max(0, Math.min(1, power)) * (PLUNGE_MAX - PLUNGE_MIN)) * Math.sqrt(this.D.g / DIFF.normal.g);
    b.vx = 0;
    this.emit('launch', { power, auto: !!auto });
    if (this.state === 'ready') {
      this.state = 'play';
      this.stateT = 0;
      if (!this.noSaver) this.saverT = Math.max(this.saverT, this.D.saver);
    }
  };

  // ------------------------------------------------------------------ one step
  Sim.prototype.step = function (dt, inp = {}) {
    this.t += dt;
    this.steps++;
    this.stateT += dt;
    const over = this.state === 'over' || this.state === 'drain';
    const dead = this.tiltT > 0 && this.D.deadFlippers;
    // the flippers: up while the button is held
    for (const f of this.flippers) {
      const held = !over && !dead && !!(f.side === 'L' ? inp.left : inp.right);
      if (held && !f.held) this.emit('flip', { side: f.side });
      f.held = held;
      f.w = held ? (f.ang < f.up ? W_UP : 0) : (f.ang > f.rest ? -W_DOWN : 0);
    }
    // the plunger
    const pb = this.onPlunger();
    if (this.queue > 0 || this.autoPlunge) {
      if (!pb && this.queue > 0 && !this.balls.some((b) => !b.ramp && b.x > PB.LANE_X0 && b.y < 6)) { this.newBall(); this.queue--; this.autoT = 0; this.autoPlunge = true; }
      if (pb) {
        this.autoT += dt;
        if (this.autoT > 0.55) { this.fire(pb, 0.55 + this.rng() * 0.3, true); this.autoPlunge = this.queue > 0; this.autoT = 0; }
      }
    } else if (pb && !over) {
      if (inp.plunger) { this.plunge = Math.min(1, this.plunge + dt / PLUNGE_TIME); this.pulling = true; }
      else if (this.pulling) { this.fire(pb, this.plunge); this.pulling = false; this.plunge = 0; }
    } else { this.pulling = false; this.plunge = Math.max(0, this.plunge - dt * 4); }
    // the nudge (TILT if you overdo it)
    if (inp.nudge && !this.prev.nudge && !over) this.nudge();
    this.prev.nudge = !!inp.nudge;
    this.tiltMeter = Math.max(0, this.tiltMeter - dt / 2.2);
    if (this.tiltT > 0) { this.tiltT -= dt; if (this.tiltT <= 0) { this.tiltT = 0; this.emit('tiltOver'); } }
    this.nudgeKick = Math.max(0, this.nudgeKick - dt * 5);
    // the balls
    const g = this.D.g;
    const anyHeld = this.flippers.some((f) => f.held);
    for (const b of this.balls) {
      const x0 = b.x, y0 = b.y;
      if (b.ramp) { this.rampStep(b, dt); b.roll += Math.abs(b.ramp ? b.ramp.v : 0) * dt; continue; }
      b.vy -= g * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > this.vmax) { b.vx *= this.vmax / sp; b.vy *= this.vmax / sp; }
      this.depen(b);
      this.sweep(b, dt);
      b.roll += Math.hypot(b.x - x0, b.y - y0);
      // stuck somewhere? a little kick (never while a flipper holds it)
      if (!b.ramp && Math.hypot(b.vx, b.vy) < 0.8 && !this.inLane(b) && !anyHeld && !over) {
        b.still += dt;
        if (b.still > 6) { b.still = 0; b.vy += 16; b.vx += (this.rng() - 0.5) * 8; this.emit('search'); }
      } else b.still = 0;
    }
    for (const f of this.flippers) f.ang = flipAng(f, dt);
    // drained balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.ramp || b.y > PB.DRAIN_Y || b.x > PB.LANE_X0) continue;
      this.balls.splice(i, 1);
      this.drained(b);
    }
    this.timers(dt);
    this.prev.left = !!inp.left;
    this.prev.right = !!inp.right;
  };

  Sim.prototype.nudge = function () {
    if (this.tiltT > 0) return;
    this.nudgeDir = -this.nudgeDir;
    for (const b of this.balls) {
      if (b.ramp || this.inLane(b)) continue;
      b.vx += this.nudgeDir * 2.4;
      b.vy += 4.2;
    }
    this.nudgeKick = 1;
    this.tiltMeter += 1;
    this.emit('nudge', { dir: this.nudgeDir });
    if (this.tiltMeter >= this.D.tiltMax) {
      this.tiltMeter = 0;
      this.tiltT = this.D.deadFlippers ? 3 : 4;
      this.emit('tilt', { dead: this.D.deadFlippers });
    } else if (this.tiltMeter >= this.D.tiltMax - 1.5) this.emit('careful');
  };

  // push a ball out of anything it ended up inside (a flipper swinging into it against a wall, mostly)
  Sim.prototype.depen = function (b) {
    for (const f of this.flippers) {
      const d = flipDist(f, f.ang, b.x, b.y) - R;
      if (d < -0.001) {
        b.x -= NX * d; b.y -= NY * d;
        const vn = b.vx * NX + b.vy * NY;
        if (vn < 0) { b.vx -= vn * NX; b.vy -= vn * NY; }
      }
    }
    for (const s of this.geo.shapes) {
      if (!s.on || s.one) continue;
      if (b.x + R < s.minx || b.x - R > s.maxx || b.y + R < s.miny || b.y - R > s.maxy) continue;
      let cx, cy;
      if (s.k === 'circ') { cx = s.x; cy = s.y; }
      else {
        const u = Math.max(0, Math.min(s.len, (b.x - s.ax) * s.dx + (b.y - s.ay) * s.dy));
        cx = s.ax + s.dx * u; cy = s.ay + s.dy * u;
      }
      const mx = b.x - cx, my = b.y - cy, d = Math.hypot(mx, my), rr = R + s.r;
      if (d < rr - 0.001 && d > 1e-9) {
        const nx = mx / d, ny = my / d;
        b.x = cx + nx * rr; b.y = cy + ny * rr;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= vn * nx; b.vy -= vn * ny; }
      }
    }
  };

  // move a ball through the step, bouncing off whatever it touches first
  Sim.prototype.sweep = function (b, dt) {
    let left = dt, n = 0;
    const shapes = this.geo.shapes;
    while (left > 1e-10) {
      let best = left, hit = null, hnx = 0, hny = 0, vsx = 0, vsy = 0;
      const reach = Math.hypot(b.vx, b.vy) * left + R + 0.3;
      const x0 = b.x - reach, x1 = b.x + reach, y0 = b.y - reach, y1 = b.y + reach;
      for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];
        if (!s.on || x1 < s.minx || x0 > s.maxx || y1 < s.miny || y0 > s.maxy) continue;
        const t = s.k === 'seg' ? toiSeg(b.x, b.y, b.vx, b.vy, s, s.r + R, best) : toiCirc(b.x, b.y, b.vx, b.vy, s.x, s.y, s.r + R, best);
        if (t !== null && t <= best) { best = t; hit = s; hnx = NX; hny = NY; vsx = vsy = 0; }
      }
      const tau = dt - left;
      for (const f of this.flippers) {
        const t = toiFlip(b, f, tau, best);
        if (t !== null && t <= best) { best = t; hit = f; hnx = NX; hny = NY; vsx = HIT.vsx; vsy = HIT.vsy; }
      }
      const px = b.x, py = b.y;
      b.x += b.vx * best;
      b.y += b.vy * best;
      if (this.crossings(b, px, py)) return;          // onto a ramp
      left -= best;
      if (!hit) break;
      this.respond(b, hit, hnx, hny, vsx, vsy);
      if (++n >= 24) break;                            // wedged: wait for the next step rather than force through
    }
  };

  Sim.prototype.respond = function (b, s, nx, ny, vsx, vsy) {
    const rvx = b.vx - vsx, rvy = b.vy - vsy;
    const vn = rvx * nx + rvy * ny;
    let kicked = false;
    if (vn < 0) {
      let e = s.e;
      if (-vn < 1.5) e = 0;                             // no little bounces: it rolls
      let tx = rvx - vn * nx, ty = rvy - vn * ny;
      if (s.fric) { tx *= 1 - s.fric; ty *= 1 - s.fric; }
      let out = -vn * e;
      if (s.kick && -vn > s.kickMin) { out += s.kick; kicked = true; }
      if (s.side && (vsx || vsy)) out = Math.max(out, 2); // a swinging flipper throws the ball clear (no endless re-touching)
      b.vx = vsx + tx + nx * out;
      b.vy = vsy + ty + ny * out;
      const sp = Math.hypot(b.vx, b.vy);
      if (!s.side && sp > this.vmax) { b.vx *= this.vmax / sp; b.vy *= this.vmax / sp; }
    }
    const hard = -vn;
    if (s.side) { // a flipper
      if (hard > 2) this.emit('flipHit', { side: s.side, v: hard });
      return;
    }
    const cx = b.x - nx * R, cy = b.y - ny * R;
    switch (s.kind) {
      case 'bumper':
        this.hit(s.id);
        this.add(SCORE.bumper, s.x, s.y + s.r);
        this.emit('bumper', { id: s.id });
        break;
      case 'sling':
        if (kicked) { this.hit(s.id); this.add(SCORE.sling); this.emit('sling', { id: s.id }); }
        break;
      case 'drop':
        if (hard > 0.5) this.dropHit(s, cx, cy);
        break;
      case 'standup':
        if (hard > 0.5) {
          this.hit(s.id);
          this.add(SCORE.standup, cx, cy);
          this.emit('standup', { id: s.id });
          if (this.lit === s) this.litHit(s, cx, cy);
        }
        break;
      default:
        if (hard > 3) this.emit('wall', { v: hard, kind: s.kind });
    }
  };

  Sim.prototype.dropHit = function (s, x, y) {
    s.on = false;
    this.hit(s.id);
    this.add(SCORE.drop, x, y);
    this.emit('drop', { id: s.id });
    if (this.lit === s) this.litHit(s, x, y);
    if (this.geo.drops.every((d) => !d.on)) {
      this.add(SCORE.bank, x, y + 1);
      this.emit('bank');
      if (!this.kick.L || !this.kick.R) { this.kick.L = this.kick.R = true; this.emit('kickLit'); }
      this.light();
      this.dropsT = 2.5;
    }
  };

  Sim.prototype.litHit = function (s, x, y) {
    this.lit = null;
    this.add(SCORE.lit, x, y + 1.2);
    this.emit('litHit', { id: s.id, who: this.buddyId });
  };

  // things the ball rolls over (no bounce): the spinner, rollover lanes, inlanes, outlanes, ramp mouths
  Sim.prototype.crossings = function (b, px, py) {
    const dx = b.x - px, dy = b.y - py;
    if (dx === 0 && dy === 0) return false;
    for (const tr of this.geo.triggers) {
      // does the path px,py -> b.x,b.y cross the trigger line?
      const ex = tr.bx - tr.ax, ey = tr.by - tr.ay;
      const den = dx * ey - dy * ex;
      if (den === 0) continue;
      const wx = tr.ax - px, wy = tr.ay - py;
      const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      switch (tr.kind) {
        case 'spinner': {
          const v = Math.abs(b.vy);
          this.spin.w = Math.min(14, this.spin.w + v * 0.22);
          this.spin.dir = b.vy >= 0 ? 1 : -1;
          this.hit('spinner');
          this.emit('spinner', { v });
          break;
        }
        case 'lane':
          this.hit(tr.id);
          if (!this.lanesLit[tr.index] && this.lanesT <= 0) {
            this.lanesLit[tr.index] = true;
            this.add(SCORE.lane, (tr.ax + tr.bx) / 2, tr.ay);
            this.emit('lane', { i: tr.index });
            if (this.lanesLit.every(Boolean)) { this.add(SCORE.lanes, 10.75, 36); this.emit('lanes'); this.light(); this.lanesT = 1.2; }
          }
          break;
        case 'inlane':
          if (dy < 0) { this.hit(tr.id); this.add(SCORE.inlane); this.emit('inlane', { id: tr.id }); }
          break;
        case 'outlane':
          if (dy < 0) {
            this.hit(tr.id);
            if (this.kick[tr.side]) {
              // KICKBACK: straight back up the outlane
              this.kick[tr.side] = false;
              this.kick['t' + tr.side] = 1;
              b.vx = (tr.side === 'L' ? 1 : -1) * (8 + this.rng() * 3);
              b.vy = 31 + this.rng() * 4;
              this.emit('kickback', { side: tr.side });
              return false;
            }
            this.emit('outlane', { id: tr.id });
          }
          break;
        case 'ramp': {
          const vin = b.vx * tr.inx + b.vy * tr.iny;
          if (vin > 0) {
            b.ramp = { r: tr.ramp, s: 0.02, v: vin };
            b.x = tr.ramp.path[0].x;
            b.y = tr.ramp.path[0].y;
            this.emit('rampIn', { id: tr.ramp.id });
            // EASY: a lit MULTIBALL starts as soon as the ball goes into a ramp, even if it rolls back out
            if (this.mb.ready && this.D.mbOnEntry) this.startMultiball();
            return true;
          }
          break;
        }
      }
    }
    return false;
  };

  // a ball on a ramp: it climbs, slows, and either makes it over the top or rolls back out of the mouth
  Sim.prototype.rampStep = function (b, dt) {
    const st = b.ramp, r = st.r, P = r.path;
    let i = 1;
    while (i < P.length - 1 && P[i].s < st.s) i++;
    const a = P[i - 1], c = P[i], ds = c.s - a.s || 1;
    // climbing up the table and up off it both slow the ball (EASY ramps are gentler)
    const g = this.D.g * this.D.rampG;
    const acc = -(g * (c.y - a.y) + g * 1.6 * (c.z - a.z)) / ds - 1.0 * Math.sign(st.v);
    st.v = Math.max(-RAMP_VMAX, Math.min(RAMP_VMAX, st.v + acc * dt));
    st.s += st.v * dt;
    if (st.s >= r.S) {
      const v = Math.max(RAMP_EXIT_MIN, Math.min(RAMP_EXIT_MAX, st.v));
      b.ramp = null;
      b.x = r.exit.x; b.y = r.exit.y; b.z = 0;
      b.vx = r.exit.dx * v; b.vy = r.exit.dy * v;
      this.rampDone(r);
      return;
    }
    if (st.s <= 0) {
      const v = Math.abs(st.v) + 1;
      b.ramp = null;
      b.x = r.at[0] - r.ux * 0.06; b.y = r.at[1] - r.uy * 0.06; b.z = 0;
      b.vx = -r.ux * v; b.vy = -r.uy * v;
      this.emit('rampBack', { id: r.id });
      return;
    }
    const k = (st.s - a.s) / ds;
    b.x = a.x + (c.x - a.x) * k;
    b.y = a.y + (c.y - a.y) * k;
    b.z = a.z + (c.z - a.z) * k;
  };

  Sim.prototype.rampDone = function (r) {
    this.hit('ramp-' + r.id);
    const ex = r.exit;
    if (this.mb.on) {
      this.add(SCORE.jackpot, ex.x, ex.y + 2);
      this.emit('jackpot', { id: r.id });
      return;
    }
    this.add(SCORE.ramp, ex.x, ex.y + 2);
    this.emit('ramp', { id: r.id, name: r.name });
    if (this.mb.ready) this.startMultiball();
    else this.light();
  };

  // one more MULTIBALL light; enough of them and the next ramp starts it
  Sim.prototype.light = function () {
    if (this.mb.on || this.mb.ready) return;
    this.mb.lights = Math.min(this.D.mbNeed, this.mb.lights + 1);
    this.emit('mbLight', { n: this.mb.lights, need: this.D.mbNeed });
    if (this.mb.lights >= this.D.mbNeed) { this.mb.ready = true; this.emit('mbReady'); }
  };

  Sim.prototype.startMultiball = function () {
    this.mb.ready = false;
    this.mb.on = true;
    this.mb.lights = 0;
    this.queue += 2;
    if (!this.noSaver) this.saverT = Math.max(this.saverT, 12);
    this.emit('multiball');
  };

  Sim.prototype.drained = function (b) {
    this.emit('drainBall', { x: b.x });
    if (this.state !== 'play' && this.state !== 'ready') return;
    const left = this.balls.length + this.queue;
    if (this.saverT > 0) {
      this.queue++;
      this.emit('saved', { who: this.buddyHelping ? this.buddyId : null });
      return;
    }
    if (left > 0) {
      if (this.mb.on && left <= 1) { this.mb.on = false; this.emit('mbEnd'); }
      return;
    }
    this.mb.on = false;
    this.state = 'drain';
    this.stateT = 0;
    this.emit('drain', { player: this.player().id, ball: this.player().ball });
  };

  // the turn after a lost ball: the next brother (2 players), or the next ball, or the end
  Sim.prototype.nextTurn = function () {
    this.player().ball++;
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const j = (this.cur + k) % n;
      if (this.players[j].ball <= this.D.balls) {
        this.cur = j;
        this.lit = null;
        this.saverT = 0;
        this.serve();
        this.emit('turn', { player: this.players[j].id, ball: this.players[j].ball, idx: j });
        return;
      }
    }
    this.state = 'over';
    this.stateT = 0;
    this.balls.length = 0;
    this.emit('over');
  };

  Sim.prototype.timers = function (dt) {
    if (this.state === 'play' && this.saverT > 0) {
      this.saverT -= dt;
      if (this.saverT <= 0) { this.saverT = 0; this.buddyHelping = false; this.emit('saverOff'); }
    }
    if (this.state === 'drain' && this.stateT > 1.6) this.nextTurn();
    // the spinner keeps turning and scores every half turn
    const sp = this.spin;
    if (sp.w > 0) {
      const before = Math.floor(sp.a * 2);
      sp.a += sp.w * dt;
      if (Math.floor(sp.a * 2) > before) { this.add(SCORE.spin); this.emit('spin'); }
      sp.w = Math.max(0, sp.w * Math.exp(-0.9 * dt) - 0.6 * dt);
    }
    if (this.lanesT > 0) { this.lanesT -= dt; if (this.lanesT <= 0) this.lanesLit = [false, false, false]; }
    if (this.dropsT > 0) {
      this.dropsT -= dt;
      if (this.dropsT <= 0) {
        // stand the targets up again, unless a ball is sitting where one goes
        const blocked = this.geo.drops.some((d) => this.balls.some((b) => !b.ramp && segDist(b.x, b.y, d) < R + d.r + 0.05));
        if (blocked) this.dropsT = 0.3;
        else { for (const d of this.geo.drops) d.on = true; this.emit('dropsUp'); }
      }
    }
    if (this.hi5Cd > 0) this.hi5Cd = Math.max(0, this.hi5Cd - dt);
    for (const k of ['L', 'R']) {
      if (this.kick['t' + k] > 0) {
        this.kick['t' + k] -= dt;
        if (this.kick['t' + k] <= 0 && this.D.kickback === 'always') this.kick[k] = true;
      }
    }
    this.updateBuddy(dt);
  };

  function segDist(x, y, s) {
    const u = Math.max(0, Math.min(s.len, (x - s.ax) * s.dx + (y - s.ay) * s.dy));
    return Math.hypot(x - (s.ax + s.dx * u), y - (s.ay + s.dy * u));
  }

  // ------------------------------------------------------------------ the companion
  // 1 player: the other brother pops in, does his signature move, tosses a treat, then turns on a 10-second ball
  // saver and lights a target. As often as you like. 2 players: a high five.
  Sim.prototype.callBuddy = function () {
    if (this.state === 'over') return false;
    if (this.players.length > 1) {
      if (this.hi5Cd > 0) return false;
      this.hi5Cd = 2.5;
      this.emit('highfive');
      return true;
    }
    const B = this.buddy;
    if (!B || B.state === 'bye' || B.state === 'leave') {
      this.buddy = { id: this.buddyId, state: 'enter', t: 0, again: 0 };
      this.emit('buddyIn', { who: this.buddyId });
    } else B.again++;
    return true;
  };

  Sim.prototype.updateBuddy = function (dt) {
    const B = this.buddy;
    if (!B) return;
    B.t += dt;
    if (B.state === 'enter' && B.t > 0.5) { B.state = 'hello'; B.t = 0; }
    else if (B.state === 'hello' && B.t > 1.3) {
      const [emoji, name] = TREATS[this.giftIx++ % TREATS.length];
      this.add(SCORE.treat);
      this.emit('gift', { emoji, name, from: B.id });
      this.help();
      B.state = 'stay'; B.t = 0;
    } else if (B.state === 'stay') {
      if (B.again > 0) { B.again--; B.state = 'hello'; B.t = 0; }
      else if (B.t > 10.5 && this.saverT <= 0.01) { B.state = 'bye'; B.t = 0; }
    } else if (B.state === 'bye' && B.t > 1.2) { B.state = 'leave'; B.t = 0; this.emit('buddyOut', { who: B.id }); }
    else if (B.state === 'leave' && B.t > 0.6) this.buddy = null;
  };

  // the companion's help: a 10-second ball saver and a lit target
  Sim.prototype.help = function () {
    this.saverT = Math.max(this.saverT, 10);
    this.buddyHelping = true;
    this.emit('help', { who: this.buddyId });
    this.lightTarget();
  };

  Sim.prototype.lightTarget = function () {
    const pool = this.geo.standups.concat(this.geo.drops.filter((d) => d.on)).filter((s) => s !== this.lit);
    if (!pool.length) return;
    this.lit = pool[Math.floor(this.rng() * pool.length)];
    this.emit('lightOn', { id: this.lit.id });
  };

  // ------------------------------------------------------------------ the autopilot
  // Plays like a careful kid: flips when a ball is about to reach a flipper, and when a slow ball lands on a raised
  // flipper it cradles it, lets it roll down and flips at a random point along the flipper (so the shots spread
  // around the table). It lets the plunger go at a random power. opts.lazy never flips (to prove flipping matters).
  function Bot(sim, o = {}) {
    this.sim = sim;
    this.rng = mulberry(o.seed || 7);
    this.lazy = !!o.lazy;
    this.o = Object.assign({ lead0: 0.01, lead1: 0.06, hold0: 0.16, hold1: 0.28, zone: 1.6, cradle: true }, o.tune || {});
    this.st = { L: { mode: 'idle', t: 0 }, R: { mode: 'idle', t: 0 } };
    this.lead = { L: 0.03, R: 0.03 };
    this.want = 0.3 + this.rng() * 0.7;
  }
  // a ball in a flipper's own frame (at rest): along it, above it, and its speed
  Bot.prototype.frame = function (f, b, la) {
    const dx = f.s * Math.cos(f.rest), dy = Math.sin(f.rest), nx = -dy * f.s, ny = dx * f.s;
    const qx = b.x + b.vx * la - f.px, qy = b.y + b.vy * la - 0.5 * this.sim.D.g * la * la - f.py;
    return { along: qx * dx + qy * dy, above: qx * nx + qy * ny, sp: Math.hypot(b.vx, b.vy) };
  };
  Bot.prototype.input = function (dt) {
    const sim = this.sim, out = { left: false, right: false, plunger: false }, o = this.o;
    if (sim.onPlunger() && !sim.queue && !sim.autoPlunge) {
      if (sim.plunge < this.want) out.plunger = true;
      else this.want = 0.15 + this.rng() * 0.85;
    }
    if (this.lazy) return out;
    for (const f of sim.flippers) {
      const key = f.side === 'L' ? 'left' : 'right', st = this.st[f.side];
      const near = sim.balls.filter((b) => !b.ramp && b.y < 12);
      st.t -= dt;
      if (st.mode === 'hold') {
        out[key] = true;
        if (st.t <= 0) {
          // a slow ball sitting on the raised flipper: keep it there for a moment (a cradle)
          const sat = o.cradle && near.some((b) => { const q = this.frame(f, b, 0); return q.sp < 5 && q.along > -0.5 && q.along < f.len + 0.3 && q.above < 2.6 && q.above > -0.5; });
          if (sat) { st.mode = 'cradle'; st.t = 0.3 + this.rng() * 0.9; } else st.mode = 'idle';
        }
        continue;
      }
      if (st.mode === 'cradle') {
        out[key] = true;
        if (st.t <= 0) { st.mode = 'aim'; st.t = 1.6; st.at = f.len * (0.3 + this.rng() * 0.55); out[key] = false; }
        continue;
      }
      if (st.mode === 'aim') {
        // let it roll down the flipper; flip when it gets to the chosen spot
        const b = near.find((bb) => { const q = this.frame(f, bb, 0); return q.along > -0.6 && q.along < f.len + 0.8 && q.above < 2.2; });
        if (!b || st.t <= 0) { st.mode = 'idle'; }
        else if (this.frame(f, b, 0).along >= st.at) { st.mode = 'hold'; st.t = o.hold0 + this.rng() * (o.hold1 - o.hold0); out[key] = true; continue; }
        else continue;
      }
      for (const b of near) {
        const la = this.lead[f.side];
        const q = this.frame(f, b, la);
        const inZone = q.along > 0.3 && q.along < f.len + 0.5 && q.above > -0.3 && q.above < o.zone && b.vy < 3;
        const rollingOff = q.sp < 4 && q.above < 1.2 && q.along > f.len * 0.45 && q.along < f.len + 0.5;
        if (inZone || rollingOff) {
          st.mode = 'hold';
          st.t = o.hold0 + this.rng() * (o.hold1 - o.hold0);
          this.lead[f.side] = o.lead0 + this.rng() * (o.lead1 - o.lead0);
          out[key] = true;
          break;
        }
      }
    }
    return out;
  };

  // ------------------------------------------------------------------ fixed steps whatever the frame rate
  function Runner(sim) { this.sim = sim; this.acc = 0; this.steps = 0; }
  Runner.prototype.advance = function (frameDt, inputFn) {
    this.acc += frameDt;
    let n = 0;
    while (this.acc >= DT - 1e-9 && n < 16) {
      this.sim.step(DT, inputFn ? inputFn(this.sim) : {});
      this.acc -= DT;
      n++;
      this.steps++;
    }
    if (this.acc > DT) this.acc = 0;
    return n;
  };

  Object.assign(PB, {
    DT, R, VMAX, W_UP, W_DOWN, PLUNGE_MIN, PLUNGE_MAX, TREATS, DIFF, SCORE, Sim, Bot, Runner, mulberry,
    toiCirc, toiSeg, flipDist, segDist,
  });
})(typeof window !== 'undefined' ? window : globalThis);
