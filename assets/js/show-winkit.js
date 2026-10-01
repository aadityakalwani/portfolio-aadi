/*
 * show-winkit.js
 * Winkit order-flow showcase: a stylised local map where simulated orders travel
 * customer pays -> lands on the kitchen's own system -> kitchen ready -> driver
 * dispatched (GPS) -> delivered, with live order states and a delivered counter.
 *
 * Module contract:
 *   import { mount } from './show-winkit.js';
 *   const api = mount(container, { theme: 'light' | 'dark', reducedMotion: bool });
 *   api.dispose();  api.setTheme('dark');
 *
 * Self contained: canvas 2D plus a small DOM overlay. All CSS is scoped under the
 * "wkf-" prefix and injected once. Never throws: any failure drops to a static fallback.
 */

const STYLE_ID = 'wkf-style';
let styleRefs = 0;

/* Winkit brand colours, sampled from assets/winkit-logo.png */
const WK = { orange: '#F89400', orangeSoft: '#FFB547', blue: '#0A31A0' };

const PAL = {
  light: {
    land: '#F0EEE2', block: '#E9E6D6', blockEdge: 'rgba(14,27,46,.055)', plot: 'rgba(14,27,46,.028)',
    park: 'rgba(21,122,67,.10)', tree: 'rgba(21,122,67,.16)', water: '#DBE4F8', waterLine: 'rgba(30,72,224,.10)',
    road: '#FBFAF5', roadEdge: 'rgba(14,27,46,.075)', lane: 'rgba(14,27,46,.11)',
    ink: '#0E1B2E', muted: '#5B6577', accent: '#1E48E0', accentGlow: 'rgba(30,72,224,.30)',
    house: '#FFFFFF', houseLine: 'rgba(14,27,46,.24)', roof: '#8A93A5', shadow: 'rgba(14,27,46,.16)',
    pill: '#FFFFFF', pillLine: 'rgba(14,27,46,.12)', ok: '#157A43', kitchen: WK.blue, kitchenText: '#FFFFFF',
    card: 'rgba(255,255,255,.96)', cardLine: 'rgba(14,27,46,.14)', cardRow: 'rgba(14,27,46,.045)', driverRing: '#FFFFFF'
  },
  dark: {
    land: '#0B1324', block: '#0F1A31', blockEdge: 'rgba(234,238,247,.06)', plot: 'rgba(234,238,247,.04)',
    park: 'rgba(76,195,138,.11)', tree: 'rgba(76,195,138,.20)', water: '#13244A', waterLine: 'rgba(127,156,255,.10)',
    road: '#1A2644', roadEdge: 'rgba(234,238,247,.05)', lane: 'rgba(234,238,247,.10)',
    ink: '#EAEEF7', muted: '#9AA6BD', accent: '#6F92FF', accentGlow: 'rgba(111,146,255,.38)',
    house: '#E8ECF6', houseLine: 'rgba(0,0,0,.45)', roof: '#6C7891', shadow: 'rgba(0,0,0,.45)',
    pill: '#1E2B4C', pillLine: 'rgba(234,238,247,.14)', ok: '#4CC38A', kitchen: '#2C54C9', kitchenText: '#FFFFFF',
    card: 'rgba(24,35,61,.96)', cardLine: 'rgba(234,238,247,.16)', cardRow: 'rgba(234,238,247,.06)', driverRing: '#18233D'
  }
};

