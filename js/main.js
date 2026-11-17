/*
 * main.js — как страница оживает.
 *
 * Если ты это читаешь — привет! Ты нашёл, как устроен сайт изнутри.
 * Меняй что хочешь: сохрани файл, обнови страницу и посмотри, что вышло.
 */
'use strict';

(() => {
  const { clamp, lerp, rng, smooth: S, hash } = Art;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  // «колокол»: 0 до a, плавно 1 от b до c, плавно 0 после d
  const bell = (a, b, c, d, u) => S(a, b, u) * (1 - S(c, d, u));

  /* ================================================================
   * 1. Прогулка. Ты листаешь — Ёжик идёт.
   * ================================================================
   *
   * Весь лес — одна длинная дорога. Её длина LW пикселей.
   * Чем дальше ты прокрутил страницу, тем дальше по дороге Ёжик.
   * u — где он сейчас: 0 — начало, 1 — костёр Медвежонка.
   *
   * Каждый слой леса едет со своей скоростью f (параллакс):
   * далёкие холмы — медленно, ближняя трава — быстро.
   * Так же работал многоярусный станок Норштейна.
   */

  const sky = $('#sky');
  const ctx = sky.getContext('2d');
  const film = $('#film');
  let W = 0, H = 0, DPR = 1, LW = 1;

  const walk = {
    x: 0,          // где Ёжик на дороге, в пикселях
    phase: 0,      // фаза шага
    move: 0,       // 0 — стоит, 1 — идёт
    face: 1,       // куда смотрит: 1 — вперёд, -1 — назад
    turn: 1,       // плавный поворот
    blinkAt: 2,
  };

  const opt = {          // то, что можно менять из консоли
    hue: 218,
    needles: 72,
    fog: null,           // null — туман решает сам
    horse: 0,
    owl: 0,
    warm: 0,
  };
  const now = { horse: 0, owl: 0, warm: 0 };

  const stars = new Art.Stars(260, 11);
  const fogBack = new Art.FogField(18, 31, 0.35);
  const fogFront = new Art.FogField(26, 3, 0.5);
  const flies = new Art.Fireflies(26, 5);

  const CONSTELLATIONS = [
    [[0.1, 0.14], [0.15, 0.1], [0.21, 0.12], [0.26, 0.16], [0.27, 0.25], [0.34, 0.24], [0.33, 0.15]],
    [[0.6, 0.08], [0.64, 0.16], [0.7, 0.13], [0.74, 0.22], [0.69, 0.3]],
  ];

  const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, t: 0 };

  let filmTop = 0, filmLen = 1;
  function measure() {
    filmTop = film.offsetTop;
    filmLen = Math.max(1, film.offsetHeight - window.innerHeight);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.6);
    const ratio = W ? walk.x / LW : 0;
    W = window.innerWidth;
    H = window.innerHeight;
    LW = Math.max(W, 900) * 9;
    walk.x = ratio * LW;
    sky.width = Math.round(W * DPR);
    sky.height = Math.round(H * DPR);
    fogBack.resize(W, H);
    fogFront.resize(W, H);
    measure();
  }
  let lastResize = 0;
  window.addEventListener('resize', () => {
    // на телефоне адресная строка меняет высоту при прокрутке — не дёргаемся
    const t = performance.now();
    if (Math.abs(window.innerWidth - W) < 2 && Math.abs(window.innerHeight - H) < 120 && t - lastResize < 4000) return;
    lastResize = t;
    resize();
  });

  // --- рука в тумане ---
  function onMove(e) {
    const t = performance.now();
    const dt = Math.max(8, t - (ptr.t || t - 16)) / 1000;
    if (ptr.active) {
      ptr.vx = lerp(ptr.vx, (e.clientX - ptr.x) / dt, 0.5);
      ptr.vy = lerp(ptr.vy, (e.clientY - ptr.y) / dt, 0.5);
    }
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = t; ptr.active = true;
    fogFront.touch(ptr.x, ptr.y, 1);
    fogBack.touch(ptr.x, ptr.y, 0.6);
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('pointerleave', () => { ptr.active = false; });
  window.addEventListener('blur', () => { ptr.active = false; });

  /* ---------- дорога ---------- */

  const hogScreenX = () => W * (W < 700 ? 0.3 : 0.36);
  const hogScale = () => clamp(Math.min(W, H) / (W < 700 ? 820 : 760), 0.42, 1.2);
  const RIVER = [0.635, 0.795];
  const riverAt = (u) => S(RIVER[0], RIVER[0] + 0.015, u) * (1 - S(RIVER[1] - 0.015, RIVER[1], u));
  const waterY = () => H * 0.84;

  function groundY(wx) {
    const u = wx / LW;
    const base = H * 0.8 + Math.sin(wx * 0.0021) * H * 0.012 + Math.sin(wx * 0.0057 + 1) * H * 0.006;
    const ravine = bell(0.16, 0.27, 0.57, 0.64, u) * H * 0.06;   // спуск в овраг
    const bed = riverAt(u) * H * 0.1;                              // русло реки
    return base + ravine + bed;
  }

  // Где на экране окажется вещь, которая стоит на дороге в точке um.
  // Когда Ёжик дойдёт до um, вещь будет ровно рядом с ним (+ offset).
  const placeX = (um, f, offset = 0) => hogScreenX() + (um * LW - walk.x) * f + offset;

  /* ---------- слои леса ---------- */

  function drawHills(camX, hue) {
    const f = 0.12;
    ctx.fillStyle = `hsl(${hue - 6} 20% 15%)`;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      const q = camX * f + x;
      const y = H * 0.6 - (Math.sin(q * 0.003) * 0.5 + 0.5) * H * 0.07 - Math.sin(q * 0.0011 + 2) * H * 0.05;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }

  function drawForest(camX, hue) {
    const f = 0.32, step = 46;
    const q0 = camX * f;
    ctx.save();
    for (let k = Math.floor((q0 - 120) / step); k <= Math.ceil((q0 + W + 120) / step); k++) {
      if (hash(k) < 0.3) continue;
      const x = k * step + (hash(k + 0.5) - 0.5) * step - q0;
      const h = H * (0.12 + hash(k + 0.9) * 0.2);
      const shade = 9 + hash(k + 0.3) * 4;
      Art.drawFir(ctx, x, H * 0.72 + hash(k + 0.7) * H * 0.03, h, `hsl(${hue - 2} 26% ${shade}%)`);
    }
    ctx.restore();
  }

  function drawGround(camX, u) {
    const col = '#070a14';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 6; x += 6) ctx.lineTo(x, groundY(camX + x));
    ctx.lineTo(W, H);
    ctx.fill();
    // трава: у каждой травинки своё место на дороге, поэтому она едет вместе с землёй
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const step = 3;
    for (let k = Math.floor(camX / step); k <= Math.ceil((camX + W) / step); k++) {
      const wx = k * step;
      if (riverAt(wx / LW) > 0.2) continue;
      const x = wx - camX;
      const y = groundY(wx) + 3;
      const len = 5 + Math.pow(hash(k), 2.2) * 26;
      const lean = (hash(k + 0.37) - 0.5) * 10 + Math.sin(T * 1.3 + k * 0.05) * 1.5;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len);
    }
    ctx.stroke();
    // зонтики на дороге
    const us = 230;
    for (let k = Math.floor((camX - 100) / us); k <= Math.ceil((camX + W + 100) / us); k++) {
      if (hash(k * 3.1) < 0.55) continue;
      const wx = k * us + hash(k * 7.7) * us;
      if (riverAt(wx / LW) > 0.1) continue;
      Art.drawUmbrella(ctx, wx - camX, groundY(wx) + 2, H * (0.09 + hash(k * 1.3) * 0.12), col, 1.6, Math.sin(T * 0.8 + k));
    }
  }

  function drawForeground(camX) {
    // самый ближний слой: тёмные стебли проплывают перед камерой быстрее всего
    const f = 1.55, step = 420, q0 = camX * f;
    for (let k = Math.floor((q0 - 300) / step); k <= Math.ceil((q0 + W + 300) / step); k++) {
      if (hash(k * 2.3) < 0.45) continue;
      const x = k * step + hash(k * 5.1) * step - q0;
      Art.drawUmbrella(ctx, x, H + 10, H * (0.28 + hash(k * 9.2) * 0.2), '#03050b', 3.2, Math.sin(T * 0.6 + k) * 0.6);
    }
    // огромный ствол посреди тумана
    const tx = placeX(0.43, 1.9, -W * 0.05);
    if (tx > -W * 0.3 && tx < W * 1.3) Art.drawTrunk(ctx, tx, Math.max(160, W * 0.16), H, '#020308', 5);
  }

  function drawWater(camX, u, t) {
    const r0 = RIVER[0] * LW - camX, r1 = RIVER[1] * LW - camX;
    const x0 = Math.max(0, r0), x1 = Math.min(W, r1);
    if (x1 <= x0) return;
    const wy = waterY();
    ctx.save();
    const g = ctx.createLinearGradient(0, wy, 0, H);
    g.addColorStop(0, 'rgba(22,36,60,.82)');
    g.addColorStop(1, 'rgba(6,12,26,.96)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, wy, x1 - x0, H - wy);
    // лунная дорожка
    const mx = W * 0.8;
    for (let i = 0; i < 40; i++) {
      const k = i / 40;
      const y = wy + 4 + k * (H - wy);
      const x = mx + Math.sin(t * 0.8 + i * 1.7) * (16 + k * 70);
      if (x < x0 || x > x1) continue;
      const len = (14 + Math.sin(t * 1.3 + i) * 10) * (0.6 + k);
      ctx.globalAlpha = (0.55 - k * 0.35) * (0.6 + 0.4 * Math.sin(t * 2 + i));
      ctx.fillStyle = '#e8e2c9';
      ctx.fillRect(x - len / 2, y, len, 1.4);
    }
    // рябь
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(170,195,230,.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = wy + 2 + i * (H - wy) / 8;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 18) {
        const yy = y + Math.sin((x + camX) * 0.014 + t * 1.2 + i) * 2;
        x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // кромка воды
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(200,215,235,.35)';
    ctx.fillRect(x0, wy - 1, x1 - x0, 1.5);
    ctx.restore();
  }

  function drawConstellations(a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(242,200,130,.55)';
    ctx.fillStyle = '#fff4dc';
    ctx.lineWidth = 1;
    for (const c of CONSTELLATIONS) {
      ctx.globalAlpha = a * 0.6;
      ctx.beginPath();
      c.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
      ctx.stroke();
      ctx.globalAlpha = a;
      for (const [x, y] of c) {
        Art.ellipse(ctx, x * W, y * H, 2, 2);
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(Art.GLOW, x * W - 10, y * H - 10, 20, 20);
        ctx.globalAlpha = a;
      }
    }
    ctx.restore();
  }

  function drawFire(a, t, hx, hy, s) {
    if (a <= 0.01) return;
    const fx = hx + 160 * s;
    const fy = hy + 50 * s;
    const flick = 0.88 + Math.sin(t * 9) * 0.06 + Math.sin(t * 13.7) * 0.05;
    ctx.save();
    const R = 380 * s * flick;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, R);
    g.addColorStop(0, `rgba(255,170,80,${0.42 * a})`);
    g.addColorStop(0.4, `rgba(220,110,50,${0.15 * a})`);
    g.addColorStop(1, 'rgba(200,90,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - R, fy - R, R * 2, R * 2);
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#2a1a10';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    ctx.moveTo(fx - 20 * s, fy + 2 * s); ctx.lineTo(fx + 18 * s, fy - 6 * s);
    ctx.moveTo(fx - 18 * s, fy - 6 * s); ctx.lineTo(fx + 20 * s, fy + 2 * s);
    ctx.stroke();
    const tongues = [[-8, 0.7, '#e0702e'], [7, 0.8, '#e0702e'], [0, 1, '#ffb350'], [-2, 0.62, '#ffe2a0']];
    tongues.forEach(([dx, hgt, col], i) => {
      const hh = 34 * s * hgt * (0.85 + 0.15 * Math.sin(t * (7 + i * 2.3) + i));
      const sway = Math.sin(t * (5 + i) + i * 2) * 3 * s;
      const bx = fx + dx * s;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(bx - 7 * s * hgt, fy - 2 * s);
      ctx.quadraticCurveTo(bx - 8 * s * hgt, fy - hh * 0.5, bx + sway, fy - hh);
      ctx.quadraticCurveTo(bx + 8 * s * hgt, fy - hh * 0.5, bx + 7 * s * hgt, fy - 2 * s);
      ctx.fill();
    });
    // искры улетают вверх
    for (let i = 0; i < 6; i++) {
      const life = (t * 0.6 + i / 6) % 1;
      ctx.globalAlpha = a * (1 - life);
      ctx.fillStyle = '#ffc070';
      ctx.fillRect(fx + Math.sin(i * 7 + t * 2) * 14 * s, fy - 30 * s - life * 120 * s, 2, 2);
    }
    ctx.globalAlpha = a * 0.8;
    ctx.drawImage(Art.GLOW, fx - 40 * s, fy - 60 * s, 80 * s, 80 * s);
    ctx.globalAlpha = a;
    Art.drawBear(ctx, hx + 300 * s, hy + 52 * s, s * 0.95, '#241a14', a);
    ctx.restore();
  }

  // Название живёт внутри тумана — его можно «протереть» рукой.
  let fontsReady = false;
  if (document.fonts) document.fonts.ready.then(() => { fontsReady = true; });
  function drawTitle(a) {
    if (a <= 0.01) return;
    const cx = W / 2 - walk.x * 0.45;
    const size = Math.min(W * 0.17, H * 0.19);
    const serif = fontsReady ? '"Cormorant Garamond", serif' : 'Georgia, serif';
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(5,8,18,.9)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#f4efe3';
    ctx.font = `500 ${size}px ${serif}`;
    const y1 = H * 0.17 + size * 0.85;
    ctx.fillText('Ёжик', cx, y1);
    ctx.font = `italic 500 ${size * 0.78}px ${serif}`;
    ctx.fillStyle = '#d7dde8';
    ctx.fillText('в тумане', cx + size * 0.35, y1 + size * 0.82);
    ctx.font = `400 ${Math.max(11, size * 0.085)}px ${fontsReady ? 'Lora, serif' : 'Georgia, serif'}`;
    ctx.fillStyle = 'rgba(236,230,217,.7)';
    ctx.fillText('ЮРИЙ НОРШТЕЙН  ·  СОЮЗМУЛЬТФИЛЬМ  ·  1975', cx, H * 0.17);
    ctx.restore();
  }

  /* ---------- кадр ---------- */

  let last = performance.now();
  let T = 0;
  let progress = 0;      // 0…1 — сколько фильма прокручено
  let bgHidden = false;  // фон закрыт другим блоком — можно не рисовать
  const Z = {};          // «зоны»: насколько густой туман, видна ли река и т. д.

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    T += reduceMotion ? dt * 0.3 : dt;

    // Ёжик догоняет прокрутку — поэтому он идёт, а не прыгает
    const target = progress * LW;
    const prev = walk.x;
    walk.x = lerp(walk.x, target, 1 - Math.exp(-dt * 4.5));
    if (Math.abs(walk.x - target) < 0.3) walk.x = target;
    const dx = walk.x - prev;
    const s = hogScale();
    const u = walk.x / LW;
    const river = riverAt(u);
    walk.phase += dx / (24 * s);
    const speed = Math.abs(dx) / Math.max(dt, 1e-3);
    walk.move = lerp(walk.move, river > 0.5 ? 0 : clamp(speed / (90 * s), 0, 1), 1 - Math.exp(-dt * 8));
    if (dx < -0.4) walk.face = -1;
    else if (dx > 0.4) walk.face = 1;
    walk.turn = lerp(walk.turn, walk.face, 1 - Math.exp(-dt * 7));

    // зоны прогулки
    Z.fog = 0.38 + 0.7 * S(0.13, 0.24, u) - 0.3 * S(0.58, 0.66, u) - 0.5 * S(0.79, 0.88, u);
    if (opt.fog !== null) Z.fog = opt.fog;
    Z.spread = 0.55 + 0.45 * bell(0.14, 0.24, 0.6, 0.7, u);
    Z.stars = 1 - 0.7 * bell(0.15, 0.25, 0.62, 0.8, u);
    Z.lines = bell(0.04, 0.07, 0.13, 0.17, u) + 0.55 * S(0.88, 0.95, u);
    Z.kalka = 0.45 * bell(0.22, 0.3, 0.55, 0.6, u);
    Z.flies = 0.7 - 0.55 * bell(0.15, 0.22, 0.75, 0.82, u) + 0.4 * S(0.85, 0.92, u);
    Z.river = river;
    Z.owl = bell(0.4, 0.44, 0.52, 0.56, u);
    Z.fire = S(0.8, 0.88, u);
    Z.crickets = (1 - bell(0.15, 0.22, 0.8, 0.86, u));
    now.horse = lerp(now.horse, opt.horse, 1 - Math.exp(-dt * 1.5));
    now.owl = lerp(now.owl, opt.owl, 1 - Math.exp(-dt * 1.5));
    now.warm = lerp(now.warm, opt.warm, 1 - Math.exp(-dt * 1.5));

    if (!ptr.active) { ptr.vx *= 0.9; ptr.vy *= 0.9; }
    fogBack.offset = walk.x * 0.55;
    fogFront.offset = walk.x * 1.15;
    fogBack.update(dt, ptr, 0.6);
    fogFront.update(dt, ptr, 1);
    flies.update(dt, W, H, ptr);
    Sound.update(Z, dt, progress);

    if (!bgHidden) render(dt, u, s);
    requestAnimationFrame(frame);
  }

  function render(dt, u, s) {
    const camX = walk.x - hogScreenX();
    const hue = opt.hue;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // кино чуть-чуть мерцает, как плёнка в проекторе
    const flicker = reduceMotion ? 0 : (Math.sin(T * 23) * Math.sin(T * 7.1)) * 0.012;

    Art.drawSky(ctx, W, H, hue);
    stars.draw(ctx, W, H, T, Z.stars);
    drawConstellations(Z.lines);
    const moonR = clamp(Math.min(W, H) * 0.042, 18, 46);
    Art.drawMoon(ctx, W * 0.8 - walk.x * 0.004 % W, H * (W < 700 ? 0.1 : 0.17), moonR, 1 - 0.55 * bell(0.2, 0.3, 0.55, 0.62, u));

    drawHills(camX, hue);
    drawForest(camX, hue);

    // далёкая Лошадь в конце — та самая, о которой думает Ёжик
    const farHorse = 0.32 * S(0.9, 1, u);
    if (farHorse > 0.01) Art.drawHorse(ctx, placeX(1, 0.3, W * 0.5), H * 0.66, H * 0.2, farHorse, T);

    ctx.drawImage(fogBack.render(0.4 * Z.fog + 0.1, Z.spread, T), 0, 0, W, H);

    // Лошадь в овраге
    const horseA = Math.max(0.9 * bell(0.17, 0.23, 0.38, 0.45, u), now.horse);
    if (horseA > 0.01) {
      const hs = clamp(H * 0.44, 220, 540);
      const hx = now.horse > 0.5 ? W * 0.72 : placeX(0.29, 0.7, W * 0.24);
      Art.drawHorse(ctx, hx, H * 0.8 - hs * 0.3, hs, horseA, T);
    }

    // дерево и Филин на ветке
    const owlX = placeX(0.47, 1, W * 0.1);
    const os = clamp(Math.min(W, H) / 700, 0.6, 1.3);
    if (owlX > -W && owlX < W * 1.6) {
      // ветка Филина длиной 400 растёт прямо из ствола
      const tx = owlX + 380 * os;
      Art.drawTrunk(ctx, tx, 120 * s, groundY(camX + tx) + 10, '#060914', 2);
    }
    const owlA = Math.max(Z.owl, now.owl);
    if (owlA > 0.01) {
      const ox = now.owl > 0.5 ? W * 0.16 : owlX;
      // зеркалим, чтобы ветка росла вправо — из ствола
      ctx.save();
      ctx.translate(ox, 0);
      ctx.scale(-1, 1);
      Art.drawOwl(ctx, 0, H * 0.33, os, owlA, T);
      ctx.restore();
    }

    if (Z.river > 0.01) drawWater(camX, u, T);
    drawGround(camX, u);

    // пёс с узелком
    const dogX = placeX(0.565, 1, W * 0.2);
    if (dogX > -300 && dogX < W + 300) {
      Art.drawDog(ctx, dogX, groundY(camX + dogX) + 6, s * 0.85, '#0d111c', T, u < 0.575);
    }

    const hx = hogScreenX();
    let hy = groundY(walk.x) - 50 * s;
    hy = lerp(hy, waterY() - 18 * s + Math.sin(T * 1.6) * 4 * s, Z.river);

    // кто-то большой под водой
    Art.drawDeepOne(ctx, placeX(0.735, 1, Math.sin(T * 0.3) * 40), waterY() + 60 * s, s * 1.2, Z.river * 0.9, T);

    drawFire(Math.max(Z.fire, now.warm), T, hx, groundY(walk.x) - 50 * s, s);

    if (T > walk.blinkAt + 0.16) walk.blinkAt = T + 2.5 + Math.random() * 3.5;
    const blink = T > walk.blinkAt ? 0.1 : 1;
    const hasBundle = !(u > 0.535 && u < 0.575);
    Art.drawHedgehog(ctx, hx, hy, s, {
      t: T, needles: opt.needles, blink, bundle: hasBundle,
      walk: walk.phase, move: walk.move, turn: walk.turn,
      boil: 1 + (Math.floor(T * 8) % 3),
      look: ptr.active ? clamp((ptr.x - hx) / W, -1, 1) : 0.3,
    });
    if (Z.kalka > 0.01) {
      const kw = 420 * s, kh = 260 * s;
      ctx.globalAlpha = Z.kalka;
      ctx.drawImage(Art.PUFF, hx - kw / 2, hy - kh / 2, kw, kh);
      ctx.globalAlpha = 1;
    }
    if (Z.river > 0.01) {
      // вода перед Ёжиком: он наполовину в реке
      const wy = waterY();
      const g = ctx.createLinearGradient(hx - 170 * s, 0, hx + 170 * s, 0);
      g.addColorStop(0, 'rgba(20,34,58,0)');
      g.addColorStop(0.25, 'rgba(20,34,58,.78)');
      g.addColorStop(0.75, 'rgba(20,34,58,.78)');
      g.addColorStop(1, 'rgba(20,34,58,0)');
      ctx.globalAlpha = Z.river;
      ctx.fillStyle = g;
      ctx.fillRect(hx - 170 * s, wy, 340 * s, 70 * s);
      ctx.fillStyle = 'rgba(210,225,240,.45)';
      ctx.fillRect(hx - 120 * s, wy - 1, 240 * s, 1.5);
      ctx.globalAlpha = 1;
    }

    drawTitle(1 - S(0.008, 0.035, u));

    ctx.drawImage(fogFront.render(Z.fog, Z.spread, T), 0, 0, W, H);
    drawForeground(camX);
    flies.draw(ctx, T, Z.flies, clamp(Math.min(W, H) / 800, 0.6, 1.2));

    // виньетка — края кадра темнее, как в старом кино
    const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.32, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(4,6,14,0)');
    v.addColorStop(1, `rgba(4,6,14,${0.62 + flicker * 4})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    if (flicker) {
      ctx.fillStyle = flicker > 0 ? `rgba(255,250,235,${flicker})` : `rgba(0,0,0,${-flicker})`;
      ctx.fillRect(0, 0, W, H);
    }
    // соринка на плёнке, изредка
    if (!reduceMotion && hash(Math.floor(T * 12)) > 0.965) {
      const k = Math.floor(T * 12);
      ctx.strokeStyle = 'rgba(230,225,210,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = hash(k + 0.1) * W, y = hash(k + 0.2) * H;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 14, y + 8, x + 6 + hash(k + 0.3) * 30, y + 26);
      ctx.stroke();
    }
  }

  /* ================================================================
   * 2. Субтитры, титры глав, счётчик кадров
   * ================================================================ */

  const lines = $$('#script li').map((li) => ({
    at: +li.dataset.at,
    html: li.innerHTML,
    quote: li.hasAttribute('data-quote'),
    chapter: li.dataset.chapter,
    name: li.dataset.name,
  }));
  const chapters = lines.filter((l) => l.chapter);
  const subEl = $('#subtitle');
  const interEl = $('#intertitle');
  const screenEl = $('.screen');
  const hintEl = $('#scrollhint');
  const frameEl = $('#frame');
  const hud = $('#hud');
  const desk = $('#code');
  const covers = [$('#code'), $('#stars')];
  let shownLine = -1, shownChapter = null, subTimer = 0;

  function showLine(i) {
    if (i === shownLine) return;
    shownLine = i;
    subEl.classList.remove('is-on');
    clearTimeout(subTimer);
    subTimer = setTimeout(() => {
      const l = lines[i];
      if (!l) return;
      subEl.innerHTML = l.html;
      subEl.classList.toggle('is-quote', l.quote);
      subEl.classList.add('is-on');
    }, 380);
  }

  function showChapter(c) {
    if (c === shownChapter) return;
    shownChapter = c;
    interEl.classList.remove('is-on');
    if (!c) return;
    setTimeout(() => {
      if (shownChapter !== c) return;
      $('.intertitle__num', interEl).textContent = c.chapter;
      $('.intertitle__name', interEl).textContent = c.name;
      interEl.classList.add('is-on');
    }, 500);
  }

  function onScroll() {
    progress = clamp((window.scrollY - filmTop) / filmLen, 0, 1);
    // субтитр выбираем по тому месту, куда Ёжик идёт
    const u = progress;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) if (lines[i].at <= u + 0.004) idx = i;
    showLine(idx);
    showChapter(chapters.find((c) => u >= c.at - 0.004 && u < c.at + 0.032) || null);
    hintEl.classList.toggle('is-gone', window.scrollY > 40);
    frameEl.textContent = String(Math.round(progress * 14800)).padStart(5, '0');

    const filmEnd = film.getBoundingClientRect().bottom;
    screenEl.classList.toggle('is-off', filmEnd < window.innerHeight * 0.75);
    const r = desk.getBoundingClientRect();
    hud.classList.toggle('on-paper', r.top < 30 && r.bottom > 30);
    bgHidden = covers.some((el) => {
      const b = el.getBoundingClientRect();
      return b.top <= 0 && b.bottom >= window.innerHeight;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ================================================================
   * Звук леса. Ни одного звукового файла: шум ветра, сверчки,
   * Филин и треск костра собираются из генераторов прямо в браузере.
   * ================================================================ */

  const Sound = (() => {
    let ac = null, master = null, on = false;
    let wind, river, fireG;
    let nextCricket = 0, nextHoot = 0, nextCrack = 0;

    function noise(brown) {
      const len = ac.sampleRate * 2;
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      let lastV = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { lastV = (lastV + 0.02 * w) / 1.02; d[i] = lastV * 3.5; } else d[i] = w;
      }
      return b;
    }
    function bed(buf, type, freq, q) {
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      return g;
    }
    function start() {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0;
      master.connect(ac.destination);
      const brown = noise(true), white = noise(false);
      wind = bed(brown, 'lowpass', 520, 0.4);
      river = bed(white, 'bandpass', 900, 0.5);
      fireG = bed(brown, 'lowpass', 260, 0.7);
      this.white = white;
    }
    // сверчок: три коротких писка на высокой ноте
    function chirp(t, vol) {
      const f = 4300 + Math.random() * 500;
      for (let k = 0; k < 3; k++) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        o.connect(g).connect(master);
        o.start(t); o.stop(t + 0.04);
        t += 0.05;
      }
    }
    // Филин: «у-ху» — две низкие ноты
    function hoot(t, vol) {
      [[0, 0.32, 390, 360], [0.5, 0.55, 370, 330]].forEach(([at, dur, f1, f2]) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f1, t + at);
        o.frequency.linearRampToValueAtTime(f2, t + at + dur);
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(vol, t + at + 0.08);
        g.gain.linearRampToValueAtTime(0, t + at + dur);
        o.connect(g).connect(master);
        o.start(t + at); o.stop(t + at + dur + 0.05);
      });
    }
    // костёр: щелчки
    function crack(t, vol, buf) {
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 1800;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
      src.connect(f).connect(g).connect(master);
      src.start(t, Math.random() * 1.5, 0.08);
    }
    const api = {
      get on() { return on; },
      toggle() {
        if (!ac) start.call(api);
        on = !on;
        if (ac.state === 'suspended') ac.resume();
        master.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.4);
        return on;
      },
      update(z, dt, p) {
        if (!ac || !on) return;
        const t = ac.currentTime;
        wind.gain.setTargetAtTime(0.12 + z.fog * 0.22, t, 0.5);
        river.gain.setTargetAtTime(z.river * 0.16, t, 0.5);
        fireG.gain.setTargetAtTime(z.fire * 0.25, t, 0.5);
        if (t > nextCricket && z.crickets > 0.2) {
          chirp(t + 0.05, 0.018 * z.crickets);
          nextCricket = t + 0.25 + Math.random() * 1.2;
        }
        if (t > nextHoot && Math.max(z.owl, now.owl) > 0.5) {
          hoot(t + 0.1, 0.12);
          nextHoot = t + 5 + Math.random() * 4;
        }
        if (t > nextCrack && Math.max(z.fire, now.warm) > 0.3) {
          crack(t + 0.02, 0.25 * Math.max(z.fire, now.warm), api.white);
          nextCrack = t + 0.05 + Math.random() * 0.4;
        }
      },
    };
    return api;
  })();

  const soundBtn = $('#sound');
  soundBtn.addEventListener('click', () => {
    const isOn = Sound.toggle();
    soundBtn.setAttribute('aria-pressed', String(isOn));
    $('b', soundBtn).textContent = isOn ? 'вкл' : 'выкл';
  });

  /* ================================================================
   * 3. Многоярусный станок
   * ================================================================ */

  function initMultiplane() {
    const stack = $('#mp-stack');
    const layers = $$('.mp__layer canvas', stack);
    const [skyL, forestL, hogL, kalkaL, grassL] = layers.map((c) => c.getContext('2d'));
    const w = 800, h = 500;

    Art.drawSky(skyL, w, h, 216);
    new Art.Stars(150, 77).draw(skyL, w, h, 1.3, 1);
    Art.drawMoon(skyL, w * 0.78, h * 0.2, 26, 1);

    Art.drawForest(forestL, w, h, 9, '#101a2d');

    Art.drawHedgehog(hogL, w * 0.42, h * 0.72, 1.15, { t: 0.5, needles: 72 });

    const kr = rng(4);
    for (let i = 0; i < 26; i++) {
      const ph = 90 + kr() * 160;
      const pw = ph * (2.2 + kr());
      kalkaL.globalAlpha = 0.25 + kr() * 0.35;
      kalkaL.drawImage(Art.PUFF, kr() * w - pw / 2, h * (0.35 + kr() * 0.7) - ph / 2, pw, ph);
    }
    kalkaL.globalAlpha = 0.35;
    kalkaL.drawImage(Art.PUFF, w * 0.42 - 260, h * 0.7 - 160, 520, 320);
    kalkaL.globalAlpha = 1;

    const g = Art.makeGround(w, h, 5, '#05070e');
    grassL.drawImage(g.canvas, 0, h * 0.07);

    const split = $('#mp-split');
    const kalka = $('#mp-kalka');
    const kalkaLayer = $('.mp__layer--kalka');
    const update = () => {
      const s = +split.value;
      const k = +kalka.value;
      stack.style.setProperty('--split', s.toFixed(3));
      stack.style.setProperty('--label', clamp((s - 0.5) * 3, 0, 1).toFixed(3));
      kalkaLayer.style.opacity = (0.08 + k * 0.92).toFixed(3);
      split.style.setProperty('--fill', `${s * 100}%`);
      kalka.style.setProperty('--fill', `${k * 100}%`);
    };
    split.addEventListener('input', update);
    kalka.addEventListener('input', update);
    update();

    // Когда блок впервые появляется на экране, станок сам немного
    // «раскрывается», чтобы было понятно, что его можно трогать.
    let shown = false;
    new IntersectionObserver((entries) => {
      if (shown || !entries[0].isIntersecting || reduceMotion) return;
      shown = true;
      const t0 = performance.now();
      const step = (now) => {
        if (split.dataset.touched) return;
        const p = clamp((now - t0) / 2600, 0, 1);
        split.value = (Math.sin(p * Math.PI) * 0.55).toFixed(3);
        update();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 }).observe($('#mp-stage'));
    split.addEventListener('pointerdown', () => { split.dataset.touched = '1'; });
  }

  /* ================================================================
   * 4. Песочница: код, который можно трогать
   * ================================================================ */

  const DEFAULTS = { stars: 140, fog: 0.55, wind: 1, needles: 72, needleLen: 34, fireflies: 14, skyHue: 218 };
  const PLAY_PRESETS = {
    bald: { needles: 0, needleLen: 0, fog: 0.2 },
    storm: { wind: 7.5, fog: 1.4, stars: 20, fireflies: 0, skyHue: 236, needleLen: 46 },
    dawn: { skyHue: 14, stars: 15, fog: 0.75, wind: 0.4, fireflies: 3 },
  };

  function initPlayground() {
    const canvas = $('#play-canvas');
    const g = canvas.getContext('2d');
    const params = { ...DEFAULTS };
    const pStars = new Art.Stars(params.stars, 42);
    const pFog = new Art.FogField(22, 8, 0.5);
    const pFlies = new Art.Fireflies(params.fireflies, 13);
    const pPtr = { x: 0, y: 0, vx: 0, vy: 0, active: false, t: 0 };
    let w = 0, h = 0, dpr = 1, pGround = null, visible = false, t = 0, lastT = performance.now();
    let fpsAcc = 0, fpsN = 0;

    function size() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(10, r.width); h = Math.max(10, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      pFog.resize(w, h);
      pGround = Art.makeGround(w, h, 17);
    }
    new ResizeObserver(size).observe(canvas);

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const now = performance.now();
      const dt = Math.max(8, now - (pPtr.t || now - 16)) / 1000;
      if (pPtr.active) { pPtr.vx = (x - pPtr.x) / dt; pPtr.vy = (y - pPtr.y) / dt; }
      Object.assign(pPtr, { x, y, t: now, active: true });
      pFog.touch(x, y, 1);
    });
    canvas.addEventListener('pointerleave', () => { pPtr.active = false; });

    new IntersectionObserver((en) => {
      const was = visible;
      visible = en[0].isIntersecting;
      if (visible && !was) { lastT = performance.now(); requestAnimationFrame(loop); }
    }).observe(canvas);

    function loop(now) {
      if (!visible) return;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      t += dt;
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 0.5) {
        $('#fps').textContent = Math.round(fpsN / fpsAcc);
        fpsAcc = 0; fpsN = 0;
      }

      pStars.setCount(params.stars);
      pFlies.setCount(params.fireflies);
      pFog.update(dt, pPtr, params.wind);
      pFlies.update(dt, w, h, pPtr);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      Art.drawSky(g, w, h, params.skyHue);
      pStars.draw(g, w, h, t, 1);
      Art.drawMoon(g, w * 0.82, h * 0.18, clamp(w * 0.035, 12, 30), 1);
      g.drawImage(pGround.canvas, 0, 0, w, h);
      const s = clamp(Math.min(w, h) / 420, 0.5, 1.4);
      const hx = w * 0.42, hy = pGround.yAt(w * 0.42) - 50 * s;
      Art.drawHedgehog(g, hx, hy, s, {
        t, needles: params.needles, needleLen: params.needleLen, boil: 1 + (Math.floor(t * 8) % 3),
        blink: (t % 4.2) > 4.05 ? 0.1 : 1,
      });
      g.drawImage(pFog.render(params.fog, 1, t), 0, 0, w, h);
      pFlies.draw(g, t, 1, clamp(w / 700, 0.6, 1.1));

      requestAnimationFrame(loop);
    }

    // --- числа, которые можно тянуть ---
    const nums = $$('.num');
    const fmt = (el, v) => (+v).toFixed(+(el.dataset.dec || 0));
    function setParam(key, v, fromEl) {
      const el = fromEl || nums.find((n) => n.dataset.key === key);
      if (!el) return;
      const min = +el.dataset.min, max = +el.dataset.max;
      v = clamp(v, min, max);
      params[key] = v;
      el.textContent = fmt(el, v);
      if (key === 'needles') $('#needle-count').textContent = Math.round(v) * 3;
    }
    for (const el of nums) {
      let startX = 0, startV = 0, dragging = false;
      el.addEventListener('pointerdown', (e) => {
        dragging = true; startX = e.clientX; startV = params[el.dataset.key];
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-drag');
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
      });
      el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const step = +el.dataset.step;
        const range = +el.dataset.max - +el.dataset.min;
        // чем дальше тянешь, тем быстрее меняется число
        const dx = e.clientX - startX;
        const speed = Math.max(step, range / 500);
        const raw = startV + Math.sign(dx) * Math.pow(Math.abs(dx), 1.25) * speed * 0.6;
        setParam(el.dataset.key, Math.round(raw / step) * step, el);
      });
      const end = () => { dragging = false; el.classList.remove('is-drag'); document.body.style.cursor = ''; };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('keydown', (e) => {
        const step = +el.dataset.step * (e.shiftKey ? 10 : 1);
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setParam(el.dataset.key, params[el.dataset.key] + step, el); e.preventDefault(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setParam(el.dataset.key, params[el.dataset.key] - step, el); e.preventDefault(); }
      });
      el.setAttribute('role', 'slider');
      el.setAttribute('aria-label', el.dataset.key);
      el.title = 'Тяни влево-вправо или нажимай стрелки';
    }

    // плавный переход к набору чисел — так видно, что меняется
    let tween = 0;
    function animateTo(values) {
      const from = { ...params };
      const to = { ...DEFAULTS, ...values };
      const id = ++tween;
      const t0 = performance.now();
      const step = (now) => {
        if (id !== tween) return;
        const p = clamp((now - t0) / 900, 0, 1);
        const e = p * p * (3 - 2 * p);
        for (const key in to) {
          const el = nums.find((n) => n.dataset.key === key);
          const st = +el.dataset.step;
          setParam(key, Math.round(lerp(from[key], to[key], e) / st) * st, el);
        }
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    $('#play-reset').addEventListener('click', () => animateTo({}));
    $$('[data-preset]').forEach((b) => b.addEventListener('click', () => animateTo(PLAY_PRESETS[b.dataset.preset])));

    for (const key in params) setParam(key, params[key]);
  }

  /* ================================================================
   * 5. Посчитай звёзды
   * ================================================================ */

  function initStarCount() {
    const canvas = $('#count-canvas');
    const g = canvas.getContext('2d');
    let w = 0, h = 0, dpr = 1, list = [], lit = [], visible = false, t = 0, lastT = 0, seed = 101;
    let revealed = false;

    function makeStars() {
      const r = rng(seed);
      list = [];
      const n = Math.round(clamp((w * h) / 5200, 40, 140));
      for (let i = 0; i < n; i++) {
        list.push({ x: r(), y: 0.04 + Math.pow(r(), 1.3) * 0.62, r: 0.7 + r() * 1.6, ph: r() * 6.28, lit: false });
      }
      lit = [];
      updateScore();
    }
    function size() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const changed = Math.abs(r.width - w) > 1;
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (changed && !lit.length) makeStars();
    }
    new ResizeObserver(size).observe(canvas);

    const chimneyX = () => w * 0.5;
    function updateScore() {
      let hog = 0, bear = 0;
      for (const s of list) if (s.lit) (s.x * w < chimneyX() ? hog++ : bear++);
      $('#score-hog').textContent = hog;
      $('#score-bear').textContent = bear;
      if (!revealed && hog + bear >= 6) {
        revealed = true;
        $('#reveal').hidden = false;
      }
    }

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      // найти ближайшую звезду
      let best = null, bestD = 34;
      for (const s of list) {
        const d = Math.hypot(s.x * w - cx, s.y * h - cy);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (!best) return;
      if (lit[lit.length - 1] === best) return;
      best.lit = true;                // зажечь её
      best.flash = 1;
      lit.push(best);                 // протянуть линию от предыдущей
      updateScore();
    });
    $('#count-clear').addEventListener('click', () => { seed += 7; makeStars(); });

    new IntersectionObserver((en) => {
      const was = visible;
      visible = en[0].isIntersecting;
      if (visible && !was) { lastT = performance.now(); requestAnimationFrame(loop); }
    }).observe(canvas);

    function drawRoof() {
      const base = h * 0.8;
      g.fillStyle = '#05070e';
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, base + h * 0.06);
      g.lineTo(w * 0.5, base - h * 0.04);
      g.lineTo(w, base + h * 0.06);
      g.lineTo(w, h);
      g.fill();
      // печная труба
      const cw = clamp(w * 0.035, 18, 34);
      g.fillRect(chimneyX() - cw / 2, base - h * 0.15, cw, h * 0.13);
      g.fillRect(chimneyX() - cw * 0.65, base - h * 0.16, cw * 1.3, h * 0.025);
      // дымок
      g.strokeStyle = 'rgba(200,210,225,.12)';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i <= 30; i++) {
        const yy = base - h * 0.17 - i * h * 0.012;
        const xx = chimneyX() + Math.sin(t * 0.8 + i * 0.35) * (4 + i * 0.6) + i * 1.2;
        i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
      }
      g.stroke();
      // Ёжик и Медвежонок сидят на крыше
      const s = clamp(h / 900, 0.3, 0.6);
      Art.drawHedgehog(g, w * 0.36, roofY(w * 0.36) - 46 * s, s, { silhouette: '#05070e', needles: 60, bundle: false, t });
      Art.drawBear(g, w * 0.62, roofY(w * 0.62) + 2, s * 0.85, '#05070e');
    }
    function roofY(x) {
      const base = h * 0.8;
      const peak = base - h * 0.04, edge = base + h * 0.06;
      return x < w * 0.5 ? lerp(edge, peak, x / (w * 0.5)) : lerp(peak, edge, (x - w * 0.5) / (w * 0.5));
    }

    function loop(now) {
      if (!visible) return;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      t += dt;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      Art.drawSky(g, w, h, 222);

      // линии созвездия
      if (lit.length > 1) {
        g.strokeStyle = 'rgba(242,190,110,.7)';
        g.lineWidth = 1.3;
        g.beginPath();
        lit.forEach((s, i) => (i ? g.lineTo(s.x * w, s.y * h) : g.moveTo(s.x * w, s.y * h)));
        g.stroke();
      }
      for (const s of list) {
        const x = s.x * w, y = s.y * h;
        if (s.lit) {
          s.flash = Math.max(0, (s.flash || 0) - dt * 1.5);
          const size = 22 + s.flash * 60;
          g.globalAlpha = 0.9;
          g.drawImage(Art.GLOW, x - size / 2, y - size / 2, size, size);
          g.globalAlpha = 1;
          g.fillStyle = '#fff6df';
          Art.ellipse(g, x, y, s.r + 0.8, s.r + 0.8);
        } else {
          g.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.6 + s.ph);
          g.fillStyle = '#dfe8ff';
          Art.ellipse(g, x, y, s.r, s.r);
          g.globalAlpha = 1;
        }
      }
      drawRoof();
      requestAnimationFrame(loop);
    }
  }

  /* ================================================================
   * 6. Консоль: управляй сайтом изнутри
   * ================================================================ */

  function initConsole() {
    const toggle = (key) => { opt[key] = opt[key] ? 0 : 1; return opt[key]; };
    const api = {
      туман(v) {
        if (v === undefined) { opt.fog = null; return 'Туман снова живёт сам по себе.'; }
        opt.fog = clamp(+v || 0, 0, 3);
        return opt.fog === 0 ? 'Туман рассеялся. Видно далеко-далеко.' : `Туман: ${opt.fog}. Вернуть как было — туман()`;
      },
      звёзды(n = 260) {
        n = clamp(Math.round(+n || 0), 0, 6000);
        stars.setCount(n);
        return `На небе ${n} звёзд. Ёжик бы обрадовался.`;
      },
      лошадь() {
        return toggle('horse') ? 'Лошадь!.. Лошадь!.. (она справа, в тумане)' : 'Лошадь ушла в туман.';
      },
      филин() {
        return toggle('owl') ? 'Угу. Угу.' : 'Филин улетел.';
      },
      медвежонок() {
        return toggle('warm') ? 'Ёжик!.. Ё-ё-жик!.. (костёр горит)' : 'Костёр погас.';
      },
      светлячки(n = 26) {
        n = clamp(Math.round(+n || 0), 0, 2000);
        flies.setCount(n);
        return `Светлячков: ${n}.`;
      },
      небо(hue = 218) {
        opt.hue = ((+hue % 360) + 360) % 360;
        return `Оттенок неба: ${opt.hue}. Попробуй 0, 120, 280.`;
      },
      звук() {
        soundBtn.click();
        return Sound.on ? 'Слушай лес.' : 'Тишина.';
      },
      помощь() {
        console.log('%cКоманды:', 'font-weight:bold;color:#f2b45a');
        console.table({
          'туман(0)': 'разогнать туман',
          'туман(1.5)': 'густой туман',
          'туман()': 'как было',
          'звёзды(1500)': 'сколько звёзд',
          'лошадь()': 'позвать Лошадь',
          'филин()': 'разбудить Филина',
          'медвежонок()': 'развести костёр',
          'светлячки(200)': 'светлячки',
          'небо(300)': 'цвет неба',
          'звук()': 'звук леса',
          'ёжик.иголки(500)': 'колючесть',
          'ёжик.моргни()': 'подмигнуть',
        });
        return 'А ещё можно открыть вкладку Sources и почитать файлы js/art.js и js/main.js.';
      },
    };
    const ёжик = {
      иголки(n = 72) {
        opt.needles = clamp(Math.round(+n || 0), 0, 3000);
        return opt.needles === 0 ? 'Совсем без иголок! Холодно, наверное.' : `Иголок в ряду: ${opt.needles}.`;
      },
      моргни() { walk.blinkAt = T; return ';)'; },
    };
    Object.assign(window, api, { ёжик, help: api.помощь });

    console.log(
      '%cПривет!%c\n\nТы открыл консоль — значит, тебе интересно, как всё устроено.\nЭто первый шаг любого программиста.\n\nНапиши %cпомощь()%c и нажми Enter.',
      'font: 600 28px Georgia, serif; color: #f2b45a;',
      'font: 14px Georgia, serif; color: inherit;',
      'font: 600 14px monospace; color: #f2b45a; background: rgba(242,180,90,.12); padding: 2px 6px; border-radius: 4px;',
      'font: 14px Georgia, serif; color: inherit;'
    );
  }

  /* ================================================================
   * 7. Настоящий код тумана и подсчёт строк
   * ================================================================ */

  /* ================================================================
   * 7. Настоящий код тумана и подсчёт строк
   * ================================================================ */

  function showSource() {
    const P = Art.FogField.prototype;
    const indent = (fn) => fn.toString().replace(/^ {4}/gm, '');
    const text = [
      '// Art.FogField — туман этой страницы\n',
      indent(P.update),
      '\n\n',
      indent(P.render),
    ].join('');
    $('#fog-source').textContent = text;
  }

  async function countLines() {
    try {
      const files = ['index.html', 'css/style.css', 'js/art.js', 'js/main.js'];
      const texts = await Promise.all(files.map((f) => fetch(f).then((r) => {
        if (!r.ok) throw new Error(f);
        return r.text();
      })));
      const n = texts.reduce((sum, s) => sum + s.split('\n').length, 0);
      $('#loc').textContent = n.toLocaleString('ru-RU');
    } catch (e) {
      // открыто как файл с диска — тогда браузер не даст прочитать файлы, и это нормально
    }
  }


  /* ================================================================
   * Поехали!
   * ================================================================ */

  resize();
  onScroll();
  walk.x = progress * LW;
  requestAnimationFrame((t) => { last = t; frame(t); });
  window.addEventListener('load', () => { measure(); onScroll(); });
  initMultiplane();
  initPlayground();
  initStarCount();
  initConsole();
  showSource();
  countLines();
})();
