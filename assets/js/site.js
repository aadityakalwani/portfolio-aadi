/* Aaditya Kalwani portfolio. One rAF drives Lenis, the pinned scenes, the nav and the showcases. */
window.__siteReady = true;

const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const damp = (x, y, l, dt) => x + (y - x) * (1 - Math.exp(-l * dt));
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eoe = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const reduceMQ = matchMedia('(prefers-reduced-motion:reduce)');
const PIN_Q = '(min-width:900px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference) and (min-height:700px)';
const pinMQ = matchMedia(PIN_Q);
let pinned = pinMQ.matches;
const finePointer = matchMedia('(hover:hover) and (pointer:fine)');

/* ------------------------------------------------------------------ theme */
const instances = []; // mounted showcases: { name, inst }
const themeBtn = $('#theme-toggle');
const themeMeta = $('meta[name="theme-color"]');
function getTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function applyThemeLabel() {
  const dark = getTheme() === 'dark';
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  if (themeMeta) themeMeta.setAttribute('content', dark ? '#0A1020' : '#F5F3E8');
}
function setTheme(t) {
  root.setAttribute('data-theme', t);
  try { localStorage.setItem('aadi-theme', t); } catch (e) { /* storage blocked */ }
  applyThemeLabel();
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } }));
  for (const i of instances) { try { i.inst && i.inst.setTheme && i.inst.setTheme(t); } catch (e) { /* module-owned */ } }
}
applyThemeLabel();
const flipTheme = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');
themeBtn.addEventListener('click', flipTheme);
$$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', flipTheme));

/* ------------------------------------------------------------------ lenis */
let lenis = null;
let lenisBusy = false;
async function startLenis() {
  if (lenis || lenisBusy || reduceMQ.matches) return;
  lenisBusy = true;
  try {
    const m = await import('lenis');
    const Lenis = m.default || m.Lenis;
    if (!reduceMQ.matches && !lenis) lenis = new Lenis({ lerp: 0.15, smoothWheel: true, syncTouch: false, autoRaf: false, anchors: false });
  } catch (e) { lenis = null; }
  lenisBusy = false;
}
function stopLenis() {
  if (!lenis) return;
  try { lenis.destroy(); } catch (e) { /* already gone */ }
  lenis = null;
}
startLenis();

