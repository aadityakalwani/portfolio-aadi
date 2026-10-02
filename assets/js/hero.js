/*
 * hero.js : cinematic WebGL hero for the portfolio.
 * One continuous shot: a battery cell, an ultrasonic pulse through it, the signal cable
 * feeding a forward-pass network, six outputs resolving into the work that shipped.
 *
 * Contract: export mount(container, opts) -> { dispose(), setTheme(t), setProgress(p, immediate?), play(), getProgress() }
 *   opts = { theme: 'light' | 'dark', reducedMotion: boolean, quality?: 'auto' | 'high' | 'low' }
 *
 * Modes
 *   pinned  : desktop, fine pointer, 900px and up. Progress comes from setProgress() or, failing that,
 *             from the scroll position of the nearest [data-scene] ancestor.
 *   auto    : coarse pointer or narrow. Plays the timeline once over 9s when half visible, Replay button.
 *   static  : reduced motion. Renders the final frame once, Play button runs the timeline on demand.
 *
 * All classes are prefixed "ph-". No globals are touched.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const P = 'ph-';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const damp = (x, y, l, dt) => x + (y - x) * (1 - Math.exp(-l * dt));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eoe = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const TIMELINE_SECONDS = 9;

/* ---------------------------------------------------------------- content */
const INPUTS = ['Aerospace · Bath', 'Machine learning', 'CAD · Inventor', 'Full-stack', 'Founder', 'Year 2'];
const OUTPUTS = [
  { t: 'First-author paper', s: 'Battery SOC, under 1% error' },
  { t: 'Winkit CTO', s: 'Live delivery platform' },
  { t: 'UAV aero lead', s: 'Competition UAV' },
  { t: 'Fifth9 red team', s: 'Adversarial AI red-teaming' },
  { t: 'Drive-shaft design', s: 'Electric snowmobile drive train' },
  { t: '14+ shipped', s: 'And counting' },
];
const CHAPTERS = [
  ['01', 'The cell', 'A battery cannot tell you how full it is.'],
  ['02', 'The signal', 'So I made it listen: ultrasound through the cell, read against its swelling and voltage.'],
  ['03', 'The network', 'A network turns raw signal into something useful. The same habit runs through everything I build.'],
  ['04', 'The work', 'And it resolves into things that shipped.'],
];
const FIG = ["fig.1 \u00b7 a forward pass, if the network's only job were to compute me.", 'Yes, I know that is not how inference works.'];
const ARIA = "Animated forward pass: six inputs, two hidden layers and six outputs naming Aaditya's shipped work";

/* ---------------------------------------------------------------- palette */
const COL = {
  cobalt: 0x1e48e0, cobalt200: 0xbccbf9, cobalt300: 0x93b1ff, rose: 0xd4506e, ink: 0x0e1b2e,
  ceramic: 0xdad7c8, steel: 0xc9ced8, cream: 0xfbfaf5, warm: 0x8d897b,
};
const THEMES = {
  light: { bg: 0xf5f3e8, g0: '#FCFBF6', g1: '#F5F3E8', floor: [0.055, 0.106, 0.18], floorA: 0.2, floorFade: [9, 30], floorAa: [0.06, 0.26], shadowA: 0.3, env: 0.55, strength: 0.9, dark: 0, edgeBase: 0.3, halo: 0.17 },
  dark: { bg: 0x0a1020, g0: '#16213A', g1: '#0A1020', floor: [0.62, 0.7, 0.86], floorA: 0.1, floorFade: [4.5, 17], floorAa: [0.035, 0.15], shadowA: 0.5, env: 0.35, strength: 1.0, dark: 1, edgeBase: 0.34, halo: 0.3 },
};

