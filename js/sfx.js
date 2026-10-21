/* TT Pinball: sound effects, all synthesised with Kit.sound.tone and Kit.sound.hiss (no audio files), so they follow
   the kit's one sound switch. Exposes PB.sfx. Every effect is silent until Kit.sound.init() runs on the first tap or
   key. Bumpers ring a little higher each time in a row, so a ball rattling round the bumpers plays a tune. */
(function () {
  'use strict';
  const PB = (window.PB = window.PB || {});
  const S = Kit.sound;
  const { tone, hiss } = S;
  const notes = (list, o = {}) => list.forEach((f, i) => tone({ type: o.type || 'triangle', f, at: (o.at || 0) + i * (o.gap || 0.07), dur: o.dur || 0.16, vol: o.vol || 0.12 }));
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319];
  let run = 0, runT = 0, lastSpin = 0, lastWall = 0;
  const now = () => performance.now();

  PB.sfx = {
    flip() { hiss({ filter: 'bandpass', f: 900, q: 1.5, dur: 0.05, vol: 0.12 }); tone({ type: 'square', f: 110, to: 70, dur: 0.06, vol: 0.05, lp: 900 }); },
    flipHit(v) { tone({ type: 'triangle', f: 180, to: 120, dur: 0.07, vol: Math.min(0.2, 0.04 + v * 0.003) }); },
    bumper() {
      if (now() - runT > 1500) run = 0;
      runT = now();
      const f = SCALE[Math.min(SCALE.length - 1, run++)];
      tone({ type: 'square', f: 150, to: 60, dur: 0.08, vol: 0.12, lp: 1200 });
      tone({ type: 'sine', f, dur: 0.22, vol: 0.12 });
      tone({ type: 'sine', f: f * 2, dur: 0.12, vol: 0.04 });
    },
    sling() { hiss({ filter: 'bandpass', f: 1400, q: 2, dur: 0.05, vol: 0.14 }); tone({ type: 'triangle', f: 260, to: 520, dur: 0.07, vol: 0.1 }); },
    drop() { tone({ type: 'square', f: 300, to: 120, dur: 0.09, vol: 0.06, lp: 1500 }); hiss({ filter: 'lowpass', f: 700, dur: 0.07, vol: 0.08 }); },
    standup() { tone({ type: 'triangle', f: 1320, dur: 0.1, vol: 0.09 }); tone({ type: 'sine', f: 1980, dur: 0.08, vol: 0.04 }); },
    spin() {
      if (now() - lastSpin < 45) return;
      lastSpin = now();
      tone({ type: 'square', f: 1800, dur: 0.02, vol: 0.03, lp: 3000 });
    },
    lane(i) { tone({ type: 'sine', f: [784, 988, 1175][i] || 1175, dur: 0.14, vol: 0.1 }); },
    lanes() { notes([784, 988, 1175, 1568], { gap: 0.07, vol: 0.1 }); },
    bank() { notes([523, 659, 784, 1047, 1319], { gap: 0.06, vol: 0.1, type: 'square' }); },
    rampIn() { tone({ type: 'sine', f: 200, to: 700, dur: 0.45, vol: 0.06 }); },
    ramp() { notes([659, 880, 1109, 1319], { gap: 0.07, vol: 0.11 }); hiss({ f: 2000, to: 5000, dur: 0.3, vol: 0.04 }); },
    rampBack() { tone({ type: 'sine', f: 600, to: 200, dur: 0.4, vol: 0.06 }); },
    jackpot() { notes([523, 659, 784, 1047, 784, 1047, 1319, 1568], { gap: 0.08, dur: 0.2, vol: 0.13 }); },
    multiball() {
      for (let k = 0; k < 3; k++) tone({ type: 'sawtooth', f: 400, to: 900, dur: 0.22, vol: 0.05, lp: 2400, at: k * 0.24 });
      notes([523, 659, 784, 1047, 1319], { gap: 0.09, dur: 0.22, vol: 0.12, at: 0.75 });
    },
    mbLight() { notes([880, 1320], { gap: 0.06, vol: 0.08, type: 'sine' }); },
    mbReady() { notes([659, 784, 988, 1319], { gap: 0.1, vol: 0.11, type: 'square' }); },
    launch(p) { tone({ type: 'sine', f: 140, to: 520 + p * 500, dur: 0.22, vol: 0.14 }); hiss({ filter: 'highpass', f: 2500, dur: 0.08, vol: 0.05 }); },
    pull() { tone({ type: 'triangle', f: 90, to: 60, dur: 0.12, vol: 0.05 }); },
    wall(v) {
      if (now() - lastWall < 40) return;
      lastWall = now();
      tone({ type: 'triangle', f: 330, to: 280, dur: 0.04, vol: Math.min(0.08, v * 0.003) });
    },
    kickback() { tone({ type: 'square', f: 80, to: 40, dur: 0.12, vol: 0.12, lp: 600 }); tone({ type: 'sine', f: 300, to: 1200, dur: 0.3, vol: 0.1, at: 0.04 }); },
    kickLit() { notes([1047, 1568], { gap: 0.08, vol: 0.08, type: 'sine' }); },
    drain() { tone({ type: 'sine', f: 900, to: 180, dur: 0.6, vol: 0.12 }); notes([392, 330, 262], { gap: 0.2, dur: 0.3, vol: 0.1, at: 0.5 }); },
    saved() { tone({ type: 'sine', f: 240, to: 800, dur: 0.3, vol: 0.14 }); notes([1047, 1319], { gap: 0.08, vol: 0.08, at: 0.2 }); },
    nudge() { tone({ type: 'sine', f: 70, to: 40, dur: 0.15, vol: 0.2 }); hiss({ filter: 'lowpass', f: 400, dur: 0.1, vol: 0.1 }); },
    careful() { tone({ type: 'square', f: 440, dur: 0.12, vol: 0.05, lp: 1500 }); tone({ type: 'square', f: 440, dur: 0.12, vol: 0.05, lp: 1500, at: 0.18 }); },
    tilt() { tone({ type: 'sawtooth', f: 160, to: 110, dur: 0.6, vol: 0.09, lp: 900 }); },
    lit() { notes([1319, 1568, 2093], { gap: 0.06, vol: 0.08, type: 'sine' }); },
    litHit() { notes([784, 1047, 1319, 1568, 2093], { gap: 0.06, vol: 0.12 }); },
    buddyIn() { tone({ type: 'sine', f: 400, to: 1200, dur: 0.35, vol: 0.1 }); hiss({ f: 1200, to: 3000, dur: 0.35, vol: 0.05 }); },
    buddyOut() { tone({ type: 'sine', f: 1200, to: 400, dur: 0.35, vol: 0.08 }); },
    gift() { S.coin(4); notes([1047, 1319], { gap: 0.08, vol: 0.08, at: 0.15 }); },
    help() { notes([659, 880, 1109], { gap: 0.06, vol: 0.1 }); },
    highfive() {
      hiss({ f: 1800, q: 1.2, dur: 0.07, vol: 0.4 });
      hiss({ f: 2400, q: 1.2, dur: 0.05, vol: 0.2, at: 0.05 });
      notes([659, 880, 1109, 1319], { gap: 0.06, vol: 0.1, at: 0.12 });
    },
    turn() { notes([523, 784], { gap: 0.12, vol: 0.1 }); },
    over() { notes([523, 659, 784, 1047, 784, 1047, 1319], { gap: 0.11, dur: 0.24, vol: 0.13 }); },
    click() { S.click(); },
    start() { S.powerup(); },
  };
})();