const CSS = `
.wkf-root{--wkf-ink:#0E1B2E;--wkf-ink2:#26344A;--wkf-muted:#5B6577;--wkf-accent:#1E48E0;--wkf-wash:rgba(30,72,224,.08);--wkf-line:rgba(14,27,46,.10);--wkf-glass:rgba(251,250,245,.80);--wkf-glass2:rgba(255,255,255,.92);--wkf-land:#F0EEE2;--wkf-ok:#157A43;--wkf-orange:#F89400;--wkf-on:#fff;--wkf-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 1px 2px rgba(14,27,46,.06),0 18px 40px -22px rgba(14,27,46,.35);--wkf-side:244px;
position:relative;width:100%;height:100%;min-height:340px;overflow:hidden;background:var(--wkf-land);color:var(--wkf-ink);font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.35;isolation:isolate;-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased;border-radius:inherit}
.wkf-root[data-theme="dark"]{--wkf-ink:#EAEEF7;--wkf-ink2:#C8D1E3;--wkf-muted:#9AA6BD;--wkf-accent:#6F92FF;--wkf-wash:rgba(111,146,255,.14);--wkf-line:rgba(234,238,247,.12);--wkf-glass:rgba(18,27,48,.72);--wkf-glass2:rgba(24,35,61,.94);--wkf-land:#0B1324;--wkf-ok:#4CC38A;--wkf-on:#0A1020;--wkf-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 2px rgba(0,0,0,.4),0 18px 40px -22px rgba(0,0,0,.7)}
.wkf-root *{box-sizing:border-box}
.wkf-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:pointer}
.wkf-hdr{position:absolute;left:12px;top:12px;display:flex;align-items:center;gap:8px;z-index:2;max-width:calc(100% - 24px)}
.wkf-logo{display:inline-flex;align-items:center;height:36px;padding:0 12px;background:#fff;border:1px solid rgba(14,27,46,.10);border-radius:999px;box-shadow:var(--wkf-shadow)}
.wkf-logo img{height:17px;width:auto;display:block}
.wkf-live{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:var(--wkf-glass);border:1px solid var(--wkf-line);box-shadow:var(--wkf-shadow);-webkit-backdrop-filter:blur(14px) saturate(1.5);backdrop-filter:blur(14px) saturate(1.5);font-size:12px;font-weight:500;color:var(--wkf-ink2);white-space:nowrap}
.wkf-live i{width:7px;height:7px;border-radius:50%;background:var(--wkf-ok);box-shadow:0 0 0 0 var(--wkf-ok);animation:wkf-live 2s ease-out infinite}
.wkf-btn{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;padding:0 16px;border-radius:999px;background:var(--wkf-accent);color:var(--wkf-on);font:600 13px/1 "Inter",ui-sans-serif,system-ui,sans-serif;letter-spacing:-.005em;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 12px 24px -12px rgba(30,72,224,.65);transition:transform .18s cubic-bezier(.2,.7,.2,1),filter .18s;white-space:nowrap}
.wkf-btn:hover{filter:brightness(1.08)}
.wkf-btn:active{transform:scale(.97)}
.wkf-btn:focus-visible{outline:2px solid var(--wkf-accent);outline-offset:3px}
.wkf-btn svg{width:13px;height:13px;flex:none}
.wkf-root[data-theme="dark"] .wkf-btn{color:#fff;background:#3A62F0}
.wkf-side{position:absolute;z-index:2;top:12px;right:12px;bottom:12px;width:calc(var(--wkf-side) - 24px);display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:20px;background:var(--wkf-glass);border:1px solid var(--wkf-line);box-shadow:var(--wkf-shadow);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6)}
.wkf-count{display:flex;flex-direction:column;gap:2px}
.wkf-num{font-family:var(--font-display,"Instrument Serif","Iowan Old Style",Georgia,serif);font-size:56px;line-height:.95;letter-spacing:-.025em;font-variant-numeric:lining-nums tabular-nums;color:var(--wkf-ink);display:inline-block;transform-origin:left bottom}
.wkf-num.wkf-bump{animation:wkf-bump .5s cubic-bezier(.34,1.56,.64,1)}
.wkf-cap{font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--wkf-muted)}
.wkf-sec{display:flex;flex-direction:column;gap:8px;min-height:0}
.wkf-sec-feed{flex:1 1 auto;border-top:1px solid var(--wkf-line);padding-top:12px}
.wkf-h{font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--wkf-muted)}
.wkf-feed{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.wkf-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;column-gap:10px;padding:9px 11px;border-radius:12px;background:var(--wkf-glass2);border:1px solid var(--wkf-line);animation:wkf-in .4s cubic-bezier(.16,1,.3,1)}
.wkf-rid{font:600 12px/1 ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:var(--wkf-ink);font-variant-numeric:tabular-nums}
.wkf-rs{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:500;color:var(--wkf-ink2);min-width:0}
.wkf-rs i{width:7px;height:7px;border-radius:50%;flex:none;background:var(--wkf-muted)}
.wkf-row[data-s="pay"] .wkf-rs i,.wkf-row[data-s="send"] .wkf-rs i{background:var(--wkf-accent)}
.wkf-row[data-s="cook"] .wkf-rs i,.wkf-row[data-s="ready"] .wkf-rs i{background:var(--wkf-orange)}
.wkf-row[data-s="deliver"] .wkf-rs i{background:var(--wkf-orange);box-shadow:0 0 0 3px rgba(248,148,0,.22)}
.wkf-row[data-s="done"] .wkf-rs i{background:var(--wkf-ok)}
.wkf-tag{display:inline-flex;align-items:center;color:var(--wkf-ok)}
.wkf-tag svg{width:12px;height:12px}
.wkf-zeros{display:flex;flex-wrap:wrap;gap:6px}
.wkf-z{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--wkf-line);font-size:12px;font-weight:500;color:var(--wkf-muted);background:transparent;transition:color .3s,background-color .3s,border-color .3s}
.wkf-z svg{width:11px;height:11px;opacity:.35;transition:opacity .3s}
.wkf-z.wkf-on{color:var(--wkf-accent);background:var(--wkf-wash);border-color:rgba(30,72,224,.28)}
.wkf-root[data-theme="dark"] .wkf-z.wkf-on{border-color:rgba(111,146,255,.4)}
.wkf-z.wkf-on svg{opacity:1}
.wkf-btn-side{width:100%;height:40px}
.wkf-btn-top{display:none}
.wkf-rail{position:absolute;z-index:2;left:12px;right:calc(var(--wkf-side) + 0px);bottom:12px;margin:0;list-style:none;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:6px;border-radius:18px;background:var(--wkf-glass);border:1px solid var(--wkf-line);box-shadow:var(--wkf-shadow);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6)}
.wkf-step{position:relative;display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:13px;color:var(--wkf-muted);font-size:12.5px;font-weight:500;line-height:1.2;transition:background-color .3s,color .3s;min-width:0}
.wkf-dot{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;border:1px solid var(--wkf-line);color:var(--wkf-muted);transition:background-color .3s,color .3s,border-color .3s}
.wkf-lbl .wkf-short{display:none}
.wkf-step.wkf-lit{background:var(--wkf-wash);color:var(--wkf-ink)}
.wkf-step.wkf-lit .wkf-dot{background:var(--wkf-accent);border-color:var(--wkf-accent);color:var(--wkf-on)}
.wkf-root[data-theme="dark"] .wkf-step.wkf-lit .wkf-dot{color:#fff;background:#3A62F0;border-color:#3A62F0}
.wkf-step.wkf-ok.wkf-lit .wkf-dot{background:var(--wkf-ok);border-color:var(--wkf-ok);color:#fff}
.wkf-step::after{content:"";position:absolute;inset:0;border-radius:13px;border:1.5px solid var(--wkf-accent);opacity:0;pointer-events:none}
.wkf-step.wkf-ping::after{animation:wkf-ping .8s cubic-bezier(.16,1,.3,1)}
.wkf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wkf-root[data-size="l"] .wkf-btn-top{display:none}
.wkf-root[data-size="m"],.wkf-root[data-size="s"]{--wkf-side:0px}
.wkf-root[data-size="m"] .wkf-rail,.wkf-root[data-size="s"] .wkf-rail{right:12px}
.wkf-root[data-size="m"] .wkf-side,.wkf-root[data-size="s"] .wkf-side{top:12px;right:12px;bottom:auto;width:auto;padding:8px 14px;border-radius:16px;gap:0;flex-direction:row;align-items:center}
.wkf-root[data-size="m"] .wkf-sec,.wkf-root[data-size="s"] .wkf-sec,.wkf-root[data-size="m"] .wkf-btn-side,.wkf-root[data-size="s"] .wkf-btn-side{display:none}
.wkf-root[data-size="m"] .wkf-count,.wkf-root[data-size="s"] .wkf-count{flex-direction:row;align-items:baseline;gap:8px}
.wkf-root[data-size="m"] .wkf-num,.wkf-root[data-size="s"] .wkf-num{font-size:30px}
.wkf-root[data-size="m"] .wkf-btn-top,.wkf-root[data-size="s"] .wkf-btn-top{display:inline-flex}
.wkf-root[data-size="s"] .wkf-logo,.wkf-root[data-size="s"] .wkf-live{display:none}
.wkf-root[data-size="s"] .wkf-rail{gap:2px;padding:5px}
.wkf-root[data-size="s"] .wkf-step{flex-direction:column;gap:5px;padding:7px 2px 6px;text-align:center;font-size:10.5px}
.wkf-root[data-size="m"] .wkf-lbl .wkf-full,.wkf-root[data-size="s"] .wkf-lbl .wkf-full{display:none}
.wkf-root[data-size="m"] .wkf-lbl .wkf-short,.wkf-root[data-size="s"] .wkf-lbl .wkf-short{display:inline}
@media (pointer:coarse){.wkf-btn{height:44px}.wkf-root[data-size="s"] .wkf-hdr{top:10px}}
.wkf-fb{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;width:100%;min-height:300px;padding:32px 20px;background:#EFEDE0;color:#0E1B2E;font-family:"Inter",ui-sans-serif,system-ui,sans-serif;border-radius:inherit;text-align:center}
.wkf-fb[data-theme="dark"]{background:#0B1324;color:#EAEEF7}
.wkf-fb .wkf-logo{height:40px}
.wkf-fb ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.wkf-fb li{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(14,27,46,.14);background:rgba(255,255,255,.7);font-size:13px;font-weight:500}
.wkf-fb[data-theme="dark"] li{background:rgba(24,35,61,.9);border-color:rgba(234,238,247,.16)}
.wkf-fb li b{font-weight:600;color:#1E48E0;font-variant-numeric:tabular-nums}
.wkf-fb[data-theme="dark"] li b{color:#7F9CFF}
.wkf-fb p{margin:0;max-width:44ch;font-size:14px;color:#5B6577}
.wkf-fb[data-theme="dark"] p{color:#9AA6BD}
@keyframes wkf-live{0%{box-shadow:0 0 0 0 rgba(21,122,67,.45)}70%,100%{box-shadow:0 0 0 7px rgba(21,122,67,0)}}
@keyframes wkf-bump{0%{transform:scale(1)}35%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes wkf-in{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes wkf-ping{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){.wkf-live i,.wkf-row,.wkf-num.wkf-bump,.wkf-step.wkf-ping::after{animation:none}}
`;