/* ---------------------------------------------------------------- css (scoped, injected once) */
const CSS = `
.ph-root{--ph-paper:#F5F3E8;--ph-ink:#0E1B2E;--ph-ink2:#26344A;--ph-muted:#5B6577;--ph-accent:#1E48E0;--ph-accent-text:#1E48E0;--ph-accent-wash:rgba(30,72,224,.08);
--ph-glass:rgba(251,250,245,.78);--ph-glass-strong:rgba(251,250,245,.9);--ph-line:rgba(14,27,46,.1);--ph-line-strong:rgba(14,27,46,.18);
--ph-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 2px 4px rgba(14,27,46,.04),0 18px 40px -20px rgba(14,27,46,.28);
--ph-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
position:absolute;inset:0;overflow:hidden;color:var(--ph-ink);isolation:isolate;
font-family:var(--font-sans,"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);-webkit-font-smoothing:antialiased;
background:var(--ph-paper)}
.ph-root[data-theme="dark"]{--ph-paper:#0A1020;--ph-ink:#EAEEF7;--ph-ink2:#C8D1E3;--ph-muted:#9AA6BD;--ph-accent:#3A62F0;--ph-accent-text:#7F9CFF;--ph-accent-wash:rgba(92,130,242,.14);
--ph-glass:rgba(18,27,48,.7);--ph-glass-strong:rgba(18,27,48,.9);--ph-line:rgba(234,238,247,.1);--ph-line-strong:rgba(234,238,247,.18);
--ph-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 2px 4px rgba(0,0,0,.3),0 22px 44px -22px rgba(0,0,0,.7)}
.ph-root *{box-sizing:border-box}
.ph-stage{position:absolute;inset:0;overflow:hidden;background:radial-gradient(52% 64% at 68% 46%,rgba(30,72,224,.10),transparent 72%)}
.ph-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .6s cubic-bezier(.16,1,.3,1)}
.ph-root.is-ready .ph-canvas{opacity:1}
@media (pointer:coarse),(any-pointer:coarse){.ph-canvas{touch-action:pan-y}}
.ph-overlay{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.ph-chip{position:absolute;left:0;top:0;display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;background:var(--ph-glass);
-webkit-backdrop-filter:blur(14px) saturate(1.5);backdrop-filter:blur(14px) saturate(1.5);border:1px solid var(--ph-line);box-shadow:var(--ph-shadow);
font-size:12px;font-weight:500;line-height:1;color:var(--ph-ink2);white-space:nowrap;opacity:0;visibility:hidden;will-change:transform,opacity}
.ph-chip::before{content:"";position:absolute;top:50%;width:28px;height:1px;background:var(--ph-accent);opacity:.55}
.ph-chip::after{content:"";position:absolute;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:var(--ph-accent)}
.ph-chip.is-r::before{right:100%}.ph-chip.is-r::after{right:calc(100% + 26px)}
.ph-chip.is-l::before{left:100%}.ph-chip.is-l::after{left:calc(100% + 26px)}
.ph-in{position:absolute;left:0;top:0;display:flex;align-items:baseline;gap:10px;white-space:nowrap;font-size:13px;font-weight:500;color:var(--ph-ink2);padding:3px 9px 3px 10px;border-radius:9px;background:color-mix(in srgb,var(--ph-paper) 80%,transparent);opacity:0;visibility:hidden;will-change:transform,opacity}
.ph-in b{font:400 12px var(--ph-mono);color:var(--ph-accent-text);font-variant-numeric:tabular-nums;min-width:3.2ch;text-align:right}
.ph-cards{list-style:none;margin:0;padding:0}
.ph-card{position:absolute;left:0;top:0;display:flex;align-items:center;gap:12px;min-width:176px;padding:10px 14px 10px 16px;border-radius:14px;background:var(--ph-glass-strong);
-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);border:1px solid var(--ph-line);box-shadow:var(--ph-shadow);opacity:0;visibility:hidden;will-change:transform,opacity}
.ph-card::before{content:"";position:absolute;left:-3px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:var(--ph-accent)}
.ph-card.is-pulse::before{animation:ph-ping .9s cubic-bezier(.16,1,.3,1) 1}
.ph-card-m{display:flex;flex-direction:column;gap:3px;min-width:0}
.ph-card-t{font-size:14px;font-weight:600;letter-spacing:-.01em;color:var(--ph-ink);line-height:1.1;white-space:nowrap}
.ph-card-s{font-size:11.5px;color:var(--ph-muted);line-height:1.15;white-space:nowrap}
.ph-card-v{margin-left:auto;font:400 12.5px var(--ph-mono);color:var(--ph-accent-text);font-variant-numeric:tabular-nums}
.ph-tight .ph-card-s{display:none}
.ph-tight .ph-card{padding:8px 12px 8px 14px;min-width:164px}
@keyframes ph-ping{0%{box-shadow:0 0 0 0 var(--ph-accent-wash),0 0 0 0 var(--ph-accent)}60%{box-shadow:0 0 0 9px transparent,0 0 0 0 transparent}100%{box-shadow:none}}
.ph-chapter{position:absolute;left:clamp(20px,5vw,64px);bottom:clamp(28px,6vh,64px);width:min(560px,calc(100% - 40px));height:clamp(150px,30vh,300px)}
.ph-ch{position:absolute;left:0;bottom:0;width:100%;opacity:0;transform:translate3d(0,24px,0);filter:blur(6px);pointer-events:none;
transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1),filter .5s cubic-bezier(.16,1,.3,1)}
.ph-ch.is-on{opacity:1;transform:none;filter:none}
.ph-chn{display:block;font-size:clamp(12px,1.2vw,18px);font-weight:600;letter-spacing:.14em;color:var(--ph-accent-text);text-shadow:0 0 10px var(--ph-paper);font-variant-numeric:tabular-nums;margin-bottom:8px}
.ph-cht{display:block;font-size:clamp(2.6rem,4.2vw,4.4rem);font-weight:600;letter-spacing:-.03em;line-height:1.05;color:var(--ph-ink);text-shadow:0 0 12px var(--ph-paper),0 0 4px var(--ph-paper)}
.ph-chs{display:block;margin-top:10px;font-size:clamp(15px,1.45vw,21px);line-height:1.45;color:var(--ph-ink2);max-width:32ch;text-wrap:pretty;text-shadow:0 0 12px var(--ph-paper),0 0 4px var(--ph-paper)}
@media (max-width:900px){.ph-cht{font-size:clamp(1.7rem,7vw,2.3rem)}.ph-chs{font-size:15px}.ph-chn{font-size:12px}}
.ph-fig{position:absolute;right:clamp(20px,3vw,40px);bottom:clamp(22px,5vh,48px);max-width:none;text-align:right;font-size:10.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;line-height:1.6;color:var(--ph-ink2);text-shadow:0 0 12px var(--ph-paper),0 0 4px var(--ph-paper);opacity:0;transition:opacity .6s cubic-bezier(.16,1,.3,1)}
.ph-fig span{display:block;white-space:nowrap}
.ph-fig.is-on{opacity:1}
.ph-compact .ph-fig span{white-space:normal}
.ph-cue{position:absolute;left:50%;bottom:20px;width:1px;height:40px;background:var(--ph-line-strong);transform:translateX(-50%);opacity:0;transition:opacity .4s}
.ph-cue.is-on{opacity:1}
.ph-cue::after{content:"";position:absolute;left:-1.5px;top:0;width:4px;height:4px;border-radius:50%;background:var(--ph-accent);animation:ph-cue 2.4s cubic-bezier(.65,0,.35,1) infinite}
.ph-cue span{position:absolute;left:50%;bottom:48px;transform:translateX(-50%);font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--ph-ink2)}
@keyframes ph-cue{0%{transform:translateY(0);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateY(36px);opacity:0}}
.ph-ticks{position:absolute;right:16px;top:50%;display:flex;flex-direction:column;gap:10px;transform:translateY(-50%)}
.ph-tick{width:2px;height:6px;border-radius:2px;background:var(--ph-line-strong);transition:height .3s cubic-bezier(.2,.7,.2,1),background-color .3s}
.ph-tick.is-on{height:20px;background:var(--ph-accent)}
.ph-btn{position:absolute;right:clamp(16px,3vw,32px);bottom:clamp(16px,3vh,28px);z-index:3;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px 0 14px;border-radius:999px;
background:var(--ph-glass-strong);-webkit-backdrop-filter:blur(16px) saturate(1.6);backdrop-filter:blur(16px) saturate(1.6);border:1px solid var(--ph-line);box-shadow:var(--ph-shadow);
font:600 13px/1 var(--font-sans,"Inter",system-ui,sans-serif);color:var(--ph-ink);cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;transition:border-color .18s,background-color .18s}
.ph-btn:hover{border-color:var(--ph-line-strong)}
.ph-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--ph-paper),0 0 0 4px var(--ph-accent)}
.ph-btn svg{width:16px;height:16px;flex:none}
.ph-pinned .ph-btn{display:none}
.ph-static:not(.ph-compact) .ph-btn{bottom:clamp(76px,12vh,104px)}
/* compact (mobile and coarse): stage on top, cards in a grid underneath */
.ph-compact{position:relative;inset:auto;display:flex;flex-direction:column;overflow:hidden}
.ph-compact .ph-stage{position:relative;inset:auto;height:clamp(300px,52svh,520px);flex:none}
.ph-compact .ph-chapter{left:20px;bottom:18px;height:112px;width:calc(100% - 170px)}
.ph-compact .ph-cht{font-size:19px}.ph-compact .ph-chs{font-size:14px;max-width:34ch}
.ph-figrow{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px}
.ph-figrow .ph-fig{margin:0;flex:1 1 auto}
.ph-figrow .ph-btn{position:static;flex:none}
.ph-compact .ph-figrow .ph-fig{margin-top:0;font-size:12px;line-height:1.5}
.ph-grid{padding:4px 20px 22px}
.ph-compact .ph-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.ph-compact .ph-card{position:relative;min-width:0;padding:11px 12px 11px 16px;gap:8px;transform:none;-webkit-backdrop-filter:none;backdrop-filter:none;background:var(--ph-glass-strong)}
.ph-compact .ph-card-s{display:none}
.ph-compact .ph-card-t{font-size:13px;white-space:normal}
.ph-compact .ph-fig{position:static;max-width:none;text-align:left;opacity:1;margin-top:16px;font-size:12px}
.ph-compact .ph-in,.ph-compact .ph-chip,.ph-compact .ph-ticks,.ph-compact .ph-cue{display:none}
/* fallback (no WebGL) */
.ph-fallback{position:relative;inset:auto;display:block;padding:clamp(28px,5vw,56px) clamp(20px,5vw,64px)}
.ph-fallback .ph-fb-in{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px;padding:0;list-style:none}
.ph-fallback .ph-fb-in li{padding:7px 12px;border-radius:999px;border:1px solid var(--ph-line);background:var(--ph-glass);font-size:12.5px;font-weight:500;color:var(--ph-ink2)}
.ph-fallback .ph-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.ph-fallback .ph-card{position:relative;opacity:1;visibility:visible;transform:none}
.ph-fallback .ph-fig{position:static;opacity:1;max-width:none;text-align:left;margin-top:18px}
@media (prefers-reduced-motion:reduce){.ph-canvas,.ph-ch,.ph-fig,.ph-cue,.ph-tick,.ph-btn{transition-duration:.01ms}.ph-cue::after,.ph-card.is-pulse::before{animation:none}}
`;