/* ------------------------------------------------------------------ scenes */
const scenes = $$('[data-scene]').map((el) => ({ el, id: el.id, top: 0, len: 1, p: 0, ps: 0, on: null, init: false }));
const sceneById = Object.fromEntries(scenes.map((s) => [s.id, s]));
const secEls = ['work', 'builds', 'about', 'contact'].map((id) => ({ id, el: document.getElementById(id), top: 0 }));
let vh = innerHeight;
let docMax = 1;
let layoutV = 0;
let frameDirty = false;
function measure() {
  vh = innerHeight;
  for (const s of scenes) {
    const r = s.el.getBoundingClientRect();
    s.top = r.top + scrollY;
    s.len = Math.max(1, r.height - vh);
  }
  for (const s of secEls) s.top = s.el.getBoundingClientRect().top + scrollY;
  anchorSecs = $$('main > section[id], main > section > section[id]').map((el) => ({ el, top: el.getBoundingClientRect().top + scrollY }));
  layoutV++;
  docMax = Math.max(1, document.documentElement.scrollHeight - vh);
  layoutNavInd();
  segs.forEach(layoutSeg);
}
new ResizeObserver(() => measure()).observe(document.body);
addEventListener('load', measure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

/* remember which section the reader is in (and how far through it) so a layout switch does not strand them */
let anchorSecs = [];
let anchorNow = null;
function captureAnchor() {
  const y = scrollY;
  let best = null;
  for (const a of anchorSecs) if (a.top <= y + 1 && (!best || a.top >= best.top)) best = a;
  return best ? { el: best.el, off: Math.max(0, y - best.top) } : null;
}
let pinChanging = false;
pinMQ.addEventListener('change', () => {
  pinChanging = true;
  /* the browser has already clamped scrollY to the new document by now, so use the anchor from the last frame */
  const anc = anchorNow;
  pinned = pinMQ.matches;
  for (const s of scenes) s.init = false;
  measure();
  if (anc) {
    const y = Math.max(0, Math.round(anc.el.getBoundingClientRect().top + scrollY + Math.min(anc.off, Math.max(0, anc.el.offsetHeight - vh * 0.5))));
    if (lenis) { lenis.resize(); lenis.scrollTo(y, { immediate: true, force: true }); } else scrollTo({ top: y, behavior: 'auto' });
    lastY = -1;
  }
  pinChanging = false;
});

/* tweens run inside the single rAF */
const tweens = [];
function tween(dur, fn, done) { tweens.push({ t0: performance.now(), dur, fn, done }); }

/* ------------------------------------------------------------------ nav */
const nav = $('#nav');
const navProg = $('#nav-progress');
const navLinks = $('#nav-links');
const navInd = $('.nav-ind');
const navAnchors = $$('a[data-sec]', navLinks);
let activeSec = null;
function layoutNavInd() {
  const a = navAnchors.find((x) => x.dataset.sec === activeSec);
  if (!a) { navInd.style.opacity = '0'; return; }
  navInd.style.opacity = '1';
  navInd.style.width = a.offsetWidth + 'px';
  navInd.style.transform = 'translateX(' + a.offsetLeft + 'px)';
}
function setActive(id) {
  if (id === activeSec) return;
  activeSec = id;
  navAnchors.forEach((a) => a.classList.toggle('is-active', a.dataset.sec === id));
  layoutNavInd();
}

/* mobile sheet */
const sheet = $('#sheet');
const menuBtn = $('#menu-btn');
function menuOpen() { return sheet.classList.contains('open'); }
function setMenu(open) {
  sheet.classList.toggle('open', open);
  sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) sheet.removeAttribute('inert'); else sheet.setAttribute('inert', '');
  menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.classList.toggle('menu-open', open);
  if (lenis) { open ? lenis.stop() : lenis.start(); }
  if (open) { const f = sheet.querySelector('a'); f && setTimeout(() => f.focus(), 60); }
}
menuBtn.addEventListener('click', () => setMenu(!menuOpen()));
addEventListener('keydown', (e) => {
  if (!menuOpen()) return;
  if (e.key === 'Escape') { setMenu(false); menuBtn.focus(); return; }
  if (e.key === 'Tab') {
    const f = [menuBtn, ...$$('a,button', sheet)].filter((x) => !x.disabled);
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
addEventListener('resize', () => { if (innerWidth >= 900 && menuOpen()) setMenu(false); });

/* anchors */
function goTo(hash) {
  const id = hash.replace('#', '');
  const target = id && id !== 'top' ? document.getElementById(id) : null;
  let y = 0;
  if (target) {
    const r = target.getBoundingClientRect();
    y = r.top + scrollY;
    if (target.hasAttribute('data-scene') && target.hasAttribute('data-case') && pinned) y += 0.16 * Math.max(1, target.offsetHeight - innerHeight);
    else y -= 76;
  }
  y = Math.max(0, Math.round(y));
  if (lenis && !reduceMQ.matches) lenis.scrollTo(y, { lerp: 0.15 });
  else scrollTo({ top: y, behavior: 'auto' });
  try { history.replaceState(null, '', id && id !== 'top' ? '#' + id : location.pathname + location.search); } catch (e) { /* ignore */ }
  /* Lenis owns anchor scrolling here, so move keyboard focus to the destination ourselves (the skip link included) */
  const dest = target || document.getElementById('top');
  if (dest) {
    if (!dest.hasAttribute('tabindex')) dest.setAttribute('tabindex', '-1');
    try { dest.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a || a.hasAttribute('download')) return;
  const h = a.getAttribute('href');
  if (h.length < 2 && h !== '#') return;
  e.preventDefault();
  if (menuOpen()) { setMenu(false); setTimeout(() => goTo(h), 80); } else goTo(h);
});

/* ------------------------------------------------------------------ reveal, count-up, scrub */
const revealIO = new IntersectionObserver((ents) => {
  for (const en of ents) {
    if (!en.isIntersecting) continue;
    en.target.classList.add('is-in');
    revealIO.unobserve(en.target);
    if (en.target.classList.contains('stat')) countUp(en.target);
    if (en.target.classList.contains('case-panel')) panelIn(en.target);
  }
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
const panelIO = new IntersectionObserver((ents) => {
  for (const en of ents) {
    if (!en.isIntersecting) continue;
    en.target.classList.add('is-in');
    panelIO.unobserve(en.target);
    panelIn(en.target);
  }
}, { threshold: 0.02, rootMargin: '0px 0px -15% 0px' });
$$('.reveal,.mask').forEach((el) => revealIO.observe(el));
$$('.case-panel').forEach((el) => panelIO.observe(el));

function countUp(tile) {
  const f = $('.t-stat', tile);
  if (!f || reduceMQ.matches) return;
  const final = f.dataset.final;
  if (f.dataset.count) {
    const target = parseFloat(f.dataset.count), dec = +f.dataset.dec || 0, pre = f.dataset.prefix || '', suf = f.dataset.suffix || '';
    tween(1100, (t) => { f.textContent = pre + (eoe(t) * target).toFixed(dec) + suf; }, () => { f.textContent = final; });
  } else if (f.dataset.slot) {
    const L = 'FIRSTfirstXYZ', frames = 4;
    tween(frames * 80, (t) => {
      const k = Math.floor(t * frames);
      if (k >= frames) return;
      let s = '';
      for (let i = 0; i < 5; i++) s += L[(i * 7 + k * 5 + 3) % L.length];
      f.textContent = s;
    }, () => { f.textContent = final; });
  }
}

/* word scrub */
const scrubEls = [];
function buildScrub() {
  if (scrubEls.length || reduceMQ.matches) return;
  $$('[data-scrub]').forEach((el) => {
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
            const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = tok; sp.style.setProperty('--wo', '.22');
            words.push(sp); frag.appendChild(sp);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    scrubEls.push({ el, words });
  });
}
buildScrub();
function clearScrub() { for (const sc of scrubEls) for (const w of sc.words) w.style.setProperty('--wo', '1'); }
reduceMQ.addEventListener('change', () => {
  if (reduceMQ.matches) { stopLenis(); clearScrub(); } else { startLenis(); buildScrub(); }
  frameDirty = true;
});

/* ------------------------------------------------------------------ segmented controls */
const segs = $$('.seg');
function layoutSeg(sg) {
  const th = $('.thumb', sg);
  const b = $('[aria-checked="true"]', sg);
  if (!th || !b || !b.offsetWidth) return;
  th.style.width = b.offsetWidth + 'px';
  th.style.transform = 'translateX(' + b.offsetLeft + 'px)';
}
function initSeg(sg, onChange) {
  const btns = $$('[role="radio"]', sg);
  const api = {
    get value() { return $('[aria-checked="true"]', sg).dataset.v; },
    set(v, silent) {
      btns.forEach((b) => b.setAttribute('aria-checked', b.dataset.v === v ? 'true' : 'false'));
      layoutSeg(sg);
      if (!silent && onChange) onChange(v);
    },
  };
  btns.forEach((b, i) => {
    b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1;
    b.addEventListener('click', () => { if (api.value !== b.dataset.v) { api.set(b.dataset.v); } btns.forEach((x) => (x.tabIndex = x === b ? 0 : -1)); });
    b.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
      e.preventDefault();
      const n = btns[(i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length];
      n.focus(); n.click();
    });
  });
  sg.classList.add('no-anim');
  requestAnimationFrame(() => { layoutSeg(sg); requestAnimationFrame(() => sg.classList.remove('no-anim')); });
  return api;
}

/* ------------------------------------------------------------------ SOC ablation panel */
const socCase = $('#soc');
const socScene = sceneById.soc;
const ABL_CAP = $('[data-foot]', socCase).textContent;
const SIM_CAP = 'fig.3 · state of charge on a sealed test cycle. Illustrative traces scaled to the paper\'s ten-seed mean errors.';
const ablRows = $$('.abl-row', socCase);
const ablRead = $('[data-abl-read]', socCase);
const ablTake = $('[data-abl-take]', socCase);
let ablCycle = 'paris', ablGrown = false;
const AXIS = 1.6;
function ablRender() {
  const k = ablCycle === 'paris' ? 'p' : 'u';
  const base = parseFloat(ablRows[0].dataset[k + 'm']);
  ablRows.forEach((r, i) => {
    const m = parseFloat(r.dataset[k + 'm']);
    r.style.setProperty('--v', ablGrown ? (m / AXIS).toFixed(4) : '0');
    r.style.setProperty('--k', ablGrown ? i : 0);
    $('.abl-track', r).style.setProperty('--bv', (base / AXIS).toFixed(4));
    $('.abl-val', r).textContent = m.toFixed(2) + '%';
  });
  if (ablTake) ablTake.innerHTML = ablCycle === 'paris'
    ? 'ToF + displacement wins on blind Paris at <em>0.57%</em>'
    : 'ToF + displacement wins on US06 at <em>0.79%</em>';
  const sel = $('.abl-row.is-sel', socCase) || ablRows[4];
  ablSelect(sel, true);
}
function ablSelect(r, quiet) {
  ablRows.forEach((x) => x.classList.toggle('is-sel', x === r));
  const k = ablCycle === 'paris' ? 'p' : 'u';
  const m = parseFloat(r.dataset[k + 'm']).toFixed(2), sd = parseFloat(r.dataset[k + 'sd']).toFixed(2), seeds = r.dataset[k + 's'];
  const name = r.getAttribute('aria-label');
  ablRead.innerHTML = '<strong>' + name + '</strong> · ' + m + ' ± ' + sd + '% mean absolute error · ' +
    (seeds ? seeds + '% of seeds beat the baseline' : 'the baseline every other variant is measured against');
  if (!quiet) markManual(socScene);
}
ablRows.forEach((r) => {
  r.addEventListener('click', () => ablSelect(r));
  r.addEventListener('mouseenter', () => { if (finePointer.matches) ablSelect(r, true); });
  r.addEventListener('focus', () => ablSelect(r, true));
});
function markManual(s) { if (s && s.el.dataset.manual !== '1') s.el.dataset.manual = '1'; }

const socTabSeg = $('[data-seg="soc-tab"]', socCase);
const socCycleSeg = $('[data-seg="soc-cycle"]', socCase);
const socTab = initSeg(socTabSeg, (v) => { showSocView(v); markManual(socScene); });
const socCycle = initSeg(socCycleSeg, (v) => { ablCycle = v; ablRender(); markManual(socScene); });
function showSocView(v) {
  $$('.soc-view', socCase).forEach((el) => { el.hidden = el.dataset.view !== v; });
  socCycleSeg.style.visibility = v === 'abl' ? '' : 'hidden';
  $('[data-foot]', socCase).textContent = v === 'abl' ? ABL_CAP : SIM_CAP;
  socTab.set(v, true);
}
function panelIn(panel) {
  if (panel.closest('#soc')) setTimeout(() => { ablGrown = true; ablRender(); }, 220);
}
ablRender();

if (socScene) {
  socScene.on = (ps) => {
    if (!pinned || socScene.el.dataset.manual === '1') return;
    const wantCycle = ps > 0.42 ? 'us06' : 'paris';
    if (wantCycle !== ablCycle) { ablCycle = wantCycle; socCycle.set(wantCycle, true); ablRender(); }
    const wantView = ps > 0.7 ? 'sim' : 'abl';
    const cur = $('.soc-view:not([hidden])', socCase).dataset.view;
    if (wantView !== cur) showSocView(wantView);
  };
}

/* builds filter */
const grid = $('#builds-grid');
const cards = $$('.card', grid);
const filterSeg = initSeg($('[data-seg="filter"]'), (v) => {
  cards.forEach((c, idx) => {
    const match = v === 'all' || c.dataset.cat === v;
    clearTimeout(c._t);
    if (match) {
      if (c.hidden) { c.hidden = false; c.classList.remove('is-out'); c.style.setProperty('--i', idx % 6); c.classList.remove('re-in'); void c.offsetWidth; c.classList.add('re-in'); c._t = setTimeout(() => c.classList.remove('re-in'), 900); }
      else c.classList.remove('is-out');
    } else if (!c.hidden) {
      c.classList.add('is-out');
      c._t = setTimeout(() => { c.hidden = true; balanceGrid(); }, reduceMQ.matches ? 0 : 180);
    }
  });
  balanceGrid();
});
cards.forEach((c) => {
  c.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
});

/* marquee pause control (WCAG 2.2.2) */
const mqBtn = $('#mq-pause');
const mqEl = $('.marquee');
if (mqBtn && mqEl) {
  const setMq = (paused) => {
    mqEl.classList.toggle('is-paused', paused);
    mqBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    mqBtn.setAttribute('aria-label', paused ? 'Resume the scrolling technologies list' : 'Pause the scrolling technologies list');
  };
  mqBtn.addEventListener('click', () => setMq(!mqEl.classList.contains('is-paused')));
  mqEl.addEventListener('click', () => { if (!finePointer.matches) setMq(!mqEl.classList.contains('is-paused')); });
}

/* the last visible card fills its row, so the grid never ends on a lone card (V14) */
function balanceGrid() {
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
  cards.forEach((c) => { c.classList.remove('card--fill'); c.style.removeProperty('--span'); });
  if (cols < 2) return;
  const vis = cards.filter((c) => !c.hidden && !c.classList.contains('is-out'));
  if (!vis.length) return;
  const used = vis.reduce((n, c) => n + (c.classList.contains('card--wide') ? 2 : 1), 0);
  const rem = used % cols;
  if (rem === 0) return;
  const last = vis[vis.length - 1];
  const own = last.classList.contains('card--wide') ? 2 : 1;
  last.classList.add('card--fill');
  last.style.setProperty('--span', String(own + (cols - rem)));
}
new ResizeObserver(() => balanceGrid()).observe(grid);

/* builds filter: fade the right edge only while the bar can still scroll (V18) */
const filterBar = $('.filters');
function filterCue() {
  if (!filterBar) return;
  filterBar.classList.toggle('can-scroll-r', filterBar.scrollWidth - filterBar.clientWidth - filterBar.scrollLeft > 4);
}
if (filterBar) {
  filterBar.addEventListener('scroll', filterCue, { passive: true });
  new ResizeObserver(filterCue).observe(filterBar);
}

/* gearbox video */
const vid = $('#gearbox-vid');
if (vid) {
  const wrap = vid.closest('.vid');
  const btn = $('.vid-btn', wrap);
  const playV = () => { const p = vid.play(); if (p && p.catch) p.catch(() => {}); };
  vid.addEventListener('play', () => wrap.classList.add('is-playing'));
  vid.addEventListener('pause', () => wrap.classList.remove('is-playing'));
  btn.addEventListener('click', () => { vid.paused ? playV() : vid.pause(); });
  vid.addEventListener('click', () => { if (!vid.paused) vid.pause(); });
  if (finePointer.matches && !reduceMQ.matches) {
    new IntersectionObserver((ents) => {
      for (const en of ents) { if (en.isIntersecting) { vid.preload = 'auto'; playV(); } else vid.pause(); }
    }, { threshold: 0.6 }).observe(vid);
  }
}

/* contact: copy email, toast */
const toast = $('#toast');
let toastT = 0;
function showToast(msg) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 1800);
}
const emailBtn = $('#email-btn');
if (emailBtn) {
  emailBtn.addEventListener('click', async () => {
    const addr = emailBtn.dataset.email;
    if (matchMedia('(hover:none),(pointer:coarse)').matches) { location.href = 'mailto:' + addr; return; }
    try {
      await navigator.clipboard.writeText(addr);
    } catch (e) { location.href = 'mailto:' + addr; return; }
    const txt = $('.e-txt', emailBtn), orig = txt.textContent, ico = $('.e-ico', emailBtn), origI = ico.innerHTML;
    txt.textContent = 'Copied';
    ico.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    emailBtn.classList.add('is-done');
    showToast('Copied');
    setTimeout(() => { txt.textContent = orig; ico.innerHTML = origI; emailBtn.classList.remove('is-done'); }, 1800);
  });
}

/* ------------------------------------------------------------------ hero mount */
const heroEl = $('#hero-stage');
const heroText = $('#hero-text');
const heroScene = sceneById.top;
let heroInst = null;
let heroStatic = false;
const heroStage = heroEl.closest('.stage');
function syncHeroStatic() {
  const off = heroStage.dataset.webgl === 'off' || heroEl.dataset.webgl === 'off';
  if (off === heroStatic) return;
  heroStatic = off;
  heroScene.el.classList.toggle('hero--static', off);
  measure();
}
new MutationObserver(syncHeroStatic).observe(heroStage, { attributes: true, attributeFilter: ['data-webgl'] });
new MutationObserver(syncHeroStatic).observe(heroEl, { attributes: true, attributeFilter: ['data-webgl'] });
async function mountHero() {
  try {
    const m = await import('./hero.js');
    heroInst = m.mount(heroEl, { theme: getTheme(), reducedMotion: reduceMQ.matches });
  } catch (e) {
    heroEl.closest('.stage').dataset.webgl = 'off';
    $('#hero-fallback').classList.add('on');
  }
}
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 60));
const startHero = () => idle(mountHero, { timeout: 1200 });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startHero); else startHero();

