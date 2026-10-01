/*
 * show-soc.js
 * Interactive SOC showcase: an animated sealed-test plot (true SOC, fused model
 * estimate and a comparator over a drive cycle, Paris / US06 toggle, hover readout)
 * plus a small schematic of acoustic sensing fused into the LSTM.
 *
 * Contract: export function mount(container, opts) -> { dispose(), setTheme(t) }
 *   opts = { theme: 'light' | 'dark', reducedMotion: boolean, bare?: boolean }
 *
 * The curves are illustrative and shape-faithful. Headline errors are the
 * ten-seed means from the paper. Canvas 2D only, no dependencies.
 */

const P = 'socx';

/* ------------------------------------------------------------------ data */

const CYCLES = {
  paris: {
    id: 'paris',
    label: 'Paris',
    long: 'Paris electric-bus cycle',
    n: 720,
    hours: 45,
    xTicks: [0, 10, 20, 30, 40],
    mae: 0.57,
    base: 0.70,
    gain: '19%',
    seeds: '80% of seeds improved',
    compLabel: 'No-ultrasound model',
    compShort: 'No ultrasound',
    seed: 1207
  },
  us06: {
    id: 'us06',
    label: 'US06',
    long: 'US06 high-current cycle',
    n: 480,
    hours: 2,
    xTicks: [0, 0.5, 1, 1.5, 2],
    mae: 0.79,
    base: 1.36,
    gain: '42%',
    seeds: '100% of seeds improved · p = 0.002',
    compLabel: 'No-ultrasound model',
    compShort: 'No ultrasound',
    seed: 4406
  }
};

function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r) {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function arNoise(n, r, corr) {
  const out = new Array(n);
  const alpha = Math.exp(-1 / corr);
  const s = Math.sqrt(1 - alpha * alpha);
  let v = gauss(r);
  for (let i = 0; i < n; i++) {
    v = alpha * v + s * gauss(r);
    out[i] = v;
  }
  return out;
}

function meanAbs(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]);
  return s / a.length;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* Build one illustrative cycle. Load drives SOC down; the fused model tracks the
   truth with correlated jitter scaled to the headline error. */
function buildCycle(def) {
  const n = def.n;
  const r = rng(def.seed);
  const load = new Array(n).fill(0);

  if (def.id === 'paris') {
    /* driving blocks separated by rests (the carried-state rests in the paper) */
    const blocks = [
      [0.0, 0.17], [0.22, 0.40], [0.46, 0.66], [0.72, 0.88], [0.91, 1.0]
    ];
    const lp = arNoise(n, r, 40);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let inBlock = false;
      for (const b of blocks) if (t >= b[0] && t <= b[1]) inBlock = true;
      if (!inBlock) {
        load[i] = 0.015 * Math.abs(gauss(r));
        continue;
      }
      /* stop-start: low frequency envelope plus bus-like bursts and the odd regen dip */
      const env = 0.5 + 0.18 * lp[i];
      const burst = 0.5 + 0.5 * Math.sin(i * 0.55 + 3 * Math.sin(i * 0.09));
      let v = env * (0.35 + 0.85 * burst) + 0.1 * gauss(r);
      if (r() < 0.07) v = -0.16 - 0.1 * r();
      load[i] = clamp(v, -0.3, 1.15);
    }
  } else {
    /* US06: aggressive accelerations, short stops, quiet head and tail */
    let i = Math.floor(n * 0.025);
    const tail = Math.floor(n * 0.03);
    while (i < n - tail) {
      const len = Math.floor(n * (0.03 + 0.06 * r()));
      const level = 0.55 + 0.45 * r();
      const ramp = Math.max(2, Math.floor(len * 0.22));
      for (let k = 0; k < len && i + k < n - tail; k++) {
        const e = Math.min(1, k / ramp, (len - k) / ramp);
        load[i + k] = level * e + 0.09 * gauss(r);
      }
      i += len;
      const stop = Math.floor(n * (0.004 + 0.01 * r()));
      for (let k = 0; k < stop && i + k < n - tail; k++) {
        load[i + k] = k < 3 ? -0.22 + 0.04 * gauss(r) : 0.02 * Math.abs(gauss(r));
      }
      i += stop;
    }
    for (let k = 0; k < n; k++) load[k] = clamp(load[k], -0.35, 1.25);
  }

  /* integrate to a true SOC trace that starts full and ends in the low-SOC endgame */
  const draw = new Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    draw[i] = load[i] > 0 ? load[i] : load[i] * 0.45;
    total += draw[i];
  }
  const startSOC = 100;
  const endSOC = def.id === 'paris' ? 8 : 9;
  const k = (startSOC - endSOC) / total;
  const truth = new Array(n);
  let s = startSOC;
  for (let i = 0; i < n; i++) {
    s -= draw[i] * k;
    truth[i] = clamp(s, 0, 100);
  }

  /* load envelope for error modulation */
  const env = new Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    let c = 0;
    for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) {
      a += Math.max(0, load[j]);
      c++;
    }
    env[i] = a / c;
  }

  /* fused model estimate: correlated jitter, scaled so the mean error is the headline */
  const e1 = arNoise(n, rng(def.seed + 11), Math.max(8, n * 0.02));
  const e1f = arNoise(n, rng(def.seed + 12), 2);
  const err1 = new Array(n);
  for (let i = 0; i < n; i++) err1[i] = (e1[i] + 0.32 * e1f[i]) * (0.75 + 0.5 * env[i]);
  const sc1 = def.mae / meanAbs(err1);
  const model = new Array(n);
  for (let i = 0; i < n; i++) model[i] = clamp(truth[i] + err1[i] * sc1, 0, 100);

  const comp = new Array(n);
  /* comparator: the electrical-only model (voltage, current and temperature), same fusion pipeline without ultrasound */
  const e2 = arNoise(n, rng(def.seed + 21), Math.max(10, n * 0.03));
  const e2f = arNoise(n, rng(def.seed + 22), 2);
  const err2 = new Array(n);
  for (let i = 0; i < n; i++) err2[i] = (e2[i] + 0.25 * e2f[i]) * (0.55 + 1.0 * env[i]);
  const sc2 = def.base / meanAbs(err2);
  for (let i = 0; i < n; i++) comp[i] = clamp(truth[i] + err2[i] * sc2, 0, 100);

  /* normalised load strip */
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, load[i]);
  const strip = load.map(function (v) { return Math.max(0, v) / mx; });

  return { def: def, n: n, truth: truth, model: model, comp: comp, strip: strip };
}

