#!/usr/bin/env node
/* TT Pinball: draws a table's collision shapes (and, with --trace, an autopilot's ball paths) as an SVG, for
   checking the layout by eye.   node tools/map.js <table> [out.svg] [--trace seconds] */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['title.js', 'tables.js', 'sim.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const PB = ctx.PB;
const id = process.argv[2] || 'space';
const out = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : `/tmp/pb-${id}.svg`;
const ti = process.argv.indexOf('--trace');
const easy = process.argv.includes('--easy');
const def = PB.TABLES.find((t) => t.id === id);
const sim = new PB.Sim(def, { easy, seed: 3 });
const S = 20, X = (x) => (x + 1) * S, Y = (y) => (47 - y) * S;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${24 * S}" height="${49 * S}" style="background:#123">`;
const col = { wall: '#ddd', post: '#ccc', bumper: '#f6c', sling: '#fc3', drop: '#3cf', standup: '#6f6', gate: '#f80', plunger: '#888', floor: '#f44', back: '#777', rampWall: '#c9f' };
for (const s of sim.geo.shapes) {
  const c = col[s.kind] || '#fff';
  if (s.k === 'seg') svg += `<line x1="${X(s.ax)}" y1="${Y(s.ay)}" x2="${X(s.bx)}" y2="${Y(s.by)}" stroke="${c}" stroke-width="${Math.max(2, s.r * 2 * S)}" stroke-linecap="round"/>`;
  else svg += `<circle cx="${X(s.x)}" cy="${Y(s.y)}" r="${s.r * S}" fill="${c}"/>`;
}
for (const t of sim.geo.triggers) svg += `<line x1="${X(t.ax)}" y1="${Y(t.ay)}" x2="${X(t.bx)}" y2="${Y(t.by)}" stroke="#0f0" stroke-dasharray="4 3" stroke-width="2"/>`;
for (const r of sim.geo.ramps) svg += `<polyline fill="none" stroke="#a6f" stroke-width="3" opacity="0.6" points="${r.path.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`;
for (const f of sim.flippers) for (const ang of [f.rest, f.up]) {
  const dx = f.s * Math.cos(ang), dy = Math.sin(ang);
  svg += `<line x1="${X(f.px)}" y1="${Y(f.py)}" x2="${X(f.px + dx * f.len)}" y2="${Y(f.py + dy * f.len)}" stroke="${ang === f.rest ? '#fa0' : '#a60'}" stroke-width="${f.r0 * 1.6 * S}" stroke-linecap="round" opacity="0.8"/>`;
}
if (ti > 0) {
  const secs = +process.argv[ti + 1] || 30;
  const bot = new PB.Bot(sim, { seed: 5 });
  let pts = [];
  const flush = () => { if (pts.length > 1) svg += `<polyline fill="none" stroke="#ff0" stroke-width="1" opacity="0.5" points="${pts.join(' ')}"/>`; pts = []; };
  for (let i = 0; i < secs / PB.DT; i++) {
    sim.step(PB.DT, bot.input(PB.DT));
    if (sim.state === 'over') break;
    const b = sim.balls[0];
    if (b && !b.ramp) pts.push(`${X(b.x).toFixed(1)},${Y(b.y).toFixed(1)}`); else flush();
    if (pts.length > 400) { const l = pts[pts.length - 1]; flush(); pts.push(l); }
  }
  flush();
  console.log('score', sim.players[0].score, 'hits', JSON.stringify(sim.hits), 'state', sim.state, 'ball', sim.players[0].ball, 't', sim.t.toFixed(1));
}
svg += '</svg>';
fs.writeFileSync(out, svg);
console.log('wrote', out);