/* ------------------------------------------------------------------ showcases */
function mountShow(el, scene) {
  const name = el.dataset.show;
  el.dataset.state = 'loading';
  const fb = $('.show-fallback', el);
  import('./show-' + name + '.js').then((m) => {
    if (fb) fb.remove();
    let inst = null;
    try { inst = m.mount(el, { theme: getTheme(), reducedMotion: reduceMQ.matches, bare: name === 'soc' }); } catch (err) { throw err; }
    el.dataset.state = 'ready';
    const rec = { name, inst, scene };
    instances.push(rec);
    ['pointerdown', 'keydown', 'input'].forEach((ev) => el.addEventListener(ev, () => markManual(scene), { capture: true, passive: true }));
    if (name === 'shaft') shaftSync(rec, scene && scene.ps, true);
  }).catch(() => {
    el.dataset.state = 'unavailable';
    if (fb && !fb.isConnected) el.prepend(fb);
  });
}
$$('.show[data-show]').forEach((el) => {
  const scene = sceneById[el.closest('[data-case]').dataset.case];
  const io = new IntersectionObserver((ents) => {
    if (ents.some((e) => e.isIntersecting)) { io.disconnect(); mountShow(el, scene); }
  }, { rootMargin: '0px 0px 60% 0px' });
  io.observe(el);
});

