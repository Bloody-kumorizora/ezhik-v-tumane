/*
 * main.js — как страница оживает.
 *
 * Если ты это читаешь — привет! Ты нашёл, как устроен сайт изнутри.
 * Меняй что хочешь: сохрани файл, обнови страницу и посмотри, что вышло.
 */
'use strict';

(() => {
  const { clamp, lerp, rng } = Art;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ================================================================
   * 1. Большая сцена на фоне всей страницы
   * ================================================================ */

  // Каждая глава истории — это набор чисел. Пока ты листаешь,
  // сцена плавно перетекает от одного набора к другому.
  const PRESETS = {
    hero:     { fog: 0.62, back: 0.35, spread: 0.6, stars: 1, lines: 0, horse: 0, owl: 0, river: 0, warm: 0, hog: 1, kalka: 0, flies: 0.7, moon: 1, ground: 1 },
    evening:  { fog: 0.22, back: 0.15, spread: 0.4, lines: 1, flies: 0.4 },
    fog:      { fog: 0.95, back: 0.6, spread: 0.8, kalka: 0.25, stars: 0.75, flies: 0.3 },
    horse:    { fog: 0.85, back: 0.55, spread: 0.85, horse: 0.85, kalka: 0.35, stars: 0.6, flies: 0.2 },
    owl:      { fog: 1.15, back: 0.8, spread: 1, owl: 1, kalka: 0.6, stars: 0.3, moon: 0.4, flies: 0.15 },
    river:    { fog: 0.7, back: 0.45, spread: 0.65, river: 1, kalka: 0.15, stars: 0.6, flies: 0 },
    together: { fog: 0.3, back: 0.2, spread: 0.45, warm: 1, lines: 0.5, flies: 1 },
    calm:     { fog: 0.3, back: 0.2, spread: 0.45, hog: 0, flies: 0.35, stars: 0.85, ground: 0.35 },
    end:      { fog: 0.45, back: 0.25, spread: 0.55, hog: 0, horse: 0.5, flies: 0.6, ground: 0.6 },
  };
  const BASE = PRESETS.hero;
  const preset = (name) => ({ ...BASE, ...(PRESETS[name] || {}) });

  const scene = {
    now: preset('hero'),       // что на экране сейчас
    target: preset('hero'),    // куда сцена плывёт
    override: {},              // то, что ты задал из консоли
    hue: 218,
    needles: 72,
    blinkAt: 2,
  };

  const sky = $('#sky');
  const ctx = sky.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let ground = null;

  const stars = new Art.Stars(260, 11);
  const fogBack = new Art.FogField(16, 31, 0.35);
  const fogFront = new Art.FogField(26, 3, 0.5);
  const flies = new Art.Fireflies(26, 5);

  // Два созвездия: звёзды Ёжика и звёзды Медвежонка.
  const CONSTELLATIONS = [
    [[0.1, 0.14], [0.15, 0.1], [0.21, 0.12], [0.26, 0.16], [0.27, 0.25], [0.34, 0.24], [0.33, 0.15]],
    [[0.6, 0.08], [0.64, 0.16], [0.7, 0.13], [0.74, 0.22], [0.69, 0.3]],
  ];

  const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, t: 0, moved: 0 };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.6);
    W = window.innerWidth;
    H = window.innerHeight;
    sky.width = Math.round(W * DPR);
    sky.height = Math.round(H * DPR);
    fogBack.resize(W, H);
    fogFront.resize(W, H);
    ground = Art.makeGround(W, H, 21);
  }

  let lastResize = 0;
  window.addEventListener('resize', () => {
    // на телефоне адресная строка меняет высоту при прокрутке — не дёргаемся
    const now = performance.now();
    if (Math.abs(window.innerWidth - W) < 2 && Math.abs(window.innerHeight - H) < 120 && now - lastResize < 4000) return;
    lastResize = now;
    resize();
  });

  // --- рука в тумане ---
  let hintDone = false;
  function onMove(e) {
    const now = performance.now();
    const dt = Math.max(8, now - (ptr.t || now - 16)) / 1000;
    if (ptr.active) {
      ptr.vx = lerp(ptr.vx, (e.clientX - ptr.x) / dt, 0.5);
      ptr.vy = lerp(ptr.vy, (e.clientY - ptr.y) / dt, 0.5);
      ptr.moved += Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
    }
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = now; ptr.active = true;
    fogFront.touch(ptr.x, ptr.y, 1);
    fogBack.touch(ptr.x, ptr.y, 0.6);
    if (!hintDone && ptr.moved > 700) {
      hintDone = true;
      $('#hint')?.classList.add('is-done');
    }
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('pointerleave', () => { ptr.active = false; });
  window.addEventListener('blur', () => { ptr.active = false; });

  function hogPlacement() {
    const narrow = W < 700;
    const s = clamp(Math.min(W, H) / (narrow ? 820 : 780), 0.42, 1.15);
    const x = narrow ? W * 0.3 : W * 0.24;
    const y = ground.yAt(x) - 50 * s;
    return { x, y, s };
  }

  function drawRiver(a, t) {
    if (a <= 0.01) return;
    const top = H * 0.8;
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, 'rgba(18,30,52,0)');
    g.addColorStop(0.18, 'rgba(18,30,52,.92)');
    g.addColorStop(1, 'rgba(8,14,28,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, H - top);
    // лунная дорожка и рябь
    const mx = W * 0.78;
    for (let i = 0; i < 46; i++) {
      const k = i / 46;
      const y = top + H * 0.03 + k * (H - top);
      const spread = 20 + k * 120;
      const x = mx + Math.sin(t * 0.8 + i * 1.7) * spread * 0.4;
      const len = (14 + Math.sin(t * 1.3 + i) * 10) * (0.6 + k);
      ctx.globalAlpha = a * (0.55 - k * 0.35) * (0.6 + 0.4 * Math.sin(t * 2 + i));
      ctx.fillStyle = '#e8e2c9';
      ctx.fillRect(x - len / 2, y, len, 1.4);
    }
    ctx.strokeStyle = 'rgba(160,190,230,.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = top + H * 0.05 + i * (H - top) / 10;
      ctx.globalAlpha = a * 0.7;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const yy = y + Math.sin(x * 0.012 + t * 0.9 + i) * 2.5;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWarmth(a, t, hog) {
    if (a <= 0.01) return;
    const s = hog.s;
    const fx = hog.x + 160 * s;
    const fy = hog.y + 50 * s;
    const flick = 0.88 + Math.sin(t * 9) * 0.06 + Math.sin(t * 13.7) * 0.05;
    ctx.save();
    const R = 360 * s * flick;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, R);
    g.addColorStop(0, `rgba(255,170,80,${0.4 * a})`);
    g.addColorStop(0.4, `rgba(220,110,50,${0.14 * a})`);
    g.addColorStop(1, 'rgba(200,90,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - R, fy - R, R * 2, R * 2);
    ctx.globalAlpha = a;
    // поленья
    ctx.strokeStyle = '#2a1a10';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    ctx.moveTo(fx - 20 * s, fy + 2 * s); ctx.lineTo(fx + 18 * s, fy - 6 * s);
    ctx.moveTo(fx - 18 * s, fy - 6 * s); ctx.lineTo(fx + 20 * s, fy + 2 * s);
    ctx.stroke();
    // язычки пламени: каждый колышется по-своему
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
    ctx.globalAlpha = a * 0.8;
    ctx.drawImage(Art.GLOW, fx - 40 * s, fy - 60 * s, 80 * s, 80 * s);
    // Медвежонок по ту сторону костра
    ctx.globalAlpha = a;
    Art.drawBear(ctx, hog.x + 300 * s, hog.y + 52 * s, s * 0.95, '#241a14', a);
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

  let last = performance.now();
  let T = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    T += reduceMotion ? dt * 0.3 : dt;
    const n = scene.now;
    const goal = { ...scene.target, ...scene.override };
    const k = 1 - Math.exp(-dt * 1.3);
    for (const key in goal) n[key] = lerp(n[key] ?? 0, goal[key], k);

    // пока руки нет, туман всё равно чуть-чуть шевелится
    if (!ptr.active) { ptr.vx *= 0.9; ptr.vy *= 0.9; }
    const wind = reduceMotion ? 0.2 : 1;
    fogBack.update(dt, ptr, wind * 0.6);
    fogFront.update(dt, ptr, wind);
    flies.update(dt, W, H, ptr);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    Art.drawSky(ctx, W, H, scene.hue);
    stars.draw(ctx, W, H, T, n.stars);
    drawConstellations(n.lines);
    const moonR = clamp(Math.min(W, H) * 0.042, 18, 46);
    Art.drawMoon(ctx, W * 0.8, H * (W < 700 ? 0.075 : 0.17), moonR, n.moon);

    const os = clamp(Math.min(W, H) / 700, 0.6, 1.3);
    Art.drawOwl(ctx, W * 0.14, H * 0.3, os, n.owl, T);

    ctx.drawImage(fogBack.render(n.back, n.spread, T), 0, 0, W, H);

    const hs = clamp(H * 0.42, 220, 520);
    Art.drawHorse(ctx, W * (W < 700 ? 0.72 : 0.7), ground.yAt(W * 0.7) - hs * 0.32, hs, n.horse, T);

    ctx.globalAlpha = (1 - n.river * 0.9) * n.ground;
    ctx.drawImage(ground.canvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
    drawRiver(n.river, T);

    const hog = hogPlacement();
    drawWarmth(n.warm, T, hog);

    if (n.hog > 0.01) {
      // Ёжик моргает примерно раз в четыре секунды
      if (T > scene.blinkAt + 0.16) scene.blinkAt = T + 2.5 + Math.random() * 3.5;
      const blink = T > scene.blinkAt ? 0.1 : 1;
      const float = n.river * Math.sin(T * 1.4) * 6 * hog.s;
      ctx.globalAlpha = n.hog;
      Art.drawHedgehog(ctx, hog.x, hog.y + float + n.river * 26 * hog.s, hog.s, {
        t: T, needles: scene.needles, blink, look: ptr.active ? clamp((ptr.x - hog.x) / W, -1, 1) : 0,
      });
      ctx.globalAlpha = 1;
      // калька: белая вуаль прямо над Ёжиком
      if (n.kalka > 0.01) {
        const kw = 420 * hog.s, kh = 260 * hog.s;
        ctx.globalAlpha = clamp(n.kalka, 0, 1) * n.hog;
        ctx.drawImage(Art.PUFF, hog.x - kw / 2, hog.y - kh / 2, kw, kh);
        ctx.globalAlpha = 1;
      }
    }

    ctx.drawImage(fogFront.render(n.fog, n.spread, T), 0, 0, W, H);
    flies.draw(ctx, T, n.flies, clamp(Math.min(W, H) / 800, 0.6, 1.2));

    // виньетка — края кадра темнее, как в старом кино
    const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(4,6,14,0)');
    v.addColorStop(1, 'rgba(4,6,14,.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(frame);
  }

  /* ================================================================
   * 2. Главы: какая сейчас на экране?
   * ================================================================ */

  const sceneEls = $$('[data-scene]');
  function pickScene() {
    const mid = window.innerHeight * 0.5;
    let best = null, bestD = Infinity;
    for (const el of sceneEls) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = el; }
    }
    if (best) scene.target = preset(best.dataset.scene);
  }
  window.addEventListener('scroll', pickScene, { passive: true });

  const chapterIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add('is-in');
  }, { threshold: 0.25 });
  $$('.chapter').forEach((el) => chapterIO.observe(el));

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
        t, needles: params.needles, needleLen: params.needleLen,
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
    const say = (text) => text;
    const api = {
      туман(v) {
        if (v === undefined) { delete scene.override.fog; delete scene.override.back; return say('Туман снова живёт сам по себе.'); }
        v = clamp(+v || 0, 0, 3);
        scene.override.fog = v;
        scene.override.back = v * 0.6;
        return say(v === 0 ? 'Туман рассеялся. Видно далеко-далеко.' : `Туман: ${v}. Чтобы вернуть как было — туман()`);
      },
      звёзды(n = 260) {
        n = clamp(Math.round(+n || 0), 0, 6000);
        stars.setCount(n);
        return say(`На небе ${n} звёзд. Ёжик бы обрадовался.`);
      },
      лошадь() {
        scene.override.horse = scene.override.horse ? 0 : 1;
        if (!scene.override.horse) delete scene.override.horse;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return say(scene.override.horse ? 'Лошадь!.. Лошадь!.. (посмотри наверх страницы)' : 'Лошадь ушла в туман.');
      },
      филин() {
        scene.override.owl = scene.override.owl ? 0 : 1;
        if (!scene.override.owl) delete scene.override.owl;
        return say(scene.override.owl ? 'Угу. Угу.' : 'Филин улетел.');
      },
      светлячки(n = 26) {
        n = clamp(Math.round(+n || 0), 0, 2000);
        flies.setCount(n);
        scene.override.flies = n ? 1 : 0;
        return say(`Светлячков: ${n}.`);
      },
      небо(hue = 218) {
        scene.hue = ((+hue % 360) + 360) % 360;
        return say(`Оттенок неба: ${scene.hue}. Попробуй 0, 120, 280.`);
      },
      медвежонок() {
        scene.override.warm = scene.override.warm ? 0 : 1;
        if (!scene.override.warm) delete scene.override.warm;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return say(scene.override.warm ? 'Ёжик!.. Ё-ё-жик!..' : 'Костёр погас.');
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
          'ёжик.иголки(500)': 'колючесть',
          'ёжик.моргни()': 'подмигнуть',
        });
        return say('А ещё можно открыть вкладку Sources и почитать файлы js/art.js и js/main.js.');
      },
    };
    const ёжик = {
      иголки(n = 72) {
        scene.needles = clamp(Math.round(+n || 0), 0, 3000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return scene.needles === 0 ? 'Совсем без иголок! Холодно, наверное.' : `Иголок в ряду: ${scene.needles}.`;
      },
      моргни() { scene.blinkAt = T; return ';)'; },
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
  pickScene();
  scene.now = { ...scene.target };
  requestAnimationFrame((t) => { last = t; frame(t); });
  initMultiplane();
  initPlayground();
  initStarCount();
  initConsole();
  showSource();
  countLines();
})();
