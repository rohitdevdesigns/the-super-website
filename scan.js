/*
 * Bioluminescent specimen scan.
 * One procedural deep-sea creature floats inside <canvas class="scan" data-specimens="medusa,squid,...">.
 * Every HOLD seconds it dissolves into light particles that re-form as the next species,
 * while HUD annotation boxes track its anatomy.
 */
(() => {
  const canvases = document.querySelectorAll('canvas.scan');
  if (!canvases.length) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HUD_FONT = 'VT323, "DM Mono", monospace';
  const TAU = Math.PI * 2;
  const HOLD = 10;     // seconds each species is shown
  const MORPH = 2.8;   // seconds of particle transformation
  const PARTICLES = 1400;
  let nextId = 12080;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const pad = (n) => String(Math.max(0, Math.round(n))).padStart(3, '0');
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

  /* ---------------- drawing helpers ---------------- */

  function halo(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function dot(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function brackets(ctx, x, y, w, h, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s); ctx.lineTo(x, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x + w - s, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + s);
    ctx.moveTo(x + w, y + h - s); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - s, y + h);
    ctx.moveTo(x + s, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - s);
    ctx.stroke();
  }

  // draws a tapered limb as short segments; returns sampled points
  function limb(ctx, fn, segs, width, color) {
    ctx.lineCap = 'butt'; // round caps overlap under additive blending and look beaded
    let prev = fn(0);
    const pts = [prev];
    for (let s = 1; s <= segs; s++) {
      const k = s / segs, p = fn(k);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.lineWidth = width(k);
      ctx.strokeStyle = color(k);
      ctx.stroke();
      pts.push(p);
      prev = p;
    }
    ctx.lineCap = 'round';
    return pts;
  }

  function normalAt(pts, i) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  }

  /* ================================================================
   * SPECIES — each draws around its own origin in pixel units of r.
   * box = [x0, y0, x1, y1] extent in r units (used for framing + centering).
   * ================================================================ */

  class Medusa {
    constructor(r) {
      this.r = r; this.ph = rand(0, TAU);
      this.taxon = 'MEDUSOZOA';
      this.box = [-1.55, -1.75, 1.55, 2.65];
      this.tent = Array.from({ length: 24 }, (_, i) => ({ u: -0.97 + (1.94 * i) / 23, len: rand(2.3, 3.4), off: rand(0, TAU), w: rand(0.5, 1) }));
      this.arms = [-0.22, -0.075, 0.075, 0.22].map((u) => ({ u, len: rand(1.7, 2.3), off: rand(0, TAU) }));
      this.speck = Array.from({ length: 80 }, () => ({ u: rand(-1, 1), v: rand(0.05, 0.95), a: rand(0.08, 0.3) }));
      this.motes = Array.from({ length: 44 }, () => ({ u: rand(-1, 1), v: rand(0.1, 0.9), f: rand(0, TAU), s: rand(0.6, 1.5) }));
    }

    geo(t) {
      const p = Math.sin(t * 1.6 + this.ph), r = this.r;
      return { p, rx: r * (1 + 0.08 * p), ry: r * 0.78 * (1 - 0.08 * p), y0: -0.85 * r };
    }

    tentPt(tn, k, t, g) {
      const r = this.r;
      return {
        x: tn.u * g.rx * 0.96 + tn.u * k * r * 0.3 + Math.sin(t * 1.7 + tn.off + k * 3.2) * k * r * 0.3 + Math.sin(t * 0.5 + tn.off) * k * k * r * 0.25
          + Math.sin(k * 18 + t * 3 + tn.off) * k * k * r * 0.04, // fine coiling toward the tips
        y: g.y0 + r * 0.1 + k * tn.len * r * (1 - 0.06 * g.p),
      };
    }

    armPt(a, k, t, g) {
      const r = this.r;
      return { x: a.u * g.rx + Math.sin(t * 1.2 + a.off + k * 3.6) * k * r * 0.32, y: g.y0 + r * 0.08 + k * a.len * r };
    }

    bell(ctx, g, s) {
      const { rx, ry, y0 } = g, r = this.r, L = 16;
      ctx.beginPath();
      ctx.ellipse(0, y0, rx * s, ry * s, 0, Math.PI, 0);
      for (let i = 0; i < L; i++) {   // scalloped lappets along the margin
        const x1 = rx * s - (2 * rx * s * i) / L, x2 = rx * s - (2 * rx * s * (i + 1)) / L;
        ctx.quadraticCurveTo((x1 + x2) / 2, y0 + r * 0.12 * s, x2, y0);
      }
      ctx.closePath();
    }

    draw(ctx, t) {
      const r = this.r, g = this.geo(t), { rx, ry, y0 } = g;
      halo(ctx, 0, y0 - ry * 0.3, r * 2.6, 'rgba(110,130,255,0.16)');
      halo(ctx, 0, y0 - ry * 0.4, r * 1.1, 'rgba(190,205,255,0.08)');
      ctx.lineCap = 'round';

      // marginal tentacles beaded with nematocyst batteries
      for (const tn of this.tent) {
        const pts = [];
        ctx.beginPath();
        for (let s = 0; s <= 30; s++) {
          const p = this.tentPt(tn, s / 30, t, g);
          pts.push(p);
          s ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(170,195,255,${0.12 + 0.2 * tn.w})`;
        ctx.lineWidth = 0.6 + 0.5 * tn.w;
        ctx.stroke();
        for (let s = 2; s < 30; s += 3) dot(ctx, pts[s].x, pts[s].y, 0.9, `rgba(215,232,255,${0.5 * (1 - s / 30)})`);
        dot(ctx, pts[0].x, pts[0].y, 1.6, 'rgba(200,225,255,0.65)'); // tentacle bulb
      }

      // oral arms with frilled, lace-like edges
      for (const a of this.arms) {
        const pts = limb(ctx, (k) => this.armPt(a, k, t, g), 26,
          (k) => (1 - k) * r * 0.1 + 1,
          (k) => `rgba(${lerp(235, 150, k) | 0},${lerp(225, 140, k) | 0},255,${0.5 - k * 0.35})`);
        ctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const k = i / (pts.length - 1), p = pts[i], n = normalAt(pts, i);
          const w = ((1 - k) * r * 0.1 + 1) * 0.5;
          const f = (1 - k) * r * 0.13 * (0.55 + 0.45 * Math.sin(k * 38 + t * 3.5 + a.off));
          ctx.moveTo(p.x + n.x * w, p.y + n.y * w); ctx.lineTo(p.x + n.x * (w + f), p.y + n.y * (w + f) + f * 0.3);
          ctx.moveTo(p.x - n.x * w, p.y - n.y * w); ctx.lineTo(p.x - n.x * (w + f), p.y - n.y * (w + f) + f * 0.3);
        }
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(220,200,255,0.22)';
        ctx.stroke();
        // bright midrib
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = 'rgba(255,245,255,0.35)';
        ctx.stroke();
      }

      // velum: thin translucent shelf under the margin
      ctx.beginPath();
      ctx.ellipse(0, y0 + r * 0.06, rx * 0.9, r * 0.05, 0, 0, TAU);
      ctx.fillStyle = 'rgba(170,180,255,0.08)';
      ctx.fill();

      // manubrium
      ctx.beginPath();
      ctx.ellipse(0, y0 + r * 0.12, r * 0.09, r * 0.2, 0, 0, TAU);
      ctx.fillStyle = 'rgba(235,220,255,0.35)';
      ctx.fill();

      // exumbrella (outer bell)
      this.bell(ctx, g, 1);
      const gr = ctx.createRadialGradient(0, y0 - ry * 0.6, 0, 0, y0 - ry * 0.3, rx * 1.1);
      gr.addColorStop(0, 'rgba(240,244,255,0.68)');
      gr.addColorStop(0.35, 'rgba(185,200,255,0.4)');
      gr.addColorStop(0.75, 'rgba(120,110,255,0.2)');
      gr.addColorStop(1, 'rgba(90,70,255,0.1)');
      ctx.shadowColor = 'rgba(140,170,255,0.7)';
      ctx.shadowBlur = r * 0.35;
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(220,235,255,0.45)';
      ctx.stroke();

      // subumbrella (inner layer, gives translucent depth)
      this.bell(ctx, g, 0.8);
      ctx.fillStyle = 'rgba(120,130,255,0.12)';
      ctx.fill();

      // ring canal
      ctx.beginPath();
      ctx.ellipse(0, y0 + r * 0.02, rx * 0.96, r * 0.07, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.stroke();

      // radial canals
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const u = -0.875 + i * 0.25;
        ctx.moveTo(0, y0 - ry * 0.88);
        ctx.quadraticCurveTo(u * rx * 0.72, y0 - ry * 0.78, u * rx * 0.96, y0);
      }
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,0.26)';
      ctx.stroke();

      // four horseshoe gonads, seen side-on through the bell as soft glowing arches
      for (const u of [-0.42, -0.14, 0.14, 0.42]) {
        const cx = u * rx, cy = y0 - ry * (0.38 - Math.abs(u) * 0.2);
        const back = Math.abs(u) < 0.3 ? 0.6 : 1; // inner pair sits behind, dimmer
        halo(ctx, cx, cy, rx * 0.16, `rgba(255,140,230,${0.18 * back})`);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.11, ry * 0.09, u * 0.5, Math.PI * 1.05, Math.PI * 1.95);
        ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,140,230,${0.22 * back})`; ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,220,250,${0.45 * back})`; ctx.stroke();
      }
      // apex glow
      halo(ctx, 0, y0 - ry * 0.62, r * 0.55, 'rgba(225,235,255,0.22)');

      // mesoglea speckle
      for (const s of this.speck) {
        dot(ctx, s.u * rx * 0.92 * Math.sqrt(1 - s.v * s.v), y0 - s.v * ry * 0.92, 0.7, `rgba(230,240,255,${s.a})`);
      }

      // hairline striations across the exumbrella
      ctx.beginPath();
      for (let i = 0; i < 30; i++) {
        const u = -0.96 + (1.92 * i) / 29;
        ctx.moveTo(0, y0 - ry * 0.97);
        ctx.quadraticCurveTo(u * rx * 0.85, y0 - ry * 0.9, u * rx * 0.99, y0 - r * 0.01);
      }
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(220,230,255,0.1)';
      ctx.stroke();

      // iridescent rim: hue travels around the bell edge
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 48; i++) {
        const a0 = Math.PI + (i / 48) * Math.PI, a1 = Math.PI + ((i + 1) / 48) * Math.PI;
        const hue = (((200 + 90 * Math.sin(a0 * 4 + t * 1.2)) % 360) + 360) % 360;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * rx, y0 + Math.sin(a0) * ry);
        ctx.lineTo(Math.cos(a1) * rx, y0 + Math.sin(a1) * ry);
        ctx.strokeStyle = `hsla(${hue},90%,75%,0.4)`;
        ctx.stroke();
      }

      // drifting light motes inside the bell
      for (const m of this.motes) {
        const a = 0.15 + 0.6 * Math.max(0, Math.sin(t * 1.8 + m.f));
        dot(ctx, m.u * rx * 0.7 * Math.sqrt(1 - m.v * m.v), y0 - m.v * ry * 0.85 + Math.sin(t * 0.7 + m.f) * r * 0.03, m.s, `rgba(200,240,255,${a})`);
      }

      // rhopalia (sense organs) between lappets
      for (let i = 1; i < 8; i++) {
        const x = rx - (2 * rx * i * 2) / 16;
        const a = 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.5 + i));
        dot(ctx, x, y0 + r * 0.01, 1.8, `rgba(170,255,255,${a})`);
      }
    }

    anchors(t) {
      const r = this.r, g = this.geo(t), { rx, ry, y0 } = g;
      return [
        { x: 0, y: y0 - ry * 0.82, label: 'MESOGLEA' },
        { x: -0.14 * rx, y: y0 - ry * 0.415, label: 'GONAD' },
        { x: rx * 0.25, y: y0, label: 'RHOPALIUM' },
        { x: rx * 0.96, y: y0 + r * 0.02, label: 'RING-CANAL' },
        { x: -0.45 * rx, y: y0 - ry * 0.62, label: 'RADIAL-CANAL' },
        { x: 0, y: y0 + r * 0.22, label: 'MANUBRIUM' },
        { ...this.armPt(this.arms[0], 0.6, t, g), label: 'ORAL-ARM' },
        { ...this.tentPt(this.tent[4], 0.5, t, g), label: 'NEMATOCYST' },
        { ...this.tentPt(this.tent[19], 0.9, t, g), label: 'TENTACLE' },
        { x: -rx * 0.88, y: y0 + r * 0.05, label: 'LAPPET' },
      ];
    }
  }

  class Squid {
    constructor(r) {
      this.r = r; this.ph = rand(0, TAU);
      this.taxon = 'TEUTHIDA';
      this.box = [-1.15, -1.9, 1.15, 2.75];
      this.arms = Array.from({ length: 8 }, (_, i) => ({ u: -0.2 + (0.4 * i) / 7, len: rand(1.05, 1.45), off: rand(0, TAU) }));
      this.tents = [{ u: -0.07, len: 2.15, off: rand(0, TAU) }, { u: 0.07, len: 2.05, off: rand(0, TAU) }];
      this.chrom = Array.from({ length: 50 }, () => ({ u: rand(-0.85, 0.85), v: rand(0.08, 0.95), f: rand(0, TAU), s: rand(0.8, 2.6) }));
    }

    m(t) { return 1 + 0.06 * Math.sin(t * 1.4 + this.ph); }
    // mantle half-width; v = 0 at the tip, 1 at the collar
    hw(v, m) { return this.r * m * 0.47 * Math.sin(Math.PI * clamp01(v) * 0.8); }
    vy(v) { return -1.75 * this.r + v * 2 * this.r; }

    armPt(a, k, t) {
      const r = this.r;
      return { x: a.u * r * 1.1 + a.u * k * r * 0.6 + Math.sin(t * 2 + a.off + k * 3.4) * k * r * 0.2, y: r * 0.6 + k * a.len * r };
    }

    draw(ctx, t) {
      const r = this.r, m = this.m(t), flap = Math.sin(t * 2.6 + this.ph) * 0.1;
      halo(ctx, 0, -0.5 * r, 2.4 * r, 'rgba(90,200,255,0.14)');
      halo(ctx, 0, -0.7 * r, r, 'rgba(200,245,255,0.1)');
      ctx.lineCap = 'round';

      // buccal webbing between the arm bases
      ctx.beginPath();
      ctx.moveTo(-0.24 * r, 0.5 * r);
      for (const a of this.arms) { const p = this.armPt(a, 0.2, t); ctx.lineTo(p.x, p.y); }
      ctx.lineTo(0.24 * r, 0.5 * r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(150,210,255,0.1)';
      ctx.fill();

      // eight arms with paired sucker rows
      for (const a of this.arms) {
        const w = (k) => (1 - k) * r * 0.085 + 0.8;
        const pts = limb(ctx, (k) => this.armPt(a, k, t), 20, w, (k) => `rgba(170,230,255,${0.55 - 0.4 * k})`);
        for (let i = 1; i < pts.length - 2; i += 2) {
          const n = normalAt(pts, i), k = i / 20, off = w(k) * 0.32, rad = Math.max(0.5, w(k) * 0.17);
          dot(ctx, pts[i].x + n.x * off, pts[i].y + n.y * off, rad, 'rgba(230,250,255,0.35)');
          dot(ctx, pts[i].x - n.x * off, pts[i].y - n.y * off, rad, 'rgba(230,250,255,0.35)');
        }
        const tip = pts[pts.length - 1];
        dot(ctx, tip.x, tip.y, 1.6, `rgba(140,255,240,${0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + a.off))})`);
      }

      // two long feeding tentacles ending in sucker clubs
      for (const tn of this.tents) {
        const fn = (k) => this.armPt(tn, k, t);
        const pts = limb(ctx, fn, 32,
          (k) => (k > 0.8 ? r * 0.07 * Math.sin(((k - 0.8) / 0.2) * Math.PI) + 1.1 : 1.1),
          (k) => `rgba(170,230,255,${k > 0.8 ? 0.6 : 0.4})`);
        for (let i = 26; i < 32; i++) {
          const n = normalAt(pts, i);
          dot(ctx, pts[i].x + n.x * 2, pts[i].y + n.y * 2, 0.9, 'rgba(235,255,255,0.55)');
          dot(ctx, pts[i].x - n.x * 2, pts[i].y - n.y * 2, 0.9, 'rgba(235,255,255,0.55)');
        }
      }

      // fins with rays
      const f0 = { x: 0, y: -1.8 * r }, fc = { x: r * (0.8 + flap), y: -1.4 * r }, f1 = { x: 0.3 * r * m, y: -0.95 * r };
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.quadraticCurveTo(fc.x, fc.y, f1.x, f1.y);
      ctx.lineTo(-f1.x, f1.y);
      ctx.quadraticCurveTo(-fc.x, fc.y, f0.x, f0.y);
      ctx.fillStyle = 'rgba(110,190,255,0.2)';
      ctx.fill();
      // iridescent fin edge
      const fe = ctx.createLinearGradient(-fc.x, 0, fc.x, 0);
      const sh = t * 40;
      fe.addColorStop(0, `hsla(${(190 + sh) % 360},100%,75%,0.6)`);
      fe.addColorStop(0.5, `hsla(${(280 + sh) % 360},100%,80%,0.5)`);
      fe.addColorStop(1, `hsla(${(160 + sh) % 360},100%,75%,0.6)`);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = fe;
      ctx.stroke();
      ctx.beginPath();
      for (let j = 1; j < 8; j++) {
        const s = j / 8, q = (1 - s) * (1 - s), c = 2 * (1 - s) * s, e = s * s;
        const x = q * f0.x + c * fc.x + e * f1.x, y = q * f0.y + c * fc.y + e * f1.y;
        ctx.moveTo(-x, y); ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(190,240,255,0.15)';
      ctx.stroke();

      // mantle
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const v = i / 24; ctx.lineTo(this.hw(v, m), this.vy(v)); }
      for (let i = 24; i >= 0; i--) { const v = i / 24; ctx.lineTo(-this.hw(v, m), this.vy(v)); }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -1.75 * r, 0, 0.25 * r);
      g.addColorStop(0, 'rgba(150,220,255,0.22)');
      g.addColorStop(0.5, 'rgba(200,235,255,0.36)');
      g.addColorStop(1, 'rgba(110,160,255,0.28)');
      ctx.shadowColor = 'rgba(110,210,255,0.7)';
      ctx.shadowBlur = r * 0.3;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(220,250,255,0.5)';
      ctx.stroke();

      // fine reticulated mesh across the mantle skin
      ctx.beginPath();
      for (let u = -0.8; u <= 0.81; u += 0.2) {
        for (let i = 1; i <= 24; i++) {
          const v = i / 24;
          i === 1 ? ctx.moveTo(u * this.hw(v, m), this.vy(v)) : ctx.lineTo(u * this.hw(v, m), this.vy(v));
        }
      }
      for (let v = 0.08; v < 0.99; v += 0.055) {
        const w = this.hw(v, m), y = this.vy(v);
        ctx.moveTo(-w, y);
        ctx.quadraticCurveTo(0, y + r * 0.05, w, y);
      }
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(210,245,255,0.08)';
      ctx.stroke();

      // iridophore stripes shimmering down the dorsal side
      for (const side of [-1, 1]) {
        for (let j = 0; j < 30; j++) {
          const v0 = 0.06 + j * 0.03, v1 = v0 + 0.03;
          const hue = 170 + 60 * Math.sin(v0 * 7 - t * 2);
          ctx.beginPath();
          ctx.moveTo(side * this.hw(v0, m) * 0.28, this.vy(v0));
          ctx.lineTo(side * this.hw(v1, m) * 0.28, this.vy(v1));
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = `hsla(${hue},100%,72%,0.28)`;
          ctx.stroke();
        }
      }

      // gladius (internal pen)
      ctx.beginPath();
      ctx.moveTo(0, -1.72 * r); ctx.lineTo(0, 0.2 * r);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -0.8 * r, 0.06 * r, 0.8 * r, 0, 0, TAU);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();

      // pulsing chromatophores
      for (const c of this.chrom) {
        const rad = c.s * (0.5 + 0.7 * Math.max(0, Math.sin(t * 1.3 + c.f)));
        dot(ctx, c.u * this.hw(c.v, m) * 0.9, this.vy(c.v), rad, 'rgba(255,140,110,0.28)');
      }

      // ventral photophore rows, light travelling down the body
      for (const side of [-1, 1]) {
        for (let j = 0; j < 14; j++) {
          const v = 0.12 + j * 0.06;
          const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 3 - v * 9)) ** 2;
          dot(ctx, side * this.hw(v, m) * 0.62, this.vy(v), 1.3, `rgba(120,255,230,${a})`);
        }
      }

      // mantle collar
      ctx.beginPath();
      ctx.ellipse(0, 0.25 * r, 0.28 * r * m, 0.05 * r, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(220,250,255,0.35)'; ctx.stroke();

      // head
      ctx.beginPath();
      ctx.ellipse(0, 0.42 * r, 0.26 * r, 0.2 * r, 0, 0, TAU);
      const hg = ctx.createRadialGradient(0, 0.4 * r, 0, 0, 0.42 * r, 0.26 * r);
      hg.addColorStop(0, 'rgba(210,240,255,0.45)');
      hg.addColorStop(1, 'rgba(120,180,255,0.1)');
      ctx.fillStyle = hg; ctx.fill();

      // siphon
      ctx.beginPath();
      ctx.moveTo(-0.07 * r, 0.28 * r);
      ctx.quadraticCurveTo(0, 0.56 * r, 0.07 * r, 0.28 * r);
      ctx.strokeStyle = 'rgba(220,250,255,0.4)'; ctx.stroke();

      // eyes
      for (const side of [-1, 1]) {
        const ex = side * 0.23 * r, ey = 0.4 * r;
        halo(ctx, ex, ey, 0.18 * r, 'rgba(160,240,255,0.35)');
        ctx.beginPath(); ctx.arc(ex, ey, 0.085 * r, 0, TAU);
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(210,245,255,0.7)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 0.05 * r, 0, TAU);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,220,255,0.6)'; ctx.stroke();
        // iris striations
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          ctx.moveTo(ex + Math.cos(a) * 0.052 * r, ey + Math.sin(a) * 0.052 * r);
          ctx.lineTo(ex + Math.cos(a) * 0.08 * r, ey + Math.sin(a) * 0.08 * r);
        }
        ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(170,240,255,0.45)'; ctx.stroke();
        dot(ctx, ex, ey, 2.2, 'rgba(255,255,255,0.95)');
        dot(ctx, ex - 0.02 * r, ey - 0.025 * r, 1, 'rgba(255,255,255,1)');
      }
    }

    anchors(t) {
      const r = this.r, m = this.m(t), c = this.chrom[0];
      return [
        { x: 0.45 * r, y: -1.4 * r, label: 'FIN' },
        { x: this.hw(0.6, m) * 0.62, y: this.vy(0.6), label: 'PHOTOPHORE' },
        { x: c.u * this.hw(c.v, m) * 0.9, y: this.vy(c.v), label: 'CHROMATOPHORE' },
        { x: 0, y: -1.2 * r, label: 'GLADIUS' },
        { x: 0.28 * r, y: 0.25 * r, label: 'MANTLE-COLLAR' },
        { x: -0.23 * r, y: 0.4 * r, label: 'OCELLUS' },
        { x: 0, y: 0.5 * r, label: 'SIPHON' },
        { ...this.armPt(this.arms[6], 0.7, t), label: 'SUCKER' },
        { ...this.armPt(this.tents[0], 0.92, t), label: 'CLUB' },
        { ...this.armPt(this.arms[1], 1, t), label: 'ARM-TIP' },
      ];
    }
  }

  class Ctenophore {
    constructor(r) {
      this.r = r; this.ph = rand(0, TAU);
      this.taxon = 'CTENOPHORA';
      this.box = [-1.75, -1.55, 1.75, 2.95];
      this.tent = [-1, 1].map((side) => ({ side, off: rand(0, TAU) }));
      this.gut = Array.from({ length: 28 }, () => ({ u: rand(-1, 1), f: rand(0, 1), s: rand(0.6, 1.4) }));
    }

    geo(t) {
      const b = 1 + 0.035 * Math.sin(t * 1.1 + this.ph), r = this.r;
      return { rx: r * 0.62 * b, ry: r / b, cy: -0.45 * r };
    }

    tentPt(tn, k, t) {
      const r = this.r;
      // trail outward and down in a long, slowly waving arc (never crossing back under the body)
      return { x: tn.side * (r * 0.35 + Math.sin(k * 1.6) * r * 0.9 + Math.sin(t * 0.8 + tn.off + k * 5) * k * r * 0.22), y: -0.3 * r + k * r * 3.2 };
    }

    combPt(i, s, t, g) {
      const phi = (i / 8) * TAU + t * 0.25;
      return { x: Math.cos(phi) * g.rx * Math.sin(s * Math.PI) * 0.97, y: g.cy - g.ry * Math.cos(s * Math.PI), depth: Math.sin(phi) };
    }

    draw(ctx, t) {
      const r = this.r, g = this.geo(t), { rx, ry, cy } = g;
      halo(ctx, 0, cy, 2.4 * r, 'rgba(120,150,255,0.13)');
      ctx.lineCap = 'round';

      // tentacles fringed with tentillae
      for (const tn of this.tent) {
        ctx.beginPath();
        for (let s = 0; s <= 40; s++) { const p = this.tentPt(tn, s / 40, t); s ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(190,220,255,0.32)'; ctx.stroke();
        ctx.beginPath();
        const ends = [];
        for (let k = 0.12; k < 0.97; k += 0.035) {
          const p = this.tentPt(tn, k, t), len = r * 0.2 * (1 - k * 0.45), wob = Math.sin(t * 2.2 + k * 25 + tn.off);
          const e = { x: p.x + tn.side * len * (0.5 + 0.3 * wob), y: p.y + len * 0.8 };
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + tn.side * len * 0.6, p.y + len * 0.2, e.x, e.y);
          ends.push(e);
        }
        ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(200,225,255,0.18)'; ctx.stroke();
        for (const e of ends) dot(ctx, e.x, e.y, 0.8, 'rgba(220,240,255,0.45)'); // colloblast beads
      }

      // body
      ctx.beginPath();
      ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
      const bg = ctx.createRadialGradient(0, cy - ry * 0.3, 0, 0, cy, rx * 1.2);
      bg.addColorStop(0, 'rgba(190,210,255,0.16)');
      bg.addColorStop(1, 'rgba(110,120,255,0.04)');
      ctx.fillStyle = bg;
      ctx.shadowColor = 'rgba(150,180,255,0.6)';
      ctx.shadowBlur = r * 0.3;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(210,230,255,0.4)'; ctx.stroke();

      // inner shell
      ctx.beginPath();
      ctx.ellipse(0, cy, rx * 0.86, ry * 0.9, 0, 0, TAU);
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(200,220,255,0.12)'; ctx.stroke();

      // pharynx
      ctx.beginPath();
      ctx.ellipse(0, cy + ry * 0.15, rx * 0.26, ry * 0.62, 0, 0, TAU);
      ctx.fillStyle = 'rgba(210,180,255,0.1)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(220,200,255,0.22)'; ctx.stroke();

      // particles drifting up through the gut
      for (const m of this.gut) {
        const k = (t * 0.12 + m.f) % 1;
        const y = cy + ry * 0.72 - k * ry * 1.15;
        const x = m.u * rx * 0.2 * Math.sin(Math.PI * k) + Math.sin(t + m.f * 9) * rx * 0.03;
        dot(ctx, x, y, m.s, `rgba(235,215,255,${0.55 * Math.sin(Math.PI * k)})`);
      }

      // canals radiating from the statocyst to each comb row
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const p = this.combPt(i, 0.12, t, g);
        ctx.moveTo(0, cy - ry);
        ctx.quadraticCurveTo(p.x * 0.4, cy - ry * 0.98, p.x, p.y);
      }
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(200,225,255,0.18)'; ctx.stroke();

      // tentacle sheaths
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * rx * 0.48, cy + ry * 0.05, rx * 0.08, ry * 0.32, side * 0.15, 0, TAU);
        ctx.strokeStyle = 'rgba(200,225,255,0.28)'; ctx.stroke();
      }

      // eight comb rows: iridescent cilia plates beating in travelling waves
      for (let i = 0; i < 8; i++) {
        const dA = this.combPt(i, 0.5, t, g).depth > 0 ? 1 : 0.3;
        ctx.beginPath();
        for (let s = 0.1; s <= 0.9; s += 0.04) { const p = this.combPt(i, s, t, g); s === 0.1 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
        ctx.lineWidth = 1; ctx.strokeStyle = `rgba(200,220,255,${0.12 * dA})`; ctx.stroke();
        for (let j = 0; j < 22; j++) {
          const s = 0.12 + j * (0.76 / 21), p = this.combPt(i, s, t, g);
          const L = r * 0.07 * Math.sin(s * Math.PI);
          const beat = Math.max(0, Math.sin(s * 16 - t * 6 + i * 0.7));
          const a = (0.25 + 0.75 * beat * beat) * dA;
          const hue = (((s * 320 + i * 45 - t * 120) % 360) + 360) % 360;
          ctx.beginPath(); ctx.moveTo(p.x - L, p.y); ctx.lineTo(p.x + L, p.y);
          ctx.lineWidth = 2.2; ctx.strokeStyle = `hsla(${hue},100%,68%,${a})`; ctx.stroke();
          // light scattering off the beating cilia
          if (beat > 0.7 && dA === 1) halo(ctx, p.x, p.y, r * 0.09, `hsla(${hue},100%,70%,${0.35 * beat})`);
        }
      }

      // aboral statocyst with polar fields
      const sy = cy - ry;
      halo(ctx, 0, sy, r * 0.15, 'rgba(200,255,255,0.4)');
      dot(ctx, 0, sy + 2, 2.6, 'rgba(255,255,255,0.95)');
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(side * r * 0.08, sy + r * 0.04, r * 0.06, r * 0.02, side * 0.4, 0, TAU);
        ctx.strokeStyle = 'rgba(220,250,255,0.4)'; ctx.stroke();
      }

      // mouth
      ctx.beginPath();
      ctx.moveTo(-rx * 0.18, cy + ry * 0.97);
      ctx.quadraticCurveTo(0, cy + ry * 1.05, rx * 0.18, cy + ry * 0.97);
      ctx.strokeStyle = 'rgba(230,220,255,0.5)'; ctx.stroke();
    }

    anchors(t) {
      const r = this.r, g = this.geo(t), { rx, ry, cy } = g;
      let front = 0;
      for (let i = 1; i < 8; i++) if (this.combPt(i, 0.5, t, g).depth > this.combPt(front, 0.5, t, g).depth) front = i;
      return [
        { x: 0, y: cy - ry, label: 'STATOCYST' },
        { ...this.combPt(front, 0.35, t, g), label: 'CTENE-ROW' },
        { ...this.combPt((front + 2) % 8, 0.62, t, g), label: 'COMB-PLATE' },
        { x: 0, y: cy + ry * 0.2, label: 'PHARYNX' },
        { x: rx * 0.48, y: cy, label: 'TENTACLE-SHEATH' },
        { ...this.tentPt(this.tent[0], 0.55, t), label: 'TENTILLA' },
        { ...this.tentPt(this.tent[1], 0.85, t), label: 'TENTACLE' },
        { x: 0, y: cy + ry, label: 'MOUTH' },
        { x: -rx * 0.5, y: cy - ry * 0.4, label: 'MESOGLEA' },
      ];
    }
  }

  class Angler {
    constructor(r) {
      this.r = r; this.ph = rand(0, TAU);
      this.taxon = 'LOPHIIFORMES';
      this.box = [-1.65, -1.95, 1.85, 0.95];
      this.skin = [];
      while (this.skin.length < 26) {
        const x = rand(-0.75, 0.95), y = rand(-0.6, 0.6);
        if ((x - 0.1) ** 2 / 0.75 + y * y / 0.33 < 1) this.skin.push({ x, y, f: rand(0, TAU) });
      }
      this.dermal = [];
      while (this.dermal.length < 90) {
        const x = rand(-0.8, 1.0), y = rand(-0.7, 0.65);
        if ((x - 0.1) ** 2 / 0.8 + y * y / 0.36 < 1) this.dermal.push({ x, y });
      }
      this.bact = Array.from({ length: 26 }, () => ({ a: rand(0, TAU), s: rand(0.4, 1.4) * (Math.random() < 0.5 ? -1 : 1), d: rand(0, 1), f: rand(0, TAU) }));
    }

    rodPt(s, t) {
      const r = this.r, e = this.esca(t), sway = Math.sin(t * 1.3 + this.ph);
      const P = [{ x: -0.15 * r, y: -0.82 * r }, { x: -0.25 * r, y: -1.75 * r }, { x: -1.1 * r, y: (-1.95 + sway * 0.04) * r }, { x: e.x, y: e.y - 0.08 * r }];
      const q = 1 - s;
      return {
        x: q * q * q * P[0].x + 3 * q * q * s * P[1].x + 3 * q * s * s * P[2].x + s * s * s * P[3].x,
        y: q * q * q * P[0].y + 3 * q * q * s * P[1].y + 3 * q * s * s * P[2].y + s * s * s * P[3].y,
      };
    }

    esca(t) { return { x: -1.38 * this.r, y: (-1.45 + Math.sin(t * 0.9) * 0.06) * this.r }; }

    draw(ctx, t) {
      const r = this.r, sway = Math.sin(t * 1.3 + this.ph), e = this.esca(t);
      const glow = 0.75 + 0.25 * Math.sin(t * 2.3);
      const jaw = 0.04 * Math.sin(t * 0.6 + this.ph);

      // the lure lights the water and the fish's face
      halo(ctx, e.x, e.y, r * 1.7, `rgba(110,255,225,${0.2 * glow})`);
      ctx.lineCap = 'round';

      // caudal fin
      const tb = { x: 1.15 * r, y: 0.02 * r };
      const rays = [];
      for (let i = 0; i < 9; i++) {
        const a = -0.65 + (1.3 * i) / 8 + sway * 0.25;
        const len = 0.7 * r * (1 - 0.2 * Math.abs(i - 4) / 4);
        rays.push({ x: tb.x + Math.cos(a) * len, y: tb.y + Math.sin(a) * len });
      }
      ctx.beginPath(); ctx.moveTo(tb.x, tb.y);
      for (const p of rays) ctx.lineTo(p.x, p.y);
      ctx.closePath(); ctx.fillStyle = 'rgba(120,200,255,0.08)'; ctx.fill();
      ctx.beginPath();
      for (const p of rays) { ctx.moveTo(tb.x, tb.y); ctx.lineTo(p.x, p.y); }
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,220,255,0.38)'; ctx.stroke();
      // segmented ray joints
      for (const p of rays) for (const k of [0.33, 0.55, 0.75, 0.92]) dot(ctx, lerp(tb.x, p.x, k), lerp(tb.y, p.y, k), 0.8, 'rgba(200,235,255,0.4)');

      // body silhouette with rim light
      ctx.beginPath();
      ctx.moveTo(-1.0 * r, -0.3 * r);
      ctx.bezierCurveTo(-0.8 * r, -0.9 * r, 0.2 * r, -1.0 * r, 0.75 * r, -0.45 * r);
      ctx.quadraticCurveTo(1.05 * r, -0.2 * r, 1.15 * r, -0.05 * r);
      ctx.lineTo(1.15 * r, 0.1 * r);
      ctx.quadraticCurveTo(0.9 * r, 0.55 * r, 0.1 * r, 0.7 * r);
      ctx.bezierCurveTo(-0.5 * r, 0.72 * r, -1.0 * r, 0.55 * r, -1.12 * r, (0.25 + jaw) * r);
      ctx.lineTo(-0.55 * r, 0.02 * r);
      ctx.closePath();
      const bg = ctx.createRadialGradient(-0.9 * r, -0.9 * r, 0, -0.9 * r, -0.9 * r, 2.2 * r);
      bg.addColorStop(0, 'rgba(80,140,200,0.35)');
      bg.addColorStop(1, 'rgba(20,30,70,0.08)');
      ctx.fillStyle = bg; ctx.fill();
      ctx.shadowColor = 'rgba(120,220,255,0.8)';
      ctx.shadowBlur = r * 0.15;
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(170,220,255,0.55)'; ctx.stroke();
      ctx.shadowBlur = 0;

      // gill slit
      ctx.beginPath();
      ctx.moveTo(-0.1 * r, -0.35 * r);
      ctx.quadraticCurveTo(0.12 * r, 0, -0.05 * r, 0.3 * r);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,220,255,0.2)'; ctx.stroke();

      // needle teeth
      // dermal texture: fine papillae across the skin
      for (const d of this.dermal) dot(ctx, d.x * r, d.y * r, 0.55, 'rgba(170,210,255,0.16)');
      // faint wrinkles behind the jaw
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo((-0.5 + i * 0.07) * r, (0.15 + i * 0.03) * r);
        ctx.quadraticCurveTo((-0.35 + i * 0.07) * r, (0.32 + i * 0.03) * r, (-0.2 + i * 0.06) * r, (0.48 + i * 0.02) * r);
      }
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(170,220,255,0.14)'; ctx.stroke();

      const teeth = (from, to, n, dir, base, extra, alpha = 0.75) => {
        for (let i = 0; i <= n; i++) {
          const f = i / n, bx = lerp(from.x, to.x, f) * r, by = lerp(from.y, to.y, f) * r;
          const len = r * (base + extra * (1 - f) * (i % 2 ? 0.6 : 1));
          ctx.beginPath();
          ctx.moveTo(bx - 0.015 * r, by);
          ctx.quadraticCurveTo(bx + dir.x * len * 0.5, by + dir.y * len * 0.6, bx + dir.x * len, by + dir.y * len);
          ctx.lineTo(bx + 0.015 * r, by);
          ctx.fillStyle = `rgba(240,250,255,${alpha})`;
          ctx.fill();
        }
      };
      // inner row of smaller, depressible teeth first, then the main fangs
      teeth({ x: -0.94, y: -0.24 }, { x: -0.6, y: 0.0 }, 12, { x: -0.3, y: 0.95 }, 0.035, 0.05, 0.4);
      teeth({ x: -1.04, y: 0.2 + jaw }, { x: -0.6, y: 0.03 }, 11, { x: -0.25, y: -0.97 }, 0.04, 0.07, 0.4);
      teeth({ x: -1.0, y: -0.3 }, { x: -0.55, y: 0.02 }, 9, { x: -0.24, y: 0.97 }, 0.07, 0.12);
      teeth({ x: -1.12, y: 0.25 + jaw }, { x: -0.55, y: 0.02 }, 8, { x: -0.2, y: -0.98 }, 0.08, 0.2);

      // eye
      halo(ctx, -0.6 * r, -0.48 * r, 0.14 * r, 'rgba(160,240,255,0.35)');
      ctx.beginPath(); ctx.arc(-0.6 * r, -0.48 * r, 0.07 * r, 0, TAU);
      ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(210,245,255,0.7)'; ctx.stroke();
      dot(ctx, -0.6 * r, -0.48 * r, 1.8, 'rgba(255,255,255,0.95)');

      // dorsal spine fin
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const bx = (0.5 + i * 0.08) * r, by = (-0.62 + i * 0.05) * r, a = -1.2 + i * 0.12 + sway * 0.05;
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a) * 0.25 * r, by + Math.sin(a) * 0.25 * r);
      }
      ctx.strokeStyle = 'rgba(170,220,255,0.35)'; ctx.stroke();

      // pectoral fin
      const pb = { x: 0.05 * r, y: 0.2 * r }, pr = [];
      for (let i = 0; i < 7; i++) { const a = 0.35 + i * 0.15 + sway * 0.15; pr.push({ x: pb.x + Math.cos(a) * 0.5 * r, y: pb.y + Math.sin(a) * 0.5 * r }); }
      ctx.beginPath(); ctx.moveTo(pb.x, pb.y); for (const p of pr) ctx.lineTo(p.x, p.y); ctx.closePath();
      ctx.fillStyle = 'rgba(120,200,255,0.07)'; ctx.fill();
      ctx.beginPath(); for (const p of pr) { ctx.moveTo(pb.x, pb.y); ctx.lineTo(p.x, p.y); }
      ctx.strokeStyle = 'rgba(170,220,255,0.35)'; ctx.stroke();

      // lateral line, pulse travelling tail-ward
      for (let j = 0; j < 20; j++) {
        const s = j / 19, q = (1 - s) * (1 - s), c = 2 * (1 - s) * s, d = s * s;
        const x = (q * -0.45 + c * 0.3 + d * 1.08) * r, y = (q * -0.2 + c * -0.45 + d * -0.05) * r;
        const a = 0.2 + 0.8 * Math.max(0, Math.sin(t * 4 - j * 0.6)) ** 3;
        dot(ctx, x, y, 1.2, `rgba(130,255,230,${a})`);
      }

      // skin photophores
      for (const s of this.skin) dot(ctx, s.x * r, s.y * r, 0.9, `rgba(180,220,255,${0.12 + 0.2 * Math.max(0, Math.sin(t * 1.5 + s.f))})`);

      // illicium (fishing rod) and esca (lure)
      ctx.beginPath();
      ctx.moveTo(-0.15 * r, -0.82 * r);
      ctx.bezierCurveTo(-0.25 * r, -1.75 * r, -1.1 * r, (-1.95 + sway * 0.04) * r, e.x, e.y - 0.08 * r);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(190,230,255,0.6)'; ctx.stroke();
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(e.x, e.y + 0.05 * r);
        ctx.quadraticCurveTo(e.x + i * 0.05 * r, e.y + 0.14 * r, e.x + i * 0.08 * r + Math.sin(t * 2 + i) * 0.02 * r, e.y + 0.22 * r);
      }
      ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(170,255,235,0.5)'; ctx.stroke();
      // rod segments
      for (let s = 0.12; s < 0.95; s += 0.12) { const p = this.rodPt(s, t); dot(ctx, p.x, p.y, 1.3, 'rgba(210,240,255,0.55)'); }

      halo(ctx, e.x, e.y, r * 0.45, `rgba(200,255,245,${0.55 * glow})`);
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 0.065 * r, 0.075 * r, 0, 0, TAU);
      ctx.fillStyle = 'rgba(220,255,250,0.8)'; ctx.fill();
      // lens ring and window on the esca
      ctx.beginPath(); ctx.arc(e.x, e.y, 0.1 * r, 0, TAU);
      ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(170,255,235,0.5)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(e.x, e.y, 0.1 * r, -2.4, -0.7);
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
      dot(ctx, e.x, e.y, 2.5, 'rgba(255,255,255,1)');
      // symbiotic bacteria swirling around the lure
      for (const b of this.bact) {
        const a = b.a + t * b.s, rad = r * (0.13 + 0.12 * b.d);
        dot(ctx, e.x + Math.cos(a) * rad, e.y + Math.sin(a) * rad * 0.8, 1, `rgba(160,255,230,${0.3 + 0.5 * Math.max(0, Math.sin(t * 3 + b.f))})`);
      }
    }

    anchors(t) {
      const r = this.r, e = this.esca(t);
      return [
        { x: e.x, y: e.y, label: 'ESCA' },
        { x: -0.75 * r, y: -1.72 * r, label: 'ILLICIUM' },
        { x: -0.6 * r, y: -0.48 * r, label: 'EYE' },
        { x: -1.08 * r, y: 0.05 * r, label: 'FANG' },
        { x: 0.4 * r, y: -0.25 * r, label: 'LATERAL-LINE' },
        { x: 0.3 * r, y: 0.45 * r, label: 'PECTORAL-FIN' },
        { x: 1.6 * r, y: 0.1 * r, label: 'CAUDAL-FIN' },
        { x: 0.62 * r, y: -0.82 * r, label: 'DORSAL-SPINE' },
        { x: 0.1 * r, y: 0.35 * r, label: 'PHOTOPHORE' },
        { x: 0.02 * r, y: 0, label: 'GILL' },
      ];
    }
  }

  const SPECIES = { medusa: Medusa, squid: Squid, ctenophore: Ctenophore, angler: Angler };

  const boxCenter = (sp) => ({ x: ((sp.box[0] + sp.box[2]) / 2) * sp.r, y: ((sp.box[1] + sp.box[3]) / 2) * sp.r });

  // Render a species offscreen and pick bright pixels as particle seeds (coords relative to box centre)
  function samplePoints(sp, t, n) {
    const r = sp.r, [x0, y0, x1, y1] = sp.box, m = 12;
    const W = Math.ceil((x1 - x0) * r + 2 * m), H = Math.ceil((y1 - y0) * r + 2 * m);
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    const o = oc.getContext('2d', { willReadFrequently: true });
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'lighter';
    o.translate(m - x0 * r, m - y0 * r);
    sp.draw(o, t);
    const d = o.getImageData(0, 0, W, H).data, bc = boxCenter(sp), pts = [];
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4, l = Math.max(d[i], d[i + 1], d[i + 2]);
        if (l > 55 && Math.random() < (l / 255) ** 1.3) {
          pts.push({ x: x - m + x0 * r - bc.x, y: y - m + y0 * r - bc.y, c: [d[i], d[i + 1], d[i + 2]] });
        }
      }
    }
    if (!pts.length) pts.push({ x: 0, y: 0, c: [200, 220, 255] });
    const out = [];
    for (let i = 0; i < n; i++) out.push(pts[(Math.random() * pts.length) | 0]);
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  }

  /* ---------------- HUD tags ---------------- */

  class Tag {
    constructor(scene, t, idx) {
      this.scene = scene;
      this.idx = idx;
      this.id = (nextId += (rand(2, 40) | 0));
      this.born = t;
      this.life = rand(2.2, 3.8);
      this.size = rand(22, 46);
      this.filled = Math.random() < 0.35;
      const a = scene.anchorsWorld(t)[idx];
      this.side = a.x >= scene.pos.x ? 1 : -1;  // labels fan outward
      this.px = null; this.py = null;
    }

    dead(t) { return t - this.born > this.life; }

    draw(ctx, t, w) {
      const a = this.scene.anchorsWorld(t)[this.idx];
      if (!a) return;
      this.px = this.px == null ? a.x : lerp(this.px, a.x, 0.25);
      this.py = this.py == null ? a.y : lerp(this.py, a.y, 0.25);
      const age = t - this.born;
      if (age < 0.18 && Math.random() < 0.5) return; // boot flicker
      const fadeOut = Math.min(1, (this.life - age) / 0.3);
      const zoom = 1 + Math.max(0, 1 - age / 0.25) * 1.2;
      const s = this.size * zoom, x = this.px, y = this.py;

      ctx.save();
      ctx.globalAlpha = Math.max(0, fadeOut);
      ctx.strokeStyle = 'rgba(235,242,255,0.9)';
      ctx.lineWidth = 1;
      brackets(ctx, x - s / 2, y - s / 2, s, s, Math.max(5, s * 0.22));
      ctx.strokeRect(x - 4, y - 4, 8, 8);
      if (Math.sin(t * 9 + this.id) > 0) ctx.strokeRect(x + s * 0.18, y - s * 0.32, 6, 6);

      let lx = x + this.side * (s / 2 + 10);
      const ly = y - s / 2 - 4;
      const label = `${a.label}-${this.id}`;
      ctx.font = `18px ${HUD_FONT}`;
      const tw = ctx.measureText(label).width;
      if (this.side < 0) lx -= tw;
      lx = Math.max(6, Math.min(w - 6 - tw, lx));
      const shown = label.slice(0, Math.ceil(label.length * Math.min(1, age / 0.4)));

      if (this.filled) {
        ctx.fillStyle = 'rgba(190,200,220,0.28)';
        ctx.fillRect(lx - 3, ly - 15, tw + 6, 34);
      }
      ctx.fillStyle = 'rgba(245,248,255,0.95)';
      ctx.fillText(shown, lx, ly);
      ctx.font = `14px ${HUD_FONT}`;
      ctx.fillStyle = 'rgba(180,195,225,0.7)';
      ctx.fillText(`X0 ${pad(x)}  Y0 ${pad(y)}`, lx, ly + 13);

      ctx.beginPath();
      ctx.moveTo(x + (this.side * s) / 2, y - s / 2);
      ctx.lineTo(this.side > 0 ? lx - 3 : lx + tw + 3, ly + 2);
      ctx.strokeStyle = 'rgba(200,215,255,0.35)';
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------------- scene ---------------- */

  function Scene(canvas) {
    const ctx = canvas.getContext('2d');
    const order = (canvas.dataset.specimens || 'medusa,squid,ctenophore,angler')
      .split(',').map((s) => SPECIES[s.trim()]).filter(Boolean);
    let w = 0, h = 0, dpr = 1, R = 100, cx = 0, cy = 0;
    let idx = 0, cur = null, next = null, state = 'hold', phaseStart = 0, morphStart = 0, particles = null;
    let tags = [], snow = [], running = false, visible = true, last = 0, frame = 0;
    const t0 = performance.now();
    const scene = { pos: { x: 0, y: 0, a: 0 } };

    scene.anchorsWorld = (t) => {
      if (state !== 'hold') return [];
      const bc = boxCenter(cur), { x, y, a } = scene.pos, cos = Math.cos(a), sin = Math.sin(a);
      return cur.anchors(t).map((p) => {
        const lx = p.x - bc.x, ly = p.y - bc.y;
        return { x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos, label: p.label };
      });
    };

    function layout() {
      const narrow = w < 700;
      R = narrow ? Math.min(w * 0.2, h * 0.13) : Math.min(w * 0.13, h * 0.18);
      cx = narrow ? w * 0.6 : w * 0.7;
      cy = h * 0.5;
      cur = new order[idx % order.length](R);
      next = null; particles = null; state = 'hold';
      snow = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.3, 1.3), v: rand(2, 9), a: rand(0.1, 0.5) }));
      tags = [];
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const t = now();
      layout();
      phaseStart = t;
      if (!running) render(reduceMotion ? 6 : t, 0);
    }

    const now = () => (performance.now() - t0) / 1000;

    function beginMorph(t) {
      next = new order[(idx + 1) % order.length](R);
      const a = samplePoints(cur, t, PARTICLES), b = samplePoints(next, t, PARTICLES);
      particles = a.map((p, i) => ({ a: p, b: b[i], spin: rand(-1.4, 1.4), jit: rand(0.3, 1.2) }));
      state = 'morph';
      morphStart = t;
      tags = [];
    }

    function drawParticles(p) {
      const vis = Math.sin(Math.PI * clamp01(p)) ** 0.6;
      const q = smooth((p - 0.1) / 0.8), swirl = Math.sin(Math.PI * q);
      for (const pt of particles) {
        let x = lerp(pt.a.x, pt.b.x, q), y = lerp(pt.a.y, pt.b.y, q);
        const ang = swirl * pt.spin, s = 1 + swirl * pt.jit * 0.25;
        const c = Math.cos(ang), sn = Math.sin(ang);
        [x, y] = [(x * c - y * sn) * s, (x * sn + y * c) * s];
        const col = pt.a.c.map((v, i) => lerp(v, pt.b.c[i], q) | 0);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${vis * 0.9})`;
        ctx.fillRect(x - 0.8, y - 0.8, 1.7, 1.7);
      }
    }

    function drawSpecies(sp, t, alpha) {
      if (alpha <= 0.01) return;
      const bc = boxCenter(sp);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(-bc.x, -bc.y);
      sp.draw(ctx, t);
      ctx.restore();
    }

    function render(t, dt) {
      // timeline
      if (!reduceMotion) {
        if (state === 'hold' && t - phaseStart >= HOLD) beginMorph(t);
        if (state === 'morph' && t - morphStart >= MORPH) {
          cur = next; next = null; particles = null;
          idx = (idx + 1) % order.length;
          state = 'hold'; phaseStart = t;
        }
      }
      const p = state === 'morph' ? (t - morphStart) / MORPH : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // marine snow
      for (const s of snow) {
        s.y -= s.v * dt; s.x += Math.sin(t * 0.3 + s.r * 10) * 2 * dt;
        if (s.y < 0) { s.y = h; s.x = rand(0, w); }
        dot(ctx, s.x, s.y, s.r, `rgba(180,200,255,${s.a})`);
      }

      // gentle float
      scene.pos = { x: cx + Math.sin(t * 0.31) * R * 0.15, y: cy + Math.sin(t * 0.47 + 1) * R * 0.12, a: Math.sin(t * 0.23) * 0.07 };

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(scene.pos.x, scene.pos.y);
      ctx.rotate(scene.pos.a);
      if (state === 'hold') {
        drawSpecies(cur, t, 1);
      } else {
        drawSpecies(cur, t, 1 - smooth(p / 0.38));
        drawSpecies(next, t, smooth((p - 0.62) / 0.38));
        drawParticles(p);
      }
      ctx.restore();

      // tracking frame around the specimen
      const sp = state === 'morph' ? null : cur;
      const bw = sp ? (cur.box[2] - cur.box[0]) * R : lerp((cur.box[2] - cur.box[0]) * R, (next.box[2] - next.box[0]) * R, smooth(p));
      const bh = sp ? (cur.box[3] - cur.box[1]) * R : lerp((cur.box[3] - cur.box[1]) * R, (next.box[3] - next.box[1]) * R, smooth(p));
      const fx = scene.pos.x - bw / 2 - 16, fy = scene.pos.y - bh / 2 - 16, fw = bw + 32, fh = bh + 32;
      ctx.lineWidth = 1;
      ctx.strokeStyle = state === 'morph' ? `rgba(111,243,255,${0.3 + 0.4 * Math.abs(Math.sin(t * 14))})` : 'rgba(111,243,255,0.35)';
      brackets(ctx, fx, fy, fw, fh, 14);
      ctx.font = `14px ${HUD_FONT}`;
      ctx.fillStyle = 'rgba(111,243,255,0.8)';
      const n = String(idx + 1).padStart(2, '0');
      if (state === 'morph') {
        const pct = Math.round(clamp01(p) * 100), bars = Math.round(clamp01(p) * 10);
        ctx.fillText(`RECLASSIFYING ${'▮'.repeat(bars)}${'▯'.repeat(10 - bars)} ${pct}%`, fx, fy - 6);
        // scan sweep through the frame
        const sy = fy + fh * smooth(p);
        const sg = ctx.createLinearGradient(0, sy - 30, 0, sy);
        sg.addColorStop(0, 'rgba(111,243,255,0)');
        sg.addColorStop(1, 'rgba(111,243,255,0.22)');
        ctx.fillStyle = sg;
        ctx.fillRect(fx, sy - 30, fw, 30);
        ctx.fillStyle = 'rgba(180,250,255,0.8)';
        ctx.fillRect(fx, sy, fw, 1);
      } else {
        ctx.fillText(`SPECIMEN ${n} // ${cur.taxon} — LOCK`, fx, fy - 6);
      }

      // annotation tags (only while a specimen is locked)
      if (state === 'hold') {
        tags = tags.filter((g) => !g.dead(t));
        if (tags.length < 3 && (reduceMotion || Math.random() < 0.05 || !tags.length)) {
          const pts = scene.anchorsWorld(t);
          const live = tags.map((g) => pts[g.idx]);
          const free = pts.map((pt, i) => ({ pt, i })).filter(({ pt, i }) =>
            !tags.some((g) => g.idx === i) && live.every((q) => Math.abs(q.y - pt.y) > 44 || Math.abs(q.x - pt.x) > 220));
          if (free.length) tags.push(new Tag(scene, t - (reduceMotion ? 1 : 0), pick(free).i));
        }
        for (const g of tags) g.draw(ctx, t, w);
      }

      // corner readouts
      frame++;
      ctx.font = `14px ${HUD_FONT}`;
      ctx.fillStyle = 'rgba(180,195,225,0.55)';
      ctx.textAlign = 'right';
      const secs = Math.floor(t);
      ctx.fillText(`REC ● ${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}:${String(frame % 60).padStart(2, '0')}`, w - 16, h - 18);
      ctx.fillText(`DEPTH ${(1180 + Math.sin(t * 0.1) * 40).toFixed(0)}M  ·  ${(3.1 + Math.sin(t * 0.07) * 0.2).toFixed(1)}°C`, w - 16, h - 34);
      if (!reduceMotion) {
        ctx.fillText(state === 'morph' ? 'SEQUENCING…' : `NEXT SCAN ${String(Math.ceil(HOLD - (t - phaseStart))).padStart(2, '0')}S`, w - 16, h - 50);
      }
      ctx.textAlign = 'left';
    }

    function loop(ts) {
      if (!running) return;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      render(now(), dt);
      requestAnimationFrame(loop);
    }

    function setRunning(on) {
      if (reduceMotion || on === running) return;
      running = on;
      if (on) { last = performance.now(); requestAnimationFrame(loop); }
    }

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(visible && !document.hidden); }).observe(canvas);
    document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
  }

  const start = () => canvases.forEach((c) => Scene(c));
  // wait for the HUD font so the first labels don't render in a fallback face
  (document.fonts && document.fonts.load ? document.fonts.load('18px VT323').catch(() => {}) : Promise.resolve()).then(start);
})();