/* ------------------------------------------------------------------ css */

const CSS = `
.${P}{--${P}-card:#FBFAF5;--${P}-paper:#F5F3E8;--${P}-well:#E6E3D1;--${P}-raised:#FFFFFF;
--${P}-ink:#0E1B2E;--${P}-ink2:#26344A;--${P}-muted:#5B6577;--${P}-faint:#7A8497;
--${P}-accent:#1E48E0;--${P}-accent-t:#1E48E0;--${P}-accent-wash:rgba(30,72,224,.07);--${P}-accent-ring:rgba(30,72,224,.32);
--${P}-rose:#D4506E;--${P}-rose-t:#B23A58;--${P}-rose-wash:rgba(212,80,110,.12);
--${P}-line:rgba(14,27,46,.10);--${P}-line2:rgba(14,27,46,.18);--${P}-grid:rgba(14,27,46,.07);
--${P}-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 4px 8px rgba(14,27,46,.04),0 44px 90px -36px rgba(14,27,46,.40);
--${P}-shadow-sm:inset 0 1px 0 rgba(255,255,255,.75),0 1px 2px rgba(14,27,46,.06),0 8px 20px -12px rgba(14,27,46,.18);
--${P}-shadow-md:inset 0 1px 0 rgba(255,255,255,.8),0 2px 4px rgba(14,27,46,.04),0 18px 40px -20px rgba(14,27,46,.28);
--${P}-font:var(--font-sans,"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);
--${P}-display:var(--font-display,"Instrument Serif","Iowan Old Style","Times New Roman",serif);
--${P}-mono:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);
--${P}-ease:cubic-bezier(.16,1,.3,1);--${P}-spring:cubic-bezier(.34,1.56,.64,1);
}
.${P}[data-${P}-theme="dark"]{--${P}-card:#121B30;--${P}-paper:#0A1020;--${P}-well:#17223A;--${P}-raised:#18233D;
--${P}-ink:#EAEEF7;--${P}-ink2:#C8D1E3;--${P}-muted:#9AA6BD;--${P}-faint:#6C7891;
--${P}-accent:#3A62F0;--${P}-accent-t:#7F9CFF;--${P}-accent-wash:rgba(92,130,242,.12);--${P}-accent-ring:rgba(127,156,255,.42);
--${P}-rose:#F07A93;--${P}-rose-t:#F07A93;--${P}-rose-wash:rgba(240,122,147,.16);
--${P}-line:rgba(234,238,247,.10);--${P}-line2:rgba(234,238,247,.18);--${P}-grid:rgba(234,238,247,.07);
--${P}-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 4px 8px rgba(0,0,0,.3),0 48px 96px -36px rgba(0,0,0,.8);
--${P}-shadow-sm:inset 0 1px 0 rgba(255,255,255,.05),0 1px 2px rgba(0,0,0,.4),0 10px 24px -14px rgba(0,0,0,.6);
--${P}-shadow-md:inset 0 1px 0 rgba(255,255,255,.06),0 2px 4px rgba(0,0,0,.3),0 22px 44px -22px rgba(0,0,0,.7);}
.${P},.${P} *{box-sizing:border-box}
.${P}{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;
font-family:var(--${P}-font);color:var(--${P}-ink);font-size:15px;line-height:1.45;
background:var(--${P}-card);border:1px solid var(--${P}-line);border-radius:28px;box-shadow:var(--${P}-shadow);
overflow:hidden;isolation:isolate;-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss03";
transition:background-color .3s,border-color .3s,color .3s}
.${P}--bare{background:transparent;border:0;box-shadow:none;border-radius:0}
.${P}::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
background:radial-gradient(var(--${P}-grid) 1px,transparent 1.2px) 0 0/24px 24px;
-webkit-mask-image:radial-gradient(120% 90% at 50% 30%,#000 25%,transparent 78%);mask-image:radial-gradient(120% 90% at 50% 30%,#000 25%,transparent 78%)}
.${P}__bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:14px 18px 0}
.${P}__title{font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--${P}-muted);font-variant-numeric:tabular-nums}
.${P}__ctrl{display:flex;align-items:center;gap:10px}
.${P}__seg{position:relative;display:inline-grid;grid-auto-flow:column;gap:2px;padding:3px;border-radius:999px;background:var(--${P}-well);border:1px solid var(--${P}-line)}
.${P}__seg button{position:relative;z-index:1;min-height:34px;min-width:64px;padding:0 16px;border:0;border-radius:999px;background:transparent;
font:500 13px/1 var(--${P}-font);color:var(--${P}-muted);cursor:pointer;transition:color .18s}
.${P}__seg button[aria-checked="true"]{color:var(--${P}-ink)}
.${P}__seg button:hover{color:var(--${P}-ink)}
.${P}__thumb{position:absolute;z-index:0;top:3px;bottom:3px;left:0;border-radius:999px;background:var(--${P}-raised);box-shadow:var(--${P}-shadow-sm);
transition:transform .3s var(--${P}-spring),width .3s var(--${P}-spring)}
.${P}__replay{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 14px 0 11px;border-radius:999px;border:1px solid var(--${P}-line);
background:var(--${P}-card);color:var(--${P}-ink2);font:500 13px/1 var(--${P}-font);cursor:pointer;transition:border-color .18s,background-color .18s}
.${P}__replay:hover{border-color:var(--${P}-line2);background:var(--${P}-raised)}
.${P}__replay svg{width:14px;height:14px;transition:transform .5s var(--${P}-ease)}
.${P}__replay:hover svg{transform:rotate(-200deg)}
.${P}__stats{display:grid;grid-template-columns:auto 1fr auto;align-items:end;gap:6px 28px;padding:12px 18px 4px}
.${P}__stat{display:flex;flex-direction:column;gap:4px;min-width:0}
.${P}__big{display:inline-flex;align-items:baseline;gap:2px;font-family:var(--${P}-display);font-size:clamp(40px,4.6vw,56px);line-height:.9;letter-spacing:-.025em;font-variant-numeric:lining-nums tabular-nums;color:var(--${P}-accent-t)}
.${P}__big small{font:400 .5em/1 var(--${P}-display);color:var(--${P}-accent-t)}
.${P}__mid{font-family:var(--${P}-display);font-size:clamp(26px,2.8vw,34px);line-height:1;letter-spacing:-.015em;color:var(--${P}-ink2);font-variant-numeric:lining-nums tabular-nums}
.${P}__cap{font-size:12px;line-height:1.35;color:var(--${P}-muted);letter-spacing:.01em}
.${P}__chip{display:inline-flex;align-self:flex-start;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--${P}-accent);color:#fff;
font:500 13px/1 var(--${P}-font);box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 10px 22px -10px rgba(30,72,224,.55);font-variant-numeric:tabular-nums}
.${P}__legend{display:flex;flex-wrap:wrap;gap:6px 8px;padding:10px 18px 0}
.${P}__lg{display:inline-flex;align-items:center;gap:8px;min-height:30px;padding:0 12px 0 10px;border-radius:999px;border:1px solid var(--${P}-line);background:transparent;
font:500 12.5px/1 var(--${P}-font);color:var(--${P}-ink2);cursor:pointer;transition:opacity .2s,border-color .18s,background-color .18s}
.${P}__lg:hover{border-color:var(--${P}-line2);background:var(--${P}-raised)}
.${P}__lg[aria-pressed="false"]{opacity:.42}
.${P}__sw{width:22px;height:0;border-top:2px solid currentColor;flex:none}
.${P}__sw--true{color:var(--${P}-ink)}
.${P}__sw--model{color:var(--${P}-accent);border-top-width:3px}
.${P}__sw--comp{color:var(--${P}-rose);border-top-style:dashed}
.${P}__lg em{font:400 12px/1 var(--${P}-mono);font-style:normal;color:var(--${P}-ink);font-variant-numeric:tabular-nums;min-width:5.2ch;text-align:right}
.${P}__tag{position:absolute;top:48px;right:18px;z-index:1;pointer-events:none;display:inline-flex;align-items:center;gap:8px;padding:5px 9px;border-radius:8px;background:var(--${P}-card);border:1px solid var(--${P}-line);font:400 12px/1 var(--${P}-mono);font-variant-numeric:tabular-nums;color:var(--${P}-muted)}
.${P}__tag b{font-weight:400;color:var(--${P}-ink)}
.${P}__tag em{font-style:normal;color:var(--${P}-accent-t)}
.${P}__plot{position:relative;flex:1 1 auto;height:clamp(250px,30vw,340px);min-height:210px;margin:6px 6px 0}
.${P}__canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:crosshair;border-radius:14px;outline:none}
.${P}__canvas:focus-visible{box-shadow:0 0 0 2px var(--${P}-card),0 0 0 4px var(--${P}-accent)}
.${P}__seal{position:absolute;display:inline-flex;align-items:center;gap:8px;padding:7px 12px 7px 10px;border-radius:12px;pointer-events:none;
background:var(--${P}-card);border:1px solid var(--${P}-line);box-shadow:var(--${P}-shadow-sm);font-size:12px;line-height:1.25;color:var(--${P}-ink2);max-width:62%}
.${P}__seal svg{width:14px;height:14px;flex:none;color:var(--${P}-accent-t)}
.${P}__seal b{font-weight:600;color:var(--${P}-ink)}
.${P}__foot{padding:8px 20px 12px;font:400 11.5px/1.5 var(--${P}-mono);color:var(--${P}-muted);letter-spacing:.005em}
.${P}__sch{margin:2px 14px 0;padding:14px 8px 0;border-top:1px solid var(--${P}-line)}
.${P}__sch-in{display:flex;justify-content:center}
.${P}__sch svg{display:block;width:100%;height:auto;max-width:640px;overflow:visible}
.${P}__sch figcaption{padding:6px 8px 4px;font:400 11.5px/1.5 var(--${P}-mono);color:var(--${P}-muted);letter-spacing:.005em}
.${P}__sch{margin-bottom:12px}
.${P}__sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.${P} .s-chip{fill:var(--${P}-raised);stroke:var(--${P}-line2);stroke-width:1}
.${P} .s-chip--ac{fill:var(--${P}-accent-wash);stroke:var(--${P}-accent-ring)}
.${P} .s-t{font:500 12px var(--${P}-font);fill:var(--${P}-ink2)}
.${P} .s-t--ac{fill:var(--${P}-accent-t)}
.${P} .s-sub{font:400 10.5px var(--${P}-font);fill:var(--${P}-muted)}
.${P} .s-big{font:600 15px var(--${P}-font);fill:var(--${P}-ink);letter-spacing:-.01em}
.${P} .s-lstm{fill:var(--${P}-accent-wash);stroke:var(--${P}-accent);stroke-width:1.4}
.${P} .s-cell{fill:var(--${P}-well);stroke:var(--${P}-line2);stroke-width:1}
.${P} .s-plate{fill:var(--${P}-accent)}
.${P} .s-wire{fill:none;stroke:var(--${P}-line2);stroke-width:1.2}
.${P} .s-wire--ac{stroke:var(--${P}-accent-ring)}
.${P} .s-flow{fill:none;stroke:var(--${P}-faint);stroke-width:2;stroke-linecap:round;stroke-dasharray:1 10;animation:${P}-flow 1.4s linear infinite}
.${P} .s-flow--ac{stroke:var(--${P}-accent)}
.${P} .s-base{fill:none;stroke:var(--${P}-rose);stroke-width:1.3;stroke-dasharray:5 5;opacity:.85}
.${P} .s-baselab{fill:var(--${P}-card);stroke:var(--${P}-rose);stroke-width:1;stroke-dasharray:3 3;opacity:.9}
.${P} .s-baset{font:500 11px var(--${P}-font);fill:var(--${P}-rose-t)}
.${P} .s-wave{fill:none;stroke:var(--${P}-accent);stroke-width:1.5;stroke-linecap:round;stroke-dasharray:4 5;animation:${P}-flow 1.1s linear infinite}
.${P} .s-gate{fill:var(--${P}-accent)}
.${P} .s-rail{stroke:var(--${P}-accent-ring);stroke-width:1.6}
.${P} .s-out{fill:var(--${P}-accent);stroke:none}
.${P} .s-outt{font:600 14px var(--${P}-font);fill:#fff}
.${P} .s-outs{font:400 10.5px var(--${P}-font);fill:rgba(255,255,255,.82)}
@keyframes ${P}-flow{to{stroke-dashoffset:-22}}
.${P}--paused .s-flow,.${P}--paused .s-wave{animation-play-state:paused}
.${P}--still .s-flow,.${P}--still .s-wave{animation:none}
.${P}__fb{padding:28px 24px;display:grid;gap:10px;align-content:center;height:100%}
.${P}.${P}--narrow{border-radius:22px}
.${P}.${P}--narrow .${P}__bar{padding:12px 14px 0}
.${P}.${P}--narrow .${P}__stats{grid-template-columns:auto 1fr;gap:10px 18px;padding:14px 14px 4px}
.${P}.${P}--narrow .${P}__stats .${P}__stat:nth-child(3){grid-column:1 / -1;flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap}
.${P}.${P}--narrow .${P}__legend{padding:8px 14px 0;gap:6px}
.${P}.${P}--narrow .${P}__lg{padding:0 10px 0 9px;gap:6px;font-size:12px}
.${P}.${P}--narrow .${P}__lg em{min-width:4.8ch;font-size:11.5px}
.${P}.${P}--narrow .${P}__sw{width:16px}
.${P}.${P}--narrow .${P}__plot{height:clamp(240px,62vw,300px);margin:6px 2px 0}
.${P}.${P}--narrow .${P}__seal{max-width:78%;padding:6px 10px 6px 8px;font-size:11px}
.${P}.${P}--narrow .${P}__sch{margin:2px 10px 0}

@media (pointer:coarse){
.${P}__seg button,.${P}__replay{min-height:44px}
.${P}__lg{min-height:40px}
}
@media (prefers-reduced-motion:reduce){
.${P} .s-flow,.${P} .s-wave{animation:none}
.${P}__thumb{transition:none}
}
`;

