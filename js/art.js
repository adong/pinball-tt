/* TT Pinball: everything painted on a canvas. The three playfields (Space, Jungle, Candy), the backbox, the chrome
   reflection for the ball, glows and floating numbers. No image files. Exposes PB.art. */
(function () {
  'use strict';
  const PB = (window.PB = window.PB || {});
  const G = Kit.gfx;
  const { makeCanvas, toTexture, roundRect } = G;

  // the table's colours and its toys (emoji are drawn by the device's own emoji font)
  const THEMES = {
    space: {
      floor: ['#1a1446', '#3b1f72'], rail: '#8fd6ff', post: '#e9f6ff', sling: '#ff4fd8', rubber: '#ffffff', flip: '#ffffff', flipRubber: '#ff4fd8',
      ramp: '#5ff2ff', rampRail: '#d8f7ff', cabinet: '#2a2350', apron: '#4b3b8f', light: '#5ff2ff', light2: '#ffd23f', ui: '#6a4bd6',
      bumper: ['#ff7b54', '#5ff2ff', '#c3a6ff', '#ffd23f'], drop: '👽', standup: '⭐', bumperToy: 'planet', sky: ['#05051a', '#1a1446'],
    },
    jungle: {
      floor: ['#1f6b3a', '#3f9a3c'], rail: '#e2b867', post: '#fff3d1', sling: '#ffb300', rubber: '#fff8e0', flip: '#fff3d1', flipRubber: '#ff7a00',
      ramp: '#7bd148', rampRail: '#c9a46a', cabinet: '#4a3218', apron: '#6b4a22', light: '#ffe14d', light2: '#ff7a00', ui: '#2f8f46',
      bumper: ['#8d5a2b', '#a66b33', '#7a4b22', '#93602e'], drop: '🐵', standup: '🍌', bumperToy: 'drum', sky: ['#0f3a22', '#2e7d32'],
    },
    candy: {
      floor: ['#ffd6ea', '#ffb3d6'], rail: '#ff5fa2', post: '#ffffff', sling: '#7ad7ff', rubber: '#ffffff', flip: '#ffffff', flipRubber: '#ff3d7f',
      ramp: '#ff5f7e', rampRail: '#ffffff', cabinet: '#c2185b', apron: '#ff7eb6', light: '#ff3d7f', light2: '#7ad7ff', ui: '#ff5fa2',
      bumper: ['#ff9ad5', '#9ee7ff', '#fff07a', '#b9f59a'], drop: '🍬', standup: '🧁', bumperToy: 'cupcake', sky: ['#ff8cc6', '#ffd6ea'],
    },
  };

  // table units to canvas pixels (the playfield picture covers x -0.6..22.2, y -1..46)
  const PF = { x0: -0.6, x1: 22.2, y0: -1, y1: 46, ppu: 22 };
  const px = (x) => (x - PF.x0) * PF.ppu, py = (y) => (PF.y1 - y) * PF.ppu;

  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // the playfield: the theme's picture, guide lines along the lanes, arrows at the ramps
  function playfield(id, geo) {
    const th = THEMES[id];
    const Wc = Math.round((PF.x1 - PF.x0) * PF.ppu), Hc = Math.round((PF.y1 - PF.y0) * PF.ppu);
    const [c, g] = makeCanvas(Wc, Hc);
    seed = id.length * 977;
    const gr = g.createLinearGradient(0, Hc, 0, 0);
    gr.addColorStop(0, th.floor[0]);
    gr.addColorStop(1, th.floor[1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, Wc, Hc);
    if (id === 'space') {
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
        const r = rnd() < 0.1 ? 2.4 : 1.2;
        g.beginPath(); g.arc(rnd() * Wc, rnd() * Hc, r, 0, Math.PI * 2); g.fill();
      }
      // a big ringed planet and a galaxy swirl
      const pl = g.createRadialGradient(px(6) - 20, py(32) - 20, 10, px(6), py(32), 70);
      pl.addColorStop(0, '#ffb36b'); pl.addColorStop(1, '#c2410c');
      g.fillStyle = pl; g.beginPath(); g.arc(px(6), py(32), 66, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,230,180,0.8)'; g.lineWidth = 8;
      g.beginPath(); g.ellipse(px(6), py(32), 110, 26, -0.3, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(160,120,255,0.35)'; g.lineWidth = 14;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(px(14), py(14), 40 + k * 26, k, k + 3.6); g.stroke(); }
      g.font = `52px ${G.EMOJI_FONT}`;
      g.globalAlpha = 0.85;
      for (const [e, x, y] of [['🚀', 15.5, 17.5], ['🛸', 4.2, 15.5], ['🌙', 16.5, 41], ['☄️', 3.2, 41.5]]) g.fillText(e, px(x) - 26, py(y) + 18);
      g.globalAlpha = 1;
    } else if (id === 'jungle') {
      // leaves, a river and vines
      for (let i = 0; i < 70; i++) {
        g.fillStyle = ['rgba(20,90,40,0.55)', 'rgba(120,200,80,0.35)', 'rgba(10,60,30,0.5)'][i % 3];
        g.save(); g.translate(rnd() * Wc, rnd() * Hc); g.rotate(rnd() * 6.3);
        g.beginPath(); g.ellipse(0, 0, 34 + rnd() * 30, 12 + rnd() * 8, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
      g.strokeStyle = 'rgba(80,190,255,0.55)'; g.lineWidth = 46;
      g.beginPath(); g.moveTo(px(-1), py(26)); g.bezierCurveTo(px(6), py(22), px(12), py(30), px(22), py(24)); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4;
      for (let k = 0; k < 8; k++) { const x = rnd() * Wc; g.beginPath(); g.moveTo(x, py(25) + rnd() * 30); g.lineTo(x + 30, py(25) + rnd() * 30); g.stroke(); }
      g.font = `54px ${G.EMOJI_FONT}`;
      g.globalAlpha = 0.9;
      for (const [e, x, y] of [['🐯', 4.6, 16.2], ['🦜', 15.6, 16.6], ['🐘', 10, 41.8], ['🌴', 3, 40.5], ['🐍', 16.8, 41]]) g.fillText(e, px(x) - 27, py(y) + 18);
      g.globalAlpha = 1;
    } else {
      // candy stripes, sprinkles and sweets
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = -Hc; k < Wc; k += 70) { g.beginPath(); g.moveTo(k, Hc); g.lineTo(k + 34, Hc); g.lineTo(k + 34 + Hc, 0); g.lineTo(k + Hc, 0); g.fill(); }
      for (let i = 0; i < 300; i++) {
        g.fillStyle = ['#ff3d7f', '#7ad7ff', '#ffe066', '#8be36b', '#b28bff'][i % 5];
        g.save(); g.translate(rnd() * Wc, rnd() * Hc); g.rotate(rnd() * 6.3); roundRect(g, -6, -2, 12, 4, 2); g.fill(); g.restore();
      }
      g.font = `54px ${G.EMOJI_FONT}`;
      for (const [e, x, y] of [['🍩', 4.5, 16], ['🍪', 15.6, 16.4], ['🍦', 16.8, 41], ['🍫', 3.4, 41], ['🍓', 10.4, 41.8]]) g.fillText(e, px(x) - 27, py(y) + 18);
    }
    // soft glow under the flippers and the lane guides painted on the floor
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 3;
    g.setLineDash([10, 10]);
    for (const x of [0.7, 2.2, 17.8, 19.3]) { g.beginPath(); g.moveTo(px(x), py(13)); g.lineTo(px(x), py(9)); g.stroke(); }
    g.setLineDash([]);
    // arrows into each ramp
    for (const r of geo.ramps) arrow(g, r.at[0] - r.ux * 3.2, r.at[1] - r.uy * 3.2, r.ux, r.uy, th.light);
    // the orbit lane and the spinner
    arrow(g, 0.9, 21.5, 0, 1, th.light2);
    // the drain: a dark mouth between the flippers
    const dg = g.createRadialGradient(px(10), py(1.2), 4, px(10), py(1.2), 120);
    dg.addColorStop(0, 'rgba(0,0,0,0.65)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = dg;
    g.fillRect(px(4), py(6), px(16) - px(4), py(0) - py(6));
    const tex = toTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function arrow(g, x, y, ux, uy, color) {
    const a = Math.atan2(-uy, ux);
    g.save();
    g.translate(px(x), py(y));
    g.rotate(a);
    g.fillStyle = color;
    g.globalAlpha = 0.75;
    g.beginPath(); g.moveTo(30, 0); g.lineTo(-6, -22); g.lineTo(2, 0); g.lineTo(-6, 22); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(-44, -22); g.lineTo(-36, 0); g.lineTo(-44, 22); g.closePath(); g.fill();
    g.restore();
  }

  // the backbox above the table: the game's name, the table's name and its toys
  function backbox(id, tableName) {
    const th = THEMES[id];
    const [c, g] = makeCanvas(1024, 512);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    seed = 99;
    if (id === 'space') for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(rnd() * 1024, rnd() * 512, 2, 2); }
    g.font = `110px ${G.EMOJI_FONT}`;
    const toys = { space: ['🚀', '🪐', '👽', '🛸'], jungle: ['🐒', '🦁', '🦜', '🐘'], candy: ['🍭', '🧁', '🍬', '🍩'] }[id];
    g.fillText(toys[0], 40, 160); g.fillText(toys[1], 860, 160); g.fillText(toys[2], 60, 470); g.fillText(toys[3], 860, 470);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.font = `130px ${G.FONT}`;
    g.lineWidth = 22; g.strokeStyle = '#14121f'; g.strokeText(PB.TITLE, 512, 200);
    g.fillStyle = '#ffd23f'; g.fillText(PB.TITLE, 512, 200);
    g.font = `78px ${G.FONT}`;
    g.lineWidth = 16; g.strokeText(tableName, 512, 360);
    g.fillStyle = '#ffffff'; g.fillText(tableName, 512, 360);
    return toTexture(c);
  }

  // a chrome room for the ball to reflect: bright sky, a dark floor, a few lights
  let chrome = null;
  function chromeEnv() {
    if (chrome) return chrome;
    const [c, g] = makeCanvas(512, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#b9c6d8'); gr.addColorStop(0.55, '#3a3f52'); gr.addColorStop(1, '#14121f');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[80, 40, 18], [260, 30, 24], [420, 50, 16], [170, 80, 10]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,120,200,0.6)'; g.fillRect(0, 150, 512, 10);
    chrome = toTexture(c);
    chrome.mapping = THREE.EquirectangularReflectionMapping;
    return chrome;
  }

  // floating "+100": a little canvas sprite texture
  const numCache = {};
  function number(text, color) {
    const key = text + color;
    if (numCache[key]) return numCache[key];
    const [c, g] = makeCanvas(256, 96);
    g.font = `64px ${G.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 12; g.strokeStyle = '#14121f'; g.strokeText(text, 128, 50);
    g.fillStyle = color; g.fillText(text, 128, 50);
    return (numCache[key] = toTexture(c));
  }

  PB.art = { THEMES, PF, playfield, backbox, chromeEnv, number };
})();
