/*
 * Holographic damascus cards.
 * Any element with [data-holo] gets a generated contour-line ("damascus") pattern.
 * The pattern sits faintly on the card; an iridescent foil is revealed through it
 * wherever the pointer passes, and the card tilts toward the pointer.
 *   data-holo="star|orbit|arrow"  centre emblem (omit value for rings only)
 *   data-holo-center="0.5,0.45"     where the rings radiate from (fractions of the card)
 */
(() => {
  const cards = [...document.querySelectorAll('[data-holo]')];
  if (!cards.length) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = matchMedia('(hover: none)').matches;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const TAU = Math.PI * 2;

  /* ---------- emblems (stroked on top of the contour field) ---------- */

  const emblems = {
    // nested four-point stars
    star(g, cx, cy, R) {
      for (let k = 0; k < 10; k++) {
        const s = R * (1 - k * 0.095);
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? s * 0.3 : s;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
        g.stroke();
      }
    },
    // a tunnel of circles sinking toward the bottom, ringed by beads
    orbit(g, cx, cy, R) {
      for (let k = 0; k < 12; k++) {
        const rad = R * (1 - k * 0.075);
        g.beginPath();
        g.arc(cx, cy + (R - rad) * 0.55, rad, 0, TAU);
        g.stroke();
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        g.beginPath();
        g.arc(cx + Math.cos(a) * R * 1.08, cy + Math.sin(a) * R * 1.08, R * 0.018, 0, TAU);
        g.fill();
      }
    },
    // cascading chevrons along a diagonal shaft
    arrow(g, cx, cy, R) {
      const d = R * 0.17;
      for (let k = 0; k < 7; k++) {
        const ax = cx + R * 0.62 - k * d, ay = cy - R * 0.62 + k * d, L = R * (0.95 - k * 0.06);
        g.beginPath();
        g.moveTo(ax - L, ay); g.lineTo(ax, ay); g.lineTo(ax, ay + L);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(cx - R * 0.8, cy + R * 0.8); g.lineTo(cx + R * 0.62, cy - R * 0.62);
      g.stroke();
    },
  };

  /* ---------- contour field → alpha mask ---------- */

  function makePattern(el) {
    const rect = el.getBoundingClientRect();
    const s = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width * s), H = Math.round(rect.height * s);
    if (!W || !H) return null;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;

    const [fx, fy] = (el.dataset.holoCenter || '0.5,0.45').split(',').map(Number);
    el.style.setProperty('--hc', `${fx * 100}% ${fy * 100}%`);
    const cx = W * fx, cy = H * fy;
    const motif = emblems[el.dataset.holo];
    const mR = motif ? Math.min(W, H) * 0.24 : 0;
    const seed = el._holoSeed ?? (el._holoSeed = Math.random() * 10);
    const gap = 6.5;          // CSS px between contour lines
    const half = 0.35;        // half line width in CSS px

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy, rr = Math.hypot(dx, dy);
        if (motif && rr < mR * 1.18) continue; // leave a clean moat around the emblem
        const xs = x / s, ys = y / s, rs = rr / s;
        // warped concentric rings — the folded-steel "damascus" figure
        const f = rs
          + 9 * Math.sin(xs * 0.021 + Math.sin(ys * 0.017 + seed) * 1.8)
          + 7 * Math.sin(ys * 0.026 - xs * 0.009 + seed * 2)
          + 4 * Math.sin(Math.atan2(dy, dx) * 3 + rs * 0.015 + seed);
        const v = f / gap, fr = v - Math.floor(v);
        const dist = Math.min(fr, 1 - fr) * gap;
        const a = clamp01(1 - (dist - half) * s);
        if (a > 0) {
          const i = (y * W + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = 255;
          d[i + 3] = (a * 255) | 0;
        }
      }
    }
    g.putImageData(img, 0, 0);

    if (motif) {
      g.strokeStyle = g.fillStyle = '#fff';
      g.lineWidth = 1.2 * s;
      g.lineJoin = 'round';
      motif(g, cx, cy, mR);
    }
    return c.toDataURL('image/png');
  }

  /* ---------- per-card setup ---------- */

  function setup(el, i) {
    const holo = document.createElement('div');
    holo.className = 'holo';
    holo.setAttribute('aria-hidden', 'true');
    holo.innerHTML = '<div class="holo-lines"></div><div class="holo-foil"></div><div class="holo-glare"></div>';
    el.prepend(holo);
    el.classList.add('holo-card');

    let pending = 0;
    const paint = () => {
      const url = makePattern(el);
      if (url) el.style.setProperty('--pattern', `url("${url}")`);
    };
    new ResizeObserver(() => {
      clearTimeout(pending);
      // stagger cards so the pattern generation never lands in one long frame
      pending = setTimeout(paint, 60 + i * 40);
    }).observe(el);

    const set = (x, y, w, h, hover) => {
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
      el.style.setProperty('--px', (x / w).toFixed(3));
      el.style.setProperty('--py', (y / h).toFixed(3));
      el.style.setProperty('--hover', hover);
      if (!reduceMotion && !noHover) {
        el.style.setProperty('--rx', `${((0.5 - y / h) * 10).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((x / w - 0.5) * 12).toFixed(2)}deg`);
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