/* ------------------------------------------------------------- schematic */

function schematicSVG(vertical) {
  const flowH = [
    'M290 16C325 16 325 66 360 66',
    'M290 46C325 46 325 74 360 74',
    'M290 76C325 76 325 82 360 82',
    'M290 106C325 106 325 90 360 90',
    'M290 136C325 136 325 98 360 98'
  ];
  if (!vertical) {
    return (
      '<svg viewBox="0 0 640 150" role="img" aria-label="Schematic: voltage, current and temperature join ultrasound time of flight and cell swelling inside an LSTM that outputs state of charge.">' +
      /* cell with through-transmission transducers */
      '<g transform="translate(6,56)">' +
      '<rect class="s-cell" x="12" y="0" width="60" height="88" rx="10"/>' +
      '<path d="M12 22H72M12 44H72M12 66H72" stroke="var(--' + P + '-line2)" stroke-width="1" fill="none"/>' +
      '<rect class="s-plate" x="2" y="24" width="8" height="40" rx="3"/>' +
      '<rect class="s-plate" x="74" y="24" width="8" height="40" rx="3"/>' +
      '<path class="s-wave" d="M16 44q4-12 9 0t9 0t9 0t9 0t9 0"/>' +
      '<text class="s-sub" x="42" y="106" text-anchor="middle">Cell and transducers</text>' +
      '</g>' +
      /* wires from cell to ultrasound chips */
      '<path class="s-wire s-wire--ac" d="M92 100C120 100 120 106 150 106"/>' +
      '<path class="s-wire s-wire--ac" d="M92 100C120 100 120 136 150 136"/>' +
      /* flows */
      flowH.map(function (d, i) { return '<path class="s-wire' + (i > 2 ? ' s-wire--ac' : '') + '" d="' + d + '"/><path class="s-flow' + (i > 2 ? ' s-flow--ac' : '') + '" d="' + d + '"/>'; }).join('') +
      /* chips */
      chipH(150, 4, 'Voltage', false) + chipH(150, 34, 'Current', false) + chipH(150, 64, 'Temperature', false) +
      chipH(150, 94, 'Ultrasound ToF', true) + chipH(150, 124, 'Cell swelling', true) +
      /* LSTM */
      '<rect class="s-lstm" x="360" y="32" width="138" height="100" rx="18"/>' +
      '<text class="s-big" x="429" y="68" text-anchor="middle">LSTM</text>' +
      '<text class="s-sub" x="429" y="86" text-anchor="middle">memory across the cycle</text>' +
      '<path class="s-rail" d="M394 110H464"/>' +
      '<circle class="s-gate" cx="400" cy="110" r="5"/><circle class="s-gate" cx="429" cy="110" r="5"/><circle class="s-gate" cx="458" cy="110" r="5"/>' +
      /* output */
      '<path class="s-wire s-wire--ac" d="M498 82H546"/><path class="s-flow s-flow--ac" d="M498 82H546"/>' +
      '<path d="M542 77l7 5-7 5" fill="none" stroke="var(--' + P + '-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect class="s-out" x="552" y="58" width="84" height="48" rx="14"/>' +
      '<text class="s-outt" x="594" y="79" text-anchor="middle">SOC</text><text class="s-outs" x="594" y="95" text-anchor="middle">estimate</text>' +
      '</svg>'
    );
  }
  /* vertical (narrow) */
  const v = [
    ['M126 19C160 19 110 86 112 120', 0],
    ['M126 53C160 53 130 86 132 120', 0],
    ['M126 87C160 87 150 86 152 120', 0],
    ['M214 19C180 19 230 86 228 120', 1],
    ['M214 53C180 53 210 86 208 120', 1]
  ];
  return (
    '<svg viewBox="0 0 340 290" role="img" aria-label="Schematic: voltage, current and temperature join ultrasound time of flight and cell swelling inside an LSTM that outputs state of charge.">' +
    v.map(function (p) { return '<path class="s-wire' + (p[1] ? ' s-wire--ac' : '') + '" d="' + p[0] + '"/><path class="s-flow' + (p[1] ? ' s-flow--ac' : '') + '" d="' + p[0] + '"/>'; }).join('') +
    chipV(6, 6, 'Voltage', false) + chipV(6, 40, 'Current', false) + chipV(6, 74, 'Temperature', false) +
    chipV(214, 6, 'Ultrasound ToF', true) + chipV(214, 40, 'Cell swelling', true) +
    '<g transform="translate(0,-20)">' +
    '<rect class="s-lstm" x="60" y="140" width="220" height="82" rx="18"/>' +
    '<text class="s-big" x="170" y="172" text-anchor="middle">LSTM</text>' +
    '<text class="s-sub" x="170" y="189" text-anchor="middle">memory across the cycle</text>' +
    '<path class="s-rail" d="M135 205H205"/>' +
    '<circle class="s-gate" cx="141" cy="205" r="4.5"/><circle class="s-gate" cx="170" cy="205" r="4.5"/><circle class="s-gate" cx="199" cy="205" r="4.5"/>' +
    '<path class="s-wire s-wire--ac" d="M170 222V252"/><path class="s-flow s-flow--ac" d="M170 222V252"/>' +
    '<path d="M165 247l5 7 5-7" fill="none" stroke="var(--' + P + '-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect class="s-out" x="112" y="256" width="116" height="48" rx="14"/>' +
    '<text class="s-outt" x="170" y="277" text-anchor="middle">SOC</text><text class="s-outs" x="170" y="293" text-anchor="middle">estimate</text>' +
    '</g></svg>'
  );
}