function ensureStyle(doc) {
  styleRefs++;
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.appendChild(s);
}
function releaseStyle(doc) {
  styleRefs = Math.max(0, styleRefs - 1);
  if (styleRefs === 0) {
    const s = doc.getElementById(STYLE_ID);
    if (s) s.remove();
  }
}

/* ------------------------------------------------------------------ helpers */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const eio = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eout = t => 1 - Math.pow(1 - t, 3);
const eback = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const ICON_CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.4l2.4 2.4 4.6-5.2"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>';

const STEPS = [
  { full: 'Customer pays', short: 'Pays' },
  { full: "Kitchen's own system", short: 'Kitchen' },
  { full: 'Kitchen ready', short: 'Ready' },
  { full: 'Driver dispatched', short: 'Driver' },
  { full: 'Delivered', short: 'Delivered' }
];

const PHASE_LABEL = {
  pay: 'Awaiting payment', send: 'Sent to kitchen', inject: 'At the kitchen', cook: 'Being prepared',
  ready: 'Ready for pickup', deliver: 'Out for delivery', done: 'Delivered'
};
const PHASE_KEY = { pay: 'pay', send: 'send', inject: 'send', cook: 'cook', ready: 'ready', deliver: 'deliver', done: 'done' };
const PHASE_STEP = { pay: 0, send: 1, inject: 1, cook: 1, ready: 2, deliver: 3, done: 4 };

/* ------------------------------------------------------------------ mount */
export function mount(container, opts) {
  opts = opts || {};
  let inner = null;
  let disposed = false;
  let theme = opts.theme === 'dark' ? 'dark' : 'light';
  const api = {
    dispose() {
      if (disposed) return;
      disposed = true;
      try { inner && inner.dispose(); } catch (e) { /* ignore */ }
      inner = null;
    },
    setTheme(t) {
      theme = t === 'dark' ? 'dark' : 'light';
      try { inner && inner.setTheme && inner.setTheme(theme); } catch (e) { /* ignore */ }
    },
    advance(sec) { try { inner && inner.advance && inner.advance(sec); } catch (e) { console.warn('[show-winkit] advance failed:', e && e.message); } }
  };
  const goFallback = () => {
    try { inner && inner.dispose(); } catch (e) { /* ignore */ }
    inner = null;
    if (disposed) return;
    try { inner = fallbackMount(container, theme); } catch (e) { inner = null; }
  };
  const ref = {};
  try {
    inner = realMount(container, opts, goFallback, ref);
  } catch (err) {
    try { ref.cleanup && ref.cleanup(); } catch (e) { /* ignore */ }
    try { console.warn('[show-winkit] falling back to static view:', err && err.message); } catch (e) { /* ignore */ }
    goFallback();
  }
  return api;
}

function fallbackMount(container, theme) {
  const doc = container.ownerDocument || document;
  let styled = false;
  try { ensureStyle(doc); styled = true; } catch (e) { /* inline fallback below */ }
  const box = doc.createElement('div');
  box.className = 'wkf-fb';
  box.dataset.theme = theme;
  if (!styled) box.style.cssText = 'padding:32px 20px;text-align:center;font-family:system-ui,sans-serif;background:#EFEDE0;color:#0E1B2E';
  let logo = '';
  try { logo = new URL('../winkit-logo.png', import.meta.url).href; } catch (e) { /* none */ }
  box.innerHTML =
    (logo ? '<span class="wkf-logo"><img alt="Winkit" src="' + logo + '"></span>' : '<strong>Winkit</strong>') +
    '<ol>' + STEPS.map((s, i) => '<li><b>' + (i + 1) + '</b>' + s.full + '</li>').join('') + '</ol>' +
    "<p>The customer pays by card, the order lands on the kitchen's own system, a driver is dispatched by GPS and the order is delivered.</p>";
  container.appendChild(box);
  return {
    dispose() { box.remove(); if (styled) releaseStyle(doc); },
    setTheme(t) { box.dataset.theme = t === 'dark' ? 'dark' : 'light'; }
  };
}

