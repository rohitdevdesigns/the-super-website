/*
 * Damascus line field for the holographic cards.
 * Runs as a Web Worker (holo.js posts jobs to it) so the heavy per-pixel work never blocks scrolling.
 * Also usable on the main thread as self.holoField(job) when workers are unavailable.
 *
 * job: { id, W, H, s, cx, cy, mR, seed }   (W,H device px; s = device px per CSS px; cx,cy,mR CSS px)
 * returns RGBA pixels (Uint8ClampedArray) — white lines with alpha.
 */
(function (root) {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

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

  function holoField({ W, H, s, cx, cy, mR, seed }) {
    const n = perlin(seed);
    // two smooth octaves only: higher octaves make the lines jitter like a topo map
    const fbm = (x, y) => n(x, y) * 0.72 + n(x * 1.93 + 7.1, y * 1.93 + 3.3) * 0.28;
    const GAP = 3.4, HALF = 0.3;             // CSS px between lines, half line width
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
        const amp = 14 + d0 * 0.2;
        F[j * GW + i] = Math.hypot(x - cx + wx * amp, y - cy + wy * amp);
      }
    }

    const d = new Uint8ClampedArray(W * H * 4);
    const lineAlpha = mR ? 0.72 : 0.85;
    for (let y = 0; y < H; y++) {
      const gy = y / step, j = Math.floor(gy), ty = gy - j;
      for (let x = 0; x < W; x++) {
        const gx = x / step, i = Math.floor(gx), tx = gx - i;
        const k = j * GW + i;
        const f00 = F[k], f10 = F[k + 1], f01 = F[k + GW], f11 = F[k + GW + 1];
        const f = (f00 * (1 - tx) + f10 * tx) * (1 - ty) + (f01 * (1 - tx) + f11 * tx) * ty;
        // gradient in field units per device px keeps every line the same hairline width
        const ddx = ((f10 - f00) * (1 - ty) + (f11 - f01) * ty) / step;
        const ddy = ((f01 - f00) * (1 - tx) + (f11 - f10) * tx) / step;
        const grad = Math.hypot(ddx, ddy) || 1e-3;
        const v = f / GAP, fr = v - Math.floor(v);
        const distPx = (Math.min(fr, 1 - fr) * GAP) / grad;
        let a = clamp01(HALF * s + 0.5 - distPx);
        if (a <= 0) continue;
        if (mR) {
          a *= smooth(mR * 1.16, mR * 1.42, Math.hypot(x / s - cx, y / s - cy)); // soft moat around the emblem
          if (a <= 0) continue;
        }
        const o = (y * W + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = 255;
        d[o + 3] = (a * lineAlpha * 255) | 0;
      }
    }
    return d;
  }

  root.holoField = holoField;
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = (e) => {
      const px = holoField(e.data);
      root.postMessage({ id: e.data.id, px }, [px.buffer]);
    };
  }
})(self);
