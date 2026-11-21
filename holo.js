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
  const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

  /* ---------- field computation: background worker, main-thread fallback ---------- */

  const FIELD_SRC = 'holo-field.js?v=1';
  let worker = null, jobId = 0, fallback = null;
  const waiting = new Map();
  const loadFallback = () => fallback || (fallback = new Promise((res) => {
    if (self.holoField) return res(self.holoField);
    const sc = document.createElement('script');
    sc.src = FIELD_SRC;
    sc.onload = () => res(self.holoField || null);
    sc.onerror = () => res(null);
    document.head.appendChild(sc);
  }));
  try {
    worker = new Worker(FIELD_SRC);
    worker.onmessage = (e) => { const cb = waiting.get(e.data.id); waiting.delete(e.data.id); if (cb) cb(e.data.px); };
    worker.onerror = () => { worker = null; for (const cb of waiting.values()) cb(null); waiting.clear(); };
  } catch { worker = null; }

  function computeField(job) {
    const local = () => loadFallback().then((fn) => (fn ? fn(job) : null));
    if (!worker) return local();
    return new Promise((res) => {
      const id = ++jobId;
      waiting.set(id, (px) => (px ? res(px) : local().then(res)));
      worker.postMessage({ ...job, id });
    });
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

  /* ---------- damascus mask: field pixels from the worker + emblem on top ---------- */

  async function makePattern(el) {
    const rect = el.getBoundingClientRect();
    const s = Math.min(LOW ? 1.5 : 2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width * s), H = Math.round(rect.height * s);
    if (!W || !H) return null;

    const [fx, fy] = (el.dataset.holoCenter || '0.5,0.42').split(',').map(Number);
    el.style.setProperty('--hc', `${fx * 100}% ${fy * 100}%`);
    const cx = rect.width * fx, cy = rect.height * fy;            // CSS px
    const motif = emblems[el.dataset.holo];
    const mR = motif ? Math.min(rect.width, rect.height) * 0.27 : 0; // CSS px
    const seed = el._holoSeed ?? (el._holoSeed = (Math.random() * 1e6) | 0);

    const px = await computeField({ W, H, s, cx, cy, mR, seed });
    if (!px) return null;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.putImageData(new ImageData(px, W, H), 0, 0);
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
    let paintToken = 0;
    const paint = async () => {
      const token = ++paintToken;
      const canvas = await makePattern(el);
      if (!canvas || token !== paintToken) return;
      canvas.toBlob((blob) => {
        if (!blob || token !== paintToken) return;
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
