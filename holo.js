/*
 * Holographic damascus cards.
 * Any element with [data-holo] gets a generated contour-line ("damascus") pattern:
 * hairline isolines of a domain-warped noise field that flow around a fine-line emblem.
 * The pattern sits faintly on the card; an iridescent foil is revealed through it
 * wherever the pointer passes, and the card tilts toward the pointer.
 *   data-holo="compass|rosette|arrow"  centre emblem (omit value for lines only)
 *   data-holo-center="0.5,0.42"          where the flow radiates from (fractions of the card)
 */
(() => {
  const cards = [...document.querySelectorAll('[data-holo]')];
  if (!cards.length) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = matchMedia('(hover: none)').matches;
  const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ---------- seeded Perlin noise ---------- */

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function perlin(seed) {
    const r = rng(seed), base = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [base[i], base[j]] = [base[j], base[i]]; }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    const grad = (h, x, y) => {
      switch (h & 7) {
        case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
        case 4: return x; case 5: return -x; case 6: return y; default: return -y;
      }
    };
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const mix = (a, b, t) => a + (b - a) * t;
    return (x, y) => {
      let X = Math.floor(x), Y = Math.floor(y);
      x -= X; y -= Y; X &= 255; Y &= 255;
      const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
      return mix(mix(grad(p[a], x, y), grad(p[b], x - 1, y), u), mix(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v);
    };
  }

  /* ---------- fine-line emblems (guilloche / engraving style) ---------- */

  const emblems = {
    // faceted eight-point compass rose inside a ticked dial and an interlaced wave band
    compass(g, cx, cy, R, lw) {
      g.lineWidth = lw;
      for (const k of [1, 0.965, 0.62, 0.6]) { g.beginPath(); g.arc(cx, cy, R * k, 0, TAU); g.stroke(); }
      // dial ticks
      g.beginPath();
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * TAU, inner = i % 8 === 0 ? 0.9 : i % 4 === 0 ? 0.93 : 0.945;
        g.moveTo(cx + Math.cos(a) * R * inner, cy + Math.sin(a) * R * inner);
        g.lineTo(cx + Math.cos(a) * R * 0.965, cy + Math.sin(a) * R * 0.965);
      }
      g.stroke();
      // interlaced guilloche waves between the rings
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        for (let i = 0; i <= 720; i++) {
          const a = (i / 720) * TAU, rr = R * (0.765 + 0.105 * Math.sin(16 * a + k * (TAU / 6)));
          i ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.stroke();
      }
      // star: each spike is two facets, one lit and one shaded
      const spike = (a, len, half, lit, shade) => {
        const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
        const l = [cx + Math.cos(a - Math.PI / 2) * half, cy + Math.sin(a - Math.PI / 2) * half];
        const rgt = [cx + Math.cos(a + Math.PI / 2) * half, cy + Math.sin(a + Math.PI / 2) * half];
        g.globalAlpha = lit; g.beginPath(); g.moveTo(cx, cy); g.lineTo(...l); g.lineTo(...tip); g.closePath(); g.fill();
        g.globalAlpha = shade; g.beginPath(); g.moveTo(cx, cy); g.lineTo(...rgt); g.lineTo(...tip); g.closePath(); g.fill();
        g.globalAlpha = 1; g.beginPath(); g.moveTo(...l); g.lineTo(...tip); g.lineTo(...rgt); g.moveTo(cx, cy); g.lineTo(...tip); g.stroke();
      };
      for (let i = 0; i < 4; i++) spike((i / 4) * TAU + Math.PI / 4, R * 0.55, R * 0.09, 0.35, 0.12);
      for (let i = 0; i < 4; i++) spike((i / 4) * TAU - Math.PI / 2, R * 0.9, R * 0.13, 0.85, 0.3);
      g.beginPath(); g.arc(cx, cy, R * 0.045, 0, TAU); g.fill();
    },

    // interlaced spirograph rosette with orbit rings and a bead border
    rosette(g, cx, cy, R, lw) {
      g.lineWidth = lw;
      for (const k of [1, 0.975]) { g.beginPath(); g.arc(cx, cy, R * k, 0, TAU); g.stroke(); }
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        g.beginPath(); g.arc(cx + Math.cos(a) * R * 1.06, cy + Math.sin(a) * R * 1.06, R * 0.014, 0, TAU); g.fill();
      }
      // hypotrochoid: a=1, b=3/10, c=0.55 closes after 3 turns
      const spiro = (scale, rot, c, b) => {
        const a = 1, steps = 2400, turns = 3, max = a - b + c;
        g.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * TAU * turns;
          const x = (a - b) * Math.cos(t) + c * Math.cos(((a - b) / b) * t);
          const y = (a - b) * Math.sin(t) - c * Math.sin(((a - b) / b) * t);
          const px = (x * Math.cos(rot) - y * Math.sin(rot)) / max, py = (x * Math.sin(rot) + y * Math.cos(rot)) / max;
          i ? g.lineTo(cx + px * scale, cy + py * scale) : g.moveTo(cx + px * scale, cy + py * scale);
        }
        g.stroke();
      };
      for (let k = 0; k < 4; k++) spiro(R * (0.9 - k * 0.012), k * 0.035, 0.55, 0.3);
      spiro(R * 0.46, 0.2, 0.42, 0.3);
      // tilted orbit ellipses
      for (let k = 0; k < 3; k++) {
        g.beginPath(); g.ellipse(cx, cy, R * 0.9, R * 0.3, (k / 3) * Math.PI + 0.3, 0, TAU); g.stroke();
      }
      g.beginPath(); g.arc(cx, cy, R * 0.12, 0, TAU); g.stroke();
      g.beginPath(); g.arc(cx, cy, R * 0.05, 0, TAU); g.fill();
    },

    // hatched arrow inside nested diamonds with radial ticks
    arrow(g, cx, cy, R, lw) {
      g.lineWidth = lw;
      for (const k of [1, 0.97, 0.8, 0.785]) {
        g.beginPath();
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.lineTo(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k); }
        g.closePath(); g.stroke();
      }
      g.beginPath();
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU, r0 = R * 1.06, r1 = R * (i % 4 ? 1.1 : 1.16);
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      g.stroke();
      // arrow pointing up-right, in its own rotated frame
      g.save();
      g.translate(cx, cy); g.rotate(-Math.PI / 4);
      const L = R * 0.62, hw = R * 0.08, hh = R * 0.26, hl = R * 0.3;
      const arrowPath = () => {
        g.beginPath();
        g.moveTo(-L, -hw); g.lineTo(L - hl, -hw); g.lineTo(L - hl, -hh); g.lineTo(L, 0);
        g.lineTo(L - hl, hh); g.lineTo(L - hl, hw); g.lineTo(-L, hw); g.closePath();
      };
      arrowPath(); g.stroke();
      g.save(); arrowPath(); g.clip();
      g.beginPath();
      for (let x = -L; x < L; x += lw * 4.5) { g.moveTo(x, -hh); g.lineTo(x + hh * 0.6, hh); }
      g.globalAlpha = 0.8; g.stroke();
      g.restore();
      // echo chevrons trailing the head
      g.beginPath();
      for (let k = 1; k <= 3; k++) {
        const x = L - hl - k * R * 0.17;
        g.moveTo(x - hl * 0.55, -hh * (1 - k * 0.15)); g.lineTo(x, 0); g.lineTo(x - hl * 0.55, hh * (1 - k * 0.15));
      }
      g.stroke();
      g.restore();
    },
  };

  /* ---------- damascus field → alpha mask ---------- */

  function makePattern(el) {
    const rect = el.getBoundingClientRect();
    const s = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width * s), H = Math.round(rect.height * s);
    if (!W || !H) return null;

    const [fx, fy] = (el.dataset.holoCenter || '0.5,0.42').split(',').map(Number);
    el.style.setProperty('--hc', `${fx * 100}% ${fy * 100}%`);
    const cx = rect.width * fx, cy = rect.height * fy;            // CSS px
    const motif = emblems[el.dataset.holo];
    const mR = motif ? Math.min(rect.width, rect.height) * 0.27 : 0; // CSS px
    const seed = el._holoSeed ?? (el._holoSeed = (Math.random() * 1e6) | 0);
    const n = perlin(seed);
    // two smooth octaves only: higher octaves make the lines jitter like a topo map
    const fbm = (x, y) => n(x, y) * 0.72 + n(x * 1.93 + 7.1, y * 1.93 + 3.3) * 0.28;

    const GAP = 3.4;   // CSS px between lines
    const HALF = 0.3;  // half line width, CSS px

    // Sample the field on a coarse grid (every 2 device px) — it is smooth, so bilinear is exact enough.
    const step = 2, GW = Math.ceil(W / step) + 2, GH = Math.ceil(H / step) + 2;
    const F = new Float32Array(GW * GH);
    const sc = 0.0029;
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const x = (i * step) / s, y = (j * step) / s;
        // two-level domain warp gives folded, flowing bands like pattern-welded steel
        const qx = fbm(x * sc, y * sc), qy = fbm(x * sc + 5.2, y * sc + 1.3);
        const wx = fbm(x * sc + 2.2 * qx + 1.7, y * sc + 2.2 * qy + 9.2), wy = fbm(x * sc + 2.2 * qx + 8.3, y * sc + 2.2 * qy + 2.8);
        const d0 = Math.hypot(x - cx, y - cy);
        const amp = 14 + d0 * 0.2;                // calm near the emblem, more folded outward
        F[j * GW + i] = Math.hypot(x - cx + wx * amp, y - cy + wy * amp);
      }
    }

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const lineAlpha = motif ? 0.72 : 0.85;

    for (let y = 0; y < H; y++) {
      const gy = y / step, j = Math.floor(gy), ty = gy - j;
      for (let x = 0; x < W; x++) {
        const gx = x / step, i = Math.floor(gx), tx = gx - i;
        const k = j * GW + i;
        const f00 = F[k], f10 = F[k + 1], f01 = F[k + GW], f11 = F[k + GW + 1];
        const f = (f00 * (1 - tx) + f10 * tx) * (1 - ty) + (f01 * (1 - tx) + f11 * tx) * ty;
        // gradient in field units per device pixel → keeps every line the same hairline width
        const ddx = ((f10 - f00) * (1 - ty) + (f11 - f01) * ty) / step;
        const ddy = ((f01 - f00) * (1 - tx) + (f11 - f10) * tx) / step;
        const grad = Math.hypot(ddx, ddy) || 1e-3;
        const v = f / GAP, fr = v - Math.floor(v);
        const distPx = (Math.min(fr, 1 - fr) * GAP) / grad;      // device px to nearest line
        let a = clamp01(HALF * s + 0.5 - distPx);
        if (a <= 0) continue;
        if (motif) {
          const dr = Math.hypot(x / s - cx, y / s - cy);
          a *= smooth(mR * 1.16, mR * 1.42, dr);                 // soft moat around the emblem
          if (a <= 0) continue;
        }
        const o = (y * W + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = 255;
        d[o + 3] = (a * lineAlpha * 255) | 0;
      }
    }
    g.putImageData(img, 0, 0);

    if (motif) {
      g.strokeStyle = g.fillStyle = '#fff';
      g.lineJoin = 'round';
      g.lineCap = 'round';
      motif(g, cx * s, cy * s, mR * s, 0.6 * s);
    }
    return c;
  }

  /* ---------- per-card setup ---------- */

  function setup(el, i) {
    const holo = document.createElement('div');
    holo.className = 'holo';
    holo.setAttribute('aria-hidden', 'true');
    holo.innerHTML = '<div class="holo-lines"></div><div class="holo-foil"></div><div class="holo-glare"></div>';
    el.prepend(holo);
    el.classList.add('holo-card');

    let pending = 0, lastW = 0, lastH = 0, blobUrl = null;
    // A short blob: URL instead of a multi-megabyte data: URL — very large data URLs in a
    // custom property can silently fail to apply on tall cards.
    const paint = () => {
      const canvas = makePattern(el);
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        el.style.setProperty('--pattern', `url("${url}")`);
        if (blobUrl) setTimeout(URL.revokeObjectURL, 1000, blobUrl);
        blobUrl = url;
      }, 'image/png');
    };
    new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (Math.abs(width - lastW) < 2 && Math.abs(height - lastH) < 2) return;
      lastW = width; lastH = height;
      clearTimeout(pending);
      // stagger cards so pattern generation never lands in one long frame
      pending = setTimeout(paint, 60 + i * 60);
    }).observe(el);

    const set = (x, y, w, h, hover) => {
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
      el.style.setProperty('--px', (x / w).toFixed(3));
      el.style.setProperty('--py', (y / h).toFixed(3));
      el.style.setProperty('--hover', hover);
      if (!reduceMotion && !noHover) {
        el.style.setProperty('--rx', `${((0.5 - y / h) * 9).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((x / w - 0.5) * 11).toFixed(2)}deg`);
      }
    };

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.classList.add('is-active');
      set(e.clientX - r.left, e.clientY - r.top, r.width, r.height, 1);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-active');
      el.style.setProperty('--hover', 0);
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });

    // Touch screens have no cursor: let the light drift across the card on its own.
    if (noHover && !reduceMotion) {
      let raf = 0;
      const drift = (ts) => {
        const r = el.getBoundingClientRect(), t = ts / 1000 + i * 2.1;
        set(r.width * (0.5 + 0.38 * Math.sin(t * 0.55)), r.height * (0.5 + 0.34 * Math.sin(t * 0.8 + 1)), r.width, r.height, 0.85);
        raf = requestAnimationFrame(drift);
      };
      new IntersectionObserver(([e]) => {
        cancelAnimationFrame(raf);
        if (e.isIntersecting) raf = requestAnimationFrame(drift);
      }).observe(el);
    }
  }

  cards.forEach(setup);
})();
