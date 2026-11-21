/*
 * Boot screen: a short "initializing" sequence that covers the page while fonts load,
 * shown once per browser session. Loaded synchronously right after the .boot markup.
 */
(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  let seen = false;
  try { seen = sessionStorage.getItem('site-booted') === '1'; } catch { /* storage unavailable */ }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen) { boot.remove(); return; }

  const lines = ['SONAR ARRAY', 'PHOTON GAIN', 'SPECIMEN DB', 'HUD LINK'];
  const results = ['OK', 'OK', '4 ENTRIES', 'LOCKED'];
  const log = boot.querySelector('.boot-log'), bar = boot.querySelector('.boot-bar span');
  const started = performance.now();
  const MIN = reduce ? 250 : 1300, MAX = 3000;

  lines.forEach((name, i) => {
    setTimeout(() => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${name}</span><i></i><b>${results[i]}</b>`;
      log.appendChild(li);
      bar.style.width = `${((i + 1) / lines.length) * 85}%`;
    }, reduce ? 0 : 180 + i * 240);
  });

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    bar.style.width = '100%';
    const wait = Math.max(0, MIN - (performance.now() - started));
    setTimeout(() => {
      boot.classList.add('boot-out');
      setTimeout(() => boot.remove(), 600);
      try { sessionStorage.setItem('site-booted', '1'); } catch {}
    }, wait);
  };

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const loaded = new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
  Promise.all([fontsReady, loaded]).then(finish);
  setTimeout(finish, MAX); // never block the page for long
})();
