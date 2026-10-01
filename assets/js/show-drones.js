/* show-drones.js
 * Team Bath Drones aerofoil explorer: Clark-Y vs NACA 0015.
 * Contract: export function mount(container, opts) -> { dispose(), setTheme(t) }
 * opts = { theme: 'light' | 'dark', reducedMotion: boolean }
 *
 * Geometry: NACA 0015 from the standard 4-digit thickness equation (t = 0.15);
 * Clark-Y from the published coordinate table (61 stations per surface).
 * Flow: a 2D vortex-panel potential-flow solution with a Kutta condition drives
 * the streamlines. Lift and drag readouts are thin-aerofoil / empirical
 * approximations, labelled illustrative. This is not CFD.
 */

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/* Clark-Y ordinates (UIUC airfoil coordinates database, 'clarky', chord-normalised) */
const CY_X=[0,0.0005,0.001,0.002,0.004,0.008,0.012,0.02,0.03,0.04,0.05,0.06,0.08,0.1,0.12,0.14,0.16,0.18,0.2,0.22,0.24,0.26,0.28,0.3,0.32,0.34,0.36,0.38,0.4,0.42,0.44,0.46,0.48,0.5,0.52,0.54,0.56,0.58,0.6,0.62,0.64,0.66,0.68,0.7,0.72,0.74,0.76,0.78,0.8,0.82,0.84,0.86,0.88,0.9,0.92,0.94,0.96,0.97,0.98,0.99,1];
const CY_U=[0,0.00234,0.00373,0.0058,0.00892,0.01374,0.01786,0.02537,0.03302,0.03913,0.04428,0.04876,0.05643,0.063,0.06862,0.07344,0.07757,0.08107,0.08392,0.08614,0.08783,0.08908,0.09,0.09068,0.09119,0.09151,0.09163,0.09152,0.09117,0.09057,0.08972,0.08864,0.08736,0.08588,0.08421,0.08237,0.08035,0.07815,0.07576,0.07321,0.07048,0.0676,0.06458,0.06143,0.05816,0.05477,0.05126,0.04763,0.04388,0.04002,0.03605,0.03197,0.02779,0.0235,0.01912,0.01462,0.01002,0.00769,0.00533,0.00297,0.0006];
const CY_L=[0,-0.00467,-0.00594,-0.00781,-0.01051,-0.01429,-0.01697,-0.02027,-0.02261,-0.02452,-0.02605,-0.02713,-0.02846,-0.02938,-0.02996,-0.03024,-0.03025,-0.03005,-0.02967,-0.02914,-0.02852,-0.02782,-0.02707,-0.02631,-0.02556,-0.02482,-0.02409,-0.02336,-0.02263,-0.0219,-0.02117,-0.02044,-0.0197,-0.01896,-0.01823,-0.01749,-0.01676,-0.01602,-0.01529,-0.01456,-0.01382,-0.01309,-0.01235,-0.01162,-0.01088,-0.01015,-0.00941,-0.00868,-0.00794,-0.00721,-0.00648,-0.00574,-0.00501,-0.00427,-0.00354,-0.0028,-0.00207,-0.0017,-0.00133,-0.00097,-0.0006];

const M = 64;                      // stations per surface (cosine spaced)
const XS = new Float64Array(M + 1);
for (let i = 0; i <= M; i++) XS[i] = 0.5 * (1 - Math.cos((Math.PI * i) / M));

/** NACA 4-digit half-thickness (closed trailing edge coefficient) */
export function nacaHalfThickness(x, t) {
  return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
}

/** Linear interpolation in sqrt(x), which resolves the rounded leading edge */
function tableAt(ys, x) {
  const s = Math.sqrt(Math.max(0, Math.min(1, x)));
  let lo = 0, hi = CY_X.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (Math.sqrt(CY_X[mid]) <= s) lo = mid; else hi = mid;
  }
  const s0 = Math.sqrt(CY_X[lo]), s1 = Math.sqrt(CY_X[hi]);
  const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
  return ys[lo] + (ys[hi] - ys[lo]) * f;
}

const NACA_U = new Float64Array(M + 1), NACA_L = new Float64Array(M + 1);
const CLARK_U = new Float64Array(M + 1), CLARK_L = new Float64Array(M + 1);
for (let i = 0; i <= M; i++) {
  const x = XS[i];
  const t = nacaHalfThickness(x, 0.15);
  NACA_U[i] = t; NACA_L[i] = -t;
  CLARK_U[i] = tableAt(CY_U, x); CLARK_L[i] = tableAt(CY_L, x);
}
// close the trailing edge exactly
NACA_U[M] = NACA_L[M] = CLARK_U[M] = CLARK_L[M] = 0;

/** Build the closed point loop for a morph value m (0 = NACA 0015, 1 = Clark-Y) */
export function buildProfile(m, out) {
  const yu = out.yu, yl = out.yl;
  for (let i = 0; i <= M; i++) {
    yu[i] = NACA_U[i] + (CLARK_U[i] - NACA_U[i]) * m;
    yl[i] = NACA_L[i] + (CLARK_L[i] - NACA_L[i]) * m;
  }
  // loop: lower surface TE -> LE, then upper surface LE -> TE (clockwise)
  let k = 0;
  for (let i = M; i >= 0; i--) { out.px[k] = XS[i]; out.py[k] = yl[i]; k++; }
  for (let i = 1; i <= M; i++) { out.px[k] = XS[i]; out.py[k] = yu[i]; k++; }
  return out;
}

/* ------------------------------------------------------------------ */
/* Vortex-panel solver (constant strength panels, Kutta condition)      */
/* ------------------------------------------------------------------ */

const NP = 2 * M; // panel count
const TWO_PI = Math.PI * 2;

export function makePanels() {
  return {
    x1: new Float64Array(NP), y1: new Float64Array(NP),
    tx: new Float64Array(NP), ty: new Float64Array(NP),
    len: new Float64Array(NP), g: new Float64Array(NP),
    mx: new Float64Array(NP), my: new Float64Array(NP),
    A: new Float64Array(NP * NP), b: new Float64Array(NP),
    gamma: 0
  };
}

