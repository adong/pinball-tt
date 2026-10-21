#!/usr/bin/env node
/* TT Pinball: the headless check. Loads the same rules the game uses (js/tables.js and js/sim.js, no Three.js) and
   runs js/checks.js: the soak, the autopilot, every target, scoring, the frame rate and the plunger, each with a
   sabotaged version that must fail.   node tools/check.js [--quick] */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Date, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['title.js', 'tables.js', 'sim.js', 'checks.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const res = ctx.PB.checks.run({ quick: process.argv.includes('--quick') });
console.log(res.lines.join('\n'));
console.log(res.ok ? '\nALL CHECKS PASS' : `\n${res.fails.length} CHECK(S) FAILED`);
process.exit(res.ok ? 0 : 1);