function realMount(container, opts, onFatal, ref) {
  if (!container || typeof container.appendChild !== 'function') throw new Error('no container');
  const doc = container.ownerDocument || document;
  const win = doc.defaultView || window;
  const reduced = typeof opts.reducedMotion === 'boolean'
    ? opts.reducedMotion
    : !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let theme = opts.theme === 'dark' ? 'dark' : 'light';
  let P = PAL[theme];

  ensureStyle(doc);

  let logoSrc = '';
  try { logoSrc = new URL('../winkit-logo.png', import.meta.url).href; } catch (e) { /* no logo */ }

  const root = doc.createElement('div');
  root.className = 'wkf-root';
  root.dataset.theme = theme;
  root.dataset.size = 'l';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', "Simulated Winkit order flow: the customer pays by card, the order lands on the kitchen's own system, a driver is dispatched by GPS and the order is delivered.");
  root.innerHTML =
    '<canvas class="wkf-canvas" aria-hidden="true"></canvas>' +
    '<div class="wkf-hdr">' +
      (logoSrc ? '<span class="wkf-logo"><img alt="Winkit" src="' + logoSrc + '"></span>' : '') +
      '<span class="wkf-live"><i></i>Live simulation</span>' +
      '<button type="button" class="wkf-btn wkf-btn-top">' + ICON_PLUS + 'Send an order</button>' +
    '</div>' +
    '<aside class="wkf-side">' +
      '<div class="wkf-count"><span class="wkf-num">0</span><span class="wkf-cap">Delivered</span></div>' +
      '<div class="wkf-sec wkf-sec-feed"><div class="wkf-h">Live orders</div><ul class="wkf-feed" aria-hidden="true"></ul></div>' +
      '<div class="wkf-sec"><div class="wkf-h">Every order</div><div class="wkf-zeros">' +
        '<span class="wkf-z" data-z="commission">' + ICON_CHECK + '£0 commission</span>' +
        '<span class="wkf-z" data-z="drivers">' + ICON_CHECK + '0 drivers to hire</span>' +
        '<span class="wkf-z" data-z="hardware">' + ICON_CHECK + '0 new hardware</span>' +
      '</div></div>' +
      '<button type="button" class="wkf-btn wkf-btn-side">' + ICON_PLUS + 'Send an order</button>' +
    '</aside>' +
    '<ol class="wkf-rail">' +
      STEPS.map((s, i) =>
        '<li class="wkf-step' + (i === 4 ? ' wkf-ok' : '') + '"><span class="wkf-dot">' + (i + 1) + '</span>' +
        '<span class="wkf-lbl"><span class="wkf-full">' + s.full + '</span><span class="wkf-short">' + s.short + '</span></span></li>'
      ).join('') +
    '</ol>';
  container.appendChild(root);
  if (ref) ref.cleanup = () => { root.remove(); releaseStyle(doc); };

  /* Containers with no intrinsic height still get a sensible stage. */
  const cw0 = container.clientWidth || root.clientWidth || 800;
  if (container.clientHeight < 200) {
    root.style.height = 'auto';
    root.style.aspectRatio = cw0 < 520 ? '3 / 4' : cw0 < 760 ? '4 / 3' : '16 / 10';
  }

  const cv = root.querySelector('.wkf-canvas');
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const bg = doc.createElement('canvas');
  const bctx = bg.getContext('2d');
  const elNum = root.querySelector('.wkf-num');
  const elFeed = root.querySelector('.wkf-feed');
  const elSteps = Array.from(root.querySelectorAll('.wkf-step'));
  const elZ = {};
  root.querySelectorAll('.wkf-z').forEach(z => { elZ[z.dataset.z] = z; });
  const btns = Array.from(root.querySelectorAll('.wkf-btn'));

  /* ---- sizing state */
  let w = 0, h = 0, dpr = 1, size = 'l';
  let L = null;                         // layout
  let world = null;                     // entities
  let simT = 0, nextSpawn = 0.5, seq = 1039, nextSwap = 17, delivered = 0;
  const orders = [];
  const toasts = [];
  const feed = [];
  let feedDirty = true, stepMask = '', stepLevel = [0, 0, 0, 0, 0];
  const zeroLit = {};
  let visible = true, tabHidden = !!doc.hidden, raf = 0, last = 0, disposed = false;

  /* ---- layout ------------------------------------------------------- */
  function sizeClass(width) { return width >= 760 ? 'l' : width >= 480 ? 'm' : 's'; }

  function buildLayout() {
    const sideW = size === 'l' ? Math.round(clamp(w * 0.26, 220, 260)) : 0;
    root.style.setProperty('--wkf-side', size === 'l' ? sideW + 'px' : '0px');
    const pad = size === 's' ? 30 : 40;
    const top = size === 'l' ? 74 : size === 'm' ? 70 : 66;
    const bottom = size === 's' ? 88 : 90;
    const x0 = pad, x1 = Math.max(x0 + 80, w - sideW - pad);
    const y0 = top, y1 = Math.max(y0 + 80, h - bottom);
    const C = clamp(Math.round((x1 - x0) / 104) + 1, 4, 9);
    const R = clamp(Math.round((y1 - y0) / 88) + 1, 3, 7);
    const nx = [], ny = [];
    for (let i = 0; i < C; i++) nx.push(lerp(x0, x1, C === 1 ? 0 : i / (C - 1)));
    for (let j = 0; j < R; j++) ny.push(lerp(y0, y1, R === 1 ? 0 : j / (R - 1)));
    const cellW = (x1 - x0) / (C - 1), cellH = (y1 - y0) / (R - 1);
    const u = Math.min(cellW, cellH);
    const hr = clamp(u * 0.17, 8, 13);
    L = {
      C, R, nx, ny, u, cellW, cellH, hr, kr: hr * 1.5,
      rw: clamp(u * 0.17, 9, 17),
      fs: size === 's' ? 10 : 11,
      sideW, top, bottom, x0, x1, y0, y1
    };
  }

  function manhattan(a, b) { return Math.abs(a.i - b.i) + Math.abs(a.j - b.j); }

  function initWorld() {
    const { C, R } = L;
    const rng = mulberry32(11);
    const k1 = { i: Math.round((C - 1) * 0.27), j: Math.max(1, Math.round((R - 1) * 0.36)) };
    let k2 = { i: Math.round((C - 1) * 0.74), j: Math.min(R - 2, Math.round((R - 1) * 0.68)) };
    if (manhattan(k1, k2) < 3) k2 = { i: clamp(k1.i + 3, 0, C - 1), j: clamp(k1.j + 1, 0, R - 1) };
    const kitchens = [k1, k2].map((k, n) => ({ i: k.i, j: k.j, tickets: [], flash: 0, name: n }));

    const all = [];
    for (let i = 0; i < C; i++) for (let j = 0; j < R; j++) all.push({ i, j });
    for (let n = all.length - 1; n > 0; n--) { const m = Math.floor(rng() * (n + 1)); [all[n], all[m]] = [all[m], all[n]]; }
    const want = clamp(Math.round(C * R / 4), 5, 11);
    const houses = [];
    const okNode = (nd, minK, minH) =>
      kitchens.every(k => manhattan(k, nd) >= minK) && houses.every(hh => manhattan(hh, nd) >= minH);
    for (const [minK, minH] of [[2, 2], [2, 1]]) {
      for (const nd of all) {
        if (houses.length >= want) break;
        if (okNode(nd, minK, minH) && !houses.some(hh => hh.i === nd.i && hh.j === nd.j)) houses.push({ i: nd.i, j: nd.j, state: 'idle', t: 0 });
      }
    }
    const taken = nd => kitchens.some(k => k.i === nd.i && k.j === nd.j) || houses.some(hh => hh.i === nd.i && hh.j === nd.j);
    const dn = all.filter(nd => !taken(nd) && kitchens.some(k => { const d = manhattan(k, nd); return d >= 1 && d <= 2; }));
    const nDrv = C * R > 28 ? 4 : 3;
    const drivers = [];
    for (let n = 0; n < nDrv && n < dn.length; n++) {
      const nd = dn[n * Math.max(1, Math.floor(dn.length / nDrv))] || dn[n];
      drivers.push({
        node: { i: nd.i, j: nd.j }, a: null, b: null, hf: true, f: 0, state: 'idle', onShift: false,
        shiftAt: 0.5 + n * 0.8, offUntil: 0, order: null, x: 0, y: 0, dx: 1, dy: 0, trail: [], ping: rng() * 2, ramp: 0, speed: 0
      });
    }
    world = { kitchens, houses, drivers, key: C + 'x' + R };
    orders.length = 0; toasts.length = 0; feed.length = 0;
    simT = 0; nextSpawn = 0.5; nextSwap = 17; feedDirty = true;
    stepLevel = [0, 0, 0, 0, 0];
  }

  /* ---- path geometry (grid aligned, one corner) ---------------------- */
  function geom(a, b, hf) {
    const ax = L.nx[a.i], ay = L.ny[a.j], bx = L.nx[b.i], by = L.ny[b.j];
    const cx = hf ? bx : ax, cy = hf ? ay : by;
    const l1 = Math.abs(cx - ax) + Math.abs(cy - ay);
    const l2 = Math.abs(bx - cx) + Math.abs(by - cy);
    return { ax, ay, bx, by, cx, cy, l1, l2, total: l1 + l2 };
  }
  function at(g, f) {
    const s = clamp(f, 0, 1) * g.total;
    if (s <= g.l1 && g.l1 > 0) {
      const k = s / g.l1;
      return { x: g.ax + (g.cx - g.ax) * k, y: g.ay + (g.cy - g.ay) * k, dx: Math.sign(g.cx - g.ax), dy: Math.sign(g.cy - g.ay) };
    }
    const k = g.l2 > 0 ? (s - g.l1) / g.l2 : 1;
    return { x: g.cx + (g.bx - g.cx) * k, y: g.cy + (g.by - g.cy) * k, dx: Math.sign(g.bx - g.cx), dy: Math.sign(g.by - g.cy) };
  }
  function strokeRange(g, f0, f1) {
    const s0 = f0 * g.total, s1 = f1 * g.total;
    const p0 = at(g, f0), p1 = at(g, f1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    if (s0 < g.l1 && s1 > g.l1) ctx.lineTo(g.cx, g.cy);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  /* ---- events -------------------------------------------------------- */
  function toast(x, y, text, kind, below) {
    toasts.push({ x, y, text, kind: kind || 'ok', t: 0, dur: 1.9, below: !!below });
    if (toasts.length > 14) toasts.shift();
  }
  function pulseStep(k) {
    if (reduced) return;
    const el = elSteps[k];
    if (!el) return;
    el.classList.remove('wkf-ping');
    void el.offsetWidth;
    el.classList.add('wkf-ping');
  }
  function lightZero(key) {
    if (zeroLit[key]) return;
    zeroLit[key] = true;
    if (elZ[key]) elZ[key].classList.add('wkf-on');
  }
  function setPhase(o, ph) {
    o.phase = ph; o.t = 0; feedDirty = true;
  }

  function spawnOrder(forceHouse) {
    if (!world) return false;
    if (orders.length >= 5) return false;
    const used = new Set(orders.map(o => o.house));
    const free = world.houses.filter(hh => !used.has(hh));
    if (!free.length) return false;
    const house = forceHouse && free.includes(forceHouse) ? forceHouse : free[Math.floor(rng2() * free.length)];
    const ks = world.kitchens.slice().sort((a, b) => manhattan(a, house) - manhattan(b, house));
    const kitchen = rng2() < 0.78 ? ks[0] : ks[1];
    const o = {
      id: ++seq, house, kitchen, phase: 'pay', t: 0, f: 0, hf: rng2() < 0.5, paid: false,
      cookDur: 2.1 + rng2() * 1.3, driver: null, ticket: null, pickT: 0
    };
    house.state = 'pay'; house.t = 0;
    orders.push(o);
    feed.unshift(o);
    if (feed.length > 4) feed.length = 4;
    feedDirty = true;
    pulseStep(0);
    return true;
  }

  let seed2 = 90210;
  function rng2() { seed2 = (seed2 * 1664525 + 1013904223) >>> 0; return seed2 / 4294967296; }

  function nearestIdleDriver(k) {
    let best = null, bd = 1e9;
    for (const d of world.drivers) {
      if (d.state !== 'idle' || !d.onShift) continue;
      const dist = manhattan(d.node, k);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }
  function assignDriver(o) {
    const d = nearestIdleDriver(o.kitchen);
    if (!d) return;
    o.driver = d; d.order = o;
    d.a = { i: d.node.i, j: d.node.j }; d.b = { i: o.kitchen.i, j: o.kitchen.j };
    d.hf = rng2() < 0.5; d.f = 0; d.speed = L.u * 1.5;
    d.state = manhattan(d.a, d.b) === 0 ? 'waiting' : 'toKitchen';
    const g = geom(d.a, d.b, d.hf), p = at(g, 0);
    d.x = p.x; d.y = p.y;
    toast(p.x, p.y - L.hr - 6, 'Driver dispatched', 'drv');
    pulseStep(3); lightZero('drivers');
  }

  /* ---- simulation step ------------------------------------------------ */
  function step(dt) {
    simT += dt;
    const { u, hr } = L;

    /* spawn cadence */
    if (simT >= nextSpawn) {
      spawnOrder();
      nextSpawn = simT + 3.1 + rng2() * 1.5;
    }

    /* driver shifts: clock on at start, occasional swap while idle */
    for (const d of world.drivers) {
      if (!d.onShift && simT >= d.shiftAt && simT >= d.offUntil) {
        d.onShift = true;
        const p = { x: L.nx[d.node.i], y: L.ny[d.node.j] };
        toast(p.x, p.y - hr - 6, 'On shift', 'drv');
      }
      d.ramp = clamp(d.ramp + (d.onShift ? dt * 3 : -dt * 3), 0, 1);
      d.ping += dt;
    }
    if (simT >= nextSwap) {
      nextSwap = simT + 15 + rng2() * 6;
      const on = world.drivers.filter(d => d.onShift);
      const cand = on.filter(d => d.state === 'idle');
      if (on.length >= 3 && cand.length) {
        const d = cand[Math.floor(rng2() * cand.length)];
        d.onShift = false; d.shiftAt = simT + 2.4; d.offUntil = simT + 2.4;
        toast(L.nx[d.node.i], L.ny[d.node.j] - hr - 6, 'Shift ended', 'off');
      }
    }

    /* orders */
    for (let n = orders.length - 1; n >= 0; n--) {
      const o = orders[n];
      o.t += dt;
      const hs = o.house, k = o.kitchen;
      const hx = L.nx[hs.i], hy = L.ny[hs.j], kx = L.nx[k.i], ky = L.ny[k.j];
      switch (o.phase) {
        case 'pay':
          hs.t += dt;
          if (!o.paid && o.t >= 0.5) {
            o.paid = true; feedDirty = true;
            toast(hx, hy - hr * 1.7, 'Paid · Stripe', 'pay');
            lightZero('commission');
          }
          if (o.t >= 1.25) { setPhase(o, 'send'); o.f = 0; }
          break;
        case 'send': {
          const g = geom(hs, k, !o.hf);
          o.f += dt * (u * 3.0) / Math.max(g.total, 1);
          if (o.f >= 1) {
            o.f = 1;
            setPhase(o, 'inject');
            o.ticket = { o, t: 0 };
            k.tickets.push(o.ticket);
            if (k.tickets.length > 3) k.tickets.shift();
            k.flash = 1;
            toast(kx, ky + L.kr + 12, 'On the kitchen\'s own system', 'inj', true);
            pulseStep(1); lightZero('hardware');
          }
          break;
        }
        case 'inject':
          if (o.t >= 0.7) setPhase(o, 'cook');
          break;
        case 'cook':
          if (!o.driver) assignDriver(o);
          if (o.t >= o.cookDur) {
            setPhase(o, 'ready');
            toast(kx, ky + L.kr + 12, 'Kitchen marks ready', 'rdy', true);
            pulseStep(2);
          }
          break;
        case 'ready':
          if (!o.driver) assignDriver(o);
          if (o.driver && o.driver.state === 'waiting') {
            o.pickT += dt;
            if (o.pickT >= 0.5) {
              const d = o.driver;
              const idx = k.tickets.indexOf(o.ticket);
              if (idx >= 0) k.tickets.splice(idx, 1);
              d.a = { i: k.i, j: k.j }; d.b = { i: hs.i, j: hs.j };
              d.hf = rng2() < 0.5; d.f = 0; d.state = 'carrying'; d.speed = L.u * 1.5;
              setPhase(o, 'deliver');
            }
          }
          break;
        case 'deliver':
          break; /* driver update advances this */
        case 'done':
          if (o.t >= 1.5) {
            hs.state = 'idle';
            orders.splice(n, 1);
          }
          break;
      }
    }

    /* drivers: motion, arrival, trails */
    for (const d of world.drivers) {
      if (d.state === 'toKitchen' || d.state === 'carrying') {
        const g = geom(d.a, d.b, d.hf);
        d.f += dt * d.speed / Math.max(g.total, 1);
        const p = at(g, Math.min(d.f, 1));
        d.x = p.x; d.y = p.y; d.dx = p.dx || d.dx; d.dy = p.dy || d.dy;
        d.trail.push({ x: p.x, y: p.y, t: simT });
        while (d.trail.length > 1 && simT - d.trail[0].t > 1.1) d.trail.shift();
        if (d.f >= 1) {
          d.node = { i: d.b.i, j: d.b.j };
          if (d.state === 'toKitchen') {
            d.state = 'waiting';
          } else {
            const o = d.order;
            d.state = 'idle'; d.order = null; d.trail.length = 0;
            if (o) {
              o.driver = null;
              setPhase(o, 'done');
              o.house.state = 'done'; o.house.t = 0;
              delivered++;
              if (elNum) {
                elNum.textContent = String(delivered);
                if (!reduced) { elNum.classList.remove('wkf-bump'); void elNum.offsetWidth; elNum.classList.add('wkf-bump'); }
              }
              toast(L.nx[o.house.i], L.ny[o.house.j] - hr * 1.7, 'Delivered', 'ok');
              pulseStep(4);
            }
          }
        }
      } else {
        d.x = L.nx[d.node.i]; d.y = L.ny[d.node.j];
        if (d.trail.length) d.trail.length = 0;
      }
    }

    /* decay */
    for (const k of world.kitchens) k.flash = Math.max(0, k.flash - dt * 1.8);
    for (let n = toasts.length - 1; n >= 0; n--) {
      toasts[n].t += dt;
      if (toasts[n].t >= toasts[n].dur) toasts.splice(n, 1);
    }
  }

  /* ---- HUD sync ------------------------------------------------------- */
  function syncHud() {
    /* rail: which steps have live orders */
    const lvl = [0, 0, 0, 0, 0];
    for (const o of orders) lvl[PHASE_STEP[o.phase]]++;
    for (const d of world.drivers) if (d.state === 'toKitchen' || d.state === 'waiting') lvl[3]++;
    const mask = lvl.map(v => (v > 0 ? 1 : 0)).join('');
    if (mask !== stepMask) {
      stepMask = mask;
      elSteps.forEach((el, i) => el.classList.toggle('wkf-lit', lvl[i] > 0));
    }
    if (feedDirty) {
      feedDirty = false;
      elFeed.innerHTML = feed.map(o => {
        const key = PHASE_KEY[o.phase];
        const label = o.phase === 'pay' && o.paid ? 'Paid via Stripe' : PHASE_LABEL[o.phase];
        return '<li class="wkf-row" data-s="' + (o.phase === 'pay' && o.paid ? 'send' : key) + '"><span class="wkf-rid">#' + o.id +
          '</span><span class="wkf-rs"><i></i>' + label + '</span>' +
          (o.paid ? '<span class="wkf-tag" title="Card payment confirmed">' + ICON_CHECK + '</span>' : '') + '</li>';
      }).join('');
    }
  }

  /* ---- drawing -------------------------------------------------------- */
  function renderBg() {
    if (!w || !h || !L) return;
    bg.width = Math.round(w * dpr); bg.height = Math.round(h * dpr);
    const c = bctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = P.land; c.fillRect(0, 0, w, h);
    const rng = mulberry32(5);
    const { nx, ny, rw } = L;
    const xs = [-40].concat(nx, [w + 40]);
    const ys = [-40].concat(ny, [h + 40]);
    const gap = 3;

    /* blocks */
    for (let a = 0; a < xs.length - 1; a++) {
      for (let b = 0; b < ys.length - 1; b++) {
        const bx = xs[a] + (a === 0 ? 0 : rw / 2 + gap), bw = xs[a + 1] - (a === xs.length - 2 ? 0 : rw / 2 + gap) - bx;
        const by = ys[b] + (b === 0 ? 0 : rw / 2 + gap), bh = ys[b + 1] - (b === ys.length - 2 ? 0 : rw / 2 + gap) - by;
        if (bw < 8 || bh < 8) continue;
        const park = rng() < 0.16;
        c.fillStyle = park ? P.park : P.block;
        rr(c, bx, by, bw, bh, 7); c.fill();
        c.strokeStyle = P.blockEdge; c.lineWidth = 1; c.stroke();
        if (park) {
          c.fillStyle = P.tree;
          const n = 4 + Math.floor(rng() * 4);
          for (let q = 0; q < n; q++) {
            c.beginPath(); c.arc(bx + 10 + rng() * Math.max(1, bw - 20), by + 10 + rng() * Math.max(1, bh - 20), 3 + rng() * 3, 0, 7); c.fill();
          }
        } else if (bw > 36 && bh > 36) {
          c.fillStyle = P.plot;
          const cols = bw > 70 ? 2 : 1, rows = bh > 70 ? 2 : 1;
          const pw = (bw - 14 - (cols - 1) * 6) / cols, ph = (bh - 14 - (rows - 1) * 6) / rows;
          for (let q = 0; q < cols; q++) for (let r = 0; r < rows; r++) {
            if (rng() < 0.2) continue;
            rr(c, bx + 7 + q * (pw + 6), by + 7 + r * (ph + 6), pw, ph, 4); c.fill();
          }
        }
      }
    }

    /* river */
    const ry = h * 0.58;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = P.water; c.lineWidth = Math.max(26, L.u * 0.5);
    c.beginPath(); c.moveTo(-30, ry + h * 0.1);
    c.bezierCurveTo(w * 0.28, ry - h * 0.16, w * 0.6, ry + h * 0.2, w + 30, ry - h * 0.06);
    c.stroke();
    c.strokeStyle = P.waterLine; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-30, ry + h * 0.1 - 6);
    c.bezierCurveTo(w * 0.28, ry - h * 0.16 - 6, w * 0.6, ry + h * 0.2 - 6, w + 30, ry - h * 0.06 - 6);
    c.stroke();
    c.restore();

    /* roads */
    c.lineCap = 'butt';
    const roads = () => {
      c.beginPath();
      for (const x of nx) { c.moveTo(x, -40); c.lineTo(x, h + 40); }
      for (const y of ny) { c.moveTo(-40, y); c.lineTo(w + 40, y); }
      c.stroke();
    };
    c.strokeStyle = P.roadEdge; c.lineWidth = rw + 2; roads();
    c.strokeStyle = P.road; c.lineWidth = rw; roads();
    c.strokeStyle = P.lane; c.lineWidth = 1; c.setLineDash([5, 7]); roads(); c.setLineDash([]);
  }

  function pill(x, y, text, color, glyph) {
    const fs = L.fs;
    ctx.font = '600 ' + fs + 'px Inter, ui-sans-serif, system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    const pw = tw + 16 + 18, ph = fs + 11;
    let px = x - pw / 2;
    px = clamp(px, 6, w - pw - 6 - (size === 'l' ? L.sideW : 0));
    const py = y - ph;
    ctx.save();
    ctx.shadowColor = P.shadow; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    rr(ctx, px, py, pw, ph, ph / 2); ctx.fillStyle = P.pill; ctx.fill();
    ctx.restore();
    rr(ctx, px, py, pw, ph, ph / 2); ctx.strokeStyle = P.pillLine; ctx.lineWidth = 1; ctx.stroke();
    /* glyph */
    const gx = px + 12, gy = py + ph / 2;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (glyph === 'check') { ctx.moveTo(gx - 2.2, gy + 0.2); ctx.lineTo(gx - 0.6, gy + 1.8); ctx.lineTo(gx + 2.4, gy - 1.8); }
    else { ctx.moveTo(gx - 1.6, gy + 1.5); ctx.lineTo(gx + 0.4, gy - 2.2); ctx.lineTo(gx + 1.6, gy + 1.5); }
    ctx.stroke();
    ctx.fillStyle = P.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, px + 22, gy + 0.5);
  }

  function drawHouse(hs) {
    const x = L.nx[hs.i], y = L.ny[hs.j], r = L.hr;
    ctx.save();
    ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 1.2, r * 0.38, 0, 0, 7); ctx.fill();
    let s = 1;
    if (hs.state === 'pay') {
      const t = hs.t;
      s = t < 0.45 ? 0.55 + 0.45 * eback(clamp(t / 0.45, 0, 1)) : 1;
      for (let k = 0; k < 2; k++) {
        const tt = (t - k * 0.35) / 1.0;
        if (tt > 0 && tt < 1) {
          ctx.strokeStyle = P.accent; ctx.globalAlpha = (1 - tt) * 0.8; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, r * (1 + tt * 2.4), 0, 7); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
    const roofCol = hs.state === 'pay' ? P.accent : hs.state === 'done' ? P.ok : P.roof;
    rr(ctx, x - r, y - r * 0.5, r * 2, r * 1.45, 3); ctx.fillStyle = P.house; ctx.fill();
    ctx.strokeStyle = P.houseLine; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 1.2, y - r * 0.42); ctx.lineTo(x, y - r * 1.38); ctx.lineTo(x + r * 1.2, y - r * 0.42); ctx.closePath();
    ctx.fillStyle = roofCol; ctx.fill();
    ctx.fillStyle = roofCol; ctx.globalAlpha = 0.55;
    rr(ctx, x - r * 0.2, y + r * 0.1, r * 0.4, r * 0.85, 1.5); ctx.fill();
    ctx.globalAlpha = 1;
    if (hs.state === 'done') {
      const bt = clamp(hs.t / 0.4, 0, 1), bs = eback(bt);
      ctx.save();
      ctx.translate(x + r * 0.95, y - r * 1.15); ctx.scale(bs, bs);
      ctx.fillStyle = P.ok; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.28, 0); ctx.lineTo(-r * 0.06, r * 0.24); ctx.lineTo(r * 0.3, -r * 0.2); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawKitchen(k) {
    const x = L.nx[k.i], y = L.ny[k.j], r = L.kr;
    ctx.save();
    ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 1.25, r * 0.36, 0, 0, 7); ctx.fill();
    if (k.flash > 0) {
      ctx.strokeStyle = P.accent; ctx.globalAlpha = k.flash * 0.9; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r * (1.25 + (1 - k.flash) * 1.4), 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    /* cooking progress ring */
    const cooking = k.tickets.find(t => t.o.phase === 'cook');
    if (cooking) {
      const pr = clamp(cooking.o.t / cooking.o.cookDur, 0, 1);
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(248,148,0,.22)'; ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, 7); ctx.stroke();
      ctx.strokeStyle = WK.orange; ctx.beginPath(); ctx.arc(x, y, r * 1.5, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); ctx.stroke();
    }
    /* body */
    rr(ctx, x - r, y - r * 0.55, r * 2, r * 1.5, 4); ctx.fillStyle = P.kitchen; ctx.fill();
    /* awning scallops */
    const n = 5, aw = (r * 2) / n, ay = y - r * 0.95;
    for (let q = 0; q < n; q++) {
      ctx.fillStyle = q % 2 ? '#FFFFFF' : WK.orange;
      rr(ctx, x - r + q * aw, ay, aw + 0.5, r * 0.5, 3); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.22)'; rr(ctx, x - r * 0.72, y - r * 0.12, r * 0.62, r * 0.5, 2); ctx.fill();
    ctx.fillStyle = WK.orange; rr(ctx, x + r * 0.12, y + r * 0.02, r * 0.5, r * 0.9, 2); ctx.fill();
    ctx.restore();
  }

  function drawKitchenCard(k) {
    const x = L.nx[k.i], y = L.ny[k.j], r = L.kr;
    const small = size === 's';
    const cw = small ? 92 : 128, rowH = small ? 15 : 17, titleH = small ? 16 : 18;
    const rows = k.tickets.length;
    const ch = titleH + Math.max(1, rows) * rowH + 6;
    let cx = clamp(x - cw / 2, 6, w - cw - 6 - (size === 'l' ? L.sideW : 0));
    let cy = y - r * 1.55 - ch - 4;
    if (cy < (size === 'l' ? 8 : 52)) cy = y + r * 1.15 + 4;
    ctx.save();
    ctx.shadowColor = P.shadow; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    rr(ctx, cx, cy, cw, ch, 9); ctx.fillStyle = P.card; ctx.fill();
    ctx.restore();
    rr(ctx, cx, cy, cw, ch, 9);
    ctx.strokeStyle = k.flash > 0 ? P.accent : P.cardLine; ctx.lineWidth = k.flash > 0 ? 1.5 : 1; ctx.stroke();
    ctx.font = '600 ' + (small ? 8.5 : 9) + 'px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = P.muted;
    ctx.fillText(small ? 'KITCHEN POS' : "KITCHEN'S OWN SYSTEM", cx + 8, cy + titleH / 2 + 1);
    ctx.font = '600 ' + (small ? 9.5 : 10.5) + 'px ui-monospace, "SF Mono", Menlo, monospace';
    if (!rows) {
      ctx.fillStyle = P.muted; ctx.globalAlpha = 0.6;
      ctx.fillText('No open tickets', cx + 8, cy + titleH + rowH / 2 + 1);
      ctx.globalAlpha = 1;
    }
    k.tickets.forEach((tk, n) => {
      const o = tk.o;
      const ry = cy + titleH + n * rowH;
      const appear = o.phase === 'inject' ? eout(clamp(o.t / 0.35, 0, 1)) : 1;
      ctx.globalAlpha = appear;
      ctx.fillStyle = P.cardRow; rr(ctx, cx + 4, ry + 1, cw - 8, rowH - 2, 5); ctx.fill();
      ctx.fillStyle = P.ink; ctx.textAlign = 'left';
      ctx.fillText('#' + o.id, cx + 9 + (1 - appear) * 10, ry + rowH / 2 + 1);
      const st = o.phase === 'ready' ? 'Ready' : o.phase === 'cook' ? 'Cooking' : 'New';
      const col = o.phase === 'ready' ? P.ok : o.phase === 'cook' ? WK.orange : P.accent;
      ctx.textAlign = 'right';
      ctx.fillStyle = col;
      ctx.fillText(st, cx + cw - 10, ry + rowH / 2 + 1);
      ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'left';
  }

  function drawPacket(o) {
    const g = geom(o.house, o.kitchen, !o.hf);
    const f = eio(clamp(o.f, 0, 1));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([2, 7]); ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
    strokeRange(g, 0, 1);
    ctx.setLineDash([]); ctx.globalAlpha = 0.9; ctx.lineWidth = 2.5;
    strokeRange(g, Math.max(0, f - 0.22), f);
    const p = at(g, f);
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
    grd.addColorStop(0, P.accentGlow); grd.addColorStop(1, 'rgba(30,72,224,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 7); ctx.fill();
    rr(ctx, p.x - 6, p.y - 6, 12, 12, 4); ctx.fillStyle = P.accent; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.x - 2.6, p.y - 1.4); ctx.lineTo(p.x + 2.6, p.y - 1.4); ctx.moveTo(p.x - 2.6, p.y + 1.6); ctx.lineTo(p.x + 1, p.y + 1.6); ctx.stroke();
    ctx.restore();
  }

  function drawDriverRoute(d) {
    if (!d.a || (d.state !== 'toKitchen' && d.state !== 'carrying')) return;
    const g = geom(d.a, d.b, d.hf);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([2, 7]); ctx.strokeStyle = WK.orange; ctx.globalAlpha = d.state === 'carrying' ? 0.55 : 0.32; ctx.lineWidth = 2;
    strokeRange(g, clamp(d.f, 0, 1), 1);
    ctx.restore();
  }

  function drawDriver(d) {
    const x = d.x, y = d.y, r = L.hr * 0.82;
    const moving = d.state === 'toKitchen' || d.state === 'carrying';
    ctx.save();
    /* trail */
    if (moving && d.trail.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let n = 1; n < d.trail.length; n++) {
        const age = (simT - d.trail[n].t) / 1.1;
        ctx.strokeStyle = WK.orange; ctx.globalAlpha = clamp(1 - age, 0, 1) * 0.65; ctx.lineWidth = 3.2 * (1 - age * 0.6);
        ctx.beginPath(); ctx.moveTo(d.trail[n - 1].x, d.trail[n - 1].y); ctx.lineTo(d.trail[n].x, d.trail[n].y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (d.ramp <= 0.02) {
      /* off shift */
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, 7);
      ctx.fillStyle = P.land; ctx.fill();
      ctx.strokeStyle = P.muted; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      return;
    }
    /* GPS ping */
    const period = moving ? 1.1 : 2.6;
    const pt = (d.ping % period) / period;
    ctx.strokeStyle = WK.orange; ctx.lineWidth = 1.6;
    ctx.globalAlpha = (1 - pt) * (moving ? 0.55 : 0.35) * d.ramp;
    ctx.beginPath(); ctx.arc(x, y, r * (1 + pt * 2.6), 0, 7); ctx.stroke();
    ctx.globalAlpha = d.ramp;
    ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 0.9, r * 0.3, 0, 0, 7); ctx.fill();
    /* body */
    ctx.beginPath(); ctx.arc(x, y, r * (0.6 + 0.4 * d.ramp), 0, 7);
    ctx.fillStyle = WK.orange; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = P.driverRing; ctx.stroke();
    /* heading chevron */
    const ang = Math.atan2(d.dy, d.dx);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(-r * 0.28, r * 0.34); ctx.lineTo(-r * 0.28, -r * 0.34); ctx.closePath();
    if (moving) ctx.fill(); else { ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 7); ctx.fill(); }
    ctx.restore();
    /* parcel */
    if (d.state === 'carrying') {
      rr(ctx, x + r * 0.35, y - r * 1.45, r * 1.05, r * 0.95, 2.5);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = WK.orange; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + r * 0.35, y - r * 1.05); ctx.lineTo(x + r * 1.4, y - r * 1.05); ctx.stroke();
    }
    ctx.restore();
  }

  function drawToast(t) {
    const a = t.t / t.dur;
    const inn = eout(clamp(t.t / 0.22, 0, 1));
    const out = a > 0.75 ? 1 - (a - 0.75) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(inn * out, 0, 1);
    const rise = eout(clamp(t.t / 0.6, 0, 1)) * 12;
    const y = t.below ? t.y + rise * 0.4 : t.y - rise;
    const col = t.kind === 'ok' ? P.ok : t.kind === 'drv' ? WK.orange : t.kind === 'off' ? P.muted : t.kind === 'rdy' ? P.ok : P.accent;
    pill(t.x, t.below ? y + L.fs + 11 : y, t.text, col, t.kind === 'ok' || t.kind === 'pay' || t.kind === 'rdy' ? 'check' : 'arrow');
    ctx.restore();
  }

  function draw() {
    if (!w || !L || !world) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bg, 0, 0, w, h);
    for (const d of world.drivers) drawDriverRoute(d);
    for (const o of orders) if (o.phase === 'send') drawPacket(o);
    for (const hs of world.houses) drawHouse(hs);
    for (const k of world.kitchens) drawKitchen(k);
    for (const k of world.kitchens) drawKitchenCard(k);
    for (const d of world.drivers) drawDriver(d);
    for (const t of toasts) drawToast(t);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /* ---- resize --------------------------------------------------------- */
  function resize(nw, nh) {
    nw = Math.round(nw); nh = Math.round(nh);
    if (nw < 60 || nh < 60) return;
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    dpr = Math.min(2, win.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    size = sizeClass(w);
    root.dataset.size = size;
    const prevKey = world && world.key;
    buildLayout();
    if (!world || prevKey !== L.C + 'x' + L.R) {
      initWorld();
      if (reduced) { presim(10.2); }
    }
    for (const d of world.drivers) d.trail.length = 0;
    renderBg();
    syncHud();
    draw();
  }

  function presim(seconds) {
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) step(dt);
    toasts.length = 0;
  }

  /* ---- loop ----------------------------------------------------------- */
  function shouldRun() { return !reduced && visible && !tabHidden && !disposed; }
  function schedule() { if (!raf && shouldRun()) raf = win.requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    if (!shouldRun()) return;
    try {
      const dt = clamp((ts - last) / 1000, 0, 0.05);
      last = ts;
      step(dt);
      syncHud();
      draw();
    } catch (e) {
      try { console.warn('[show-winkit] runtime error, using static fallback:', e && e.message); } catch (x) { /* ignore */ }
      disposed = true;
      onFatal && onFatal();
      return;
    }
    schedule();
  }
  function kick() {
    last = (win.performance || performance).now();
    schedule();
  }

  /* ---- interaction ---------------------------------------------------- */
  function userOrder(house) {
    if (!world) return;
    const ok = spawnOrder(house);
    if (reduced && ok) {
      /* discrete jump: advance the sim and repaint without animation */
      for (let t = 0; t < 3.2; t += 1 / 30) step(1 / 30);
      toasts.length = 0;
      syncHud(); draw();
    } else if (ok) {
      kick();
    }
  }
  function onCanvasTap(ev) {
    if (!world) return;
    const rect = cv.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    let best = null, bd = 1e9;
    for (const hs of world.houses) {
      const d = Math.hypot(L.nx[hs.i] - px, L.ny[hs.j] - py);
      if (d < bd) { bd = d; best = hs; }
    }
    userOrder(best);
  }
  cv.addEventListener('click', onCanvasTap);
  const onBtn = () => userOrder(null);
  btns.forEach(b => b.addEventListener('click', onBtn));

  /* ---- observers ------------------------------------------------------ */
  const ro = typeof win.ResizeObserver === 'function'
    ? new win.ResizeObserver(entries => {
        const r = entries[0].contentRect;
        try { resize(r.width, r.height); } catch (e) { disposed = true; onFatal && onFatal(); }
      })
    : null;
  if (ro) ro.observe(root);
  const io = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver(entries => {
        const was = visible;
        visible = entries[entries.length - 1].isIntersecting;
        if (visible && !was) kick();
      }, { threshold: 0.01 })
    : null;
  if (io) io.observe(root);
  const onVis = () => { tabHidden = !!doc.hidden; if (!tabHidden) kick(); };
  doc.addEventListener('visibilitychange', onVis);

  /* initial paint */
  resize(root.clientWidth || cw0, root.clientHeight || 520);
  if (!reduced) kick();

  return {
    dispose() {
      disposed = true;
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
      ro && ro.disconnect();
      io && io.disconnect();
      doc.removeEventListener('visibilitychange', onVis);
      cv.removeEventListener('click', onCanvasTap);
      btns.forEach(b => b.removeEventListener('click', onBtn));
      root.remove();
      releaseStyle(doc);
    },
    /* harness helper, not part of the module contract: fast-forward the simulation */
    advance(sec) {
      for (let t = 0; t < sec; t += 1 / 30) step(1 / 30);
      syncHud(); draw();
    },
    setTheme(t) {
      theme = t === 'dark' ? 'dark' : 'light';
      P = PAL[theme];
      root.dataset.theme = theme;
      renderBg();
      draw();
    }
  };
}