export function solvePanels(prof, alpha, P) {
  const px = prof.px, py = prof.py;
  for (let j = 0; j < NP; j++) {
    const ax = px[j], ay = py[j], bx = px[j + 1], by = py[j + 1];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9;
    P.x1[j] = ax; P.y1[j] = ay; P.len[j] = l;
    P.tx[j] = dx / l; P.ty[j] = dy / l;
    P.mx[j] = (ax + bx) / 2; P.my[j] = (ay + by) / 2;
  }
  const ux = Math.cos(alpha), uy = Math.sin(alpha);
  const A = P.A, b = P.b;
  for (let i = 0; i < NP; i++) {
    const nxi = -P.ty[i], nyi = P.tx[i];
    const mx = P.mx[i], my = P.my[i];
    for (let j = 0; j < NP; j++) {
      if (i === j) { A[i * NP + j] = 0; continue; }
      const tx = P.tx[j], ty = P.ty[j], l = P.len[j];
      const dx = mx - P.x1[j], dy = my - P.y1[j];
      const lx = dx * tx + dy * ty, ly = -dx * ty + dy * tx;
      const th1 = Math.atan2(ly, lx), th2 = Math.atan2(ly, lx - l);
      const r1 = lx * lx + ly * ly, r2 = (lx - l) * (lx - l) + ly * ly;
      const ul = (th1 - th2) / TWO_PI;
      const vl = Math.log((r1 + 1e-18) / (r2 + 1e-18)) / (2 * TWO_PI);
      // local axes: t (along panel) and n = (-ty, tx)
      const vx = ul * tx - vl * ty, vy = ul * ty + vl * tx;
      A[i * NP + j] = vx * nxi + vy * nyi;
    }
    b[i] = -(ux * nxi + uy * nyi);
  }
  // Kutta condition replaces the last boundary equation
  const last = (NP - 1) * NP;
  for (let j = 0; j < NP; j++) A[last + j] = 0;
  A[last + 0] = 1; A[last + NP - 1] = 1; b[NP - 1] = 0;

  // Gaussian elimination with partial pivoting
  for (let c = 0; c < NP; c++) {
    let piv = c, best = Math.abs(A[c * NP + c]);
    for (let r = c + 1; r < NP; r++) { const v = Math.abs(A[r * NP + c]); if (v > best) { best = v; piv = r; } }
    if (piv !== c) {
      for (let k = c; k < NP; k++) { const t = A[c * NP + k]; A[c * NP + k] = A[piv * NP + k]; A[piv * NP + k] = t; }
      const t = b[c]; b[c] = b[piv]; b[piv] = t;
    }
    const d = A[c * NP + c] || 1e-12;
    for (let r = c + 1; r < NP; r++) {
      const f = A[r * NP + c] / d;
      if (f === 0) continue;
      for (let k = c; k < NP; k++) A[r * NP + k] -= f * A[c * NP + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = NP - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < NP; k++) s -= A[r * NP + k] * P.g[k];
    P.g[r] = s / (A[r * NP + r] || 1e-12);
  }
  let G = 0;
  for (let j = 0; j < NP; j++) G += P.g[j] * P.len[j];
  P.gamma = G;
  P.alpha = alpha;
  P.ux = ux; P.uy = uy;
  return P;
}

/** Potential-flow lift coefficient from the circulation (clockwise circulation is negative here) */
export function panelCl(P) { return -2 * P.gamma; }

const _vel = { u: 0, v: 0 };
/** Velocity at a body-frame point (freestream speed = 1) */
export function velocityAt(P, x, y, out) {
  let u = P.ux, v = P.uy;
  for (let j = 0; j < NP; j++) {
    const tx = P.tx[j], ty = P.ty[j], l = P.len[j], g = P.g[j];
    const dx = x - P.x1[j], dy = y - P.y1[j];
    const lx = dx * tx + dy * ty, ly = -dx * ty + dy * tx;
    const th1 = Math.atan2(ly, lx), th2 = Math.atan2(ly, lx - l);
    const r1 = lx * lx + ly * ly, r2 = (lx - l) * (lx - l) + ly * ly;
    const ul = g * (th1 - th2) / TWO_PI;
    const vl = g * Math.log((r1 + 1e-12) / (r2 + 1e-12)) / (2 * TWO_PI);
    u += ul * tx - vl * ty;
    v += ul * ty + vl * tx;
  }
  out.u = u; out.v = v;
  return out;
}

/* ------------------------------------------------------------------ */
/* Illustrative aerodynamic model (thin-aerofoil slope + empirical)     */
/* ------------------------------------------------------------------ */

const DEG = Math.PI / 180;
const REF_ALPHA = 4;                 // reference angle the trade-study gain is anchored to
const TARGET_GAIN = 1.30;            // +30% lift-to-drag (trade study)
const AERO = {
  naca:  { a0: 0,    slope: 0.105, clmax: 1.25, stall: 12, cd0: 0.0105, k: 0.0125 },
  clark: { a0: -3.2, slope: 0.105, clmax: 1.55, stall: 13, cd0: 0.0,    k: 0.0050 }
};
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function calibrate() {
  // choose the Clark-Y zero-lift drag so the L/D ratio at the reference angle equals the trade-study gain
  AERO.clark.cd0 = 0;
  const n = aeroModel('naca', REF_ALPHA), c = aeroModel('clark', REF_ALPHA);
  const cdWanted = c.cl / (n.ld * TARGET_GAIN);
  AERO.clark.cd0 = Math.max(0.003, cdWanted - c.cd);
}

export function aeroModel(kind, alphaDeg) {
  const p = AERO[kind];
  const lin = p.slope * (alphaDeg - p.a0);
  let cl = p.clmax * Math.tanh(lin / p.clmax);
  const s = smoothstep(p.stall, p.stall + 4.5, alphaDeg);
  cl *= 1 - 0.32 * s;
  const cd = p.cd0 + p.k * cl * cl + 0.16 * s * s + 0.02 * s;
  return { cl, cd, ld: cl / cd, sep: s };
}
calibrate();

/* ------------------------------------------------------------------ */
/* Themes                                                              */
/* ------------------------------------------------------------------ */

const THEMES = {
  light: {
    vars: {
      '--tbd-bg': '#FBFAF5', '--tbd-bg2': '#EFEDE0', '--tbd-bg3': '#E6E3D1', '--tbd-raised': '#FFFFFF',
      '--tbd-ink': '#0E1B2E', '--tbd-ink2': '#26344A', '--tbd-muted': '#5B6577',
      '--tbd-accent': '#1E48E0', '--tbd-accent-text': '#1E48E0', '--tbd-on-accent': '#FFFFFF',
      '--tbd-wash': 'rgba(30,72,224,.07)', '--tbd-ring': 'rgba(30,72,224,.32)',
      '--tbd-line': 'rgba(14,27,46,.10)', '--tbd-line2': 'rgba(14,27,46,.18)',
      '--tbd-shadow': 'inset 0 1px 0 rgba(255,255,255,.8), 0 2px 4px rgba(14,27,46,.04), 0 18px 40px -20px rgba(14,27,46,.28)',
      '--tbd-stage': 'linear-gradient(180deg,#FDFCF8 0%,#F7F5EA 100%)', '--tbd-glass': 'rgba(251,250,245,.72)'
    },
    canvas: {
      ink: '14,27,46', cobalt: [[92, 130, 242], [30, 72, 224], [16, 42, 140]],
      dot: 'rgba(14,27,46,.075)', fill: 'rgba(30,72,224,.10)', stroke: 'rgba(14,27,46,.92)',
      ghost: 'rgba(14,27,46,.30)', chord: 'rgba(14,27,46,.28)', arrow: '#1E48E0', glow: 'rgba(30,72,224,.18)'
    }
  },
  dark: {
    vars: {
      '--tbd-bg': '#121B30', '--tbd-bg2': '#0E1628', '--tbd-bg3': '#17223A', '--tbd-raised': '#18233D',
      '--tbd-ink': '#EAEEF7', '--tbd-ink2': '#C8D1E3', '--tbd-muted': '#9AA6BD',
      '--tbd-accent': '#3A62F0', '--tbd-accent-text': '#7F9CFF', '--tbd-on-accent': '#FFFFFF',
      '--tbd-wash': 'rgba(92,130,242,.12)', '--tbd-ring': 'rgba(127,156,255,.42)',
      '--tbd-line': 'rgba(234,238,247,.10)', '--tbd-line2': 'rgba(234,238,247,.18)',
      '--tbd-shadow': 'inset 0 1px 0 rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.3), 0 22px 44px -22px rgba(0,0,0,.7)',
      '--tbd-stage': 'linear-gradient(180deg,#141E36 0%,#0F172B 100%)', '--tbd-glass': 'rgba(18,27,48,.66)'
    },
    canvas: {
      ink: '234,238,247', cobalt: [[110,140,246], [127, 156, 255], [190, 207, 255]],
      dot: 'rgba(234,238,247,.07)', fill: 'rgba(127,156,255,.14)', stroke: 'rgba(234,238,247,.92)',
      ghost: 'rgba(234,238,247,.30)', chord: 'rgba(234,238,247,.26)', arrow: '#7F9CFF', glow: 'rgba(127,156,255,.22)'
    }
  }
};

/* ------------------------------------------------------------------ */
/* Styles (every selector scoped under .tbd-root)                       */
/* ------------------------------------------------------------------ */

const CSS = `
.tbd-root{position:relative;box-sizing:border-box;width:100%;color:var(--tbd-ink);font-family:var(--font-sans,Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;font-optical-sizing:auto}
.tbd-root *,.tbd-root *::before,.tbd-root *::after{box-sizing:border-box}
.tbd-grid{display:grid;gap:20px;grid-template-columns:minmax(0,1fr)}
.tbd-root[data-size="wide"] .tbd-grid{grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);align-items:stretch}
.tbd-card{background:var(--tbd-bg);border:1px solid var(--tbd-line);border-radius:28px;box-shadow:var(--tbd-shadow);overflow:hidden;transition:background-color .3s,border-color .3s}
.tbd-main{display:flex;flex-direction:column}
.tbd-top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px 18px 0}
.tbd-seg{display:inline-flex;padding:4px;border-radius:999px;background:var(--tbd-bg2);border:1px solid var(--tbd-line);gap:2px;position:relative}
.tbd-chip{appearance:none;border:0;background:transparent;color:var(--tbd-muted);font:inherit;font-weight:500;font-size:14px;letter-spacing:-.005em;min-height:40px;padding:0 18px;border-radius:999px;cursor:pointer;transition:color .18s,background-color .18s,box-shadow .18s;-webkit-tap-highlight-color:transparent}
.tbd-chip:hover{color:var(--tbd-ink)}
.tbd-chip[aria-pressed="true"]{background:var(--tbd-raised);color:var(--tbd-ink);box-shadow:0 1px 2px rgba(14,27,46,.10),0 4px 10px -4px rgba(14,27,46,.18)}
.tbd-chip:focus-visible,.tbd-auto:focus-visible,.tbd-slider:focus-visible{outline:2px solid var(--tbd-accent-text);outline-offset:2px}
.tbd-auto{appearance:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px 0 12px;border-radius:999px;border:1px solid var(--tbd-line2);background:transparent;color:var(--tbd-ink2);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background-color .18s,border-color .18s,color .18s}
.tbd-auto:hover{background:var(--tbd-wash);border-color:var(--tbd-ring)}
.tbd-auto svg{width:14px;height:14px;fill:currentColor}
.tbd-stage{position:relative;margin:14px 10px 0;border-radius:20px;overflow:hidden;background:var(--tbd-stage);border:1px solid var(--tbd-line);aspect-ratio:16/9;min-height:260px}
.tbd-root[data-size="narrow"] .tbd-stage{aspect-ratio:4/5;min-height:0}
.tbd-root[data-size="wide"] .tbd-stage{aspect-ratio:auto;flex:1 1 auto;min-height:360px}
.tbd-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:auto}
@media (pointer:coarse),(any-pointer:coarse){.tbd-canvas{touch-action:pan-y}}
.tbd-hud{position:absolute;pointer-events:none;padding:6px 10px;border-radius:10px;background:var(--tbd-glass);-webkit-backdrop-filter:blur(10px) saturate(1.5);backdrop-filter:blur(10px) saturate(1.5);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-variant-numeric:tabular-nums;color:var(--tbd-muted);font-weight:500}
.tbd-hud-tl{left:12px;top:12px;display:flex;flex-direction:column;gap:2px}
.tbd-hud-tl b{font-weight:600;color:var(--tbd-ink);font-size:13px;letter-spacing:.06em}
.tbd-hud-br{right:12px;bottom:10px;text-align:right;text-transform:none;letter-spacing:0;font-size:12px;max-width:62%}
.tbd-hud-bl{left:12px;bottom:10px;font-size:13px;color:var(--tbd-ink2);text-transform:none;letter-spacing:.02em}
.tbd-controls{display:flex;align-items:center;gap:16px;padding:8px 22px 20px}
.tbd-controls label{font-size:12px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--tbd-muted);white-space:nowrap}
.tbd-slider-wrap{flex:1;min-width:0;display:flex;align-items:center;height:44px}
.tbd-slider{--tbd-fill:50%;appearance:none;-webkit-appearance:none;width:100%;height:44px;margin:0;background:transparent;cursor:pointer;touch-action:pan-y}
.tbd-slider::-webkit-slider-runnable-track{height:4px;border-radius:999px;background:linear-gradient(90deg,var(--tbd-accent) 0,var(--tbd-accent) var(--tbd-fill),var(--tbd-bg3) var(--tbd-fill),var(--tbd-bg3) 100%)}
.tbd-slider::-moz-range-track{height:4px;border-radius:999px;background:var(--tbd-bg3)}
.tbd-slider::-moz-range-progress{height:4px;border-radius:999px;background:var(--tbd-accent)}
.tbd-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;margin-top:-10px;border-radius:50%;background:var(--tbd-raised);border:2px solid var(--tbd-accent);box-shadow:0 2px 8px -2px rgba(14,27,46,.35);transition:transform .18s}
.tbd-slider::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--tbd-raised);border:2px solid var(--tbd-accent);box-shadow:0 2px 8px -2px rgba(14,27,46,.35)}
.tbd-slider:active::-webkit-slider-thumb{transform:scale(1.12)}
.tbd-val{min-width:58px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:15px;color:var(--tbd-ink)}
.tbd-side{display:flex;flex-direction:column;gap:0;padding:26px 26px 24px}
.tbd-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--tbd-accent-text)}
.tbd-eyebrow::before{content:"";width:24px;height:1px;background:currentColor;opacity:.6}
.tbd-stat{padding:18px 0;border-bottom:1px solid var(--tbd-line)}
.tbd-stat:first-of-type{padding-top:14px}
.tbd-num{font-family:var(--font-display,"Instrument Serif","Iowan Old Style","Times New Roman",serif);font-weight:400;font-size:clamp(3rem,2.2rem + 2.8vw,4.5rem);line-height:.95;letter-spacing:-.025em;font-variant-numeric:lining-nums tabular-nums;color:var(--tbd-ink)}
.tbd-num em{font-style:italic;color:var(--tbd-accent-text)}
.tbd-cap{margin-top:8px;color:var(--tbd-muted);font-size:14px;max-width:34ch;text-wrap:pretty}
.tbd-live{padding-top:18px;display:flex;flex-direction:column;gap:14px}
.tbd-live-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.tbd-label{font-size:12px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--tbd-muted)}
.tbd-row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;font-size:13px}
.tbd-row span.n{font-weight:500;color:var(--tbd-ink2);min-width:84px}
.tbd-track{height:8px;border-radius:999px;background:var(--tbd-bg3);overflow:hidden}
.tbd-fill{height:100%;width:0;border-radius:999px;transition:width .12s linear}
.tbd-fill.a{background:var(--tbd-ink2);opacity:.55}
.tbd-fill.b{background:var(--tbd-accent)}
.tbd-row b{font-variant-numeric:tabular-nums;font-weight:600;min-width:46px;text-align:right;color:var(--tbd-ink)}
.tbd-gap{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--tbd-muted);padding:10px 14px;border-radius:12px;background:var(--tbd-wash);border:1px solid var(--tbd-line)}
.tbd-gap b{font-variant-numeric:tabular-nums;color:var(--tbd-accent-text);font-weight:600}
.tbd-note{margin-top:auto;padding-top:16px;color:var(--tbd-muted);font-size:12px;line-height:1.5;text-wrap:pretty}
.tbd-root[data-size="narrow"] .tbd-side{padding:22px 20px 20px}
.tbd-root[data-size="narrow"] .tbd-controls{padding:4px 14px 16px;gap:10px}
.tbd-root[data-size="narrow"] .tbd-controls label{display:none}
.tbd-root[data-size="narrow"] .tbd-top{padding:12px 12px 0}
.tbd-root[data-size="narrow"] .tbd-chip{padding:0 14px}
.tbd-root[data-size="narrow"] .tbd-hud-br{display:none}
.tbd-fb{padding:28px;border-radius:28px;background:var(--tbd-bg);border:1px solid var(--tbd-line);box-shadow:var(--tbd-shadow)}
.tbd-fb svg{display:block;width:100%;height:auto;margin:6px 0 14px}
.tbd-fb .tbd-fbstats{display:flex;gap:28px;flex-wrap:wrap}
.tbd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const MINUS = '−';
const fmt = (v, d = 1) => (v < 0 ? MINUS : '') + Math.abs(v).toFixed(d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function applyTheme(root, name) {
  const t = THEMES[name] || THEMES.light;
  root.setAttribute('data-tbd-theme', THEMES[name] ? name : 'light');
  for (const k in t.vars) root.style.setProperty(k, t.vars[k]);
  return t;
}

function staticProfilePath(kind, w, h, pad) {
  const up = [], lo = [];
  const sx = w - pad * 2, ox = pad, oy = h / 2;
  for (let i = 0; i <= M; i++) {
    const yu = kind === 'naca' ? NACA_U[i] : CLARK_U[i];
    const yl = kind === 'naca' ? NACA_L[i] : CLARK_L[i];
    up.push([ox + XS[i] * sx, oy - yu * sx]);
    lo.push([ox + XS[i] * sx, oy - yl * sx]);
  }
  const pts = up.concat(lo.reverse());
  return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
}

function mountFallback(container, themeName, reason) {
  try {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'tbd-root';
    const st = document.createElement('style'); st.textContent = CSS; root.appendChild(st);
    applyTheme(root, themeName);
    let svg = '';
    try {
      svg = '<svg viewBox="0 0 640 150" role="img" aria-label="Clark-Y and NACA 0015 aerofoil sections">' +
        '<path d="' + staticProfilePath('naca', 300, 150, 16) + '" fill="none" stroke="var(--tbd-line2)" stroke-width="1.5"/>' +
        '<g transform="translate(330 0)"><path d="' + staticProfilePath('clark', 300, 150, 16) + '" fill="var(--tbd-wash)" stroke="var(--tbd-accent)" stroke-width="1.8"/></g></svg>';
    } catch (e) { svg = ''; }
    const box = document.createElement('div');
    box.className = 'tbd-fb';
    box.innerHTML = '<span class="tbd-eyebrow">Aerofoil trade study</span>' + svg +
      '<div class="tbd-fbstats"><div><div class="tbd-num">30<em>%</em></div><div class="tbd-cap">lift-to-drag gain, Clark-Y over NACA 0015</div></div>' +
      '<div><div class="tbd-num">400<em>g</em></div><div class="tbd-cap">structural weight saving at the Critical Design Review</div></div></div>';
    root.appendChild(box);
    container.appendChild(root);
    return { dispose() { try { container.innerHTML = ''; } catch (e) { /* noop */ } }, setTheme(t) { try { applyTheme(root, t); } catch (e) { /* noop */ } } };
  } catch (e) {
    try { container.textContent = 'Clark-Y over NACA 0015: 30% lift-to-drag gain. 400g structural weight saving.'; } catch (e2) { /* noop */ }
    return { dispose() {}, setTheme() {} };
  }
}

/* ------------------------------------------------------------------ */
/* mount                                                                */
/* ------------------------------------------------------------------ */

export function mount(container, opts = {}) {
  try {
    return mountInner(container, opts);
  } catch (err) {
    try { console.warn('[show-drones] fallback:', err && err.message); } catch (e) { /* noop */ }
    return mountFallback(container, opts && opts.theme === 'dark' ? 'dark' : 'light');
  }
}

function mountInner(container, opts) {
  if (!container) throw new Error('no container');
  const reduced = !!opts.reducedMotion;
  let themeName = opts.theme === 'dark' ? 'dark' : 'light';
  let T = THEMES[themeName];

  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'tbd-root';
  root.setAttribute('data-size', 'wide');
  applyTheme(root, themeName);

  root.innerHTML = `
<style>${CSS}</style>
<div class="tbd-grid">
  <div class="tbd-card tbd-main">
    <div class="tbd-top">
      <div class="tbd-seg" role="group" aria-label="Aerofoil section">
        <button type="button" class="tbd-chip" data-k="naca" aria-pressed="false">NACA 0015</button>
        <button type="button" class="tbd-chip" data-k="clark" aria-pressed="true">Clark-Y</button>
      </div>
      <button type="button" class="tbd-auto" aria-pressed="false" aria-label="Sweep the angle of attack automatically"><svg viewBox="0 0 14 14" aria-hidden="true"><path class="tbd-ico" d="M3 1.5v11l9-5.5z"/></svg><span class="tbd-auto-t">Auto sweep</span></button>
    </div>
    <div class="tbd-stage">
      <canvas class="tbd-canvas" role="img" aria-label="Streamlines bending around the selected aerofoil section"></canvas>
      <div class="tbd-hud tbd-hud-tl"><b class="tbd-name">Clark-Y</b><span class="tbd-desc">Cambered, flat-bottomed, 11.7% thick</span></div>
      <div class="tbd-hud tbd-hud-bl"><span class="tbd-alpha-hud"></span></div>
      <div class="tbd-hud tbd-hud-br">Illustrative potential flow, not CFD</div>
    </div>
    <div class="tbd-controls">
      <label for="tbd-aoa-${Math.random().toString(36).slice(2, 7)}" class="tbd-aoa-label">Angle of attack</label>
      <div class="tbd-slider-wrap"><input class="tbd-slider" type="range" min="-4" max="16" step="0.1" value="4" aria-label="Angle of attack in degrees"></div>
      <span class="tbd-val" aria-hidden="true">4.0°</span>
    </div>
  </div>
  <aside class="tbd-card tbd-side" aria-label="Trade study results">
    <span class="tbd-eyebrow">Trade study result</span>
    <div class="tbd-stat">
      <div class="tbd-num"><span class="tbd-n1">30</span><em>%</em></div>
      <p class="tbd-cap">Lift-to-drag gain, Clark-Y over NACA 0015.</p>
    </div>
    <div class="tbd-stat">
      <div class="tbd-num"><span class="tbd-n2">400</span><em>g</em></div>
      <p class="tbd-cap">Structural weight saving, delivered at the Critical Design Review.</p>
    </div>
    <div class="tbd-live">
      <div class="tbd-gap"><span>Selected</span><b>Clark-Y · +30% lift-to-drag</b></div>
    </div>
    <p class="tbd-note">Streamlines come from a 2D vortex-panel potential-flow solver, an illustration of the flow field rather than CFD.</p>
  </aside>
</div>`;
  container.appendChild(root);

  const $ = s => root.querySelector(s);
  const stage = $('.tbd-stage'), canvas = $('.tbd-canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const chips = root.querySelectorAll('.tbd-chip');
  const slider = $('.tbd-slider'), valEl = $('.tbd-val');
  const autoBtn = $('.tbd-auto'), autoT = $('.tbd-auto-t'), autoIco = $('.tbd-ico');
  const nameEl = $('.tbd-name'), descEl = $('.tbd-desc'), alphaHud = $('.tbd-alpha-hud');
  const n1 = $('.tbd-n1'), n2 = $('.tbd-n2');

  /* ---------- state ---------- */
  const profile = { px: new Float64Array(NP + 1), py: new Float64Array(NP + 1), yu: new Float64Array(M + 1), yl: new Float64Array(M + 1) };
  const panels = makePanels();
  let alphaTarget = 4, alphaCur = 4;
  let morphTarget = 1, morphCur = 1, morphAnim = null;
  let autoOn = false, userTouched = false, autoT0 = 0;
  let running = false, visible = true, disposed = false, raf = 0, lastT = 0;
  let dirty = true;
  let W = 0, H = 0, dpr = 1;
  let viewW = 2.6, scale = 1, ox = 0, oy = 0, vLeft = -0.8, vRight = 1.8, vTop = 0.7, vBottom = -0.7;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // pivot for pitching (quarter chord)
  const PIV = 0.25;

  /* ---------- particles (lanes keep streamlines coherent) ---------- */
  let LANES = 0, PER = 0, K = 0;
  const TRAIL = 18, TRAIL_DT = 1 / 30;
  let lane, px, py, hx, hy, hAge, histHead, acc, spd;

  function initParticles() {
    const small = W < 520;
    LANES = small ? 19 : 33;
    PER = small ? 5 : 6;
    K = LANES * PER;
    lane = new Float32Array(K); px = new Float32Array(K); py = new Float32Array(K);
    hx = new Float32Array(K * TRAIL); hy = new Float32Array(K * TRAIL);
    histHead = new Uint8Array(K); acc = new Float32Array(K); spd = new Float32Array(K);
    const halfH = (vTop - vBottom) / 2 + 0.08;
    for (let l = 0; l < LANES; l++) {
      // symmetric lanes, denser near the body
      const idx = l - (LANES - 1) / 2;
      const f = idx / ((LANES - 1) / 2);
      const y = Math.sign(f) * Math.pow(Math.abs(f), 1.35) * halfH + 0.012;
      for (let p = 0; p < PER; p++) {
        const k = l * PER + p;
        lane[k] = y;
        px[k] = vLeft - 0.1 + ((p + Math.random() * 0.6) / PER) * (vRight - vLeft + 0.2);
        py[k] = y;
        histHead[k] = 0; acc[k] = Math.random() * TRAIL_DT; spd[k] = 1;
        for (let h = 0; h < TRAIL; h++) { hx[k * TRAIL + h] = px[k]; hy[k * TRAIL + h] = py[k]; }
      }
    }
  }

  function respawn(k) {
    px[k] = vLeft - 0.08 - Math.random() * 0.1; py[k] = lane[k];
    for (let h = 0; h < TRAIL; h++) { hx[k * TRAIL + h] = px[k]; hy[k * TRAIL + h] = py[k]; }
    histHead[k] = 0;
  }

  /* ---------- sizing ---------- */
  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const cw = Math.round(root.getBoundingClientRect().width);
    const size = cw >= 860 ? 'wide' : (cw >= 560 ? 'mid' : 'narrow');
    if (root.getAttribute('data-size') !== size) root.setAttribute('data-size', size);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === W && h === H && canvas.width === Math.round(w * dpr)) return;
    W = w; H = h;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    viewW = W < 520 ? 1.7 : 2.05;
    scale = W / viewW;
    vLeft = 0.5 - viewW * 0.46; vRight = vLeft + viewW;
    const viewH = H / scale; vTop = viewH / 2; vBottom = -viewH / 2;
    ox = -vLeft * scale; oy = H / 2;
    initParticles();
    dirty = true;
    prewarmPending = true;
    if (reduced) staticPending = true;
  }

  /* ---------- flow ---------- */
  function currentKind() { return morphCur >= 0.5 ? 'clark' : 'naca'; }

  function mixedAero(aDeg) {
    const a = aeroModel('naca', aDeg), b = aeroModel('clark', aDeg);
    const m = morphCur;
    return { cl: a.cl + (b.cl - a.cl) * m, sep: a.sep + (b.sep - a.sep) * m, a, b };
  }

  function recompute() {
    buildProfile(morphCur, profile);
    solvePanels(profile, alphaCur * DEG, panels);
    dirty = false;
  }

  // body-frame upper/lower surface at x for the inside test
  function surfaceAt(x) {
    // continuous station index for cosine spacing
    const f = (M * Math.acos(clamp(1 - 2 * x, -1, 1))) / Math.PI;
    const i = Math.min(M - 1, Math.floor(f)), t = f - i;
    return [profile.yl[i] + (profile.yl[i + 1] - profile.yl[i]) * t, profile.yu[i] + (profile.yu[i + 1] - profile.yu[i]) * t];
  }

  const ca = { c: 1, s: 0 };
  function stepVelocity(sx, sy, sepAmt, out) {
    // screen -> body
    const dx = sx - PIV, dy = sy;
    const bx = PIV + ca.c * dx - ca.s * dy, by = ca.s * dx + ca.c * dy;
    // inside test (body frame)
    if (bx > -0.002 && bx < 1.002) {
      const sf = surfaceAt(clamp(bx, 0, 1));
      if (by > sf[0] - 0.02 && by < sf[1] + 0.02) { out.inside = true; return out; }
    }
    out.inside = false;
    velocityAt(panels, bx, by, _vel);
    let u = _vel.u, v = _vel.v;
    if (sepAmt > 0.001 && bx > 0.3 && bx < 1.9 && by > 0) {
      const sfu = surfaceAt(clamp(bx, 0, 1))[1];
      const top = (bx <= 1 ? sfu : 0) + 0.04 + 0.26 * (bx - 0.25);
      if (by < top) {
        const k = sepAmt * smoothstep(0.3, 0.55, bx);
        u *= 1 - 0.72 * k;
        v += (Math.random() - 0.5) * 1.1 * k + 0.0;
        u += (Math.random() - 0.5) * 0.5 * k;
      }
    }
    out.u = ca.c * u + ca.s * v;       // body -> screen (rotate by -alpha)
    out.v = -ca.s * u + ca.c * v;
    out.speed = Math.hypot(u, v);
    return out;
  }
  const sv = { u: 0, v: 0, inside: false, speed: 1 };

  const U_SCREEN = 0.78; // chords per second

  function advance(dt) {
    const sep = mixedAero(alphaCur).sep;
    ca.c = Math.cos(alphaCur * DEG); ca.s = Math.sin(alphaCur * DEG);
    for (let k = 0; k < K; k++) {
      stepVelocity(px[k], py[k], sep, sv);
      if (sv.inside) { respawn(k); continue; }
      px[k] += sv.u * U_SCREEN * dt; py[k] += sv.v * U_SCREEN * dt;
      spd[k] = sv.speed;
      acc[k] += dt;
      if (acc[k] >= TRAIL_DT) {
        acc[k] -= TRAIL_DT;
        const hd = (histHead[k] + 1) % TRAIL;
        histHead[k] = hd; hx[k * TRAIL + hd] = px[k]; hy[k * TRAIL + hd] = py[k];
      }
      if (px[k] > vRight + 0.15 || py[k] > vTop + 0.4 || py[k] < vBottom - 0.4) respawn(k);
    }
  }

  /* ---------- drawing ---------- */
  const sxp = x => ox + x * scale, syp = y => oy - y * scale;

  function drawBackdrop() {
    ctx.clearRect(0, 0, W, H);
    // dot grid, anchored to world space so it feels like graph paper
    ctx.fillStyle = T.canvas.dot;
    const step = 0.1 * scale;
    const x0 = ox % step, y0 = oy % step;
    for (let x = x0; x < W; x += step) for (let y = y0; y < H; y += step) ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
  }

  function rotPt(x, y) { // body -> screen (rotate -alpha about the pivot)
    const dx = x - PIV;
    return [PIV + ca.c * dx + ca.s * y, -ca.s * dx + ca.c * y];
  }

  function profileScreenPath(prof, c) {
    ctx.beginPath();
    for (let i = 0; i <= NP; i++) {
      const p = rotPt(prof.px[i], prof.py[i]);
      const X = sxp(p[0]), Y = syp(p[1]);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath();
  }

  const ghost = { px: new Float64Array(NP + 1), py: new Float64Array(NP + 1), yu: new Float64Array(M + 1), yl: new Float64Array(M + 1) };

  function drawStreams() {
    const col = T.canvas.cobalt;
    // 3 speed bins x 3 age bins, batched into 9 paths
    const bins = [[], [], []];
    for (let s = 0; s < 3; s++) for (let a = 0; a < 3; a++) bins[s].push(new Path2D());
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < K; k++) {
      const sb = spd[k] < 0.97 ? 0 : (spd[k] < 1.18 ? 1 : 2);
      const hd = histHead[k];
      let prevX = px[k], prevY = py[k];
      for (let h = 1; h < TRAIL; h++) {
        const idx = ((hd - h + 1 + TRAIL * 2) % TRAIL);
        const x = hx[k * TRAIL + idx], y = hy[k * TRAIL + idx];
        if (x === prevX && y === prevY) { continue; }
        const ab = h < 6 ? 0 : (h < 12 ? 1 : 2);
        const path = bins[sb][ab];
        path.moveTo(sxp(prevX), syp(prevY)); path.lineTo(sxp(x), syp(y));
        prevX = x; prevY = y;
      }
    }
    const alphas = [0.95, 0.5, 0.2], widths = [2.1, 1.7, 1.3];
    for (let a = 2; a >= 0; a--) {
      for (let s = 0; s < 3; s++) {
        const c = col[s];
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alphas[a] + ')';
        ctx.lineWidth = widths[a];
        ctx.stroke(bins[s][a]);
      }
    }
  }

  function drawStaticStreams() {
    // reduced motion: integrate whole streamlines once and draw them still
    const col = T.canvas.cobalt;
    ca.c = Math.cos(alphaCur * DEG); ca.s = Math.sin(alphaCur * DEG);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 1.5;
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    for (let l = 0; l < LANES; l++) {
      let x = vLeft - 0.05, y = lane[l * PER];
      for (let i = 0; i < 700; i++) {
        stepVelocity(x, y, 0, sv);
        if (sv.inside) break;
        const sp = Math.hypot(sv.u, sv.v) || 1;
        const ds = 0.012;
        const nx = x + (sv.u / sp) * ds, ny = y + (sv.v / sp) * ds;
        const sb = sv.speed < 0.97 ? 0 : (sv.speed < 1.18 ? 1 : 2);
        paths[sb].moveTo(sxp(x), syp(y)); paths[sb].lineTo(sxp(nx), syp(ny));
        x = nx; y = ny;
        if (x > vRight + 0.1 || y > vTop + 0.3 || y < vBottom - 0.3) break;
      }
    }
    for (let s = 0; s < 3; s++) {
      const c = col[s];
      ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.55)';
      ctx.stroke(paths[s]);
    }
  }

  function drawBody(aero) {
    // ghost of the other section
    const other = morphCur >= 0.5 ? 0 : 1;
    if (morphAnim === null) {
      buildProfile(other, ghost);
      ctx.save();
      profileScreenPath(ghost);
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2; ctx.strokeStyle = T.canvas.ghost; ctx.stroke();
      ctx.restore();
    }
    // body glow + fill
    ctx.save();
    profileScreenPath(profile);
    ctx.shadowColor = T.canvas.glow; ctx.shadowBlur = 22 * Math.min(dpr, 2); ctx.shadowOffsetY = 6;
    ctx.fillStyle = T.canvas.fill;
    ctx.fill();
    ctx.restore();
    // opaque-ish layer so streamlines never read through the section
    ctx.save();
    profileScreenPath(profile);
    ctx.fillStyle = themeName === 'dark' ? 'rgba(18,27,48,.92)' : 'rgba(251,250,245,.94)';
    ctx.fill();
    ctx.fillStyle = T.canvas.fill; ctx.fill();
    ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.strokeStyle = T.canvas.stroke; ctx.stroke();
    ctx.restore();
    // chord line
    const a = rotPt(0, 0), b = rotPt(1, 0);
    ctx.save();
    ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = T.canvas.chord;
    ctx.beginPath(); ctx.moveTo(sxp(a[0]), syp(a[1])); ctx.lineTo(sxp(b[0]), syp(b[1])); ctx.stroke();
    ctx.restore();
    // lift arrow at quarter chord (length follows the illustrative lift)
    const cl = aero.cl;
    const L = clamp(cl, -0.6, 1.6) * 0.42 * scale;
    if (Math.abs(L) > 4) {
      const cx = sxp(PIV), cy = syp(0);
      ctx.save();
      ctx.strokeStyle = T.canvas.arrow; ctx.fillStyle = T.canvas.arrow; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      const dir = L > 0 ? -1 : 1, y2 = cy + dir * Math.abs(L), back = -dir * 9;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, y2 + back * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y2); ctx.lineTo(cx - 5.5, y2 + back); ctx.lineTo(cx + 5.5, y2 + back); ctx.closePath(); ctx.fill();
      ctx.font = '600 12px ' + (getComputedStyle(root).fontFamily || 'sans-serif');
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('L', cx + 9, (cy + y2) / 2);
      ctx.restore();
    }
    // freestream marker
    ctx.save();
    ctx.fillStyle = 'rgba(' + T.canvas.ink + ',.5)';
    ctx.font = '500 11px ' + (getComputedStyle(root).fontFamily || 'sans-serif');
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('FLOW →', sxp(vLeft + 0.06), syp(vTop - 0.1) + 0);
    ctx.restore();
  }

  let staticPending = true, prewarmPending = false;

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop();
    ca.c = Math.cos(alphaCur * DEG); ca.s = Math.sin(alphaCur * DEG);
    if (reduced) drawStaticStreams(); else drawStreams();
    drawBody(mixedAero(alphaCur));
  }

  /* ---------- readouts ---------- */
  function updateReadout() {
    const txt = fmt(alphaCur, 1) + '°';
    valEl.textContent = txt;
    alphaHud.textContent = 'α ' + txt;
    slider.style.setProperty('--tbd-fill', ((alphaCur + 4) / 20) * 100 + '%');
  }

  function updateNames() {
    const k = morphTarget >= 0.5 ? 'clark' : 'naca';
    nameEl.textContent = k === 'clark' ? 'Clark-Y' : 'NACA 0015';
    descEl.textContent = k === 'clark' ? 'Cambered, flat-bottomed, 11.7% thick' : 'Symmetric, 15% thick';
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === k)));
    canvas.setAttribute('aria-label', 'Streamlines bending around the ' + nameEl.textContent + ' section at ' + fmt(alphaTarget, 1) + ' degrees angle of attack');
  }

  /* ---------- interactions ---------- */
  function setMorph(target) {
    morphTarget = target;
    updateNames();
    if (reduced) { morphCur = target; dirty = true; staticPending = true; frameOnce(); return; }
    const from = morphCur, t0 = performance.now(), dur = 640;
    morphAnim = { from, to: target, t0, dur };
    wake();
  }
  chips.forEach(c => c.addEventListener('click', () => setMorph(c.dataset.k === 'clark' ? 1 : 0)));

  slider.addEventListener('input', () => {
    userTouched = true; setAuto(false);
    alphaTarget = parseFloat(slider.value);
    if (reduced) { alphaCur = alphaTarget; dirty = true; staticPending = true; frameOnce(); } else wake();
    updateNames();
  });

  function setAuto(on) {
    autoOn = on; autoBtn.setAttribute('aria-pressed', String(on));
    autoT.textContent = on ? 'Pause sweep' : 'Auto sweep';
    autoIco.setAttribute('d', on ? 'M2.5 1.5h3v11h-3zM8.5 1.5h3v11h-3z' : 'M3 1.5v11l9-5.5z');
    if (on) { autoT0 = performance.now(); wake(); }
  }
  if (reduced) autoBtn.style.display = 'none';
  autoBtn.addEventListener('click', () => { userTouched = true; setAuto(!autoOn); });

  /* ---------- loop ---------- */
  function frame(now) {
    raf = 0;
    if (disposed || !running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;

    if (morphAnim) {
      const t = clamp((now - morphAnim.t0) / morphAnim.dur, 0, 1);
      morphCur = morphAnim.from + (morphAnim.to - morphAnim.from) * ease(t);
      dirty = true;
      if (t >= 1) { morphCur = morphAnim.to; morphAnim = null; }
    }
    if (autoOn) {
      const s = (now - autoT0) / 1000;
      alphaTarget = 6.5 + 5.5 * Math.sin(s * 0.55 - Math.PI / 2 * 0.6);
      slider.value = alphaTarget.toFixed(1);
    }
    const d = alphaTarget - alphaCur;
    if (Math.abs(d) > 0.002) { alphaCur += d * Math.min(1, dt * 9); dirty = true; } else if (d !== 0) { alphaCur = alphaTarget; dirty = true; }
    if (dirty) { recompute(); updateReadout(); }
    if (prewarmPending) prewarm();
    advance(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  function prewarm() {
    prewarmPending = false;
    if (reduced) return;
    if (dirty) { recompute(); }
    for (let i = 0; i < 44; i++) advance(1 / 30);
  }

  function frameOnce() { // reduced-motion path: draw one still frame
    if (disposed || !W) return;
    if (dirty) { recompute(); updateReadout(); }
    render();
  }

  function wake() {
    if (reduced) { frameOnce(); return; }
    if (disposed || !visible) return;
    if (!running) { running = true; lastT = performance.now(); }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function sleep() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ---------- observers ---------- */
  const ro = new ResizeObserver(() => { resize(); if (reduced) { frameOnce(); } else if (!running) { if (visible) wake(); } });
  ro.observe(root);
  ro.observe(stage);

  let counted = false;
  function countUp() {
    if (counted) return; counted = true;
    if (reduced) return;
    const t0 = performance.now(), dur = 1300;
    const done = () => { n1.textContent = '30'; n2.textContent = '400'; };
    const guard = setTimeout(done, dur + 400);
    n1.textContent = '0'; n2.textContent = '0';
    (function tick(now) {
      if (disposed) { clearTimeout(guard); return; }
      const t = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 4);
      n1.textContent = String(Math.round(30 * e)); n2.textContent = String(Math.round(400 * e));
      if (t < 1) requestAnimationFrame(tick); else { clearTimeout(guard); done(); }
    })(t0);
  }

  const io = new IntersectionObserver(es => {
    for (const e of es) {
      visible = e.isIntersecting;
      if (visible) { countUp(); if (!reduced) wake(); else frameOnce(); } else sleep();
    }
  }, { rootMargin: '120px' });
  io.observe(root);

  /* ---------- init ---------- */
  updateNames();
  resize();
  recompute(); updateReadout();
  if (reduced) { countUp(); frameOnce(); } else { wake(); }

  /* ---------- api ---------- */
  return {
    dispose() {
      disposed = true; sleep();
      try { ro.disconnect(); io.disconnect(); } catch (e) { /* noop */ }
      try { container.innerHTML = ''; } catch (e) { /* noop */ }
    },
    setTheme(t) {
      themeName = t === 'dark' ? 'dark' : 'light';
      T = applyTheme(root, themeName);
      dirty = true;
      if (!running) frameOnce();
    }
  };
}
