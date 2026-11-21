/*
 * HUD contact form.
 * - If the form has a data-endpoint (e.g. a Formspree form URL), messages are POSTed there.
 * - Otherwise it falls back to opening the visitor's mail app, pre-filled, addressed to data-mailto.
 */
(() => {
  const form = document.querySelector('.contact-form');
  if (!form) return;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');

  const say = (text, kind = '') => {
    status.textContent = text;
    status.dataset.kind = kind;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      const bad = form.querySelector(':invalid');
      say(`CHECK FIELD — ${bad.labels[0].textContent.trim().toUpperCase()}`, 'error');
      bad.focus();
      return;
    }
    const data = new FormData(form);
    const endpoint = form.dataset.endpoint.trim();

    if (!endpoint) {
      const to = form.dataset.mailto;
      const subject = `Hello from ${data.get('name')}`;
      const body = `${data.get('message')}\n\n— ${data.get('name')} (${data.get('email')})`;
      say('OPENING YOUR MAIL APP…', 'ok');
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }

    button.disabled = true;
    say('TRANSMITTING…');
    try {
      const res = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      say('TRANSMISSION RECEIVED — I’LL REPLY SOON.', 'ok');
      if (window.siteSound) window.siteSound.ping();
    } catch {
      say('SIGNAL LOST — PLEASE TRY AGAIN, OR EMAIL DIRECTLY BELOW.', 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