/* shaft: scroll explodes the assembly, then flips to the forces view */
let shaftLast = { ex: -1, view: '' };
function shaftSync(rec, ps, force) {
  const sc = rec.scene;
  if (!pinned || (sc && sc.el.dataset.manual === '1') || !rec.inst) return;
  const inst = rec.inst;
  const ex = eio(seg(ps, 0.1, 0.55));
  if (inst.setExplode && (force || Math.abs(ex - shaftLast.ex) > 0.003)) { inst.setExplode(ex); shaftLast.ex = ex; }
  const view = ps > 0.66 ? 'forces' : 'iso';
  if (inst.setView && (force || view !== shaftLast.view)) { inst.setView(view); shaftLast.view = view; }
}
if (sceneById.shaft) {
  sceneById.shaft.on = (ps) => {
    const rec = instances.find((i) => i.name === 'shaft');
    if (rec) shaftSync(rec, ps);
  };
}

/* ------------------------------------------------------------------ the one rAF */
let last = performance.now();
const aboutEl = $('#about');
const photo = $('.photo-frame');
const contactBand = $('.contact-band');
let lastY = -1, lastVh = -1, lastLayoutV = -1, lastPinned = null, lastHero = null, lastHeroStatic = null;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (lenis) lenis.raf(t);
  const y = scrollY;
  let settling = false;

  for (const s of scenes) {
    if (!s.init) {
      s.p = pinned ? clamp((y - s.top) / s.len, 0, 1) : 1;
      s.ps = s.p; s.init = true;
      s.el.style.setProperty('--p', s.ps.toFixed(4));
      if (s.on) s.on(s.ps, s.p, dt);
      settling = true;
      continue;
    }
    const near = y + vh * 1.3 > s.top && y < s.top + s.len + vh * 1.2;
    if (!near) continue;
    s.p = pinned ? clamp((y - s.top) / s.len, 0, 1) : 1;
    const was = s.ps;
    s.ps = pinned ? damp(s.ps, s.p, 8, dt) : 1;
    if (Math.abs(s.ps - s.p) > 0.0004 || s.ps !== was) settling = true;
    if (s.ps !== was) s.el.style.setProperty('--p', s.ps.toFixed(4));
    if (s.on) s.on(s.ps, s.p, dt);
  }

  /* everything below only recomputes when the scroll position, the viewport, the layout or a scene has moved */
  const moved = y !== lastY || vh !== lastVh || layoutV !== lastLayoutV || pinned !== lastPinned || heroInst !== lastHero || heroStatic !== lastHeroStatic || frameDirty;
  if (moved || settling) {
    /* hero */
    if (heroScene) {
      if (pinned && !heroStatic) {
        const ps = heroScene.ps;
        if (heroInst) heroInst.setProgress(ps);
        const f = clamp(ps / 0.12, 0, 1);
        heroText.style.opacity = String(1 - f);
        heroText.style.transform = 'translate3d(0,' + (-48 * f).toFixed(1) + 'px,0)';
        heroText.classList.toggle('gone', f > 0.92);
      } else {
        heroText.style.opacity = '';
        heroText.style.transform = '';
        heroText.classList.remove('gone');
      }
    }

    /* nav */
    nav.classList.toggle('is-scrolled', y > 24);
    if (contactBand) {
      const cb = contactBand.getBoundingClientRect();
      nav.classList.toggle('over-contact', cb.top < 72 && cb.bottom > 16);
    }
    navProg.style.transform = 'scaleX(' + clamp(y / docMax, 0, 1).toFixed(4) + ')';
    const probe = y + vh * 0.45;
    let act = null;
    for (const s of secEls) if (s.top <= probe) act = s.id;
    setActive(act);

    /* word scrub */
    if (!reduceMQ.matches) {
      for (const sc of scrubEls) {
        const r = sc.el.getBoundingClientRect();
        if (r.bottom < -40 || r.top > vh + 40) continue;
        const tt = clamp((vh * 0.85 - r.top) / (vh * 0.5), 0, 1);
        const n = sc.words.length;
        for (let i = 0; i < n; i++) {
          const w = seg(tt, (i / n) * 0.8, (i / n) * 0.8 + 0.2);
          sc.words[i].style.setProperty('--wo', (0.22 + 0.78 * w).toFixed(3));
        }
      }
    }

    /* about parallax */
    if (pinned && aboutEl && photo) {
      const r = aboutEl.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) photo.style.setProperty('--sp', clamp((vh - r.top) / (vh + r.height), 0, 1).toFixed(3));
    }
    if (!pinChanging) anchorNow = captureAnchor();
    lastY = y; lastVh = vh; lastLayoutV = layoutV; lastPinned = pinned; lastHero = heroInst; lastHeroStatic = heroStatic; frameDirty = false;
  }

  /* tweens */
  if (tweens.length) {
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = clamp((now - tw.t0) / tw.dur, 0, 1);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
  }
  requestAnimationFrame(frame);
}
measure();
requestAnimationFrame(frame);

/* ------------------------------------------------------------------ teardown */
/* free GPU contexts, observers and rAF loops when the page is left (bfcache keeps pageshow alive, so only dispose on real unload) */
addEventListener('pagehide', (e) => {
  if (e.persisted) return;
  for (const i of instances) { try { i.inst && i.inst.dispose && i.inst.dispose(); } catch (err) { /* already gone */ } }
  try { heroInst && heroInst.dispose && heroInst.dispose(); } catch (err) { /* already gone */ }
  try { lenis && lenis.destroy && lenis.destroy(); } catch (err) { /* already gone */ }
});
