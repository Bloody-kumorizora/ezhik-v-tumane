/*
 * art.js — всё, что рисуется на этом сайте.
 *
 * Здесь нет ни одной картинки. Ёжик, туман, звёзды, лошадь и филин
 * собираются из кругов, линий и чисел — прямо в твоём браузере,
 * шестьдесят раз в секунду.
 */
'use strict';

const Art = (() => {
  const TAU = Math.PI * 2;

  /* ---------- маленькие помощники ---------- */

  // Генератор «случайных» чисел, который всегда выдаёт одну и ту же
  // последовательность для одного и того же seed. Поэтому у ёжика
  // при каждом запуске одни и те же иголки.
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // «Случайное» число для любого целого n — всегда одно и то же.
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function ellipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
    ctx.fill();
  }

  // Мягкое пятно: из таких пятен состоит туман.
  function makeSoftSprite(size, stops) {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const PUFF = makeSoftSprite(256, [
    [0, 'rgba(226,232,238,1)'],
    [0.3, 'rgba(218,226,234,.62)'],
    [0.62, 'rgba(206,216,228,.2)'],
    [1, 'rgba(200,210,224,0)'],
  ]);

  const HOLE = makeSoftSprite(128, [
    [0, 'rgba(0,0,0,1)'],
    [0.45, 'rgba(0,0,0,.7)'],
    [1, 'rgba(0,0,0,0)'],
  ]);

  const GLOW = makeSoftSprite(64, [
    [0, 'rgba(255,236,170,1)'],
    [0.18, 'rgba(255,205,110,.75)'],
    [0.5, 'rgba(255,170,70,.16)'],
    [1, 'rgba(255,150,50,0)'],
  ]);

  /* ---------- небо ---------- */

  function drawSky(ctx, w, h, hue = 218) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${hue} 42% 6%)`);
    g.addColorStop(0.55, `hsl(${hue - 4} 30% 13%)`);
    g.addColorStop(1, `hsl(${hue - 14} 24% 20%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawMoon(ctx, x, y, r, alpha = 1) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 7);
    halo.addColorStop(0, 'rgba(240,232,205,.22)');
    halo.addColorStop(1, 'rgba(240,232,205,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
    const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    disc.addColorStop(0, '#fbf5e2');
    disc.addColorStop(1, '#d9cfb3');
    ctx.fillStyle = disc;
    ellipse(ctx, x, y, r, r);
    // пятна на луне
    ctx.fillStyle = 'rgba(160,150,125,.25)';
    ellipse(ctx, x + r * 0.25, y - r * 0.15, r * 0.22, r * 0.18);
    ellipse(ctx, x - r * 0.3, y + r * 0.3, r * 0.16, r * 0.13);
    ellipse(ctx, x + r * 0.05, y + r * 0.45, r * 0.1, r * 0.08);
    ctx.restore();
  }

  class Stars {
    constructor(count, seed = 11) {
      this.seed = seed;
      this.rand = rng(seed);
      this.list = [];
      this.setCount(count);
    }
    setCount(n) {
      n = Math.max(0, Math.round(n));
      while (this.list.length < n) {
        const r = this.rand;
        const big = r() < 0.08;
        this.list.push({
          x: r(), y: Math.pow(r(), 1.6) * 0.82,
          r: big ? 1.1 + r() * 1.1 : 0.35 + r() * 0.75,
          ph: r() * TAU, sp: 0.6 + r() * 2.2,
          warm: r() < 0.25,
        });
      }
      this.list.length = n;
    }
    draw(ctx, w, h, t, alpha = 1) {
      if (alpha <= 0) return;
      for (const s of this.list) {
        const a = alpha * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = s.warm ? '#ffe9c2' : '#e6eeff';
        const x = s.x * w, y = s.y * h;
        if (s.r < 0.9) {
          ctx.fillRect(x, y, s.r * 1.6, s.r * 1.6);
        } else {
          ellipse(ctx, x, y, s.r, s.r);
          ctx.globalAlpha = a * 0.25;
          ellipse(ctx, x, y, s.r * 3, s.r * 3);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- туман ---------- */

  // Туман — это много больших мягких пятен, которые медленно плывут.
  // Пятна живут на отдельном холсте, и в нём можно «протереть» дыру,
  // как ладонью на запотевшем стекле.
  class FogField {
    constructor(count, seed = 3, quality = 0.5) {
      this.rand = rng(seed);
      this.quality = quality;
      this.canvas = makeCanvas(2, 2);
      this.ctx = this.canvas.getContext('2d');
      this.puffs = [];
      this.trail = [];
      this.w = 1; this.h = 1;
      this.offset = 0;     // насколько туман сдвинут, пока Ёжик идёт
      this.setCount(count);
    }

    // Где пятно на экране. Туман бесконечный: что уплыло влево, появляется справа.
    _x(p) {
      const span = this.w * 1.7;
      let x = (p.hx * this.w - this.offset) % span;
      if (x < 0) x += span;
      return x - this.w * 0.35 + p.dx;
    }

    setCount(n) {
      n = Math.max(0, Math.round(n));
      while (this.puffs.length < n) {
        const r = this.rand;
        this.puffs.push({
          hx: r() * 1.6 - 0.3, hy: 0.08 + r() * 1.0,
          s: r(), a: 0.22 + r() * 0.34,
          speed: 0.5 + r(), ph: r() * TAU,
          dx: 0, dy: 0, vx: 0, vy: 0,
        });
      }
      this.puffs.length = n;
    }

    resize(w, h) {
      this.w = w; this.h = h;
      this.canvas.width = Math.max(2, Math.round(w * this.quality));
      this.canvas.height = Math.max(2, Math.round(h * this.quality));
    }

    // След от руки: туман в этом месте расступается и медленно возвращается.
    touch(x, y, strength = 1) {
      const last = this.trail[this.trail.length - 1];
      if (last && Math.hypot(last.x - x, last.y - y) < 14) return;
      this.trail.push({ x, y, age: 0, k: strength });
      if (this.trail.length > 80) this.trail.shift();
    }

    update(dt, ptr, wind = 1) {
      const { w, h } = this;
      const R = Math.max(130, Math.min(w, h) * 0.26);
      for (const p of this.puffs) {
        p.hx += wind * p.speed * 0.011 * dt;
        if (p.hx > 1.35) p.hx -= 1.7;
        if (p.hx < -0.35) p.hx += 1.7;
        const x = this._x(p);
        const y = p.hy * h + p.dy;
        if (ptr && ptr.active) {
          const ex = x - ptr.x;
          const ey = (y - ptr.y) * 1.5;
          const d = Math.hypot(ex, ey) || 1;
          if (d < R) {
            const k = 1 - d / R;
            const f = k * k * 2200;
            p.vx += ((ex / d) * f + ptr.vx * k * 1.6) * dt;
            p.vy += ((ey / d) * f * 0.45 + ptr.vy * k * 0.8) * dt;
          }
        }
        p.vx -= p.dx * 1.1 * dt;
        p.vy -= p.dy * 1.1 * dt;
        const damp = Math.exp(-2.4 * dt);
        p.vx *= damp; p.vy *= damp;
        p.dx += p.vx * dt; p.dy += p.vy * dt;
      }
      for (const tr of this.trail) tr.age += dt;
      while (this.trail.length && this.trail[0].age > 3.2) this.trail.shift();
    }

    render(density, spread = 1, t = 0) {
      const { ctx, w, h } = this;
      const q = this.quality;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (density <= 0.001) return this.canvas;
      ctx.setTransform(q, 0, 0, q, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      const top = 1 - spread;
      for (const p of this.puffs) {
        const vis = smooth(top - 0.18, top + 0.12, p.hy);
        const a = p.a * density * vis;
        if (a < 0.004) continue;
        const ph = h * (0.15 + 0.22 * p.s);
        const pw = ph * (2.3 + p.s * 1.2);
        const x = this._x(p);
        const y = p.hy * h + p.dy + Math.sin(t * 0.4 + p.ph) * ph * 0.06;
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(PUFF, x - pw / 2, y - ph / 2, pw, ph);
      }
      // «протираем» туман там, где прошла рука
      if (this.trail.length) {
        ctx.globalCompositeOperation = 'destination-out';
        const R = Math.max(110, Math.min(w, h) * 0.17);
        for (const tr of this.trail) {
          const life = 1 - tr.age / 3.2;
          const grow = 1 + tr.age * 0.35;
          ctx.globalAlpha = clamp(life * life * 0.85 * tr.k, 0, 1);
          const r = R * grow;
          ctx.drawImage(HOLE, tr.x - r, tr.y - r * 0.8, r * 2, r * 1.6);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      return this.canvas;
    }
  }

  /* ---------- светлячки ---------- */

  class Fireflies {
    constructor(count, seed = 5) {
      this.rand = rng(seed);
      this.list = [];
      this.w = 1; this.h = 1;
      this.setCount(count);
    }
    setCount(n) {
      n = clamp(Math.round(n), 0, 2000);
      while (this.list.length < n) {
        const r = this.rand;
        this.list.push({
          x: r(), y: 0.45 + r() * 0.5, a: r() * TAU,
          sp: 0.02 + r() * 0.03, ph: r() * TAU, f: 0.8 + r() * 1.8,
          s: 0.6 + r() * 0.8,
        });
      }
      this.list.length = n;
    }
    update(dt, w, h, ptr) {
      this.w = w; this.h = h;
      const r = this.rand;
      for (const f of this.list) {
        f.a += (r() - 0.5) * 4 * dt;
        f.x += Math.cos(f.a) * f.sp * dt * (h / w);
        f.y += Math.sin(f.a) * f.sp * dt * 0.6;
        if (ptr && ptr.active) {
          const dx = ptr.x / w - f.x, dy = ptr.y / h - f.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.25 && d > 0.02) {
            f.x += dx * 0.35 * dt;
            f.y += dy * 0.35 * dt;
          }
        }
        if (f.x < -0.05) f.x = 1.05;
        if (f.x > 1.05) f.x = -0.05;
        if (f.y < 0.35) f.a = Math.abs(f.a);
        if (f.y > 0.98) f.a = -Math.abs(f.a);
      }
    }
    draw(ctx, t, alpha = 1, scale = 1) {
      if (alpha <= 0) return;
      const { w, h } = this;
      for (const f of this.list) {
        const blink = Math.max(0, Math.sin(t * f.f + f.ph));
        const a = alpha * (0.15 + 0.85 * blink * blink);
        if (a < 0.03) continue;
        const size = 34 * f.s * scale;
        ctx.globalAlpha = a;
        ctx.drawImage(GLOW, f.x * w - size / 2, f.y * h - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Ёжик ---------- */

  // Ёжик смотрит вправо. Точка (x, y) — середина его тела,
  // s — масштаб (1 = примерно 170 пикселей от хвоста до носа).
  function drawHedgehog(ctx, x, y, s, o = {}) {
    const needles = clamp(Math.round(o.needles ?? 72), 0, 3000);
    const L = o.needleLen ?? 34;
    const t = o.t ?? 0;
    const sil = o.silhouette;              // если задан цвет — рисуем только силуэт
    const blink = o.blink ?? 1;            // 1 — глаз открыт, 0 — закрыт
    const rand = rng(o.seed ?? 7);
    const breath = 1 + Math.sin(t * 1.7) * 0.014;
    const move = clamp(o.move ?? 0, 0, 1);   // 0 — стоит, 1 — идёт
    const ph = o.walk ?? 0;                  // фаза шага
    const boil = o.boil ?? 0;                // «дрожание» линий, как в рисованном кино
    const bob = -Math.abs(Math.sin(ph)) * 4 * move;

    ctx.save();
    ctx.translate(x, y + bob * s);
    ctx.scale((o.turn ?? (o.flip ? -1 : 1)) * s, s);
    ctx.globalAlpha *= o.alpha ?? 1;

    const C = (c) => sil || c;

    // тень и лапки
    if (!sil) {
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ellipse(ctx, 0, 50, 74, 7);
    }
    // лапки: дальние темнее и шагают в противофазе
    const leg = (lx, ly, phase, color) => {
      const dx = Math.sin(phase) * 9 * move;
      const lift = Math.max(0, Math.cos(phase)) * 5 * move;
      ctx.fillStyle = C(color);
      ellipse(ctx, lx + dx, ly - lift - bob, 10, 8);
    };
    leg(-22, 40, ph + Math.PI, '#241d18');
    leg(28, 42, ph, '#241d18');
    leg(-32, 42, ph, '#3a2f28');
    leg(18, 44, ph + Math.PI, '#3a2f28');

    // тело
    ctx.fillStyle = C('#6b5b4e');
    ellipse(ctx, -8, 6, 58 * breath, 40 * breath);

    // иголки: три ряда, от тёмных длинных к светлым коротким.
    // Это обычный цикл for — один шаг, одна иголка.
    const rows = [
      { k: 0.92, len: 1.0, w: 2.6, c: '#241e1a' },
      { k: 0.8, len: 0.86, w: 2.1, c: '#463a32' },
      { k: 0.66, len: 0.66, w: 1.6, c: '#8d7c6c' },
    ];
    ctx.lineCap = 'round';
    rows.forEach((row, ri) => {
      ctx.strokeStyle = C(row.c);
      ctx.lineWidth = row.w * (needles > 400 ? 0.6 : 1);
      ctx.beginPath();
      for (let i = 0; i < needles; i++) {
        const u = (i + rand() * 0.7) / Math.max(1, needles);
        const a = Math.PI * 0.9 + u * Math.PI * 0.98;
        const bx = -8 + Math.cos(a) * 56 * row.k * breath;
        const by = 6 + Math.sin(a) * 38 * row.k * breath;
        const bj = boil ? hash(i * 7.3 + ri * 131 + boil * 977) - 0.5 : 0;
        const dir = a - 0.42 + (rand() - 0.5) * 0.35 + bj * 0.09;
        const taper = u > 0.82 ? 1 - (u - 0.82) * 3.2 : 1;
        const len = L * row.len * (0.72 + rand() * 0.5) * taper * (1 + bj * 0.07);
        const sway = Math.sin(t * 2 + i * 0.3) * 0.03 + Math.sin(ph * 2 + i) * 0.05 * move;
        const tx = bx + Math.cos(dir + sway) * len;
        const ty = by + Math.sin(dir + sway) * len;
        const cx = bx + Math.cos(dir) * len * 0.5 - Math.sin(dir) * 3;
        const cy = by + Math.sin(dir) * len * 0.5 + Math.cos(dir) * 3;
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(cx, cy, tx, ty);
      }
      ctx.stroke();
    });

    // мордочка
    ctx.fillStyle = C('#b8a48e');
    ctx.beginPath();
    ctx.moveTo(26, -26);
    ctx.quadraticCurveTo(62, -22, 92, 7);
    ctx.quadraticCurveTo(97, 14, 88, 18);
    ctx.quadraticCurveTo(60, 34, 30, 34);
    ctx.quadraticCurveTo(10, 4, 26, -26);
    ctx.fill();

    if (!sil) {
      // светлая щёчка
      ctx.fillStyle = 'rgba(232,218,196,.45)';
      ellipse(ctx, 48, 16, 18, 10, -0.2);
      // ушко
      ctx.fillStyle = '#5a4a3f';
      ellipse(ctx, 30, -22, 6, 7, -0.4);
      // нос
      ctx.fillStyle = '#16110e';
      ellipse(ctx, 91, 11, 5.6, 5);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ellipse(ctx, 89.5, 9, 1.6, 1.2);
      // глаз — большой и немного удивлённый
      const ey = Math.max(0.08, blink);
      ctx.fillStyle = '#f4efe6';
      ellipse(ctx, 54, -2, 9.5, 11 * ey);
      if (blink > 0.3) {
        ctx.fillStyle = '#1b1512';
        ellipse(ctx, 57 + (o.look ?? 0) * 2, 0, 5.4, 6 * ey);
        ctx.fillStyle = '#fff';
        ellipse(ctx, 59, -3 * ey, 1.8, 1.8 * ey);
      }
      ctx.strokeStyle = 'rgba(40,30,25,.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(54, -2, 9.5, 11 * ey, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      // усы
      ctx.strokeStyle = 'rgba(30,22,18,.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(84, 14); ctx.quadraticCurveTo(96, 22, 104, 22);
      ctx.moveTo(84, 12); ctx.quadraticCurveTo(98, 12, 106, 8);
      ctx.stroke();
    }

    // узелок с малиновым вареньем
    if (o.bundle !== false) {
      ctx.fillStyle = C('#ece6dc');
      ellipse(ctx, 50, 38, 15, 13);
      ctx.beginPath();
      ctx.moveTo(44, 27); ctx.lineTo(41, 17); ctx.lineTo(50, 25);
      ctx.lineTo(57, 16); ctx.lineTo(56, 27);
      ctx.fill();
      if (!sil) {
        ctx.fillStyle = '#c04466';
        const dots = [[44, 34], [53, 31], [57, 41], [47, 44], [51, 38]];
        for (const [dx, dy] of dots) ellipse(ctx, dx, dy, 1.8, 1.8);
        // лапка держит узелок
        ctx.fillStyle = '#5c4c40';
        ellipse(ctx, 36, 34, 7, 6, 0.4);
      }
    }

    ctx.restore();
  }

  /* ---------- Медвежонок ---------- */

  // Медвежонок смотрит влево. rim — насколько он освещён костром слева.
  function drawBear(ctx, x, y, s, color = '#33251c', rim = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const body = new Path2D();
    const add = (cx, cy, rx, ry) => { body.moveTo(cx + rx, cy); body.ellipse(cx, cy, rx, ry, 0, 0, TAU); };
    add(0, -58, 50, 60);       // тело
    add(-6, -138, 36, 33);     // голова
    add(-32, -164, 11, 11);    // уши
    add(18, -167, 11, 11);
    add(-40, -126, 17, 12);    // морда
    add(-34, -4, 20, 9);       // лапы
    add(28, -4, 20, 9);
    ctx.fillStyle = color;
    ctx.fill(body);
    if (rim > 0) {
      const light = ctx.createRadialGradient(-150, -20, 10, -150, -20, 210);
      light.addColorStop(0, `rgba(255,170,90,${0.55 * rim})`);
      light.addColorStop(0.6, `rgba(220,120,60,${0.22 * rim})`);
      light.addColorStop(1, 'rgba(200,100,50,0)');
      ctx.fillStyle = light;
      ctx.fill(body);
      ctx.globalAlpha *= rim;
      ctx.fillStyle = '#120c08';
      ellipse(ctx, -55, -128, 4, 3.4);     // нос
      ellipse(ctx, -24, -146, 3, 3.4);     // глаз
      ctx.fillStyle = 'rgba(255,200,140,.7)';
      ellipse(ctx, -25, -147.5, 1, 1);
    }
    ctx.restore();
  }

  /* ---------- Лошадь ---------- */

  // Лошадь рисуется один раз, а потом «размывается»: мы уменьшаем её
  // до крошечного размера и растягиваем обратно. Так получается туман.
  function makeHorse() {
    const c = makeCanvas(400, 400);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    ellipse(g, 215, 200, 95, 46);                       // туловище
    g.beginPath();                                      // шея
    g.moveTo(132, 205); g.quadraticCurveTo(108, 140, 118, 92);
    g.lineTo(150, 78); g.quadraticCurveTo(160, 150, 196, 172);
    g.fill();
    ellipse(g, 100, 112, 42, 19, 2.25);                 // голова
    g.beginPath();                                      // ухо
    g.moveTo(128, 72); g.lineTo(136, 46); g.lineTo(146, 74); g.fill();
    g.lineWidth = 15;                                   // ноги
    for (const [x0, x1] of [[150, 146], [176, 182], [262, 256], [288, 298]]) {
      g.beginPath(); g.moveTo(x0, 220); g.lineTo(x1, 340); g.stroke();
    }
    g.lineWidth = 13;                                   // хвост
    g.beginPath(); g.moveTo(304, 182);
    g.quadraticCurveTo(342, 226, 322, 304); g.stroke();
    g.lineWidth = 9;                                    // грива
    g.beginPath(); g.moveTo(150, 84); g.quadraticCurveTo(170, 130, 196, 160); g.stroke();

    // низ лошади тонет в тумане
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 160, 0, 320);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.45, 'rgba(0,0,0,.5)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 400, 400);
    return { sharp: c, soft: blurCopy(c, 7), haze: blurCopy(c, 18) };
  }

  // Размытие без фильтров: рисуем картинку много раз со сдвигом по кругу.
  function blurCopy(src, r) {
    const c = makeCanvas(src.width, src.height);
    const g = c.getContext('2d');
    // если браузер умеет настоящее размытие — берём его
    g.filter = `blur(${r}px)`;
    if (g.filter === `blur(${r}px)`) {
      g.drawImage(src, 0, 0);
      g.filter = 'none';
      return c;
    }
    const rings = [[r * 0.45, 8], [r, 14]];
    g.globalAlpha = 0.11;
    for (const [rad, n] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        g.drawImage(src, Math.cos(a) * rad, Math.sin(a) * rad);
      }
    }
    g.globalAlpha = 0.25;
    g.drawImage(src, 0, 0);
    return c;
  }
  let HORSE = null;

  function drawHorse(ctx, x, y, size, alpha, t = 0) {
    if (alpha <= 0.01) return;
    HORSE = HORSE || makeHorse();
    const bob = Math.sin(t * 0.6) * size * 0.006;
    const breathe = 1 + Math.sin(t * 0.9) * 0.004;
    const sz = size * breathe;
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.drawImage(HORSE.haze, x - sz * 0.53, y - sz * 0.53 + bob, sz * 1.06, sz * 1.06);
    ctx.globalAlpha = alpha * 0.6;
    ctx.drawImage(HORSE.soft, x - sz / 2, y - sz / 2 + bob, sz, sz);
    ctx.globalAlpha = alpha * 0.08;
    ctx.drawImage(HORSE.sharp, x - sz / 2, y - sz / 2 + bob, sz, sz);
    ctx.restore();
  }

  /* ---------- Филин ---------- */

  function drawOwl(ctx, x, y, s, alpha, t = 0) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);
    // ветка
    ctx.strokeStyle = '#0c111e';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-400, 46); ctx.quadraticCurveTo(-80, 30, 60, 48);
    ctx.moveTo(-10, 44); ctx.lineTo(30, 20);
    ctx.stroke();
    // тело
    ctx.fillStyle = '#121828';
    ellipse(ctx, 0, 0, 26, 38);
    ctx.beginPath();
    ctx.moveTo(-22, -22); ctx.lineTo(-20, -48); ctx.lineTo(-6, -32);
    ctx.lineTo(6, -32); ctx.lineTo(20, -48); ctx.lineTo(22, -22);
    ctx.fill();
    // глаза моргают раз в несколько секунд
    const cyc = (t % 5.3) / 5.3;
    const open = cyc > 0.96 ? 0.1 : 1;
    for (const ex of [-10, 10]) {
      ctx.globalAlpha = alpha * 0.5;
      ctx.drawImage(GLOW, ex - 18, -32, 36, 36);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#f0b44c';
      ellipse(ctx, ex, -14, 7, 7 * open);
      ctx.fillStyle = '#140d06';
      ellipse(ctx, ex, -14, 3, 3.4 * open);
    }
    ctx.restore();
  }

  /* ---------- земля и трава ---------- */

  // Холм с травой. Возвращает картинку и функцию «высота земли в точке x».
  function makeGround(w, h, seed = 21, color = '#080c17') {
    const rand = rng(seed);
    const base = h * 0.86;
    const yAt = (x) => base
      + Math.sin(x / w * 3.1 + 0.6) * h * 0.035
      + Math.sin(x / w * 7.3 + 2.1) * h * 0.012;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, yAt(x));
    g.lineTo(w, h);
    g.fill();
    g.strokeStyle = color;
    g.lineCap = 'round';
    for (let x = 0; x < w; x += 2.5) {
      const y = yAt(x) + 3;
      const len = 5 + Math.pow(rand(), 2.2) * 26;
      const lean = (rand() - 0.5) * 10;
      g.lineWidth = 0.8 + rand() * 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + lean * 0.3, y - len * 0.6, x + lean, y - len);
      g.stroke();
    }
    // несколько высоких зонтиков — как в мультфильме
    for (let i = 0; i < Math.max(3, w / 220); i++) {
      const x = rand() * w;
      const y = yAt(x);
      const tall = h * (0.06 + rand() * 0.08);
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 4, y - tall * 0.5, x + 2, y - tall);
      g.stroke();
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + (k - 4) * 0.28;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x + 2, y - tall);
        g.lineTo(x + 2 + Math.cos(a) * 16, y - tall + Math.sin(a) * 10 + 6);
        g.stroke();
      }
    }
    return { canvas: c, yAt };
  }

  /* ---------- деревья (рекурсия!) ---------- */

  // Ветка рисует себя и две ветки поменьше. Те — ещё по две.
  // Функция, которая вызывает саму себя, называется рекурсией.
  function branch(g, x, y, len, ang, depth, rand) {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    g.lineWidth = Math.max(0.6, depth * 1.4);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth <= 0) return;
    const spread = 0.35 + rand() * 0.25;
    branch(g, x2, y2, len * (0.68 + rand() * 0.1), ang - spread, depth - 1, rand);
    branch(g, x2, y2, len * (0.68 + rand() * 0.1), ang + spread, depth - 1, rand);
  }

  function drawForest(g, w, h, seed = 9, color = '#0d1626') {
    const rand = rng(seed);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';
    // дальняя линия леса
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const y = h * 0.62 - Math.abs(Math.sin(x * 0.05)) * h * 0.05 - rand() * h * 0.03;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.fill();
    // ели
    for (let i = 0; i < 9; i++) {
      const x = rand() * w;
      const th = h * (0.25 + rand() * 0.2);
      const by = h * 0.68;
      for (let k = 0; k < 6; k++) {
        const yy = by - th * (k / 6);
        const ww = th * 0.28 * (1 - k / 7);
        g.beginPath();
        g.moveTo(x - ww, yy);
        g.lineTo(x, yy - th * 0.24);
        g.lineTo(x + ww, yy);
        g.fill();
      }
    }
    // два больших дерева-рекурсии
    branch(g, w * 0.14, h, h * 0.22, -Math.PI / 2, 8, rand);
    branch(g, w * 0.86, h, h * 0.2, -Math.PI / 2 - 0.05, 8, rand);
  }


  /* ---------- лес и дорога для прогулки ---------- */

  // Ёлка из треугольников. Чем дальше ёлка, тем она светлее — так работает туман.
  function drawFir(ctx, x, baseY, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - h * 0.02, baseY - h * 0.2, h * 0.04, h * 0.2);
    for (let k = 0; k < 7; k++) {
      const yy = baseY - h * 0.12 - (h * 0.85) * (k / 7);
      const ww = h * 0.26 * (1 - k / 8);
      ctx.beginPath();
      ctx.moveTo(x - ww, yy);
      ctx.lineTo(x, yy - h * 0.22);
      ctx.lineTo(x + ww, yy);
      ctx.fill();
    }
  }

  // Высокий «зонтик» — сныть или борщевик. Такие стоят в тумане в мультфильме.
  function drawUmbrella(ctx, x, baseY, h, color, lw = 1.4, sway = 0) {
    const tx = x + sway * h * 0.08, ty = baseY - h;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + h * 0.03, baseY - h * 0.5, tx, ty);
    for (let k = 0; k < 11; k++) {
      const a = -Math.PI / 2 + (k - 5) * 0.26;
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + Math.cos(a) * h * 0.16, ty + Math.sin(a) * h * 0.07 + h * 0.05);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (let k = 0; k < 11; k++) {
      const a = -Math.PI / 2 + (k - 5) * 0.26;
      ellipse(ctx, tx + Math.cos(a) * h * 0.16, ty + Math.sin(a) * h * 0.07 + h * 0.05, lw * 1.6, lw * 1.6);
    }
  }

  // Огромный ствол дерева. Проплывает перед камерой, ближе всего к зрителю.
  function drawTrunk(ctx, x, w, h, color, seed = 3) {
    const r = rng(seed);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, h);
    for (let y = h; y >= -20; y -= 30) {
      ctx.lineTo(x - w * 0.5 + (r() - 0.5) * w * 0.06 - Math.max(0, (y - h * 0.8)) * 0.4, y);
    }
    ctx.lineTo(x + w * 0.5, -20);
    for (let y = -20; y <= h; y += 30) {
      ctx.lineTo(x + w * 0.5 + (r() - 0.5) * w * 0.06 + Math.max(0, (y - h * 0.8)) * 0.4, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Большой лохматый пёс: силуэт из сотни коротких штрихов-шерстинок.
  function drawDog(ctx, x, y, s, color, t = 0, hasBundle = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-s, s);           // смотрит влево, на Ёжика
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ellipse(ctx, 0, -60, 80, 48);            // туловище
    ellipse(ctx, 78, -110, 38, 34);          // голова
    ellipse(ctx, 108, -98, 26, 16);          // морда
    ellipse(ctx, 60, -104, 13, 30, 0.35);    // ухо висит
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    for (const [lx, d] of [[-55, 0], [-30, 1], [40, 0], [62, 1]]) {
      ctx.beginPath();
      ctx.moveTo(lx, -40);
      ctx.lineTo(lx + Math.sin(t * 2 + d) * 2, 0);
      ctx.stroke();
    }
    // шерсть свисает вниз лохмами
    ctx.lineWidth = 3;
    ctx.beginPath();
    const fur = rng(17);
    for (let i = 0; i < 140; i++) {
      const a = fur() * TAU;
      const head = i >= 100;
      const cx = head ? 78 + Math.cos(a) * 36 : Math.cos(a) * 78;
      const cy = head ? -110 + Math.sin(a) * 32 : -60 + Math.sin(a) * 46;
      if (Math.sin(a) < -0.6 && !head) continue;
      const len = (head ? 7 : 10) + fur() * 12;
      const out = 0.35;
      const dx = Math.cos(a) * out, dy = 1 - out + Math.max(0, Math.sin(a)) * out;
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + dx * len * 0.6 + 2, cy + dy * len * 0.5, cx + dx * len, cy + dy * len);
    }
    ctx.stroke();
    // хвост виляет
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-76, -78);
    ctx.quadraticCurveTo(-110, -100 + Math.sin(t * 9) * 14, -118, -130 + Math.sin(t * 9) * 20);
    ctx.stroke();
    if (hasBundle) {
      ctx.strokeStyle = '#b9b2a4';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(126, -96); ctx.lineTo(130, -84); ctx.stroke();
      ctx.fillStyle = '#d8d2c6';
      ellipse(ctx, 131, -74, 13, 11);
      ctx.fillStyle = '#b04060';
      ellipse(ctx, 127, -74, 1.8, 1.8);
      ellipse(ctx, 135, -71, 1.8, 1.8);
    }
    // глаз блестит
    ctx.fillStyle = 'rgba(255,230,190,.7)';
    ellipse(ctx, 92, -116, 2.5, 2.5);
    ctx.restore();
  }

  // Кто-то большой под водой. Видна только тень и один блик.
  function drawDeepOne(ctx, x, y, s, alpha, t = 0) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 170);
    g.addColorStop(0, 'rgba(2,6,14,.85)');
    g.addColorStop(1, 'rgba(2,6,14,0)');
    ctx.fillStyle = g;
    ellipse(ctx, 0, 0, 190, 46);
    ctx.fillStyle = 'rgba(2,6,14,.6)';
    ctx.beginPath();          // хвост
    ctx.moveTo(150, 0);
    ctx.lineTo(220, -30 + Math.sin(t * 2) * 10);
    ctx.lineTo(214, 30 + Math.sin(t * 2) * 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,230,240,.5)';
    ellipse(ctx, -120, -8, 3, 2.5);
    ctx.restore();
  }

  return {
    TAU, rng, hash, clamp, lerp, smooth, makeCanvas, ellipse,
    drawFir, drawUmbrella, drawTrunk, drawDog, drawDeepOne,
    PUFF, GLOW, drawSky, drawMoon, Stars, FogField, Fireflies,
    drawHedgehog, drawBear, drawHorse, drawOwl, makeGround, drawForest, branch,
  };
})();
