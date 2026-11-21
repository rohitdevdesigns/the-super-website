/*
 * Optional sound effects, off by default. Synthesised with Web Audio (no audio files).
 * window.siteSound.ping()  — sonar ping with echo (species transformations, form sent)
 * window.siteSound.blip()  — tiny tick (HUD lock-on)
 * The nav toggle (.snd-toggle) switches it on/off; the choice is remembered on this device.
 */
(() => {
  const KEY = 'site-sound';
  let on = false, ac = null, lastBlip = 0;
  try { on = localStorage.getItem(KEY) === 'on'; } catch { /* storage unavailable */ }

  const audio = () => {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };

  function ping() {
    if (!on) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1350, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.6);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    // echo: feedback delay through a low-pass, like sound returning through water
    const delay = a.createDelay(1), fb = a.createGain(), lp = a.createBiquadFilter();
    delay.delayTime.value = 0.34; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 1600;
    osc.connect(gain);
    gain.connect(a.destination);
    gain.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(a.destination);
    osc.start(t); osc.stop(t + 1.5);
    setTimeout(() => { try { fb.disconnect(); lp.disconnect(); delay.disconnect(); } catch {} }, 4000);
  }

  function blip() {
    if (!on) return;
    const now = performance.now();
    if (now - lastBlip < 140) return;
    lastBlip = now;
    const a = audio(); if (!a) return;
    const t = a.currentTime, osc = a.createOscillator(), gain = a.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2300, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain); gain.connect(a.destination);
    osc.start(t); osc.stop(t + 0.07);
  }

  const buttons = () => document.querySelectorAll('.snd-toggle');
  function render() {
    buttons().forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('span').textContent = on ? 'ON' : 'OFF';
      b.classList.toggle('is-on', on);
    });
  }

  function set(value) {
    on = value;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    render();
    if (on) { audio(); blip(); }
  }

  window.siteSound = { ping, blip, get on() { return on; }, set };
  const init = () => {
    render();
    buttons().forEach((b) => b.addEventListener('click', () => set(!on)));
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
