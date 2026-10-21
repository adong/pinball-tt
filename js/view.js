/* TT Pinball: the Three.js scene. Builds each table from the same shapes the physics uses (js/tables.js), keeps a
   model for every ball, flipper, target, light and kid, and plays the effects (bumper flashes, floating points,
   confetti, treats and the 🏀 of Teddy's jump shot). Exposes PB.View. The rules live in js/sim.js.

   Table units to the scene: x - CX across, height up, CY - y away from the player. The whole table leans back a
   little (TILT), like a real one. */
(function () {
  'use strict';
  const T = THREE, Gx = Kit.gfx, PB = window.PB;
  const People = Kit.people;
  const CX = 10.8, CY = 20, TILT = 0.11;
  const KID = 3.0;                                   // the kids on the apron, as toy figures
  const SPOT = { L: [2.8, -4.6], R: [17.4, -4.6] };   // where they stand
  const APRON_H = 0.7;
  const v3 = (x, y, h = 0) => new T.Vector3(x - CX, h, CY - y);
  // a shape drawn in table x, y (Kit shapes, extrusions) laid flat on the table, extruded upward
  function flat(mesh) { mesh.rotation.x = -Math.PI / 2; mesh.position.set(-CX, 0, CY); return mesh; }

  function View(canvas) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = T.sRGBEncoding;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer = r;
    this.canvas = canvas;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(34, 1, 1, 400);
    this.hemi = new T.HemisphereLight('#ffffff', '#6a5a8a', 0.85);
    this.scene.add(this.hemi);
    const sun = new T.DirectionalLight('#fff4e2', 0.95);
    sun.position.set(-14, 46, 26);
    sun.target.position.set(0, 0, -2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
    this.root = new T.Group();
    this.root.rotation.x = TILT;
    this.scene.add(this.root);
    this.table = null;
    this.ownTex = [];
    this.margins = { top: 8, bottom: 8, left: 8, right: 8 };
    this.size = [0, 0];
    this.t = 0;
    this.fx = [];
    this.kids = {};
    this.ballMat = new T.MeshStandardMaterial({ color: '#f2f6fb', metalness: 1, roughness: 0.16, envMap: PB.art.chromeEnv(), envMapIntensity: 1.25 });
    this.ballGeo = new T.SphereGeometry(PB.R, 28, 18);
    this.balls = [];
    for (const id of ['teddy', 'tommy']) {
      const p = People.build(Kit.roster.get(id).look);
      p.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      p.root.visible = false;
      // a holder leans the kid toward the camera, so a camera high above still sees his face
      const holder = new T.Group();
      holder.add(p.root);
      this.root.add(holder);
      this.kids[id] = { id, p, holder, mode: 'idle', modeT: 0, ph: Math.random() * 6, scale: KID, want: 0, show: 0, spot: 'L', x: SPOT.L[0], y: SPOT.L[1], jump: 0 };
    }
  }

  // ---------------------------------------------------------------- building a table

  View.prototype.setTable = function (sim) {
    if (this.table) { this.root.remove(this.table); dispose(this.table); for (const tx of this.ownTex) tx.dispose(); }
    for (const f of this.fx) this.root.remove(f.obj);
    this.fx = [];
    const geo = sim.geo, id = geo.def.id, th = PB.art.THEMES[id];
    this.th = th;
    this.tableId = id;
    const g = new T.Group();
    this.table = g;
    this.root.add(g);
    this.scene.background = new T.Color(th.sky[0]);
    // the playfield picture
    const PF = PB.art.PF;
    const pfTex = PB.art.playfield(id, geo);
    const floor = new T.Mesh(new T.PlaneGeometry(PF.x1 - PF.x0, PF.y1 - PF.y0), new T.MeshStandardMaterial({ map: pfTex, roughness: 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(v3((PF.x0 + PF.x1) / 2, (PF.y0 + PF.y1) / 2, 0));
    floor.receiveShadow = true;
    g.add(floor);
    const wood = new T.MeshStandardMaterial({ color: th.cabinet, roughness: 0.6 });
    // the cabinet: sides, the corners above the arch, the apron in front, the front board
    const box = (x0, x1, y0, y1, h0, h1, mat) => {
      const m = new T.Mesh(new T.BoxGeometry(x1 - x0, h1 - h0, y1 - y0), mat);
      m.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2, (h0 + h1) / 2));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    box(-1.6, -0.08, -8, 46.6, -0.5, 1.7, wood);
    box(21.68, 23.2, -8, 46.6, -0.5, 1.7, wood);
    box(-1.6, 23.2, 45.0, 46.6, -0.5, 1.7, wood);
    const corner = new T.Shape();
    corner.moveTo(-0.1, PB.ARC_CY);
    corner.lineTo(-0.1, 45.1);
    corner.lineTo(21.7, 45.1);
    corner.lineTo(21.7, PB.ARC_CY);
    corner.absarc(PB.ARC_CX, PB.ARC_CY, PB.ARC_R + 0.06, 0, Math.PI, false);
    const cm = flat(new T.Mesh(new T.ExtrudeGeometry(corner, { depth: 1.7, bevelEnabled: false, curveSegments: 40 }), wood));
    cm.castShadow = cm.receiveShadow = true;
    g.add(cm);
    const apronMat = new T.MeshStandardMaterial({ color: th.apron, roughness: 0.45 });
    box(-0.1, PB.LANE_X0, -8, 1.0, -0.2, APRON_H, apronMat);
    box(-1.6, 23.2, -8.8, -8, -0.5, 1.9, wood);
    const stripe = new T.Mesh(new T.PlaneGeometry(19.6, 0.35), new T.MeshBasicMaterial({ color: th.light }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.copy(v3(10, 0.5, APRON_H + 0.01));
    g.add(stripe);
    // rails and posts: one instanced box per wall segment
    const segs = geo.shapes.filter((s) => s.k === 'seg' && s.kind !== 'floor' && s.kind !== 'plunger' && s.kind !== 'drop' && s.kind !== 'standup' && s.kind !== 'sling' && !s.one);
    const rail = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 }), segs.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), col = new T.Color();
    segs.forEach((s, i) => {
      const h = s.kind === 'post' ? 1.15 : s.kind === 'rampWall' ? 0.9 : 1.0;
      const thick = Math.max(0.22, s.r * 2);
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.atan2(s.dy, s.dx));
      sc.set(s.len + thick, h, thick);
      m4.compose(v3((s.ax + s.bx) / 2, (s.ay + s.by) / 2, h / 2), q, sc);
      rail.setMatrixAt(i, m4);
      rail.setColorAt(i, col.set(s.kind === 'post' || s.kind === 'rampWall' ? th.post : th.rail));
    });
    rail.castShadow = rail.receiveShadow = true;
    g.add(rail);
    // one-way gates: thin metal flaps
    for (const s of geo.shapes.filter((x) => x.one)) {
      const m = new T.Mesh(new T.BoxGeometry(s.len, 0.5, 0.06), new T.MeshStandardMaterial({ color: '#e8eef5', metalness: 0.8, roughness: 0.3 }));
      m.position.copy(v3((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 0.75));
      m.rotation.y = Math.atan2(s.dy, s.dx);
      m.castShadow = true;
      g.add(m);
    }
    // slingshots: a plastic block with a rubber band on the kicker side
    this.slings = {};
    for (const sl of geo.slings) {
      const sh = new T.Shape(sl.pts.map(([x, y]) => new T.Vector2(x, y)));
      const mat = new T.MeshStandardMaterial({ color: th.sling, roughness: 0.4, emissive: th.sling, emissiveIntensity: 0.15 });
      const m = flat(new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 }), mat));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      const s = sl.shape;
      const band = new T.Mesh(new T.BoxGeometry(s.len + 0.3, 0.42, 0.18), new T.MeshStandardMaterial({ color: th.rubber, roughness: 0.7 }));
      const cxm = (s.ax + s.bx) / 2, cym = (s.ay + s.by) / 2;
      const nx = s.nx, ny = s.ny, toward = (10 - cxm) * nx > 0 ? 1 : -1;
      band.position.copy(v3(cxm + nx * toward * 0.12, cym + ny * toward * 0.12, 0.5));
      band.rotation.y = Math.atan2(s.dy, s.dx);
      g.add(band);
      this.slings[sl.id] = { mat, band, flash: 0, n: [nx * toward, ny * toward], base: band.position.clone() };
    }
    // bumpers
    this.bumpers = {};
    geo.bumpers.forEach((b, i) => {
      const grp = new T.Group();
      grp.position.copy(v3(b.x, b.y, 0));
      const color = th.bumper[i % th.bumper.length];
      const capMat = new T.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.1 });
      const base = new T.Mesh(new T.CylinderGeometry(b.r, b.r * 1.05, 0.35, 32), new T.MeshStandardMaterial({ color: '#2b2b38', roughness: 0.5 }));
      base.position.y = 0.18;
      const skirt = new T.Mesh(new T.TorusGeometry(b.r * 0.98, 0.12, 8, 32), new T.MeshStandardMaterial({ color: th.rubber, roughness: 0.6 }));
      skirt.rotation.x = Math.PI / 2;
      skirt.position.y = 0.45;
      grp.add(base, skirt);
      const top = new T.Group();
      top.position.y = 0.55;
      if (th.bumperToy === 'planet') {
        const ball = new T.Mesh(new T.SphereGeometry(b.r * 0.78, 24, 16), capMat);
        ball.position.y = 0.55;
        const ring = new T.Mesh(new T.TorusGeometry(b.r * 1.05, 0.07, 6, 32), new T.MeshStandardMaterial({ color: '#fff3c4', emissive: '#fff3c4', emissiveIntensity: 0.3 }));
        ring.rotation.x = Math.PI / 2 - 0.35;
        ring.position.y = 0.55;
        top.add(ball, ring);
      } else if (th.bumperToy === 'drum') {
        const drum = new T.Mesh(new T.CylinderGeometry(b.r * 0.92, b.r * 0.85, 0.8, 24), capMat);
        drum.position.y = 0.4;
        const skin = new T.Mesh(new T.CylinderGeometry(b.r * 0.9, b.r * 0.9, 0.06, 24), new T.MeshStandardMaterial({ color: '#f3e3c0', roughness: 0.8, emissive: '#ffe9a8', emissiveIntensity: 0.1 }));
        skin.position.y = 0.83;
        const leaf = new T.Mesh(new T.ConeGeometry(0.3, 0.6, 6), new T.MeshStandardMaterial({ color: '#4caf50' }));
        leaf.position.y = 1.1;
        top.add(drum, skin, leaf);
      } else {
        const cup = new T.Mesh(new T.CylinderGeometry(b.r * 0.9, b.r * 0.72, 0.55, 20), new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }));
        cup.position.y = 0.27;
        const frost = new T.Mesh(new T.SphereGeometry(b.r * 0.92, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        frost.position.y = 0.52;
        const cherry = new T.Mesh(new T.SphereGeometry(0.22, 12, 8), new T.MeshStandardMaterial({ color: '#e5323d', roughness: 0.3 }));
        cherry.position.y = 0.52 + b.r * 0.9;
        top.add(cup, frost, cherry);
      }
      grp.add(top);
      grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(grp);
      this.bumpers[b.id] = { grp, top, mat: capMat, flash: 0 };
    });
    // flippers: a tapered rubber-edged bat turning on its pivot
    this.flips = {};
    for (const f of geo.flippers) {
      const sh = new T.Shape();
      const bb = (f.r0 - f.r1) / f.len, aa = Math.sqrt(1 - bb * bb), ang = Math.atan2(aa, bb);
      sh.absarc(0, 0, f.r0, ang, Math.PI * 2 - ang, false);
      sh.absarc(f.len, 0, f.r1, -ang, ang, false);
      const body = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: false, curveSegments: 16 }), new T.MeshStandardMaterial({ color: th.flipRubber, roughness: 0.6 }));
      body.rotation.x = -Math.PI / 2;
      const sh2 = new T.Shape();
      sh2.absarc(0, 0, f.r0 - 0.14, ang, Math.PI * 2 - ang, false);
      sh2.absarc(f.len, 0, Math.max(0.08, f.r1 - 0.12), -ang, ang, false);
      const cap = new T.Mesh(new T.ExtrudeGeometry(sh2, { depth: 0.05, bevelEnabled: false, curveSegments: 16 }), new T.MeshStandardMaterial({ color: th.flip, roughness: 0.3 }));
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = 0.56;
      const pin = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.08, 12), new T.MeshStandardMaterial({ color: '#c0c6d0', metalness: 0.8, roughness: 0.3 }));
      pin.position.y = 0.62;
      const grp = new T.Group();
      grp.add(body, cap, pin);
      grp.position.copy(v3(f.px, f.py, 0.02));
      grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(grp);
      this.flips[f.side] = grp;
    }
    // drop and standup targets, each with its toy on the front
    this.targets = {};
    const tmat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    for (const s of geo.drops.concat(geo.standups)) {
      const grp = new T.Group();
      const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
      grp.position.copy(v3(mx, my, 0));
      grp.rotation.y = Math.atan2(s.dy, s.dx);
      const color = s.kind === 'drop' ? th.light2 : th.light;
      const body = new T.Mesh(new T.BoxGeometry(s.len, 1.0, 0.24), new T.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.12 }));
      body.position.y = 0.5;
      body.castShadow = true;
      const face = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshBasicMaterial({ map: Gx.emojiTexture(s.kind === 'drop' ? th.drop : th.standup), transparent: true }));
      // the face looks along the target's normal (where the ball comes from)
      face.position.set(0, 0.55, 0.13);
      const holder = new T.Group();
      holder.add(body, face);
      // the shape's left normal is local +z after the turn? make sure the face points at the ball
      const nloc = new T.Vector3(s.nx, 0, -s.ny).applyAxisAngle(new T.Vector3(0, 1, 0), -grp.rotation.y);
      if (nloc.z < 0) holder.rotation.y = Math.PI;
      grp.add(holder);
      if (s.kind === 'standup') {
        const post = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.6, 8), tmat);
        post.position.set(0, 0.3, -0.2);
        grp.add(post);
      }
      g.add(grp);
      this.targets[s.id] = { grp, holder, body, s, h: 0, wob: 0 };
    }
    // the spinner across the orbit lane
    const spin = new T.Group();
    spin.position.copy(v3(0.875, 27, 1.0));
    const plate = new T.Mesh(new T.BoxGeometry(1.6, 0.7, 0.06), new T.MeshStandardMaterial({ color: th.light2, metalness: 0.5, roughness: 0.3, emissive: th.light2, emissiveIntensity: 0.2 }));
    plate.position.y = -0.38;
    plate.castShadow = true;
    spin.add(plate);
    const axle = new T.Mesh(new T.BoxGeometry(1.8, 0.08, 0.08), new T.MeshStandardMaterial({ color: '#c0c6d0', metalness: 0.8 }));
    g.add(spin, axle);
    axle.position.copy(spin.position);
    this.spinner = spin;
    // ramps: a see-through track with rails, on little posts
    this.ramps = {};
    for (const r of geo.ramps) {
      const P = r.path;
      const pos = [], rails = [[], []];
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
        let dx = c.x - a.x, dy = c.y - a.y;
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const nx = -dy, ny = dx, hw = 0.85, h = P[i].z + 0.02;
        pos.push(v3(P[i].x + nx * hw, P[i].y + ny * hw, h), v3(P[i].x - nx * hw, P[i].y - ny * hw, h));
        rails[0].push(v3(P[i].x + nx * hw, P[i].y + ny * hw, h + 0.45));
        rails[1].push(v3(P[i].x - nx * hw, P[i].y - ny * hw, h + 0.45));
      }
      const geoR = new T.BufferGeometry();
      const verts = [], idx = [];
      pos.forEach((p) => verts.push(p.x, p.y, p.z));
      for (let i = 0; i + 1 < P.length; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      geoR.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
      geoR.setIndex(idx);
      geoR.computeVertexNormals();
      const floorM = new T.Mesh(geoR, new T.MeshStandardMaterial({ color: th.ramp, transparent: true, opacity: 0.55, side: T.DoubleSide, roughness: 0.2, emissive: th.ramp, emissiveIntensity: 0.15 }));
      floorM.castShadow = true;
      g.add(floorM);
      const railMat = new T.MeshStandardMaterial({ color: th.rampRail, metalness: 0.4, roughness: 0.35 });
      for (const side of rails) {
        const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(side), side.length * 3, 0.07, 6, false), railMat);
        tube.castShadow = true;
        g.add(tube);
      }
      for (let i = 2; i < P.length - 2; i += 6) {
        if (P[i].z < 0.8) continue;
        const post = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, P[i].z, 6), railMat);
        post.position.copy(v3(P[i].x, P[i].y, P[i].z / 2));
        g.add(post);
      }
      this.ramps[r.id] = { r };
    }
    // the plunger in the shooter lane
    const pl = new T.Group();
    const rod = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 6, 10), new T.MeshStandardMaterial({ color: '#d7dde6', metalness: 0.85, roughness: 0.25 }));
    rod.rotation.x = Math.PI / 2;
    rod.position.copy(v3(20.8, PB.PLUNGER_Y - 3, 0.5));
    const tip = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.3, 14), new T.MeshStandardMaterial({ color: '#222', roughness: 0.6 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.copy(v3(20.8, PB.PLUNGER_Y - 0.15, 0.5));
    const knob = new T.Mesh(new T.SphereGeometry(0.65, 16, 12), new T.MeshStandardMaterial({ color: th.light2, roughness: 0.3 }));
    knob.position.copy(v3(20.8, -8.4, 1.0));
    pl.add(rod, tip, knob);
    pl.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(pl);
    this.plunger = pl;
    // lights in the playfield
    const lamp = (x, y, r, color) => {
      const m = new T.Mesh(new T.CircleGeometry(r, 24), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(v3(x, y, 0.02));
      g.add(m);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: Gx.glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      glow.scale.set(r * 4, r * 4, 1);
      glow.position.copy(v3(x, y, 0.3));
      g.add(glow);
      return { m, glow, on: 0 };
    };
    this.lamps = {
      mb: Array.from({ length: sim.D.mbNeed }, (_, i) => lamp(10 + (i - (sim.D.mbNeed - 1) / 2) * 1.5, 15.2, 0.45, th.light2)),
      saver: lamp(10, 9.4, 0.8, th.light),
      kickL: lamp(0.7, 9.4, 0.42, '#7dff8a'),
      kickR: lamp(19.3, 9.4, 0.42, '#7dff8a'),
      lanes: geo.lanes.map((l) => lamp((l.ax + l.bx) / 2, 36.4, 0.42, th.light)),
      ramps: geo.ramps.map((r) => lamp(r.at[0] - r.ux * 1.6, r.at[1] - r.uy * 1.6, 0.55, '#ffffff')),
    };
    const saverIcon = new T.Sprite(new T.SpriteMaterial({ map: Gx.emojiTexture('🛟'), transparent: true, depthWrite: false }));
    saverIcon.scale.set(1.3, 1.3, 1);
    saverIcon.position.copy(v3(10, 9.4, 0.7));
    g.add(saverIcon);
    this.saverIcon = saverIcon;
    // the lit target's arrow and glow
    this.litArrow = new T.Sprite(new T.SpriteMaterial({ map: Gx.emojiTexture('👇'), transparent: true, depthWrite: false }));
    this.litArrow.scale.set(1.6, 1.6, 1);
    this.litGlow = new T.Sprite(new T.SpriteMaterial({ map: Gx.glowTexture(), color: '#ffe14d', transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    this.litGlow.scale.set(3.4, 3.4, 1);
    g.add(this.litArrow, this.litGlow);
    // the backbox: a lit sign standing behind the table
    this.backMat = new T.MeshBasicMaterial({ map: PB.art.backbox(id, Kit.lang.t(geo.def.name.toUpperCase())) });
    this.ownTex = [pfTex, this.backMat.map];
    const bbox = new T.Group();
    const sign = new T.Mesh(new T.PlaneGeometry(22, 11), this.backMat);
    sign.position.set(0, 5.5, 0.32);
    const frame = new T.Mesh(new T.BoxGeometry(24.4, 12.4, 0.6), wood);
    frame.position.set(0, 5.5, 0);
    bbox.add(frame, sign);
    bbox.position.copy(v3(10.8, 47.2, 0.5));
    bbox.rotation.x = -TILT * 0.5;
    g.add(bbox);
    this.backbox = bbox;
    // balls
    for (const b of this.balls) this.root.remove(b, b.userData.dark);
    this.balls = [];
  };

  View.prototype.shadowTex = function () {
    return this._shadow || (this._shadow = Gx.radialTexture(64, [[0, 'rgba(10,8,30,0.75)'], [0.55, 'rgba(10,8,30,0.4)'], [1, 'rgba(10,8,30,0)']]));
  };

  View.prototype.relabel = function () {
    if (!this.backMat || !this.tableId) return;
    const def = PB.TABLES.find((t) => t.id === this.tableId);
    this.backMat.map.dispose();
    this.backMat.map = PB.art.backbox(this.tableId, Kit.lang.t(def.name.toUpperCase()));
    this.backMat.needsUpdate = true;
    this.ownTex[1] = this.backMat.map;
  };

  // ---------------------------------------------------------------- every frame

  View.prototype.update = function (sim, dt, o = {}) {
    this.t += dt;
    const t = this.t, th = this.th;
    // balls
    while (this.balls.length < sim.balls.length) {
      const m = new T.Mesh(this.ballGeo, this.ballMat);
      m.castShadow = true;
      // a soft dark patch under the ball, so it stands out even on the pale Candy table
      const dark = new T.Mesh(new T.CircleGeometry(1.0, 20), new T.MeshBasicMaterial({ map: this.shadowTex(), transparent: true, depthWrite: false }));
      dark.rotation.x = -Math.PI / 2;
      m.userData.dark = dark;
      this.root.add(m, dark);
      this.balls.push(m);
    }
    this.balls.forEach((m, i) => {
      const b = sim.balls[i];
      m.visible = m.userData.dark.visible = !!b;
      if (b) {
        m.position.copy(v3(b.x, b.y, (b.z || 0) + PB.R));
        m.userData.dark.position.copy(v3(b.x, b.y, (b.z || 0) + 0.03));
      }
    });
    // flippers
    for (const f of sim.flippers) {
      const grp = this.flips[f.side];
      grp.rotation.y = f.side === 'L' ? f.ang : Math.PI - f.ang;
    }
    // plunger
    this.plunger.position.z = sim.plunge * 2.2;
    // bumpers flash and pop
    for (const k in this.bumpers) {
      const v = this.bumpers[k];
      v.flash = Math.max(0, v.flash - dt * 4);
      v.mat.emissiveIntensity = 0.1 + v.flash * 1.3;
      v.top.scale.setScalar(1 + v.flash * 0.14);
    }
    for (const k in this.slings) {
      const v = this.slings[k];
      v.flash = Math.max(0, v.flash - dt * 5);
      v.mat.emissiveIntensity = 0.15 + v.flash * 1.2;
      v.band.position.copy(v.base).add(new T.Vector3(v.n[0], 0, -v.n[1]).multiplyScalar(v.flash * 0.25));
    }
    // targets: drop ones sink when hit, standups wobble
    for (const k in this.targets) {
      const v = this.targets[k];
      const want = v.s.on ? 0 : -1.1;
      v.h += (want - v.h) * Math.min(1, dt * 14);
      v.holder.position.y = v.h;
      v.wob = Math.max(0, v.wob - dt * 3);
      v.holder.rotation.x = Math.sin(t * 40) * v.wob * 0.25;
    }
    this.spinner.rotation.x = -sim.spin.a * Math.PI * 2 * (sim.spin.dir || 1);
    // lights
    const L = this.lamps, blink = (hz) => (Math.sin(t * Math.PI * 2 * hz) > 0 ? 1 : 0.25);
    const setLamp = (l, v) => { l.m.material.opacity = 0.3 + v * 0.7; l.glow.material.opacity = v * 0.85; };
    L.mb.forEach((l, i) => setLamp(l, sim.mb.on ? blink(4) : sim.mb.ready ? blink(2) : i < sim.mb.lights ? 1 : 0));
    const sv = sim.saverT;
    setLamp(L.saver, sv > 3 ? 1 : sv > 0 ? blink(4) : 0);
    this.saverIcon.visible = sv > 0;
    setLamp(L.kickL, sim.kick.L ? 1 : 0);
    setLamp(L.kickR, sim.kick.R ? 1 : 0);
    L.lanes.forEach((l, i) => setLamp(l, sim.lanesLit[i] ? (sim.lanesT > 0 ? blink(6) : 1) : 0));
    L.ramps.forEach((l) => setLamp(l, sim.mb.on ? blink(3) : sim.mb.ready ? blink(1.5) : 0.25 + 0.25 * Math.sin(t * 3)));
    // the lit target: a bobbing hand pointing at it
    const lit = sim.lit && this.targets[sim.lit.id];
    this.litArrow.visible = this.litGlow.visible = !!lit;
    if (lit) {
      const s = lit.s, mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
      this.litArrow.position.copy(v3(mx + s.nx * 0.4, my + s.ny * 0.4, 2.3 + Math.abs(Math.sin(t * 5)) * 0.6));
      this.litGlow.position.copy(v3(mx, my, 0.6));
      this.litGlow.material.opacity = 0.55 + Math.sin(t * 8) * 0.3;
    }
    // the table jumps a little when nudged
    this.root.position.x = Math.sin(t * 60) * sim.nudgeKick * 0.12;
    this.root.position.z = -sim.nudgeKick * 0.25;
    this.updateKids(sim, dt, o);
    this.cycleSignatures(dt);
    this.updateFx(dt);
  };

  // ---------------------------------------------------------------- the kids on the apron

  // o: which kid stands where: { L: 'teddy', R: 'tommy' | null, buddy: 'tommy' | null, play: who flips, big: whose turn }
  View.prototype.updateKids = function (sim, dt, o) {
    const cast = o || {};
    for (const id of ['teddy', 'tommy']) {
      const k = this.kids[id], p = k.p;
      const spot = cast.L === id ? 'L' : cast.R === id ? 'R' : null;
      const isBuddy = cast.buddy === id;
      k.want = spot ? 1 : 0;
      if (spot) { k.spot = spot; k.x = SPOT[spot][0]; k.y = SPOT[spot][1]; }
      k.show += (k.want - k.show) * Math.min(1, dt * (k.want ? 9 : 7));
      p.root.visible = k.show > 0.02;
      if (!p.root.visible) continue;
      const scale = KID * (isBuddy ? Kit.roster.get(id).buddyScale || 0.8 : 1) * (cast.big === id ? 1.06 : 1);
      // pop in with a little overshoot
      const pop = k.want ? 1 + Math.sin(Math.min(1, k.show) * Math.PI) * 0.15 : 1;
      p.root.scale.setScalar(scale * Math.min(1, k.show) * pop);
      k.modeT -= dt;
      if (k.modeT <= 0 && k.mode !== 'idle' && k.mode !== 'loop') k.mode = 'idle';
      k.ph += dt * (k.mode === 'peace' || k.mode === 'wave' ? 6 : k.mode === 'boxing' ? 7.5 : 5);
      let mode = k.mode === 'loop' ? k.loop : k.mode;
      if (mode === 'idle') mode = cast.play === id ? (o.flipping ? 'grab' : 'stand') : 'stand';
      k.jump = Math.max(0, k.jump - dt);
      let hop = 0;
      if (mode === 'jumpshot') {
        const c = (k.ph % (Math.PI * 2)) / (Math.PI * 2);
        hop = Math.sin(Math.min(1, c * 1.6) * Math.PI) * 0.9;
        if (c > 0.32 && !k.shot) { k.shot = true; this.emojiFly('🏀', k.x + 0.2, k.y, 4.4 * scale / KID, 10, 8, 7, 1.0); }
        if (c < 0.3) k.shot = false;
      } else if (mode === 'cheer') hop = Math.abs(Math.sin(k.ph * 1.3)) * 0.8;
      this.pose(p, k.ph, mode, 1 - Math.exp(-14 * dt));
      k.holder.position.copy(v3(k.x, k.y, APRON_H + hop * scale / KID));
      k.holder.rotation.x = this.lean || 0;
      // face the player, turned a little toward the middle of the table
      p.root.rotation.y = Math.PI + (k.spot === 'L' ? -0.3 : 0.3);
    }
  };

  // a kid does something for a moment (or 'loop' forever: the winner's signature)
  View.prototype.act = function (id, mode, secs = 1.6) {
    const k = this.kids[id];
    if (!k) return;
    if (mode === 'signature') {
      const sig = Kit.roster.get(id).signature || ['wave'];
      k.mode = 'loop';
      k.loop = sig[0];
      k.sigList = sig;
      k.sigT = 0;
      k.modeT = secs;
      return;
    }
    k.mode = mode;
    k.modeT = secs;
    k.ph = 0;
  };
  View.prototype.calm = function (id) { const k = this.kids[id]; if (k) { k.mode = 'idle'; k.modeT = 0; } };

  View.prototype.pose = function (p, ph, mode, k) {
    const ease = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
    if (mode === 'oops') {
      People.pose(p, ph, 'idle', k);
      ease(p.armL.rotation, 'x', 2.7); ease(p.armR.rotation, 'x', 2.7);
      ease(p.armL.rotation, 'z', -0.85); ease(p.armR.rotation, 'z', 0.85);
      ease(p.head.rotation, 'x', 0.3);
      return;
    }
    if (mode === 'cheer') {
      People.pose(p, ph, 'jump', k);
      ease(p.armL.rotation, 'x', 2.9); ease(p.armR.rotation, 'x', 2.9);
      ease(p.armL.rotation, 'z', -0.4); ease(p.armR.rotation, 'z', 0.4);
      ease(p.legL.rotation, 'x', 0); ease(p.legR.rotation, 'x', 0);
      return;
    }
    if (mode === 'grab' || mode === 'stand') {
      People.pose(p, ph, 'idle', k);
      const a = mode === 'grab' ? 1.2 : 0.15;
      ease(p.armL.rotation, 'x', a); ease(p.armR.rotation, 'x', a);
      ease(p.armL.rotation, 'z', -0.12); ease(p.armR.rotation, 'z', 0.12);
      p.hips.position.y = p.hipY + Math.sin(ph * 0.8) * 0.012;
      return;
    }
    People.pose(p, ph, mode, k);
    if (mode === 'peace' || mode === 'wave') {
      p.legL.rotation.x *= 0.25;
      p.legR.rotation.x *= 0.25;
      p.hips.position.y = p.hipY + Math.abs(Math.sin(ph)) * 0.03;
    }
  };

  // the winner's signature moves take turns (Teddy: boxing, then the jump shot)
  View.prototype.cycleSignatures = function (dt) {
    for (const id in this.kids) {
      const k = this.kids[id];
      if (k.mode !== 'loop' || !k.sigList || k.sigList.length < 2) continue;
      k.sigT += dt;
      if (k.sigT > 2.4) { k.sigT = 0; k.loop = k.sigList[(k.sigList.indexOf(k.loop) + 1) % k.sigList.length]; k.ph = 0; }
    }
  };

  // ---------------------------------------------------------------- effects

  View.prototype.onEvent = function (ev, sim) {
    switch (ev.type) {
      case 'bumper': if (this.bumpers[ev.id]) this.bumpers[ev.id].flash = 1; break;
      case 'sling': if (this.slings[ev.id]) this.slings[ev.id].flash = 1; break;
      case 'standup': if (this.targets[ev.id]) this.targets[ev.id].wob = 1; break;
      case 'points': this.floatText('+' + ev.pts, ev.x, ev.y, ev.pts >= 5000 ? '#ffd23f' : '#ffffff', ev.pts >= 2000 ? 1.4 : 0.9); break;
      case 'multiball': case 'jackpot': this.confetti(90); break;
      case 'bank': case 'lanes': this.confetti(30); break;
    }
    void sim;
  };

  View.prototype.floatText = function (text, x, y, color, size = 1) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: PB.art.number(text, color), transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(2.6 * size, 0.98 * size, 1);
    s.position.copy(v3(x, y, 1.6));
    s.renderOrder = 10;
    this.root.add(s);
    this.fx.push({ obj: s, t: 0, life: 0.9, kind: 'text' });
  };

  // an emoji flying in an arc from (x0, y0) to (x1, y1) in table units, h = starting height
  View.prototype.emojiFly = function (emoji, x0, y0, h, x1, y1, peak = 6, life = 0.9) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: Gx.emojiTexture(emoji), transparent: true, depthWrite: false }));
    s.scale.set(1.8, 1.8, 1);
    this.root.add(s);
    this.fx.push({ obj: s, t: 0, life, kind: 'fly', x0, y0, h, x1, y1, peak });
  };

  View.prototype.treat = function (emoji, from, to) {
    const a = this.kids[from], b = this.kids[to];
    if (!a || !b) return;
    this.emojiFly(emoji, a.x, a.y, 3.2, b.x, b.y + 0.2, 7, 0.9);
  };

  View.prototype.confetti = function (n) {
    const colors = ['#ff4b4b', '#ffd23f', '#3d9bff', '#2fd6a2', '#ff6fb5', '#a066e8'];
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(new T.PlaneGeometry(0.4, 0.25), new T.MeshBasicMaterial({ color: colors[i % colors.length], side: T.DoubleSide }));
      const x = 1 + Math.random() * 19.6, y = -2 + Math.random() * 30;
      m.position.copy(v3(x, y, 8 + Math.random() * 6));
      this.root.add(m);
      this.fx.push({ obj: m, t: 0, life: 2.6 + Math.random(), kind: 'conf', vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3, spin: Math.random() * 8 });
    }
  };

  View.prototype.updateFx = function (dt) {
    for (const f of this.fx) {
      f.t += dt;
      const o = f.obj, k = f.t / f.life;
      if (f.kind === 'text') { o.position.y += dt * 2.2; o.material.opacity = Math.min(1, (1 - k) * 3); }
      else if (f.kind === 'fly') {
        const u = Math.min(1, k);
        o.position.copy(v3(f.x0 + (f.x1 - f.x0) * u, f.y0 + (f.y1 - f.y0) * u, f.h + Math.sin(u * Math.PI) * f.peak));
        o.material.opacity = u > 0.85 ? (1 - u) / 0.15 : 1;
      } else if (f.kind === 'conf') {
        o.position.x += f.vx * dt;
        o.position.y += f.vy * dt;
        o.rotation.x += f.spin * dt;
        o.rotation.y += f.spin * 0.7 * dt;
      }
      if (f.t >= f.life) { this.root.remove(o); o.material.dispose(); if (f.kind === 'conf') o.geometry.dispose(); f.dead = true; }
    }
    this.fx = this.fx.filter((f) => !f.dead);
  };

  // ---------------------------------------------------------------- the camera
  // Portrait screens look at the table from high above; wide ones from lower down, like standing at a real machine.
  // The table, the apron (with the kids) and the bottom of the backbox are fitted into the space the HUD leaves.

  View.prototype.fit = function (force) {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    if (!force && w === this.size[0] && h === this.size[1]) return;
    this.size = [w, h];
    this.renderer.setSize(w, h, false);
    const M = this.margins;
    const rw = Math.max(50, w - M.left - M.right), rh = Math.max(50, h - M.top - M.bottom);
    const aspect = rw / rh;
    const cam = this.camera;
    cam.aspect = w / h;
    cam.clearViewOffset();
    const u = Math.max(0, Math.min(1, (aspect - 0.55) / 0.75));
    const elev = (70 - u * 37) * (Math.PI / 180);
    this.root.updateMatrixWorld(true);
    const pts = [];
    for (const x of [-1.6, 23.2]) for (const y of [-8.8, 46.6]) for (const hh of [0, 1.8]) pts.push(v3(x, y, hh));
    for (const [x, y] of [SPOT.L, SPOT.R]) pts.push(v3(x, y, APRON_H + 6.4));
    if (aspect > 0.9) pts.push(v3(0, 47.2, 6), v3(21.6, 47.2, 6));
    const wp = pts.map((p) => p.applyMatrix4(this.root.matrixWorld));
    const target = new T.Vector3(0, 0, 0);
    wp.forEach((p) => target.add(p));
    target.multiplyScalar(1 / wp.length);
    const dir = new T.Vector3(0, Math.sin(elev), Math.cos(elev));
    const v = new T.Vector3();
    const measure = (d) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of wp) {
        v.copy(p).project(cam);
        const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      return { x0, x1, y0, y1 };
    };
    let lo = 20, hi = 600, box = null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      box = measure(mid);
      if (box.x1 - box.x0 > rw || box.y1 - box.y0 > rh) lo = mid; else hi = mid;
    }
    box = measure(hi);
    // centre the table in the free space (shift the picture, the camera stays put)
    const dx = (M.left + rw / 2) - (box.x0 + box.x1) / 2, dy = (M.top + rh / 2) - (box.y0 + box.y1) / 2;
    cam.setViewOffset(w, h, -dx, -dy, w, h);
    cam.updateProjectionMatrix();
    this.fitInfo = { elev, d: hi, box, dx, dy };
    // lean the kids back (toward the table) so their faces turn up to the camera instead of showing the tops of their heads
    this.lean = -Math.max(0, elev + TILT - 0.35);
  };

  // where a table point lands on the screen (for the HUD: the launch hint over the plunger)
  View.prototype.screenAt = function (x, y, h = 0) {
    const p = v3(x, y, h).applyMatrix4(this.root.matrixWorld).project(this.camera);
    return [(p.x + 1) / 2 * this.size[0], (1 - p.y) / 2 * this.size[1]];
  };

  View.prototype.render = function () {
    this.fit(false);
    this.renderer.render(this.scene, this.camera);
  };

  // (textures are left alone: the emoji, glow and chrome ones are shared; the table's own two are disposed by name)
  function dispose(o) {
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
    });
  }

  PB.View = View;
})();