function chipH(x, y, label, ac) {
  return '<rect class="s-chip' + (ac ? ' s-chip--ac' : '') + '" x="' + x + '" y="' + y + '" width="140" height="24" rx="12"/>' +
    '<text class="s-t' + (ac ? ' s-t--ac' : '') + '" x="' + (x + 70) + '" y="' + (y + 16) + '" text-anchor="middle">' + label + '</text>';
}

function chipV(x, y, label, ac) {
  return '<rect class="s-chip' + (ac ? ' s-chip--ac' : '') + '" x="' + x + '" y="' + y + '" width="120" height="26" rx="13"/>' +
    '<text class="s-t' + (ac ? ' s-t--ac' : '') + '" x="' + (x + 60) + '" y="' + (y + 17) + '" text-anchor="middle">' + label + '</text>';
}

/* ----------------------------------------------------------------- mount */

const LOCK =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
const REPLAY =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1"/><path d="M2.5 2.5v3h3"/></svg>';

function fallback(container, opts, theme) {
  const dark = theme === 'dark';
  const root = document.createElement('div');
  root.className = P + ' ' + P + '--still';
  root.setAttribute('data-' + P + '-theme', dark ? 'dark' : 'light');
  root.innerHTML =
    '<style>' + CSS + '</style>' +
    '<div class="' + P + '__fb">' +
    '<span class="' + P + '__title">fig.3 · sealed blind test</span>' +
    '<div class="' + P + '__big">0.57<small>%</small></div>' +
    '<p class="' + P + '__cap" style="font-size:14px;max-width:46ch">Mean absolute error of state of charge on a blind real-world Paris electric-bus cycle, ten-seed mean. On US06 the same fusion cuts error by 42%, from 1.36% to 0.79%.</p>' +
    '</div>';
  try { container.appendChild(root); } catch (e) { /* container unusable */ }
  return {
    dispose: function () { try { root.remove(); } catch (e) { /* noop */ } },
    setTheme: function (t) { root.setAttribute('data-' + P + '-theme', t === 'dark' ? 'dark' : 'light'); }
  };
}