function ensureCss() {
  if (document.getElementById('ph-style')) return;
  const s = document.createElement('style');
  s.id = 'ph-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* ---------------------------------------------------------------- shared DOM pieces */
function buildCards() {
  const ol = h('ol', P + 'cards');
  return { ol, cards: OUTPUTS.map((o, i) => {
    const li = h('li', P + 'card');
    const m = h('div', P + 'card-m');
    m.append(h('span', P + 'card-t', o.t), h('span', P + 'card-s', o.s));
    const v = h('span', P + 'card-v', '0.00');
    li.append(m, v);
    ol.appendChild(li);
    return { li, v, last: '' };
  }) };
}

/* ---------------------------------------------------------------- fallback (no WebGL) */
function buildFallback(container, theme) {
  ensureCss();
  container.setAttribute('data-webgl', 'off');
  const st = container.closest ? container.closest('.stage') : null;
  if (st) st.setAttribute('data-webgl', 'off');
  const root = h('div', P + 'root ' + P + 'fallback');
  root.dataset.theme = theme;
  const inp = h('ul', P + 'fb-in');
  INPUTS.forEach((t) => inp.appendChild(h('li', null, t)));
  const { ol, cards } = buildCards();
  cards.forEach((c, i) => { c.v.textContent = (0.62 + 0.36 * hash(i * 5.7 + 2.1)).toFixed(2); });
  root.append(inp, ol, h('p', P + 'fig', FIG));
  container.appendChild(root);
  return { dispose() { root.remove(); container.removeAttribute('data-webgl'); if (st) st.removeAttribute('data-webgl'); }, setTheme(t) { root.dataset.theme = t; } };
}

/* ---------------------------------------------------------------- the instance */
function createInstance(container, o) {
  ensureCss();
  const compact = o.compact;
  const reduced = o.reduced;
  const coarse = matchMedia('(pointer:coarse)').matches;
  const lowDevice = coarse || (navigator.deviceMemory && navigator.deviceMemory < 4);
  let useComposer = o.quality === 'high' ? true : o.quality === 'low' ? false : !(lowDevice || compact && container.clientWidth < 700);
  const lockQuality = o.quality !== 'auto';
  const mode = reduced ? 'static' : compact ? 'auto' : 'pinned';
  const sceneEl = container.closest ? container.closest('[data-scene]') : null;
  let theme = o.theme;
  let TH = THEMES[theme];

  /* ----- DOM */
  const root = h('div', P + 'root ' + P + mode + (compact ? ' ' + P + 'compact' : '') + (compact ? '' : ' ' + P + 'wide'));
  root.dataset.theme = theme;
  const stage = h('div', P + 'stage');
  const canvas = h('canvas', P + 'canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', ARIA);
  const overlay = h('div', P + 'overlay');
  stage.append(canvas, overlay);
  root.appendChild(stage);

  const chips = [
    { el: h('div', P + 'chip is-l', 'Cell swelling'), ops: [0.12, 0.18, 0.3, 0.34], side: 'l' },
    { el: h('div', P + 'chip is-r', 'Voltage · current · temperature'), ops: [0.15, 0.21, 0.3, 0.34], side: 'r' },
    { el: h('div', P + 'chip is-r', 'Time of flight'), ops: [0.34, 0.4, 0.5, 0.56], side: 'r' },
  ];
  chips.forEach((c) => overlay.appendChild(c.el));

  const inputs = INPUTS.map((t) => {
    const e = h('div', P + 'in');
    e.append(h('span', null, t));
    const b = h('b', null, '0.00');
    e.appendChild(b);
    overlay.appendChild(e);
    return { e, b, last: '' };
  });

  const mkFig = () => { const f = h('p', P + 'fig'); FIG.forEach((l) => f.appendChild(h('span', null, l))); return f; };
  const { ol: cardsOl, cards } = buildCards();
  let grid = null;
  if (compact) {
    grid = h('div', P + 'grid');
    grid.append(cardsOl, mkFig());
    root.appendChild(grid);
  } else {
    overlay.appendChild(cardsOl);
  }

  const chapterBox = h('div', P + 'chapter');
  const chEls = CHAPTERS.map(([n, t, s]) => {
    const d = h('div', P + 'ch');
    d.append(h('span', P + 'chn', n), h('span', P + 'cht', t), h('span', P + 'chs', s));
    chapterBox.appendChild(d);
    return d;
  });
  overlay.appendChild(chapterBox);

  let figEl = null, cueEl = null, tickEls = [];
  if (!compact) {
    figEl = mkFig();
    overlay.appendChild(figEl);
    cueEl = h('div', P + 'cue');
    cueEl.appendChild(h('span', null, 'Scroll'));
    overlay.appendChild(cueEl);
    const ticks = h('div', P + 'ticks');
    ticks.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) { const t = h('i', P + 'tick'); ticks.appendChild(t); tickEls.push(t); }
    overlay.appendChild(ticks);
  }

  const btn = h('button', P + 'btn');
  btn.type = 'button';
  const ICON_PLAY = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L5.4 2.1a.6.6 0 0 0-.9.5z"/></svg>';
  const ICON_REPLAY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1"/><path d="M2.4 2.2v3.2h3.2"/></svg>';
  const setBtn = (replay) => { btn.innerHTML = (replay ? ICON_REPLAY : ICON_PLAY) + '<span>' + (replay ? 'Replay' : 'Play') + '</span>'; };
  setBtn(mode !== 'static');
  btn.setAttribute('aria-label', mode === 'static' ? 'Play the animation' : 'Replay the animation');
  if (compact && grid) {
    /* mobile: the Replay pill sits beside the caption instead of floating over the stage */
    const fig = grid.querySelector('.' + P + 'fig');
    const row = h('div', P + 'figrow');
    fig.replaceWith(row);
    row.append(fig, btn);
  } else overlay.appendChild(btn);


  /* ----- renderer */
  const maxDpr = coarse ? 1.5 : 2;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !useComposer, alpha: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  let dpr = Math.min(window.devicePixelRatio || 1, useComposer ? maxDpr : Math.min(maxDpr, 1.5));
  renderer.setPixelRatio(dpr);

  const restorePos = (() => {
    if (getComputedStyle(container).position === 'static') { container.style.position = 'relative'; return () => { container.style.position = ''; }; }
    return () => {};
  })();
  if (compact) { root.style.position = 'relative'; }
  container.appendChild(root);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1.6, 0.1, 200);
  const bgTex = new THREE.CanvasTexture(document.createElement('canvas'));
  bgTex.colorSpace = THREE.SRGBColorSpace;
  function paintBg() {
    const c = bgTex.image; c.width = c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(512 * 0.64, 512 * 0.44, 0, 512 * 0.64, 512 * 0.44, 512 * 0.78);
    gr.addColorStop(0, TH.g0); gr.addColorStop(1, TH.g1);
    g.fillStyle = TH.g1; g.fillRect(0, 0, 512, 512);
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    bgTex.needsUpdate = true;
  }
  paintBg();
  scene.background = bgTex;

  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = TH.env;
  pm.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(-6, 9, 8);
  const fill = new THREE.DirectionalLight(0xcfdcff, 0.25);
  fill.position.set(10, 3, 6);
  scene.add(key, fill);

  const glow = (m) => { m.layers.enable(1); return m; };
  const disposables = [bgTex, envTex];
  const track = (x) => { disposables.push(x); return x; };

  /* ----- layout (network) */
  const xs = compact ? 0.62 : 1;
  const ys = compact ? 1.5 : 1;
  const LX = [-2.2, 1.6, 5.0, 8.4].map((x) => -2.2 + (x + 2.2) * xs);
  const COUNT = [6, 8, 8, 6];
  const SP = [0.72, 0.62, 0.62, 0.8];
  const nodes = [];
  {
    let k = 0;
    for (let l = 0; l < 4; l++) {
      for (let i = 0; i < COUNT[l]; i++) {
        nodes.push({ l, i, idx: k, x: LX[l], y: ((COUNT[l] - 1) / 2 - i) * SP[l] * ys, z: 0, val: 0.55 + 0.43 * hash(k * 5.7 + 2.1), a: 0 });
        k++;
      }
    }
  }
  const layerNodes = [0, 1, 2, 3].map((l) => nodes.filter((n) => n.l === l));
  const floorY = -Math.max(2.9, 2.17 * ys + 0.75);
  const CELL_X = -9;
  const FAN = new THREE.Vector3(LX[0] - 0.6, 0, 0);

  /* ----- floor, backdrop dots and contact shadows */
  const floorMat = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uCol: { value: new THREE.Vector3(...TH.floor) }, uA: { value: TH.floorA }, uFocus: { value: new THREE.Vector2(0, 0) }, uFd: { value: new THREE.Vector2(...TH.floorFade) }, uAa: { value: new THREE.Vector2(...TH.floorAa) } },
    vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `varying vec3 vW;uniform vec3 uCol;uniform float uA;uniform vec2 uFocus;uniform vec2 uFd;uniform vec2 uAa;
      void main(){vec2 g=vW.xz/.6;vec2 f=fract(g)-.5;float d=length(f);float aa=fwidth(d);
      float dm=1.-smoothstep(.075-aa,.075+aa,d);dm*=1.-smoothstep(uAa.x,uAa.y,aa);
      float dist=length(vW.xz-uFocus);float fade=1.-smoothstep(uFd.x,uFd.y,dist);
      gl_FragColor=vec4(uCol,dm*fade*uA);
#include <colorspace_fragment>
}`,
  }));
  const floorGeo = track(new THREE.PlaneGeometry(90, 70));
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, floorY, 0);
  scene.add(floor);

  const blobTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(14,27,46,1)'); gr.addColorStop(0.55, 'rgba(14,27,46,.35)'); gr.addColorStop(1, 'rgba(14,27,46,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return track(t);
  })();
  const blobGeo = track(new THREE.PlaneGeometry(1, 1)); blobGeo.rotateX(-Math.PI / 2);
  const mkBlob = (x, z, sx, sz, a) => {
    const m = track(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: a }));
    const b = new THREE.Mesh(blobGeo, m); b.position.set(x, floorY + 0.01, z); b.scale.set(sx, 1, sz); b.userData.a = a; scene.add(b); return b;
  };
  const blobs = [
    mkBlob(CELL_X, 0, 5.2, 5.2, 0.42),
    mkBlob((LX[0] + LX[3]) / 2, 0, (LX[3] - LX[0]) + 5, 6.5, 0.17),
  ];

  /* ----- cell */
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.7);
  const cell = new THREE.Group();
  cell.position.set(CELL_X, 0, 0);
  scene.add(cell);
  const shellMat = track(new THREE.MeshPhysicalMaterial({ color: COL.ceramic, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide, clippingPlanes: [clip] }));
  const shell = new THREE.Mesh(track(new THREE.CylinderGeometry(1, 1, 3.2, 72, 1, false)), shellMat);
  cell.add(shell);
  const labelTex = (() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 430;
    const g = c.getContext('2d');
    g.fillStyle = '#F4F2E8'; g.fillRect(0, 0, 600, 430);
    g.fillStyle = '#1E48E0'; g.fillRect(0, 0, 600, 34);
    const F = '"Inter","Helvetica Neue",Arial,sans-serif';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#F4F2E8'; g.font = '700 22px ' + F; g.fillText('CYLINDRICAL CELL', 78, 25);
    g.textAlign = 'right'; g.fillText('RESEARCH GRADE', 548, 25); g.textAlign = 'left';
    g.fillStyle = '#0E1B2E'; g.font = '800 88px ' + F; g.fillText('Li-ion', 74, 140);
    g.fillStyle = 'rgba(14,27,46,.18)'; g.fillRect(74, 170, 474, 3);
    g.fillStyle = 'rgba(14,27,46,.55)'; g.fillRect(78, 206, 300, 8); g.fillRect(78, 232, 210, 8);
    g.fillStyle = 'rgba(14,27,46,.28)'; g.fillRect(78, 266, 400, 4); g.fillRect(78, 288, 330, 4); g.fillRect(78, 310, 370, 4);
    g.fillStyle = '#0E1B2E';
    for (let i = 0, x = 78; x < 300; i++) { const w = 2 + ((i * 7) % 4); g.fillRect(x, 336, w, 40); x += w + 2 + ((i * 5) % 3); }
    g.font = '600 19px ' + F; g.fillText('SOC RESEARCH CELL', 330, 366);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return track(t);
  })();
  const sleeveMat = track(new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.55, side: THREE.DoubleSide, clippingPlanes: [clip] }));
  const sleeve = new THREE.Mesh(track(new THREE.CylinderGeometry(1.012, 1.012, 1.5, 48, 1, true, -2.05, 2.1)), sleeveMat);
  sleeve.position.y = 0.2;
  const stripeMat = track(new THREE.MeshStandardMaterial({ color: COL.cobalt, roughness: 0.5, side: THREE.DoubleSide, clippingPlanes: [clip] }));
  const stripe = new THREE.Mesh(track(new THREE.CylinderGeometry(1.014, 1.014, 0.1, 48, 1, true, -2.05, 2.1)), stripeMat);
  stripe.position.y = 0.2 + 0.7;
  const steelMat = track(new THREE.MeshStandardMaterial({ color: COL.steel, metalness: 0.7, roughness: 0.35 }));
  const terminal = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 40)), steelMat);
  terminal.position.y = 1.67;
  const termRing = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 40)), steelMat);
  termRing.position.y = 1.62;
  const zClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const mandrelMat = track(new THREE.MeshStandardMaterial({ color: COL.steel, metalness: 0.7, roughness: 0.35, clippingPlanes: [zClip] }));
  const mandrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.1, 3.0, 24)), mandrelMat);
  const crimpGeo = track(new THREE.TorusGeometry(0.985, 0.045, 10, 72)); crimpGeo.rotateX(Math.PI / 2);
  const crimpMat = track(new THREE.MeshStandardMaterial({ color: 0xc4c8d2, metalness: 0.6, roughness: 0.4, clippingPlanes: [clip] }));
  const crimpTop = new THREE.Mesh(crimpGeo, crimpMat); crimpTop.position.y = 1.52;
  const crimpBot = new THREE.Mesh(crimpGeo, crimpMat); crimpBot.position.y = -1.52;
  const capGeo = track(new THREE.CylinderGeometry(0.97, 0.97, 0.02, 64));
  const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: 0xc4c8d2, metalness: 0.6, roughness: 0.38 })); cap.position.y = 1.605;
  disposables.push(cap.material);
  cell.add(sleeve, stripe, terminal, termRing, mandrel, crimpTop, crimpBot, cap);

  function spiralRibbon(phase, color) {
    const turns = 6, segs = 40, N = turns * segs, r0 = 0.17, r1 = 0.9, th = 0.045, hh = 1.47;
    const pos = [], nor = [], idx = [];
    const P3 = (i, off) => { const t = i / N, a = phase + t * turns * Math.PI * 2, r = lerp(r0, r1, t) + off; return [Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)]; };
    const strip = (fn) => {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) { const [p0, p1, n] = fn(i); pos.push(...p0, ...p1); nor.push(...n, ...n); }
      for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    strip((i) => { const [x, z, cx, cz] = P3(i, th / 2); return [[x, -hh, z], [x, hh, z], [cx, 0, cz]]; });
    strip((i) => { const [x, z, cx, cz] = P3(i, -th / 2); return [[x, -hh, z], [x, hh, z], [-cx, 0, -cz]]; });
    strip((i) => { const [xo, zo] = P3(i, th / 2), [xi, zi] = P3(i, -th / 2); return [[xi, hh, zi], [xo, hh, zo], [0, 1, 0]]; });
    strip((i) => { const [xo, zo] = P3(i, th / 2), [xi, zi] = P3(i, -th / 2); return [[xi, -hh, zi], [xo, -hh, zo], [0, -1, 0]]; });
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide, clippingPlanes: [zClip] })));
  }
  cell.add(spiralRibbon(0, COL.cobalt300), spiralRibbon(Math.PI, 0xc9c4b2));
  const basePlate = new THREE.Mesh(track(new THREE.CylinderGeometry(0.93, 0.93, 0.07, 64)), track(new THREE.MeshStandardMaterial({ color: 0xc4c8d2, metalness: 0.5, roughness: 0.45, clippingPlanes: [zClip] })));
  basePlate.position.y = -1.5;
  cell.add(basePlate);

  const ringMat = track(new THREE.MeshBasicMaterial({ color: COL.cobalt, transparent: true, opacity: 0 }));
  const cutRing = glow(new THREE.Mesh(track(new THREE.TorusGeometry(1.004, 0.01, 8, 96)), ringMat));
  cutRing.rotation.x = Math.PI / 2;
  cutRing.position.set(CELL_X, 0, 0);
  scene.add(cutRing);

  /* ----- transducers */
  const plateGeo = track(new RoundedBoxGeometry(0.28, 2.2, 0.9, 4, 0.06));
  const plateMat = track(new THREE.MeshStandardMaterial({ color: 0xd3d8e1, metalness: 0.55, roughness: 0.42, transparent: true, opacity: 0 }));
  const tx = new THREE.Mesh(plateGeo, plateMat), rx = new THREE.Mesh(plateGeo, plateMat);
  const rimGeo = track(new RoundedBoxGeometry(0.03, 1.7, 0.5, 2, 0.012));
  const rimMat = track(new THREE.MeshBasicMaterial({ color: COL.cobalt, transparent: true, opacity: 0 }));
  const txRim = glow(new THREE.Mesh(rimGeo, rimMat)), rxRim = glow(new THREE.Mesh(rimGeo, rimMat));
  scene.add(tx, rx, txRim, rxRim);

  /* ----- pulse (analytic wavefront quad, drawn over the shell like an x-ray) */
  const pulseMat = track(new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uPh: { value: 0 }, uOp: { value: 0 }, uC: { value: new THREE.Color(COL.cobalt) } },
    vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vP;uniform float uPh,uOp;uniform vec3 uC;
      void main(){
        vec2 c=vec2(-2.4,0.);vec2 d=vP-c;float r=length(d);float ang=abs(atan(d.y,d.x));
        float a=0.;
        for(int i=0;i<5;i++){float f=fract(uPh+float(i)/5.);float rr=2.4+.15+f*2.0;float dr=r-rr;
          float env=sin(3.14159*f);a+=exp(-dr*dr/.0065)*(.5+.5*cos(dr*34.))*env;}
        float m=smoothstep(1.2,.95,abs(vP.y))*smoothstep(-.1,.12,vP.x+1.1)*smoothstep(1.2,1.02,vP.x);
        gl_FragColor=vec4(uC,clamp(a*m*1.25,0.,1.)*uOp);
#include <colorspace_fragment>
}`,
  }));
  const pulse = glow(new THREE.Mesh(track(new THREE.PlaneGeometry(4, 3)), pulseMat));
  pulse.position.set(CELL_X, 0, 0.02);
  pulse.renderOrder = 10;
  scene.add(pulse);

  /* ----- A-scan trace + time-of-flight bracket */
  const NT = 200, TY = 2.72, TX0 = CELL_X - 2.1, TX1 = CELL_X + 2.1;
  const traceGeo = track(new THREE.BufferGeometry());
  const tp = new Float32Array((NT + 1) * 6);
  traceGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const tidx = [];
  for (let i = 0; i < NT; i++) { const a = i * 2; tidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  traceGeo.setIndex(tidx);
  const traceMat = track(new THREE.MeshBasicMaterial({ color: COL.cobalt, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  const trace = glow(new THREE.Mesh(traceGeo, traceMat));
  trace.frustumCulled = false;
  scene.add(trace);
  const thinGeo = track(new THREE.PlaneGeometry(1, 1));
  const thinMat = track(new THREE.MeshBasicMaterial({ color: COL.cobalt, transparent: true, opacity: 0 }));
  const tofBar = new THREE.Mesh(thinGeo, thinMat), tofA = new THREE.Mesh(thinGeo, thinMat), tofB = new THREE.Mesh(thinGeo, thinMat);
  scene.add(tofBar, tofA, tofB);
  const baseMat = track(new THREE.MeshBasicMaterial({ color: COL.ink, transparent: true, opacity: 0 }));
  const baseline = new THREE.Mesh(thinGeo, baseMat);
  baseline.scale.set(TX1 - TX0, 0.012, 1); baseline.position.set(CELL_X, TY - 0.0, -0.01);
  scene.add(baseline);
  const pk = (d) => Math.exp(-(d * d) / 0.032) * Math.sin(d * 38);
  const xB = CELL_X - 1.55;
  let xA = CELL_X - 0.6;
  function updateTrace() {
    for (let i = 0; i <= NT; i++) {
      const x = lerp(TX0, TX1, i / NT);
      const y = TY + pk(x - xB) * 0.3 + pk(x - xA) * 0.46 + (hash(i * 1.7) - 0.5) * 0.003;
      tp[i * 6] = x; tp[i * 6 + 1] = y + 0.013; tp[i * 6 + 2] = 0;
      tp[i * 6 + 3] = x; tp[i * 6 + 4] = y - 0.013; tp[i * 6 + 5] = 0;
    }
    traceGeo.attributes.position.needsUpdate = true;
    const by = TY - 0.52;
    tofBar.scale.set(xA - xB, 0.012, 1); tofBar.position.set((xA + xB) / 2, by, 0);
    tofA.scale.set(0.012, 0.16, 1); tofA.position.set(xA, by, 0);
    tofB.scale.set(0.012, 0.16, 1); tofB.position.set(xB, by, 0);
  }

  /* ----- signal cable + particles */
  const cablePts = [[-7.82, 0, 0.1], [-7.2, -0.55, 0.9], [-5.8, -1.05, 1.2], [-4.4, -0.7, 0.8], [-3.3, -0.2, 0.3]].map((a) => new THREE.Vector3(...a));
  cablePts[0].x = CELL_X + 1.18; cablePts.push(FAN.clone());
  const cable = new THREE.CatmullRomCurve3(cablePts, false, 'catmullrom', 0.5);
  const cableGeo = track(new THREE.TubeGeometry(cable, 140, 0.035, 6, false));
  const cableU = {
    uReveal: { value: 0 }, uTime: { value: 0 }, uInk: { value: new THREE.Color(COL.ink) }, uCob: { value: new THREE.Color(COL.cobalt) }, uMode: { value: 0 }, uInkA: { value: 0.4 }, uDashA: { value: 1 },
  };
  const cableShader = (mode) => track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...cableU, uMode: { value: mode } },
    vertexShader: 'varying float vU;void main(){vU=uv.x;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying float vU;uniform float uReveal,uTime,uMode,uInkA,uDashA;uniform vec3 uInk,uCob;
      void main(){if(vU>uReveal)discard;
        float f=fract(vU*14.-uTime*.9);float dash=smoothstep(0.,.12,f)*(1.-smoothstep(.28,.4,f));
        float head=smoothstep(uReveal-.07,uReveal,vU);
        if(uMode<.5){gl_FragColor=vec4(uInk,uInkA);}else{gl_FragColor=vec4(uCob,clamp(dash*.95+head*.9,0.,1.)*uDashA);}
        
#include <colorspace_fragment>
}`,
  }));
  const cableInk = new THREE.Mesh(cableGeo, cableShader(0));
  const cableDash = glow(new THREE.Mesh(cableGeo, cableShader(1)));
  cableInk.frustumCulled = cableDash.frustumCulled = false;
  scene.add(cableInk, cableDash);

  const NP = (useComposer && !lowDevice) ? 360 : 150;
  const cableSamples = cable.getSpacedPoints(300);
  const ppos = new Float32Array(NP * 3), psize = new Float32Array(NP);
  const partGeo = track(new THREE.BufferGeometry());
  partGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  partGeo.setAttribute('aSize', new THREE.BufferAttribute(psize, 1));
  const partMat = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uPx: { value: dpr }, uOp: { value: 0 }, uC: { value: new THREE.Color(COL.cobalt) } },
    vertexShader: 'attribute float aSize;uniform float uPx;varying float vS;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uPx*(14./-mv.z);vS=aSize;gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 uC;uniform float uOp;varying float vS;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.08,d)*uOp*step(.01,vS);gl_FragColor=vec4(uC,a);\n#include <colorspace_fragment>\n}',
  }));
  const points = glow(new THREE.Points(partGeo, partMat));
  points.frustumCulled = false;
  scene.add(points);
  const partSeed = Array.from({ length: NP }, (_, i) => ({ o: hash(i * 2.3), sz: 3 + 3 * hash(i * 9.1 + 1), tgt: i % 6, j: hash(i * 4.4 + 8) }));
  const tmpV = new THREE.Vector3();
  function updateParticles(time, reveal, op, fadeX) {
    const count = Math.floor(NP * reveal);
    for (let i = 0; i < NP; i++) {
      const sd = partSeed[i];
      if (i >= count) { psize[i] = 0; continue; }
      const s = (sd.o + time * 0.14) % 1.34;
      if (s < 1) {
        const cs = cableSamples[Math.min(299, Math.floor(s * 299))];
        ppos[i * 3] = cs.x; ppos[i * 3 + 1] = cs.y + (sd.j - 0.5) * 0.07; ppos[i * 3 + 2] = cs.z;
        psize[i] = sd.sz * smooth(Math.min(1, s * 8));
      } else {
        const f = eoe((s - 1) / 0.34);
        const t = layerNodes[0][sd.tgt];
        tmpV.set(t.x, t.y, t.z);
        ppos[i * 3] = lerp(FAN.x, t.x - 0.1, f); ppos[i * 3 + 1] = lerp(FAN.y, t.y, f) + Math.sin(f * Math.PI) * 0.1 * (sd.j - 0.5);
        ppos[i * 3 + 2] = lerp(FAN.z, t.z, f);
        psize[i] = sd.sz * (1 - smooth(seg(f, 0.7, 1)));
      }
      /* keep the stream out of the label column: fade to zero left of its right edge */
      if (fadeX > 0 && psize[i] > 0) {
        pv.set(ppos[i * 3], ppos[i * 3 + 1], ppos[i * 3 + 2]).project(camera);
        const sx = (pv.x * 0.5 + 0.5) * W;
        psize[i] *= smooth(seg(sx, fadeX, fadeX + 34));
      }
    }
    partGeo.attributes.position.needsUpdate = true;
    partGeo.attributes.aSize.needsUpdate = true;
    partMat.uniforms.uOp.value = op;
  }

  /* ----- network: nodes (instanced), halos, edges, leaders */
  const nodeGeo = track(new THREE.SphereGeometry(0.1, 24, 16));
  const nodeMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05 }));
  const nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, nodes.length);
  nodeMesh.frustumCulled = false;
  const haloGeo = track(new THREE.SphereGeometry(0.155, 20, 14));
  const haloMat = track(new THREE.MeshBasicMaterial({ color: COL.cobalt, transparent: true, opacity: 0.3, depthWrite: false }));
  const haloMesh = glow(new THREE.InstancedMesh(haloGeo, haloMat, nodes.length));
  haloMesh.frustumCulled = false;
  scene.add(nodeMesh, haloMesh);
  const dummy = new THREE.Object3D();
  const cA = new THREE.Color(COL.cream), cB = new THREE.Color(COL.cobalt), cTmp = new THREE.Color();
  nodes.forEach((n, i) => { dummy.position.set(n.x, n.y, n.z); dummy.scale.setScalar(1); dummy.updateMatrix(); nodeMesh.setMatrixAt(i, dummy.matrix); nodeMesh.setColorAt(i, cA); haloMesh.setMatrixAt(i, dummy.matrix); });

  const edgePos = [], edgeCol = [], edgeW = [];
  const cCob = new THREE.Color(COL.cobalt), cRose = new THREE.Color(COL.rose);
  for (let l = 0; l < 3; l++) {
    for (const a of layerNodes[l]) for (const b of layerNodes[l + 1]) {
      const hv = hash(a.idx * 13.1 + b.idx * 7.7);
      const c = hv > 0.38 ? cCob : cRose;
      edgePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      edgeCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
      const w = 0.45 + 0.55 * hash(a.idx * 3.3 + b.idx * 1.9);
      edgeW.push(w, w);
    }
  }
  const edgeGeo = track(new THREE.BufferGeometry());
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
  edgeGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeCol, 3));
  edgeGeo.setAttribute('aW', new THREE.Float32BufferAttribute(edgeW, 1));
  const edgeShader = (glowOnly) => track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { uWf: { value: -99 }, uBase: { value: TH.edgeBase }, uHi: { value: 0.95 }, uGlow: { value: glowOnly ? 1 : 0 } },
    vertexShader: `attribute float aW;uniform float uWf;varying vec3 vC;varying float vW;varying float vL;
      void main(){vC=color;vW=aW;float d=uWf-position.x;vL=smoothstep(-.2,.9,d)*(1.-.5*smoothstep(1.4,4.2,d));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uBase,uHi,uGlow;varying vec3 vC;varying float vW;varying float vL;
      void main(){float a=mix(uBase*vW,uHi,vL);if(uGlow>.5)a=vL*vL*.95;gl_FragColor=vec4(vC,a);
#include <colorspace_fragment>
}`,
  }));
  const edgesBase = new THREE.LineSegments(edgeGeo, edgeShader(false));
  edgesBase.frustumCulled = false;
  scene.add(edgesBase);
  let edgesGlow = null;
  if (useComposer) { edgesGlow = glow(new THREE.LineSegments(edgeGeo, edgeShader(true))); edgesGlow.frustumCulled = false; scene.add(edgesGlow); }

  const leaderMat = track(new THREE.MeshBasicMaterial({ color: COL.cobalt, transparent: true, opacity: 0.8 }));
  const leaderGeo = track(new THREE.PlaneGeometry(1, 0.018)); leaderGeo.translate(0.5, 0, 0);
  const leaders = layerNodes[3].map((n) => { const m = glow(new THREE.Mesh(leaderGeo, leaderMat)); m.position.set(n.x + 0.14, n.y, n.z); m.scale.x = 0.0001; scene.add(m); return m; });
  const LEADER = compact ? 0.56 : 1.16;
  const CARD_DX = compact ? 0.7 : 1.3;

  /* ----- halos for the low tier (replaces bloom) */
  let haloSprites = null;
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(30,72,224,1)'); gr.addColorStop(0.4, 'rgba(30,72,224,.4)'); gr.addColorStop(1, 'rgba(30,72,224,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return track(t);
  })();
  function ensureHalos() {
    if (haloSprites) return;
    haloSprites = nodes.map((n) => {
      const m = track(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0 }));
      const s = new THREE.Sprite(m); s.position.set(n.x, n.y, n.z - 0.05); s.scale.setScalar(0.01); scene.add(s); return s;
    });
  }
  if (!useComposer) ensureHalos();

  /* ----- post processing */
  let bloomComposer = null, baseComposer = null, bloomPass = null, compPass = null;
  let W = 0, H = 0;
  function buildComposers() {
    const bt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.0, 0.65, 0);
    bloomComposer.addPass(bloomPass);
    baseComposer = new EffectComposer(renderer, bt);
    baseComposer.addPass(new RenderPass(scene, camera));
    compPass = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tBloom: { value: bloomComposer.renderTarget2.texture },
        uTint: { value: new THREE.Color(COL.cobalt) }, uStrength: { value: TH.strength }, uDark: { value: TH.dark },
      },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform sampler2D tDiffuse,tBloom;uniform vec3 uTint;uniform float uStrength,uDark;varying vec2 vUv;
        void main(){vec3 base=texture2D(tDiffuse,vUv).rgb;vec3 b=texture2D(tBloom,vUv).rgb;
          float g=clamp(dot(b,vec3(.3333))*uStrength,0.,.38);
          vec3 light=base*mix(vec3(1.),uTint,g);vec3 dark=base+b*uStrength*.6;
          gl_FragColor=vec4(mix(light,dark,uDark),1.);}`,
    }));
    baseComposer.addPass(compPass);
    baseComposer.addPass(new OutputPass());
  }
  if (useComposer) buildComposers();

  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height));
    if (w === W && hh === H) return;
    W = w; H = hh;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (useComposer) {
      bloomComposer.setPixelRatio(dpr); baseComposer.setPixelRatio(dpr);
      baseComposer.setSize(W, H);
      bloomComposer.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
      bloomComposer.setPixelRatio(dpr);
    }
    partMat.uniforms.uPx.value = dpr;
    measureSizes();
  }

  /* ----- theme */
  function applyTheme(t) {
    theme = t === 'dark' ? 'dark' : 'light';
    TH = THEMES[theme];
    root.dataset.theme = theme;
    paintBg();
    scene.environmentIntensity = TH.env;
    floorMat.uniforms.uCol.value.set(...TH.floor);
    floorMat.uniforms.uA.value = TH.floorA;
    floorMat.uniforms.uFd.value.set(...TH.floorFade);
    floorMat.uniforms.uAa.value.set(...TH.floorAa);
    blobs.forEach((b) => { b.material.opacity = b.userData.a * (theme === 'dark' ? 1.5 : 1); });
    edgesBase.material.uniforms.uBase.value = TH.edgeBase;
    if (compPass) { compPass.uniforms.uStrength.value = TH.strength; compPass.uniforms.uDark.value = TH.dark; }
    if (haloSprites) haloSprites.forEach((s) => (s.userData.max = TH.halo));
  }
  applyTheme(theme);

  /* ----- camera path */
  const KEYS = [
    { p: 0.0, pos: [-9.0, 0.8, 12.5], look: [-10.6, 0.2, 0], fov: 28, hw: 3.3 },
    { p: 0.12, pos: [-7.6, 1.5, 9.8], look: [-9.0, 0.4, 0], fov: 30, hw: 3.4 },
    { p: 0.3, pos: [-8.9, 1.3, 10.2], look: [-8.9, 0.85, 0], fov: 32, hw: 3.8 },
    { p: 0.46, pos: [-4.2, 1.2, 8.8], look: [-4.5, 0.3, 0], fov: 34, hw: 4.6, net: true },
    { p: 0.62, pos: [1.4, 0.8, 10.6], look: [2.0, 0, 0], fov: 34, hw: 7.2, net: true },
    { p: 0.8, pos: [6.4, 0.6, 9.6], look: [6.8, 0, 0], fov: 34, hw: 7.2, net: true },
    { p: 0.92, pos: [3.9, 0.2, 13.5], look: [3.9, 0, 0], fov: 36, hw: 9.5, net: true, final: true },
    { p: 1.0, pos: [3.9, 0.2, 13.5], look: [3.9, 0, 0], fov: 36, hw: 9.5, net: true, final: true },
  ];
  const mapNetX = (x) => -2.2 + (x + 2.2) * xs;
  const netCx = compact ? (LX[0] + LX[3]) / 2 : (LX[0] - 1.5 + LX[3] + 3.3) / 2;
  const K = KEYS.map((k) => {
    const pos = new THREE.Vector3(...k.pos), look = new THREE.Vector3(...k.look);
    if (k.net) { pos.x = mapNetX(pos.x); look.x = mapNetX(look.x); }
    if (k.final) { pos.x = look.x = netCx; }
    if (compact && !k.net) { look.x = lerp(look.x, CELL_X, 0.9); pos.x = lerp(pos.x, CELL_X, 0.9); }
    let hw = k.hw;
    if (compact) hw = k.net ? (k.final ? 4.2 : k.hw * 0.55 + 0.4) : k.hw * 0.62;
    if (compact && k.p === 0) { pos.y = 1.1; look.y = 0.3; }
    return { p: k.p, pos, look, fov: k.fov, hw };
  });
  const posCurve = new THREE.CatmullRomCurve3(K.map((k) => k.pos), false, 'catmullrom', 0.5);
  const lookCurve = new THREE.CatmullRomCurve3(K.map((k) => k.look), false, 'catmullrom', 0.5);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), dirV = new THREE.Vector3();
  let mx = 0, my = 0, pmx = 0, pmy = 0;
  function placeCamera(p, dt) {
    let i = 0;
    while (i < K.length - 2 && p > K[i + 1].p) i++;
    const k0 = K[i], k1 = K[i + 1];
    const f = eio(clamp((p - k0.p) / (k1.p - k0.p), 0, 1));
    const u = (i + f) / (K.length - 1);
    posCurve.getPoint(u, camPos); lookCurve.getPoint(u, camLook);
    const fov = lerp(k0.fov, k1.fov, f), hw = lerp(k0.hw, k1.hw, f);
    // fit the horizontal extent for narrow aspects
    dirV.copy(camPos).sub(camLook);
    const dist = dirV.length();
    const need = hw / (Math.tan((fov * Math.PI) / 360) * camera.aspect);
    if (need > dist) { dirV.multiplyScalar(need / dist); camPos.copy(camLook).add(dirV); }
    if (mode === 'pinned' && !coarse) {
      pmx = damp(pmx, mx, 4, dt); pmy = damp(pmy, my, 4, dt);
      camPos.x += pmx * 0.35; camPos.y += pmy * 0.2;
    }
    /* network stage: level the camera (no pitch) so every neuron column projects to a perfectly vertical line */
    const lvl = smooth(seg(p, 0.46, 0.58));
    if (lvl > 0) camPos.y = lerp(camPos.y, camLook.y, lvl);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    floorMat.uniforms.uFocus.value.set(camLook.x, camLook.z);
  }

  /* ----- overlay projection helpers */
  const pv = new THREE.Vector3();
  function proj(x, y, z, out) {
    pv.set(x, y, z).project(camera);
    out.x = (pv.x * 0.5 + 0.5) * W; out.y = (-pv.y * 0.5 + 0.5) * H; out.ok = pv.z < 1;
    return out;
  }
  const o2 = { x: 0, y: 0, ok: true };
  let tight = false;
  function measureSizes() {
    if (compact) return;
    placeCamera(1, 0);
    const p0 = proj(0, layerNodes[3][0].y, 0, { x: 0, y: 0 }), p1 = proj(0, layerNodes[3][1].y, 0, { x: 0, y: 0 });
    tight = Math.abs(p1.y - p0.y) < 60;
    root.classList.toggle(P + 'tight', tight);
  }

  /* ----- state + per-frame update */
  const st = { ps: 0, time: 0, yaw: 0.5, yawBase: 0.5, chap: -1, lastTick: -1, cardW: 0 };
  const lastOp = new Map();
  function setOp(el, v, tf) {
    const k = el;
    const key = v.toFixed(3) + '|' + tf;
    if (lastOp.get(k) === key) return;
    lastOp.set(k, key);
    if (v <= 0.002) { el.style.visibility = 'hidden'; el.style.opacity = '0'; return; }
    el.style.visibility = 'visible'; el.style.opacity = v.toFixed(3);
    if (tf) el.style.transform = tf;
  }

  function update(ps, dt) {
    const t = st.time;
    // act 1: cell
    const planeY = lerp(-1.65, 0.15, eio(seg(ps, 0.08, 0.28)));
    clip.constant = -planeY;
    st.yawBase += dt * 0.1 * (1 - seg(ps, 0, 0.06));
    cell.rotation.y = st.yawBase + 1.6 * Math.min(ps, 0.3);
    ringMat.opacity = smooth(seg(ps, 0.075, 0.1)) * (1 - 0.7 * seg(ps, 0.3, 0.42)) * (ps < 0.28 ? 1 : 1);
    cutRing.position.y = planeY;
    // act 2: transducers, pulse, trace, cable
    const slide = 1 - eio(seg(ps, 0.22, 0.34));
    const plateOp = smooth(seg(ps, 0.2, 0.28));
    plateMat.opacity = plateOp; rimMat.opacity = plateOp * 0.6;
    const off = 1.18 + 0.9 * slide;
    tx.position.set(CELL_X - off, 0, 0); rx.position.set(CELL_X + off, 0, 0);
    txRim.position.set(CELL_X - off + 0.15, 0, 0); rxRim.position.set(CELL_X + off - 0.15, 0, 0);
    tx.visible = rx.visible = txRim.visible = rxRim.visible = plateOp > 0.01;
    const pOp = smooth(seg(ps, 0.27, 0.34)) * (1 - smooth(seg(ps, 0.5, 0.62)));
    pulseMat.uniforms.uOp.value = pOp;
    pulseMat.uniforms.uPh.value = seg(ps, 0.26, 0.5) * 3 + t * 0.12;
    pulse.visible = pOp > 0.01;
    const soc = 1 - seg(ps, 0.28, 0.5);
    xA = CELL_X - 0.7 + 1.5 * (1 - soc);
    const trOp = smooth(seg(ps, 0.28, 0.38));
    traceMat.opacity = trOp; thinMat.opacity = trOp * 0.55; baseMat.opacity = trOp * 0.18;
    trace.visible = tofBar.visible = tofA.visible = tofB.visible = baseline.visible = trOp > 0.01;
    if (trOp > 0.01) updateTrace();
    const cabR = eio(seg(ps, 0.34, 0.5));
    cableU.uReveal.value = cabR; cableU.uTime.value = t;
    const cabFade = 1 - 0.95 * smooth(seg(ps, 0.62, 0.82));
    cableInk.material.uniforms.uInkA.value = 0.4 * cabFade;
    cableU.uDashA.value = cabFade;
    cableInk.material.uniforms.uReveal.value = cabR; cableDash.material.uniforms.uReveal.value = cabR;
    cableInk.material.uniforms.uTime.value = t; cableDash.material.uniforms.uTime.value = t;
    cableInk.visible = cableDash.visible = cabR > 0.002;
    const partRev = seg(ps, 0.36, 0.5);
    const partOp = smooth(partRev) * (1 - 0.9 * seg(ps, 0.62, 0.8));
    points.visible = partOp > 0.01;
    if (points.visible) {
      let fadeX = 0;
      if (!compact && ps > 0.44) {
        for (let k = 0; k < layerNodes[0].length; k++) {
          const n0 = layerNodes[0][k]; proj(n0.x - 0.32, n0.y, n0.z, o2);
          if (o2.x > fadeX) fadeX = o2.x;
        }
      }
      updateParticles(t, Math.min(1, partRev * 1.2), partOp, fadeX);
    }
    // act 3: network wavefront
    const kw = 1.4 * Math.max(xs, 0.7);
    const wf = lerp(LX[0] - 0.3, LX[3] + 0.5, eio(seg(ps, 0.5, 0.72)));
    edgesBase.material.uniforms.uWf.value = wf;
    if (edgesGlow) edgesGlow.material.uniforms.uWf.value = wf;
    const inAct = smooth(seg(ps, 0.46, 0.54));
    const fire = OUTPUTS.map((_, i) => eio(seg(ps, 0.7 + i * 0.022, 0.77 + i * 0.022)));
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      let a = smooth(clamp((wf - n.x) / kw, 0, 1));
      if (n.l === 0) a = Math.max(a, inAct);
      let sc = 1 + 0.3 * a;
      if (n.l === 3) { const f = fire[n.i]; a = Math.max(a * 0.45, f); sc = 1 + 0.3 * a + 0.2 * Math.sin(f * Math.PI); }
      n.a = a;
      dummy.position.set(n.x, n.y, n.z);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      nodeMesh.setMatrixAt(k, dummy.matrix);
      cTmp.copy(cA).lerp(cB, a * 0.9);
      nodeMesh.setColorAt(k, cTmp);
      dummy.scale.setScalar(Math.max(0.0001, a * (1 + 0.35 * (n.l === 3 ? fire[n.i] : 0))));
      dummy.updateMatrix();
      haloMesh.setMatrixAt(k, dummy.matrix);
      if (haloSprites) { const s = haloSprites[k]; const m = TH.halo * 1.4; s.material.opacity = a * m; s.scale.setScalar(0.1 + a * 1.05); }
    }
    nodeMesh.instanceMatrix.needsUpdate = true; nodeMesh.instanceColor.needsUpdate = true; haloMesh.instanceMatrix.needsUpdate = true;
    haloMesh.visible = useComposer || !haloSprites;
    haloMat.opacity = useComposer ? 0.3 : 0.0;
    haloMesh.visible = useComposer;
    leaders.forEach((m, i) => { m.scale.x = Math.max(0.0001, fire[i] * LEADER); m.visible = fire[i] > 0.01; });
    blobs.forEach((b, i) => { b.visible = i === 0 ? true : true; });

    placeCamera(ps, dt);

    // ----- overlays
    // chapter
    let ch = ps < 0.08 ? -1 : ps < 0.28 ? 0 : ps < 0.48 ? 1 : ps < 0.71 ? 2 : 3;
    if (ch !== st.chap) { st.chap = ch; chEls.forEach((e, i) => e.classList.toggle('is-on', i === ch)); tickEls.forEach((e, i) => e.classList.toggle('is-on', i === ch)); }
    if (cueEl) cueEl.classList.toggle('is-on', ps < 0.03);
    if (figEl) figEl.classList.toggle('is-on', ps > 0.5);
    // chips
    if (!compact) {
      const anchors = [[CELL_X - 0.8, 1.25, 0.6], [CELL_X + 0.3, 1.78, 0], [xA, TY - 0.52, 0]];
      chips.forEach((c, i) => {
        const op = smooth(seg(ps, c.ops[0], c.ops[1])) * (1 - smooth(seg(ps, c.ops[2], c.ops[3])));
        if (op <= 0.002) { setOp(c.el, 0, ''); return; }
        const a = anchors[i]; proj(a[0], a[1], a[2], o2);
        const dx = c.side === 'r' ? 30 : -30;
        setOp(c.el, op, `translate3d(${(o2.x + dx).toFixed(1)}px,${o2.y.toFixed(1)}px,0) translate(${c.side === 'r' ? '0' : '-100%'},-50%)`);
      });
      inputs.forEach((e, i) => {
        const n = layerNodes[0][i];
        let op = smooth(seg(n.a, 0.02, 0.5)) * smooth(seg(ps, 0.46, 0.56));
        if (op <= 0.002) { setOp(e.e, 0, ''); return; }
        proj(n.x - 0.32, n.y, n.z, o2);
        op *= smooth(seg(o2.x, 110, 230));
        if (op <= 0.002) { setOp(e.e, 0, ''); return; }
        const v = (n.val * n.a).toFixed(2);
        if (v !== e.last) { e.last = v; e.b.textContent = v; }
        setOp(e.e, op, `translate3d(${o2.x.toFixed(1)}px,${o2.y.toFixed(1)}px,0) translate(-100%,-50%)`);
      });
    }
    let colX = 0;
    if (!compact) {
      for (let k = 0; k < cards.length; k++) { const nk = layerNodes[3][k]; proj(nk.x + CARD_DX, nk.y, nk.z, o2); if (o2.x > colX) colX = o2.x; }
      colX += 0;
      const cw = Math.round(clamp(W - colX - 18, 176, 236));
      if (cw !== st.cardW) { st.cardW = cw; cards.forEach((c) => { c.li.style.width = cw + 'px'; }); }
    }
    cards.forEach((c, i) => {
      const n = layerNodes[3][i];
      const f = fire[i];
      const v = (n.val * f).toFixed(2);
      if (v !== c.last) { c.last = v; c.v.textContent = v; }
      c.li.classList.toggle('is-pulse', f > 0.92 && i === 5);
      if (compact) {
        const op = 0.34 + 0.66 * f;   // outputs wait as ghosts, so the stack is never an empty box
        const key = op.toFixed(3);
        if (lastOp.get(c.li) !== key) { lastOp.set(c.li, key); c.li.style.opacity = op.toFixed(3); c.li.style.visibility = 'visible'; }
        return;
      }
      if (f <= 0.002) { setOp(c.li, 0, ''); return; }
      proj(n.x + CARD_DX, n.y, n.z, o2);
      setOp(c.li, f, `translate3d(${colX.toFixed(1)}px,${(o2.y + (1 - f) * 28).toFixed(1)}px,0) translate(0,-50%)`);
    });
  }

  /* ----- render */
  function renderFrame() {
    if (!W || !H) return;
    if (useComposer) {
      scene.background = null;
      camera.layers.set(1);
      bloomComposer.render();
      scene.background = bgTex;
      camera.layers.enableAll();
      baseComposer.render();
    } else {
      camera.layers.enableAll();
      renderer.render(scene, camera);
    }
  }

  function degrade() {
    if (!useComposer) return;
    useComposer = false;
    if (bloomComposer) { bloomComposer.dispose(); baseComposer.dispose(); bloomComposer = baseComposer = null; }
    if (edgesGlow) { scene.remove(edgesGlow); edgesGlow = null; }
    ensureHalos();
    dpr = Math.min(dpr, 1.5);
    W = 0; resize();
    root.classList.add(P + 'lowq');
  }

  /* ----- driver */
  let extP = null;
  let target = o.startP || 0;
  let playing = false, playT = 0, started = false, immediate = true;
  let onScreen = true, raf = 0, last = 0, frames = 0, frameSum = 0, disposed = false;
  const useAuto = () => extP == null && (mode !== 'pinned' || !sceneEl);
  if (mode === 'static') target = 1;
  st.ps = target;
  if (o.startP != null && o.startP >= 1) started = true;

  function scrollP() {
    const r = sceneEl.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
  }
  function startTimeline() { playing = true; playT = 0; started = true; setBtn(true); btn.setAttribute('aria-label', 'Replay the animation'); kick(); }

  function shouldRun() { return !disposed && onScreen && !document.hidden && (mode !== 'static' || playing); }
  function tick(now) {
    let dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    st.time += dt;
    if (extP != null) { st.ps = extP; }
    else if (useAuto()) {
      if (playing) { playT += dt; target = clamp(playT / TIMELINE_SECONDS, 0, 1); if (target >= 1) playing = false; }
      st.ps = target;
    } else {
      target = scrollP();
      st.ps = immediate ? target : damp(st.ps, target, 8, dt);
    }
    immediate = false;
    update(st.ps, dt);
    renderFrame();
    if (!root.classList.contains('is-ready')) root.classList.add('is-ready');
    frames++;
    if (!lockQuality && useComposer && frames > 3 && frames <= 28) { frameSum += dt; if (frames === 28 && frameSum / 25 > 0.024) degrade(); }
  }
  function loop(now) { raf = 0; if (!shouldRun()) return; tick(now); raf = requestAnimationFrame(loop); }
  function kick() { if (!raf && shouldRun()) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function renderOnce() { if (disposed) return; if (extP != null) st.ps = extP; last = performance.now(); const keep = st.time; tick(last); st.time = keep; }

  /* ----- events + observers */
  const ro = new ResizeObserver(() => { resize(); if (!raf) renderOnce(); });
  ro.observe(stage);
  const io = new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; if (onScreen) kick(); }, { rootMargin: '60% 0px' });
  io.observe(root);
  let io2 = null;
  if (mode === 'auto' || (mode === 'pinned' && !sceneEl)) {
    io2 = new IntersectionObserver((es) => { if (es[es.length - 1].isIntersecting && !started) startTimeline(); }, { threshold: 0.5 });
    io2.observe(stage);
  }
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  const onMove = (e) => { mx = (e.clientX / window.innerWidth - 0.5) * 2; my = -(e.clientY / window.innerHeight - 0.5) * 2; };
  if (mode === 'pinned' && !coarse) window.addEventListener('pointermove', onMove, { passive: true });
  btn.addEventListener('click', () => { extP = null; if (mode === 'pinned' && !useAuto()) return; startTimeline(); });
  const onLost = (e) => { e.preventDefault(); if (o.onFail) o.onFail(); };
  canvas.addEventListener('webglcontextlost', onLost);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!disposed) measureSizes(); });

  resize();
  renderOnce();
  kick();

  return {
    compact,
    mode,
    getP: () => st.ps,
    setProgress(p, imm) { extP = clamp(p, 0, 1); if (imm) { st.ps = extP; } if (!raf) renderOnce(); },
    setTheme(t) { applyTheme(t); if (!raf) renderOnce(); },
    play() { startTimeline(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); if (io2) io2.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('webglcontextlost', onLost);
      scene.traverse((ob) => { if (ob.geometry) ob.geometry.dispose(); if (ob.material) { (Array.isArray(ob.material) ? ob.material : [ob.material]).forEach((m) => m.dispose()); } });
      disposables.forEach((d) => d.dispose && d.dispose());
      nodeMesh.dispose(); haloMesh.dispose();
      if (bloomComposer) { bloomComposer.dispose(); baseComposer.dispose(); }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      root.remove();
      restorePos();
    },
  };
}

/* ---------------------------------------------------------------- public API */
export function mount(container, opts = {}) {
  try {
    return mountInner(container, opts);
  } catch (err) {
    console.warn('[hero] mount failed, nothing rendered.', err);
    return { dispose() {}, setTheme() {}, setProgress() {}, getProgress() { return 1; }, play() {}, replay() {} };
  }
}

function mountInner(container, opts) {
  const cfg = {
    theme: opts.theme === 'dark' ? 'dark' : 'light',
    reduced: !!opts.reducedMotion,
    quality: opts.quality === 'high' || opts.quality === 'low' ? opts.quality : 'auto',
  };
  let inst = null, fb = null, dead = false, extP = null;
  const coarse = () => matchMedia('(pointer:coarse)').matches || matchMedia('(hover:none)').matches;
  const wantCompact = () => coarse() || (container.clientWidth || window.innerWidth) < 900;

  function showFallback() {
    if (inst) { try { inst.dispose(); } catch (e) { /* ignore */ } inst = null; }
    if (!fb) fb = buildFallback(container, cfg.theme);
  }
  function build(startP) {
    try {
      inst = createInstance(container, { ...cfg, compact: wantCompact(), startP, onFail: showFallback });
      if (extP != null) inst.setProgress(extP, true);
    } catch (err) {
      console.warn('[hero] WebGL scene unavailable, showing static fallback.', err);
      container.querySelectorAll(':scope > .' + P + 'root').forEach((n) => n.remove());
      showFallback();
    }
  }
  build(0);

  const ro = new ResizeObserver(() => {
    if (dead || fb || !inst) return;
    if (wantCompact() !== inst.compact) { const p = inst.getP(); inst.dispose(); inst = null; build(p); }
  });
  ro.observe(container);
  const onTheme = (e) => { const t = (e && e.detail && e.detail.theme) || document.documentElement.getAttribute('data-theme'); if (t) api.setTheme(t); };
  window.addEventListener('themechange', onTheme);

  const api = {
    dispose() {
      dead = true; ro.disconnect();
      window.removeEventListener('themechange', onTheme);
      if (inst) inst.dispose();
      if (fb) fb.dispose();
      inst = fb = null;
    },
    setTheme(t) { cfg.theme = t === 'dark' ? 'dark' : 'light'; if (inst) inst.setTheme(cfg.theme); if (fb) fb.setTheme(cfg.theme); },
    setProgress(p, immediate) { extP = clamp(+p || 0, 0, 1); if (inst) inst.setProgress(extP, !!immediate); },
    getProgress() { return inst ? inst.getP() : 1; },
    play() { if (inst) inst.play(); },
    replay() { if (inst) inst.play(); },
  };
  return api;
}

export default mount;
