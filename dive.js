/*
 * Scroll dive: the page is a descent.
 * - window.siteDive.depth goes from 1,180 m (top) to 4,000 m (bottom); scan.js reads it.
 * - surface light fades and marine snow thickens as you go deeper (fixed canvas behind content).
 * - a depth gauge rides the right edge on wide screens.
 */
(() => {
  const TOP = 1180, BOTTOM = 4000;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || matchMedia('(max-width: 700px)').matches;
  const dive = (window.siteDive = { progress: 0, depth: TOP });

  // ---- fixed background layer ----
  const canvas = document.createElement('canvas');
  canvas.className = 'dive-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  // ---- depth gauge ----
  const gauge = document.createElement('div');
  gauge.className = 'depth-gauge';
  gauge.setAttribute('aria-hidden', 'true');
  gauge.innerHTML = '<span class="dg-top">1180M</span><div class="dg-rail"><div class="dg-mark"><b></b><i></i></div></div><span class="dg-bottom">4000M</span>';
  document.body.appendChild(gauge);
  const mark = gauge.querySelector('.dg-mark'), readout = gauge.querySelector('.dg-mark b');
  const zone = gauge.querySelector('.dg-mark i');
  const zoneName = (d) => (d < 2000 ? 'BATHYAL' : d < 3000 ? 'LOWER BATHYAL' : 'ABYSSAL');

  let w = 0, h = 0, dpr = 1;
  const POOL = LOW ? 90 : 220;
  const snow = Array.from({ length: POOL }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.3 + Math.random() * 1.2, v: 3 + Math.random() * 10, a: 0.08 + Math.random() * 0.3, k: i / POOL }));

  function resize() {
    dpr = Math.min(LOW ? 1 : 1.5, window.devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function readScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    dive.progress = Math.min(1, Math.max(0, scrollY / max));
    dive.depth = TOP + (BOTTOM - TOP) * dive.progress;
    mark.style.top = `${dive.progress * 100}%`;
    readout.textContent = `${Math.round(dive.depth).toLocaleString('en-US')}M`;
    zone.textContent = zoneName(dive.depth);
  }

  function draw(dt) {
    const p = dive.progress;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // last of the surface light, fading with depth
    const light = (1 - p) ** 1.6;
    if (light > 0.01) {
      const g = ctx.createRadialGradient(w * 0.5, -h * 0.25, 0, w * 0.5, -h * 0.25, h * 1.1);
      g.addColorStop(0, `rgba(70,120,210,${0.16 * light})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // marine snow: more particles the deeper you are
    const visible = 0.25 + 0.75 * p;
    for (const s of snow) {
      if (s.k > visible) continue;
      s.y -= (s.v * dt) / h;
      if (s.y < 0) { s.y = 1; s.x = Math.random(); }
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,200,255,${s.a})`;
      ctx.fill();
    }
  }

  let last = performance.now(), skip = false, raf = 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (LOW && (skip = !skip)) return;
    const dt = Math.min(0.066, (ts - last) / 1000);
    last = ts;
    draw(dt);
  }

  resize();
  readScroll();
  addEventListener('resize', () => { resize(); readScroll(); if (reduceMotion) draw(0); }, { passive: true });
  addEventListener('scroll', () => { readScroll(); if (reduceMotion) draw(0); }, { passive: true });
  if (reduceMotion) {
    draw(0);
  } else {
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); }
    });
  }
})();