export function mount(container, opts) {
  opts = opts || {};
  let theme = opts.theme === 'dark' ? 'dark' : 'light';
  try {
    return mountInner(container, opts, theme);
  } catch (err) {
    return fallback(container, opts, theme);
  }
}

function mountInner(container, opts, theme0) {
  let theme = theme0;
  const reduced = !!opts.reducedMotion;

  /* --- dom --- */
  const root = document.createElement('section');
  root.className = P + (opts.bare ? ' ' + P + '--bare' : '') + (reduced ? ' ' + P + '--still' : '');
  root.setAttribute('data-' + P + '-theme', theme);
  root.setAttribute('aria-label', 'Battery state-of-charge showcase');
  root.innerHTML =
    '<style>' + CSS + '</style>' +
    '<div class="' + P + '__bar">' +
    '<span class="' + P + '__title">fig.3 · sealed test, illustrative</span>' +
    '<div class="' + P + '__ctrl">' +
    '<div class="' + P + '__seg" role="radiogroup" aria-label="Blind test cycle">' +
    '<span class="' + P + '__thumb" aria-hidden="true"></span>' +
    '<button type="button" role="radio" aria-checked="true" data-cycle="paris" aria-label="Paris electric-bus cycle">Paris</button>' +
    '<button type="button" role="radio" aria-checked="false" data-cycle="us06" aria-label="US06 high-current cycle">US06</button>' +
    '</div>' +
    '<button type="button" class="' + P + '__replay" aria-label="Replay the drive cycle">' + REPLAY + 'Replay</button>' +
    '</div></div>' +
    '<div class="' + P + '__stats">' +
    '<div class="' + P + '__stat"><span class="' + P + '__big"><span data-num>0.57</span><small>%</small></span><span class="' + P + '__cap" data-cap1>blind-test error, ten-seed mean</span></div>' +
    '<div class="' + P + '__stat"><span class="' + P + '__mid" data-mid>0.70%</span><span class="' + P + '__cap">with voltage, current and temperature only</span></div>' +
    '<div class="' + P + '__stat"><span class="' + P + '__chip" data-gain>19% less error</span><span class="' + P + '__cap" data-seeds>80% of seeds improved</span></div>' +
    '</div>' +
    '<div class="' + P + '__legend" role="group" aria-label="Series">' +
    '<button type="button" class="' + P + '__lg" data-s="truth" aria-pressed="true"><i class="' + P + '__sw ' + P + '__sw--true"></i>True SOC<em data-rv="truth">100.0%</em></button>' +
    '<button type="button" class="' + P + '__lg" data-s="model" aria-pressed="true"><i class="' + P + '__sw ' + P + '__sw--model"></i>Fused model<em data-rv="model">100.0%</em></button>' +
    '<button type="button" class="' + P + '__lg" data-s="comp" aria-pressed="true"><i class="' + P + '__sw ' + P + '__sw--comp"></i><span data-complab>No-ultrasound model</span><em data-rv="comp">100.0%</em></button>' +
        '</div>' +
    '<div class="' + P + '__plot">' +
    '<canvas class="' + P + '__canvas" tabindex="0" role="img" aria-label="Illustrative blind-test plot of state of charge against time. Use left and right arrow keys to read values."></canvas>' +
    '<span class="' + P + '__tag" aria-hidden="true"><b data-rt>0.0h</b></span>' +
    '<div class="' + P + '__seal" title="The test cycle is held out of training, validation and model selection alike">' + LOCK + '<span><b>Sealed test cycle</b></span></div>' +
    '</div>' +
    '<figure class="' + P + '__sch" style="margin-left:14px;margin-right:14px"><div class="' + P + '__sch-in" data-sch></div>' +
    '<figcaption>fig.4 · ultrasound time of flight and cell swelling join voltage, current and temperature inside the LSTM.</figcaption></figure>' +
    '<p class="' + P + '__sr" aria-live="polite" data-sr></p>';

  container.appendChild(root);

  const $ = function (sel) { return root.querySelector(sel); };
  const canvas = $('.' + P + '__canvas');
  const plot = $('.' + P + '__plot');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const seg = $('.' + P + '__seg');
  const thumb = $('.' + P + '__thumb');
  const segBtns = Array.prototype.slice.call(seg.querySelectorAll('button'));
  const seal = $('.' + P + '__seal');
  const tagEl = $('.' + P + '__tag');
  const sch = $('[data-sch]');
  const srEl = $('[data-sr]');
  const elNum = $('[data-num]');

  /* --- state --- */
  const data = { paris: buildCycle(CYCLES.paris), us06: buildCycle(CYCLES.us06) };
  let cyc = 'paris';
  let front = 0; // 0..1 draw front
  let playing = false;
  let playStart = 0;
  let playDur = 7000;
  let hover = null; // fractional index
  let visible = false;
  let started = false;
  let disposed = false;
  let raf = 0;
  let size = { w: 0, h: 0, dpr: 1 };
  let colors = readColors();
  let statShown = 0.57;
  let statFrom = 0.57;
  let statTo = 0.57;
  let statT0 = 0;
  const show = { truth: true, model: true, comp: true };
  let vertical = null;
  let lastX = 0;

  function readColors() {
    const cs = getComputedStyle(root);
    const g = function (n) { return cs.getPropertyValue('--' + P + '-' + n).trim(); };
    return {
      card: g('card'), well: g('well'), raised: g('raised'), ink: g('ink'), ink2: g('ink2'),
      muted: g('muted'), faint: g('faint'), accent: g('accent'), accentT: g('accent-t'),
      rose: g('rose'), roseT: g('rose-t'), roseWash: g('rose-wash'), line: g('line'), line2: g('line2'), grid: g('grid'),
      mono: g('mono') || 'ui-monospace, Menlo, monospace', font: g('font') || 'system-ui, sans-serif'
    };
  }

  /* --- layout --- */
  function geom() {
    const w = size.w;
    const h = size.h;
    const small = w < 520;
    const padL = small ? 36 : 48;
    const padR = small ? 10 : 18;
    const padT = small ? 36 : 40;
    const axisH = 22;
    const stripH = small ? 34 : 46;
    const gap = 10;
    const plotY1 = h - axisH - stripH - gap;
    return {
      w: w, h: h, small: small, x0: padL, x1: w - padR, y0: padT, y1: plotY1,
      sy0: plotY1 + gap, sy1: h - axisH, axisY: h - 6
    };
  }

  function placeOverlays() {
    const g = geom();
    /* the pill sits above the plot (top-left, outside the data), the readout sits inside it (top-right) */
    seal.style.left = g.x0 + 'px';
    seal.style.top = '4px';
    if (tagEl) { tagEl.style.top = g.y0 + 8 + 'px'; tagEl.style.right = size.w - g.x1 + 8 + 'px'; }
  }

  function resize() {
    if (disposed) return;
    const w = Math.max(1, Math.round(plot.clientWidth));
    const h = Math.max(1, Math.round(plot.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== size.w || h !== size.h || dpr !== size.dpr) {
      size = { w: w, h: h, dpr: dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    placeOverlays();
    const wantV = root.clientWidth < 600;
    root.classList.toggle(P + '--narrow', wantV);
    if (wantV !== vertical) {
      vertical = wantV;
      sch.innerHTML = schematicSVG(vertical);
    }
    placeThumb();
    requestDraw();
  }

  function placeThumb() {
    const b = segBtns.find(function (x) { return x.getAttribute('data-cycle') === cyc; });
    if (!b || !b.offsetWidth) return;
    thumb.style.width = b.offsetWidth + 'px';
    thumb.style.transform = 'translateX(' + b.offsetLeft + 'px)';
  }

  /* --- drawing --- */
  function xOf(g, i, n) { return g.x0 + (i / (n - 1)) * (g.x1 - g.x0); }
  function yOf(g, v) { return g.y1 - (v / 100) * (g.y1 - g.y0); }

  function pathTo(g, arr, n, fi, ctx2) {
    const last = Math.floor(fi);
    ctx2.beginPath();
    for (let i = 0; i <= last; i++) {
      const x = xOf(g, i, n);
      const y = yOf(g, arr[i]);
      if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
    }
    if (last < n - 1) {
      const f = fi - last;
      const v = arr[last] + (arr[last + 1] - arr[last]) * f;
      ctx2.lineTo(xOf(g, fi, n), yOf(g, v));
    }
  }

  function draw() {
    if (disposed || !size.w) return;
    const c = colors;
    const g = geom();
    const d = data[cyc];
    const n = d.n;
    const fi = clamp(front, 0, 1) * (n - 1);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    /* grid and y labels */
    ctx.font = '11px ' + c.mono;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const yTicks = g.small ? [0, 50, 100] : [0, 25, 50, 75, 100];
    for (let k = 0; k < yTicks.length; k++) {
      const y = Math.round(yOf(g, yTicks[k])) + 0.5;
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash(yTicks[k] === 0 ? [] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(g.x0, y);
      ctx.lineTo(g.x1, y);
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.fillText(yTicks[k] + '%', g.x0 - 8, y);
    }
    ctx.setLineDash([]);

    /* x ticks */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const ticks = d.def.xTicks;
    for (let k = 0; k < ticks.length; k++) {
      const x = g.x0 + (ticks[k] / d.def.hours) * (g.x1 - g.x0);
      ctx.strokeStyle = c.line2;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, g.sy1);
      ctx.lineTo(Math.round(x) + 0.5, g.sy1 + 4);
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.textAlign = k === 0 ? 'left' : 'center';
      ctx.fillText(ticks[k] + 'h', k === 0 ? x - 1 : x, g.axisY);
    }

    /* load strip */
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('load', g.x0 - 8, (g.sy0 + g.sy1) / 2);
    ctx.strokeStyle = c.line;
    ctx.beginPath();
    ctx.moveTo(g.x0, g.sy1 + 0.5);
    ctx.lineTo(g.x1, g.sy1 + 0.5);
    ctx.stroke();
    {
      const sh = g.sy1 - g.sy0;
      const last = Math.floor(fi);
      ctx.beginPath();
      ctx.moveTo(xOf(g, 0, n), g.sy1);
      for (let i = 0; i <= last; i++) ctx.lineTo(xOf(g, i, n), g.sy1 - d.strip[i] * sh);
      ctx.lineTo(xOf(g, last, n), g.sy1);
      ctx.closePath();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = c.faint;
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = c.faint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= last; i++) {
        const x = xOf(g, i, n);
        const y = g.sy1 - d.strip[i] * sh;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* drift wash between truth and comparator */
    if (show.comp && show.truth && cyc === 'paris') {
      const last = Math.floor(fi);
      ctx.beginPath();
      for (let i = 0; i <= last; i++) {
        const x = xOf(g, i, n);
        if (i === 0) ctx.moveTo(x, yOf(g, d.truth[i])); else ctx.lineTo(x, yOf(g, d.truth[i]));
      }
      for (let i = last; i >= 0; i--) ctx.lineTo(xOf(g, i, n), yOf(g, d.comp[i]));
      ctx.closePath();
      ctx.fillStyle = c.roseWash;
      ctx.fill();
    }

    /* series */
    if (show.comp) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = c.rose;
      ctx.lineWidth = 1.7;
      pathTo(g, d.comp, n, fi, ctx);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (show.model) {
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 8;
      pathTo(g, d.model, n, fi, ctx);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.6;
      pathTo(g, d.model, n, fi, ctx);
      ctx.stroke();
    }
    if (show.truth) {
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.2;
      pathTo(g, d.truth, n, fi, ctx);
      ctx.stroke();
    }

    /* playhead / hover cursor */
    const idx = hover !== null ? Math.min(hover, fi) : fi;
    const live = hover !== null || (playing && front < 1);
    if (live) {
      const x = Math.round(xOf(g, idx, n)) + 0.5;
      ctx.strokeStyle = hover !== null ? c.line2 : c.accent;
      ctx.globalAlpha = hover !== null ? 1 : 0.5;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, g.y0 - 4);
      ctx.lineTo(x, g.sy1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const i0 = Math.floor(idx);
      const i1 = Math.min(n - 1, i0 + 1);
      const f = idx - i0;
      const dot = function (arr, col, r, ring) {
        const v = arr[i0] + (arr[i1] - arr[i0]) * f;
        const y = yOf(g, v);
        if (ring) {
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.arc(x, y, r + 5 + (playing ? 2 * Math.sin(performance.now() / 180) : 0), 0, 6.2832);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = c.card;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
      };
      if (hover !== null) {
        if (show.comp) dot(d.comp, c.rose, 3.2, false);
        if (show.truth) dot(d.truth, c.ink, 3.2, false);
      }
      if (show.model) dot(d.model, c.accent, 4.6, true);
    }
  }

  function requestDraw() {
    if (disposed) return;
    if (loopOn) return; // the loop draws every frame
    cancelAnimationFrame(rafOnce);
    rafOnce = requestAnimationFrame(function () { safe(function () { updateReadout(); draw(); }); });
  }
  let rafOnce = 0;
  let loopOn = false;

  /* --- readout and stats --- */
  const rv = {
    truth: $('[data-rv="truth"]'), model: $('[data-rv="model"]'), comp: $('[data-rv="comp"]')
  };
  const rt = $('[data-rt]');

  function updateReadout() {
    const d = data[cyc];
    const n = d.n;
    const fi = clamp(front, 0, 1) * (n - 1);
    const idx = hover !== null ? Math.min(hover, fi) : fi;
    const i = Math.round(idx);
    rt.textContent = (i / (n - 1) * d.def.hours).toFixed(d.def.hours > 10 ? 1 : 2) + 'h';
    rv.truth.textContent = d.truth[i].toFixed(1) + '%';
    rv.model.textContent = d.model[i].toFixed(1) + '%';
    rv.comp.textContent = d.comp[i].toFixed(1) + '%';
  }

  function updateStats(now) {
    const t = clamp((now - statT0) / 700, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    statShown = statFrom + (statTo - statFrom) * e;
    elNum.textContent = statShown.toFixed(2);
    return t < 1;
  }

  function setCycleCopy() {
    const def = CYCLES[cyc];
    $('[data-mid]').textContent = def.base.toFixed(2) + '%';
    $('[data-gain]').textContent = def.gain + ' less error';
    $('[data-seeds]').textContent = def.seeds;
    $('[data-complab]').textContent = def.compLabel;
    srEl.textContent = def.long + ': the fused model reaches a blind-test mean absolute error of ' + def.mae.toFixed(2) +
      '% against ' + def.base.toFixed(2) + '% with voltage, current and temperature only, ' + def.gain + ' less error. ' +
      def.seeds + '.';
    canvas.setAttribute('aria-label', 'Illustrative blind-test plot for the ' + def.long + '. True SOC, fused model estimate and ' +
      def.compLabel.toLowerCase() + '. Use left and right arrow keys to read values.');
  }

  /* --- animation loop --- */
  function safe(fn) {
    try { fn(); } catch (e) {
      if (!disposed) {
        disposed = true;
        teardownListeners();
        try { root.remove(); } catch (er) { /* noop */ }
        fallback(container, opts, theme);
      }
    }
  }

  function startPlay(dur) {
    playDur = dur || 7000;
    if (reduced) { front = 1; playing = false; requestDraw(); return; }
    front = 0;
    playing = true;
    playStart = performance.now();
    kick();
  }

  function kick() {
    if (loopOn || disposed || !visible || document.hidden) return;
    loopOn = true;
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    safe(function () {
      if (disposed) return;
      if (!visible || document.hidden) { loopOn = false; return; }
      let busy = false;
      if (playing) {
        const t = clamp((now - playStart) / playDur, 0, 1);
        front = 0.04 * (1 - Math.cos(Math.PI * t)) / 2 + 0.96 * t; // near-linear: it plays in real time
        if (t >= 1) { playing = false; front = 1; } else busy = true;
      }
      if (updateStats(now)) busy = true;
      updateReadout();
      draw();
      if (busy) raf = requestAnimationFrame(frame); else loopOn = false;
    });
  }

  function setCycle(id, instant) {
    if (id === cyc && !instant) return;
    cyc = id;
    segBtns.forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-cycle') === id ? 'true' : 'false'); });
    placeThumb();
    setCycleCopy();
    statFrom = statShown;
    statTo = CYCLES[id].mae;
    statT0 = performance.now();
    hover = null;
    if (reduced) { statShown = statTo; elNum.textContent = statTo.toFixed(2); }
    startPlay(id === 'paris' ? 7000 : 5200);
    if (reduced) { updateReadout(); }
  }

  /* --- events --- */
  const listeners = [];
  function on(el, ev, fn, o) { el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); }
  function teardownListeners() {
    listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    listeners.length = 0;
    try { ro.disconnect(); } catch (e) { /* noop */ }
    try { io.disconnect(); } catch (e) { /* noop */ }
    cancelAnimationFrame(raf);
    cancelAnimationFrame(rafOnce);
  }

  segBtns.forEach(function (b) {
    on(b, 'click', function () { setCycle(b.getAttribute('data-cycle')); });
    on(b, 'keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = cyc === 'paris' ? 'us06' : 'paris';
        setCycle(next);
        segBtns.find(function (x) { return x.getAttribute('data-cycle') === next; }).focus();
      }
    });
  });
  on($('.' + P + '__replay'), 'click', function () { startPlay(cyc === 'paris' ? 7000 : 5200); });
  Array.prototype.forEach.call(root.querySelectorAll('.' + P + '__lg'), function (b) {
    on(b, 'click', function () {
      const k = b.getAttribute('data-s');
      show[k] = !show[k];
      b.setAttribute('aria-pressed', show[k] ? 'true' : 'false');
      requestDraw();
    });
  });

  function setHoverFromX(clientX) {
    const r = canvas.getBoundingClientRect();
    const g = geom();
    const d = data[cyc];
    const px = clientX - r.left;
    lastX = px;
    const f = clamp((px - g.x0) / (g.x1 - g.x0), 0, 1);
    hover = f * (d.n - 1);
    requestDraw();
  }
  on(canvas, 'pointermove', function (e) { setHoverFromX(e.clientX); });
  on(canvas, 'pointerdown', function (e) { setHoverFromX(e.clientX); });
  on(canvas, 'pointerleave', function (e) { if (e.pointerType === 'mouse') { hover = null; requestDraw(); } });
  on(canvas, 'blur', function () { hover = null; requestDraw(); });
  on(canvas, 'keydown', function (e) {
    const d = data[cyc];
    const step = d.n / 60;
    const fi = clamp(front, 0, 1) * (d.n - 1);
    let cur = hover === null ? fi : hover;
    if (e.key === 'ArrowRight') cur += step;
    else if (e.key === 'ArrowLeft') cur -= step;
    else if (e.key === 'Home') cur = 0;
    else if (e.key === 'End') cur = fi;
    else if (e.key === 'Escape') { hover = null; requestDraw(); return; }
    else return;
    e.preventDefault();
    hover = clamp(cur, 0, fi);
    requestDraw();
  });

  const ro = new ResizeObserver(function () { safe(resize); });
  ro.observe(root);
  ro.observe(plot);

  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      visible = en.isIntersecting;
      root.classList.toggle(P + '--paused', !visible);
      if (visible) {
        if (!started) {
          started = true;
          startPlay(7000);
        } else {
          kick();
          requestDraw();
        }
      }
    });
  }, { threshold: 0.12 });
  io.observe(root);

  on(document, 'visibilitychange', function () { if (!document.hidden) { kick(); requestDraw(); } });

  /* --- init --- */
  setCycleCopy();
  if (reduced) {
    front = 1;
    statShown = statTo = CYCLES.paris.mae;
    elNum.textContent = statShown.toFixed(2);
  }
  safe(resize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (!disposed) safe(resize); });
  }
  updateReadout();

  return {
    dispose: function () {
      if (disposed) return;
      disposed = true;
      teardownListeners();
      try { root.remove(); } catch (e) { /* noop */ }
    },
    setTheme: function (t) {
      theme = t === 'dark' ? 'dark' : 'light';
      root.setAttribute('data-' + P + '-theme', theme);
      colors = readColors();
      safe(function () { updateReadout(); draw(); });
    }
  };
}
