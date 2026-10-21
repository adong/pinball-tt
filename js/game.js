/* TT Pinball: everything around the simulation. Screens, keyboard and finger input, the HUD, the companion button,
   toasts, saving best scores, the title-screen demo, and test hooks on window.game. */
(function () {
  'use strict';
  const PB = window.PB, S = Kit.sound;
  const { DT } = PB;
  const $ = (id) => document.getElementById(id);
  const NAME = { teddy: 'TEDDY', tommy: 'TOMMY' };
  const cls = (who) => (who === 'tommy' ? 'm' : 't');
  const fmt = (n) => n.toLocaleString('en-US');

  // ---------------------------------------------------------------- saving
  const SAVE_KEY = 'pinballTT.v1';
  const save = { best: {}, hero: 'teddy', easy: true, table: 'space' };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
  const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } };
  const bestKey = () => `${G.table}-${G.easy ? 'easy' : 'normal'}`;

  const view = new PB.View($('scene'));
  const faces = Kit.portraits([Kit.roster.get('teddy'), Kit.roster.get('tommy')], { size: 160 });

  const G = {
    screen: 'title', mode: '1p', hero: save.hero === 'tommy' ? 'tommy' : 'teddy', easy: save.easy !== false,
    table: PB.TABLES.some((t) => t.id === save.table) ? save.table : 'space',
    sim: null, runner: null, demo: null, held: false, keepAwake: false, toasts: [], touchOn: false,
    bannerT: 9, auto: null, overT: -1, buddyState: null, hudCache: {},
  };
  const tableDef = (id) => PB.TABLES.find((t) => t.id === id);

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const tapped = new Set(); // pressed since the last step: a quick tap still flips even if released before the next frame
  const fingers = new Map(); // pointerId -> 'L' | 'R'
  let nudgeTap = false;
  // (no Shift keys: Shift held for a flipper plus / for the other would type ? and open the keys panel)
  const LEFT = ['KeyZ', 'ArrowLeft'], RIGHT = ['Slash', 'ArrowRight'], PLUNGE = ['Space', 'ArrowDown'], NUDGE = ['KeyN', 'ArrowUp'];

  addEventListener('keydown', (e) => {
    S.init();
    if (/^Arrow|^Space$|^Slash$/.test(e.code)) e.preventDefault(); // (a bare / opens Quick Find in Firefox)
    const fresh = !keys.has(e.code);
    keys.add(e.code);
    tapped.add(e.code);
    if (fresh && !e.repeat) onKey(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  function onKey(code) {
    const sc = G.screen;
    if (code === 'KeyM') return toggleMute();
    if (sc === 'play') {
      if (code === 'KeyT' || code === 'Enter' || code === 'NumpadEnter') callBuddy();
      else if (code === 'KeyP' || code === 'Escape') pause();
      else if (LEFT.includes(code) || RIGHT.includes(code)) PB.sfx.flip();
    } else if (sc === 'pause') {
      if (code === 'KeyP' || code === 'Escape' || code === 'Space' || code === 'Enter') resume();
    } else if (sc === 'title') {
      if (code === 'Enter' || code === 'Space') startGame('1p', G.hero);
      else if (code === 'Digit2' || code === 'Numpad2') startGame('2p');
      else if (code === 'Digit1' || code === 'Numpad1') startGame('1p', G.hero);
      else if (code === 'ArrowLeft' || code === 'KeyA') pickHero('teddy');
      else if (code === 'ArrowRight' || code === 'KeyD') pickHero('tommy');
      else if (code === 'KeyE') setEasy(!G.easy);
      else if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyS') pickTable(1);
    } else if (sc === 'over') {
      if (code === 'Enter' || code === 'Space') again();
      else if (code === 'Escape') toTitle();
    }
  }

  const any = (list) => list.some((c) => keys.has(c) || tapped.has(c));
  function inputs() {
    let left = any(LEFT), right = any(RIGHT), plunger = any(PLUNGE), nudge = any(NUDGE) || nudgeTap;
    for (const side of fingers.values()) { if (side === 'L') left = true; else right = true; }
    // a finger anywhere pulls the plunger back while a ball waits on it
    if (fingers.size && G.sim && G.sim.onPlunger()) plunger = true;
    const out = { left, right, plunger, nudge };
    if (G.auto && G.auto.sim === G.sim) Object.assign(out, G.auto.input(DT));
    return out;
  }

  // Fingers: the left half of the screen is the left flipper, the right half the right one (both at once is fine).
  // While a ball waits on the plunger, holding any finger down pulls the plunger; letting go launches.
  function setupPointer() {
    const cv = $('scene');
    cv.addEventListener('pointerdown', (e) => {
      S.init();
      if (e.pointerType === 'touch' && !G.touchOn) { G.touchOn = true; layoutHud(); }
      if (G.screen !== 'play') return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      fingers.set(e.pointerId, e.clientX < innerWidth / 2 ? 'L' : 'R');
      PB.sfx.flip();
      e.preventDefault();
    });
    const end = (e) => fingers.delete(e.pointerId);
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    if (matchMedia('(pointer: coarse)').matches) G.touchOn = true;
    // the touch pads and the nudge button do the same as the halves of the screen
    for (const [id, side] of [['padL', 'L'], ['padR', 'R']]) {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { S.init(); e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } fingers.set(e.pointerId, side); PB.sfx.flip(); });
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }
    $('btnNudge').addEventListener('pointerdown', (e) => { S.init(); e.preventDefault(); e.stopPropagation(); nudgeTap = true; });
  }

  // ---------------------------------------------------------------- flow

  const SCREENS = ['title', 'pause', 'over'];
  function show(screen) {
    G.screen = screen;
    for (const id of SCREENS) $(id).classList.toggle('hidden', id !== screen);
    const playing = screen === 'play' || screen === 'pause' || screen === 'over';
    $('hud').classList.toggle('hidden', !playing);
    S.music(screen === 'play' ? 'play' : screen === 'pause' ? 'pause' : screen === 'over' ? 'over' : 'title');
    if (screen !== 'play') fingers.clear();
    layoutHud();
  }

  function startGame(mode, hero) {
    S.init();
    PB.sfx.start();
    G.mode = mode;
    if (hero) { G.hero = hero; save.hero = hero; }
    save.easy = G.easy;
    save.table = G.table;
    store();
    G.demo = null;
    G.auto = null;
    clearToasts();
    const players = mode === '2p' ? ['teddy', 'tommy'] : [G.hero];
    G.sim = new PB.Sim(tableDef(G.table), { easy: G.easy, players, buddy: Kit.roster.buddyFor(G.hero), seed: (Math.random() * 1e9) | 0 });
    G.runner = new PB.Runner(G.sim);
    G.overT = -1;
    G.buddyState = null;
    for (const id in view.kids) view.calm(id);
    view.setTable(G.sim);
    view.update(G.sim, 0, cast());
    setupHud();
    banner();
    show('play');
  }

  const again = () => startGame(G.mode, G.hero);

  function pause() { if (G.screen === 'play') show('pause'); }
  function resume() { if (G.screen === 'pause') show('play'); }

  function toTitle() {
    clearToasts();
    G.sim = null;
    G.auto = null;
    for (const id in view.kids) view.calm(id);
    startDemo();
    show('title');
    refreshTitle();
  }

  function callBuddy() {
    const sim = G.sim;
    if (!sim || G.screen !== 'play') return;
    S.init();
    if (!sim.callBuddy() && G.mode === '2p' && sim.hi5Cd > 0) toast('ONE MORE SECOND…', { life: 0.8 });
  }

  // who stands on the apron: the player on the left; his brother on the right when he comes to help (1 player),
  // or Teddy on the left and Tommy on the right (2 players, the one whose turn it is a little bigger)
  function cast() {
    const sim = G.sim;
    if (!sim) return {};
    if (G.mode === '2p') {
      const cur = sim.player().id;
      return { L: 'teddy', R: 'tommy', play: sim.state === 'over' ? null : cur, big: sim.state === 'over' ? null : cur };
    }
    const B = sim.buddy;
    return { L: G.hero, play: G.hero, R: B && B.state !== 'leave' ? B.id : null, buddy: B ? B.id : null };
  }

  // ---------------------------------------------------------------- the simulation's events

  function afterSteps() {
    const sim = G.sim;
    if (tapped.size) tapped.clear();
    nudgeTap = false;
    for (const ev of sim.events) handle(ev, sim);
    sim.events.length = 0;
    // the buddy's signature each time he says hello (again)
    const B = sim.buddy, st = B && B.state;
    if (st !== G.buddyState) {
      if (st === 'hello') view.act(B.id, Kit.roster.signature(Kit.roster.get(B.id), 'hello'), 1.5);
      if (st === 'bye') view.act(B.id, Kit.roster.signature(Kit.roster.get(B.id), 'goodbye') === 'peace' ? 'peace' : 'wave', 1.3);
      G.buddyState = st;
    }
  }

  function handle(ev, sim, quiet) {
    view.onEvent(ev, sim);
    if (quiet) return;
    const fx = PB.sfx, me = sim.player().id, bud = sim.buddyId;
    switch (ev.type) {
      case 'flipHit': fx.flipHit(ev.v); break;
      case 'bumper': fx.bumper(); break;
      case 'sling': fx.sling(); break;
      case 'drop': fx.drop(); break;
      case 'standup': fx.standup(); break;
      case 'spin': fx.spin(); break;
      case 'lane': fx.lane(ev.i); break;
      case 'lanes': fx.lanes(); toast('⭐ ALL THREE LANES! +3,000', { life: 1.8 }); view.act(me, 'cheer', 1); break;
      case 'bank': fx.bank(); toast('🎯 ALL TARGETS DOWN! +5,000', { life: 1.8 }); view.act(me, 'cheer', 1); break;
      case 'kickLit': fx.kickLit(); toast('KICKBACKS ARE ON!', { life: 1.6 }); break;
      case 'kickback': fx.kickback(); toast('BOING! KICKBACK!', { life: 1.2 }); break;
      case 'rampIn': fx.rampIn(); break;
      case 'ramp': fx.ramp(); toast(`${ev.name}! +2,000`, { life: 1.6 }); break;
      case 'rampBack': fx.rampBack(); break;
      case 'jackpot': fx.jackpot(); toast('💰 JACKPOT! +10,000', { big: true, life: 2 }); view.act(me, 'cheer', 1.4); break;
      case 'mbLight': fx.mbLight(); if (!sim.mb.ready && ev.n < ev.need) toast(`MULTIBALL LIGHT ${ev.n} OF ${ev.need}`, { life: 1.4 }); break;
      case 'mbReady': fx.mbReady(); toast('MULTIBALL IS READY! SHOOT A RAMP!', { big: true, life: 2.4 }); break;
      case 'multiball': fx.multiball(); toast('🎉 MULTIBALL! 🎉', { big: true, life: 2.4 }); view.act(me, 'cheer', 1.6); break;
      case 'mbEnd': toast('MULTIBALL IS OVER', { life: 1.4 }); break;
      case 'launch': fx.launch(ev.power); break;
      case 'wall': fx.wall(ev.v); break;
      case 'saved': fx.saved(); toast(ev.who ? `🛟 ${NAME[ev.who]} SAVED THE BALL!` : '🛟 BALL SAVED!', { big: true, cls: ev.who ? cls(ev.who) : '', life: 1.6 }); break;
      case 'drain': fx.drain(); toast('OOPS! THE BALL GOT AWAY!', { big: true, life: 1.6 }); view.act(ev.player, 'oops', 1.6); break;
      case 'turn': fx.turn(); banner(); setupHud(); break;
      case 'over': gameOver(); break;
      case 'nudge': fx.nudge(); break;
      case 'careful': fx.careful(); toast('CAREFUL! NOT TOO MUCH SHAKING!', { life: 1.4 }); break;
      case 'tilt': fx.tilt(); toast(ev.dead ? 'TILT! 😵 THE FLIPPERS NAP FOR A MOMENT' : 'TILT! 😵 NO SHAKING FOR A MOMENT', { big: true, life: 2.2 }); break;
      case 'buddyIn': fx.buddyIn(); toast(`${NAME[ev.who]} IS COMING TO HELP!`, { cls: cls(ev.who), life: 1.6 }); break;
      case 'gift':
        fx.gift();
        toast(`${ev.emoji} ${ev.name} FROM ${NAME[ev.from]}!`, { cls: cls(ev.from), life: 1.2 });
        view.treat(ev.emoji, ev.from, me);
        break;
      case 'help': fx.help(); toast(`${NAME[ev.who]} SAYS: BALL SAVER ON!`, { big: true, cls: cls(ev.who), life: 2.2 }); break;
      case 'lightOn': fx.lit(); toast('👇 HIT THE GLOWING TARGET!', { cls: cls(bud), life: 2.6 }); break;
      case 'litHit': fx.litHit(); toast(`🎯 ${NAME[ev.who]}'S TARGET! +5,000`, { big: true, cls: cls(ev.who), life: 2 }); view.act(me, 'cheer', 1.2); break;
      case 'buddyOut': fx.buddyOut(); toast(`BYE BYE, ${NAME[ev.who]}! 👋`, { cls: cls(ev.who), life: 1.4 }); break;
      case 'highfive':
        fx.highfive();
        toast('✋ HIGH FIVE! ✋', { big: true, life: 1.6 });
        view.act('teddy', 'signature', 1.8);
        view.act('tommy', 'signature', 1.8);
        view.confetti(50);
        view.emojiFly('✋', 6, -3, 4, 10, -2.5, 3, 1.2);
        view.emojiFly('✋', 14, -3, 4, 10, -2.5, 3, 1.2);
        break;
    }
  }

  // the last ball is gone: scores, the winner's signature move and confetti, PLAY AGAIN
  function gameOver() {
    const sim = G.sim, P = sim.players;
    PB.sfx.over();
    const k = bestKey();
    const top = Math.max(...P.map((p) => p.score));
    const newBest = top > (save.best[k] || 0);
    save.best[k] = Math.max(save.best[k] || 0, top);
    store();
    let winner;
    if (P.length > 1) {
      const [a, b] = P;
      winner = a.score === b.score ? null : a.score > b.score ? a.id : b.id;
      $('overTitle').textContent = winner ? `${NAME[winner]} WINS!` : "IT'S A TIE!";
      $('overText').innerHTML = P.map((p) => `<span class="${cls(p.id)}">${NAME[p.id]} <b>${fmt(p.score)}</b></span>`).join('');
      if (winner) view.act(winner, 'signature', 1e9); else { view.act('teddy', 'signature', 1e9); view.act('tommy', 'signature', 1e9); }
    } else {
      winner = P[0].id;
      $('overTitle').textContent = 'GREAT GAME!';
      $('overText').innerHTML = `<span class="${cls(winner)}">${NAME[winner]} <b>${fmt(P[0].score)}</b></span>`;
      view.act(winner, 'signature', 1e9);
    }
    $('overBest').textContent = newBest ? `NEW BEST! ${fmt(save.best[k])}` : `BEST ${fmt(save.best[k])}`;
    view.confetti(160);
    G.overT = 0;
  }

  // ---------------------------------------------------------------- the title-screen demo: the autopilot plays

  function startDemo() {
    const sim = new PB.Sim(tableDef(G.table), { easy: true, seed: (Math.random() * 1e9) | 0 });
    G.demo = { sim, t: 0, runner: new PB.Runner(sim), bot: new PB.Bot(sim, { seed: (Math.random() * 1e9) | 0 }) };
    view.setTable(sim);
  }
  function demoAfter() {
    const d = G.demo;
    for (const ev of d.sim.events) handle(ev, d.sim, true);
    d.sim.events.length = 0;
    if (d.sim.state === 'over' || d.t > 120) startDemo();
  }

  // ---------------------------------------------------------------- HUD

  function setupHud() {
    const sim = G.sim, two = G.mode === '2p';
    $('cardB').classList.toggle('hidden', !two);
    $('cards').classList.toggle('two', two);
    $('faceA').src = two ? faces.teddy : faces[G.hero];
    $('cardA').className = 'pcard' + (!two && G.hero === 'tommy' ? ' m' : '');
    $('faceB').src = faces.tommy;
    const btn = $('callBtn'), bud = Kit.roster.buddyFor(G.hero);
    btn.classList.toggle('t', !two && bud === 'teddy');
    btn.querySelector('img').src = faces[bud];
    btn.querySelector('img').classList.toggle('hidden', two);
    btn.querySelector('.five').classList.toggle('hidden', !two);
    $('tableName').textContent = tableDef(G.table).name.toUpperCase();
    G.hudCache = {};
    if (sim) updateHud();
    layoutHud();
  }

  function layoutHud() {
    const playing = !$('hud').classList.contains('hidden');
    const h = innerHeight, w = innerWidth, short = h <= 520;
    const top = document.querySelector('#hud .top');
    const touch = G.touchOn && G.screen === 'play';
    if (playing) {
      view.margins.top = short ? 6 : Math.min(h * 0.2, top.getBoundingClientRect().bottom + 4);
      view.margins.bottom = touch ? (short ? 8 : 74) : 6;
    } else { view.margins.top = 6; view.margins.bottom = 6; }
    // keep clear of the kit's round buttons in the middle of the left edge
    view.margins.left = 58;
    view.margins.right = short && playing ? 150 : 10;
    if (short && playing) view.margins.left = 150;
    view.fit(true);
    $('pads').classList.toggle('hidden', !touch);
    document.body.classList.toggle('touch', G.touchOn);
  }
  addEventListener('resize', () => setTimeout(layoutHud, 50));

  function setText(key, el, text, html) {
    if (G.hudCache[key] === text) return;
    G.hudCache[key] = text;
    if (html) el.innerHTML = text; else el.textContent = text;
  }

  function updateHud() {
    const sim = G.sim;
    if (!sim) return;
    const two = G.mode === '2p';
    const balls = (p) => '●'.repeat(Math.max(0, sim.D.balls - p.ball + 1)) + '○'.repeat(Math.min(sim.D.balls, p.ball - 1));
    const A = sim.players[0], B = sim.players[1];
    setText('sa', $('scoreA'), fmt(A.score));
    setText('ba', $('ballsA'), balls(A));
    if (two) {
      setText('sb', $('scoreB'), fmt(B.score));
      setText('bb', $('ballsB'), balls(B));
      $('cardA').classList.toggle('on', sim.cur === 0 && sim.state !== 'over');
      $('cardB').classList.toggle('on', sim.cur === 1 && sim.state !== 'over');
    }
    // the companion button
    const Bd = sim.buddy, here = !!Bd && Bd.state !== 'leave';
    const btn = $('callBtn');
    btn.classList.toggle('here', here || sim.saverT > 0);
    const bud = Kit.roster.buddyFor(G.hero);
    let label;
    if (two) {
      btn.querySelector('.cool').style.background = sim.hi5Cd > 0 ? `conic-gradient(rgba(10,8,25,0.65) ${(sim.hi5Cd / 2.5) * 360}deg, transparent 0)` : 'none';
      label = 'HIGH FIVE! ✋<small>press T</small>';
    } else label = here ? `${NAME[bud]} IS HERE!<small>tap for more help</small>` : `CALL ${NAME[bud]}<small>press T</small>`;
    setText('call', btn.querySelector('em'), label, true);
    // the ball saver bar
    const sv = sim.saverT;
    $('saverBar').classList.toggle('hidden', !(sv > 0));
    if (sv > 0) $('saverBar').querySelector('b').style.transform = `scaleX(${Math.max(0, Math.min(1, sv / Math.max(10, sim.D.saver)))})`;
    // the launch hint and the plunger's power
    const waiting = G.screen === 'play' && !!sim.onPlunger() && !sim.queue && !sim.autoPlunge && sim.state !== 'over';
    $('hint').classList.toggle('hidden', !waiting);
    if (waiting) {
      setText('hint', $('hintText'), G.touchOn ? 'HOLD YOUR FINGER DOWN, THEN LET GO!' : 'HOLD SPACE, THEN LET GO!');
      $('power').style.transform = `scaleX(${sim.plunge.toFixed(3)})`;
    }
    $('tiltTag').classList.toggle('hidden', !(sim.tiltT > 0));
  }

  function banner() {
    const sim = G.sim;
    if (!sim) return;
    const p = sim.player();
    $('bnWho').textContent = G.mode === '2p' ? `${NAME[p.id]}'S TURN` : NAME[p.id];
    $('bnBall').textContent = `BALL ${p.ball} OF ${sim.D.balls}`;
    $('banner').className = cls(p.id);
    G.bannerT = 0;
  }

  // ---------------------------------------------------------------- toasts and the banner (game time)

  function toast(text, o = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (o.big ? ' huge' : '') + (o.cls ? ' ' + o.cls : '');
    el.textContent = text;
    $('toasts').appendChild(el);
    G.toasts.push({ el, t: 0, life: o.life || 1.6 });
    const live = G.toasts.filter((q) => !q.done);
    if (live.length > 3) live[0].life = Math.min(live[0].life, live[0].t + 0.15);
  }
  function clearToasts() { for (const q of G.toasts) q.el.remove(); G.toasts = []; }
  function updateToasts(dt) {
    for (const q of G.toasts) {
      q.t += dt;
      q.el.style.opacity = Math.max(0, Math.min(1, q.t * 6, (q.life - q.t) * 4));
      q.el.style.transform = `scale(${0.7 + 0.3 * Math.min(1, q.t * 6) + (q.t < 0.25 ? Math.sin(q.t * 12.5) * 0.08 : 0)})`;
      if (q.t >= q.life) { q.el.remove(); q.done = true; }
    }
    G.toasts = G.toasts.filter((q) => !q.done);
  }
  function updateBanner(dt) {
    G.bannerT += dt;
    const on = G.screen === 'play' && G.bannerT < 2.4;
    $('banner').classList.toggle('hidden', !on);
    if (on) $('banner').style.opacity = Math.min(1, (2.4 - G.bannerT) * 3, G.bannerT * 6);
  }

  // ---------------------------------------------------------------- the loop

  function tick(dt) {
    const sim = activeSim();
    if (G.screen === 'play' && G.sim) { G.runner.advance(dt, inputs); afterSteps(); }
    else if (G.screen === 'over' && G.sim) { G.runner.advance(dt, () => ({})); G.sim.events.length = 0; }
    else if (G.screen === 'title' && G.demo) { G.demo.t += dt; G.demo.runner.advance(dt, () => G.demo.bot.input(DT)); demoAfter(); }
    frameRest(sim, dt);
  }
  function frameRest(sim0, dt) {
    const sim = activeSim();
    if (G.sim && G.sim.state === 'over' && G.screen === 'play') { G.overT += dt; if (G.overT > 1.4) show('over'); }
    if (sim) view.update(sim, dt, G.screen === 'title' ? demoCast() : Object.assign(cast(), { flipping: any(LEFT) || any(RIGHT) || fingers.size > 0 }));
    updateHud();
    updateToasts(dt);
    updateBanner(dt);
    view.render();
    void sim0;
  }
  // behind the title the brothers watch the demo together
  const demoCast = () => ({ L: 'teddy', R: 'tommy' });
  const activeSim = () => (G.screen === 'title' ? G.demo && G.demo.sim : G.sim);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.held) { view.render(); return; }
    tick(dt);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (!G.keepAwake) { pause(); S.suspend(); } } else S.resume();
  });

  // ---------------------------------------------------------------- title screen

  function refreshTitle() {
    $('logo').innerHTML = PB.TITLE.replace(/^(\S+) (\S+)$/, '<span class="a">$1</span> <span class="b">$2</span>');
    $('subtitle').textContent = PB.SUBTITLE;
    for (const b of document.querySelectorAll('.kid')) {
      b.querySelector('img').src = faces[b.dataset.hero];
      b.classList.toggle('sel', b.dataset.hero === G.hero);
    }
    $('img2pT').src = faces.teddy;
    $('img2pM').src = faces.tommy;
    for (const b of document.querySelectorAll('#segEasy button')) b.classList.toggle('on', (b.dataset.easy === '1') === G.easy);
    for (const b of document.querySelectorAll('#tables button')) b.classList.toggle('on', b.dataset.table === G.table);
    const best = save.best[bestKey()] || 0;
    $('bestLine').textContent = best ? `BEST SCORE ${fmt(best)}` : '';
    muteIcons();
  }

  function pickHero(id) { G.hero = id; refreshTitle(); }
  function setEasy(on) { G.easy = on; save.easy = on; store(); refreshTitle(); }
  function pickTable(id) {
    if (typeof id === 'number') { const i = PB.TABLES.findIndex((t) => t.id === G.table); id = PB.TABLES[(i + id) % PB.TABLES.length].id; }
    G.table = id;
    save.table = id;
    store();
    if (G.screen === 'title') startDemo();
    refreshTitle();
  }

  function toggleMute() { S.init(); S.toggleMute(); muteIcons(); }
  function muteIcons() {
    const m = S.isMuted() ? '🔇' : '🔊';
    $('btnMute').textContent = m;
    $('btnMute2').textContent = m;
  }
  S.onMute(muteIcons);
  Kit.lang.onChange(() => view.relabel());

  function wire() {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { S.init(); PB.sfx.click(); fn(e); });
    for (const b of document.querySelectorAll('.kid')) b.addEventListener('click', () => startGame('1p', b.dataset.hero));
    click('btn2p', () => startGame('2p'));
    for (const b of document.querySelectorAll('#segEasy button')) b.addEventListener('click', () => { S.init(); PB.sfx.click(); setEasy(b.dataset.easy === '1'); });
    for (const b of document.querySelectorAll('#tables button')) b.addEventListener('click', () => { S.init(); PB.sfx.click(); pickTable(b.dataset.table); });
    click('btnMute', toggleMute);
    click('btnMute2', toggleMute);
    click('btnPause', pause);
    click('btnResume', resume);
    click('btnRestart', again);
    click('btnMenu', toTitle);
    click('btnAgain', again);
    click('btnOverMenu', toTitle);
    $('callBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); callBuddy(); });
  }

  // ---------------------------------------------------------------- start

  setupPointer();
  wire();
  const q = new URLSearchParams(location.search);
  if (q.has('table')) { const t = q.get('table'); if (tableDef(t)) G.table = t; }
  if (q.has('play')) {
    if (q.has('easy')) G.easy = q.get('easy') === '1';
    startGame(q.get('mode') === '2p' ? '2p' : '1p', q.get('hero') === 'tommy' ? 'tommy' : G.hero);
  } else {
    startDemo();
    show('title');
    refreshTitle();
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- test hooks
  // The Browser pane throttles requestAnimationFrame while hidden, so tests drive the game with step().
  window.game = {
    G, view, faces, save,
    get sim() { return G.sim; },
    step(seconds = 0.5) {
      const n = Math.max(1, Math.round(seconds / DT));
      for (let i = 0; i < n; i++) {
        if (G.screen === 'play' && G.sim) { G.sim.step(DT, inputs()); afterSteps(); }
        else if (G.screen === 'over' && G.sim) { G.sim.step(DT, {}); G.sim.events.length = 0; }
        else if (G.screen === 'title' && G.demo) { G.demo.t += DT; G.demo.sim.step(DT, G.demo.bot.input(DT)); demoAfter(); }
        const sim = activeSim();
        if (G.sim && G.sim.state === 'over' && G.screen === 'play') { G.overT += DT; if (G.overT > 1.4) show('over'); }
        if (sim) view.update(sim, DT, G.screen === 'title' ? demoCast() : cast());
        updateToasts(DT);
        updateBanner(DT);
      }
      updateHud();
      view.render();
      return this.state();
    },
    hold(on = true) { G.held = on; },
    keepAwake() { G.keepAwake = true; },
    calm() { document.body.classList.add('calm'); },
    // game.start('space', '1p', 'teddy', true)
    start(table = 'space', mode = '1p', hero = 'teddy', easy = true) { G.table = table; G.easy = easy; startGame(mode, hero); return this.state(); },
    title() { toTitle(); },
    press(code, down = true) { if (down) { if (!keys.has(code)) { keys.add(code); tapped.add(code); onKey(code); } } else keys.delete(code); },
    tap(code) { this.press(code); this.step(1 / 60); this.press(code, false); },
    launch(power = 0.6) { const b = G.sim && G.sim.onPlunger(); if (b) G.sim.fire(b, power); },
    finger(side, down = true, id = side === 'L' ? 901 : 902) { if (down) fingers.set(id, side); else fingers.delete(id); },
    call() { callBuddy(); },
    nudge() { nudgeTap = true; },
    pause, resume, again,
    showTouch(on = true) { G.touchOn = on; layoutHud(); },
    // let the autopilot play (screenshots and demos)
    autopilot(on = true) { G.auto = on && G.sim ? new PB.Bot(G.sim, { seed: 3 }) : null; },
    // end the game now (the results screen)
    finish() { const s = G.sim; if (!s) return; for (const p of s.players) p.ball = s.D.balls + 1; s.balls.length = 0; s.state = 'over'; s.emit('over'); },
    state() {
      const s = G.sim;
      return {
        screen: G.screen, table: G.table, mode: G.mode, hero: G.hero, easy: G.easy,
        sim: s && {
          state: s.state, t: +s.t.toFixed(2), cur: s.player().id, players: s.players.map((p) => `${p.id} ${p.score} ball ${p.ball}`),
          balls: s.balls.map((b) => `${b.x.toFixed(1)},${b.y.toFixed(1)}${b.ramp ? ' ramp' : ''}`), saver: +s.saverT.toFixed(1),
          mb: `${s.mb.lights}${s.mb.ready ? ' ready' : ''}${s.mb.on ? ' ON' : ''}`, lit: s.lit && s.lit.id, buddy: s.buddy && `${s.buddy.id}:${s.buddy.state}`,
          kick: `${s.kick.L ? 'L' : ''}${s.kick.R ? 'R' : ''}`, tilt: +s.tiltT.toFixed(1),
        },
      };
    },
    // the headless checks (js/checks.js), the same as `node tools/check.js`; quick by default
    check(quick = true) { const r = PB.checks.run({ quick }); return { ok: r.ok, lines: r.lines }; },
  };
})();
