/*
 * Section reveals.
 * - content fades / un-blurs into place as it scrolls into view (staggered among siblings)
 * - HUD labels "decode": characters scramble, then resolve left to right
 * - major sections get a one-time lock-on bracket animation
 * Nothing is hidden unless this script runs, so the page still works without JS.
 */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

  const REVEAL = 'h1, h2, .story-intro, .hero-bottom, .notes-hero > p:last-child, .card, .note, .principle-list article, .story-cta, .contact-form, .email, .specimen';
  const DECODE = '.section-label, .eyebrow, .card-meta span, .note-meta span';
  const LOCK = '.statement, .hello, .principles, .notes-signoff, .specimen-grid';
  const GLYPHS = '▮▯▚▞/\\<>01#*+=';

  const items = [...document.querySelectorAll(REVEAL)];
  items.forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.matches(REVEAL));
    el.style.setProperty('--rv-delay', `${Math.min(sibs.indexOf(el), 4) * 90}ms`);
    el.classList.add('rv');
  });
  const decoders = [...document.querySelectorAll(DECODE)];
  decoders.forEach((el) => { el.dataset.text = el.textContent; });
  const locks = [...document.querySelectorAll(LOCK)];
  locks.forEach((el) => el.classList.add('lockable'));

  function decode(el) {
    const final = el.dataset.text;
    if (!final || el._decoding) return;
    el._decoding = true;
    const start = performance.now(), dur = 380 + final.length * 22;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const solved = Math.floor(final.length * k);
      let out = final.slice(0, solved);
      for (let i = solved; i < final.length; i++) out += final[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = out;
      if (k < 1) requestAnimationFrame(step);
      else { el.textContent = final; el._decoding = false; }
    };
    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.classList.contains('rv')) el.classList.add('rv-in');
      if (el.dataset.text != null) decode(el);
      if (el.classList.contains('lockable')) el.classList.add('locked-on');
      io.unobserve(el);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  [...items, ...decoders, ...locks].forEach((el) => io.observe(el));
})();
