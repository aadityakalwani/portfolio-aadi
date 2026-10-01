// show-shaft.js : portfolio showcase for the DMM2 snowmobile track drive-shaft.
// Contract: export mount(container, opts) -> { dispose(), setTheme(t), setExplode(t), setView(v) }
// opts = { theme: 'light' | 'dark', reducedMotion: bool, config?: 'A' | 'B', view?: string, explode?: 0..1 }
// Needs the import map: "three" and "three/addons/" (vendored r169).
// Units inside the scene are mm; the root group is scaled by 0.01 (1mm = 0.01 world units).
// All DOM classes carry the pfsh- prefix and every rule is scoped under .pfsh, so nothing leaks.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GUIDE_URL = 'https://dmm2-pair122-guide.vercel.app';

/* ------------------------------------------------------------------ statics (config A or B) */
// Loads are the first-pass design loads from the calculation core (N, mm).
// Forward and up are positive. Reactions come from moment and force balance about bearing A, per plane.
const LD = { T: 720, chain: 2122, chH: 1838, chV: 1061 };
function statics(cfg) {
  const xC = cfg === 'A' ? 460 : 400, xB = cfg === 'A' ? 400 : 460;
  const H = [[50, -LD.T], [350, -LD.T], [xC, LD.chH]];
  const V = [[xC, LD.chV]];
  const react = (L) => {
    const B = -L.reduce((s, [x, f]) => s + f * x, 0) / xB;
    const A = -(L.reduce((s, [, f]) => s + f, 0) + B);
    return { A, B };
  };
  const rh = react(H), rv = react(V);
  const Ah = rh.A, Bh = rh.B, Av = rv.A, Bv = rv.B;
  const Hf = [[0, Ah], ...H, [xB, Bh]], Vf = [[0, Av], ...V, [xB, Bv]];
  const mom = (L, x) => L.reduce((s, [xi, f]) => (xi <= x + 1e-9 ? s + f * (x - xi) : s), 0);
  const M = (x) => Math.hypot(mom(Hf, x), mom(Vf, x)) / 1000;     // resultant bending moment, Nm
  let peak = 0, peakX = 0;
  for (let x = 0; x <= 500; x += 1) { const m = M(x); if (m > peak) { peak = m; peakX = x; } }
  const stations = { A: 0, T1: 50, T2: 350, C: xC, B: xB };
  let peakAt = null, best = 12;
  for (const k in stations) { const d = Math.abs(stations[k] - peakX); if (d < best) { best = d; peakAt = k; } }
  return { cfg, xC, xB, Ah, Av, Bh, Bv, RA: Math.hypot(Ah, Av), RB: Math.hypot(Bh, Bv), M, peak, peakX, peakAt, stations };
}
const fmt = (n, d = 0) => n.toFixed(d);

/* ------------------------------------------------------------------ part info */
export const PART_INFO = {
  shaft: {
    name: 'Drive shaft',
    role: 'Stepped steel shaft. Carries torque from sprocket C out to the two track sprockets and spans bearings A and B.',
    keyNumbers: (st) => ['Peak torque 208.8Nm between T2 and C', `Critical section: ${fmt(st.peak, 1)}Nm resultant bending${st.peakAt ? ' at ' + st.peakAt : ''}`, 'First-pass diameter 30mm']
  },
  bearingA: {
    name: 'Bearing A',
    role: 'Deep-groove ball bearing in a pillow-block housing. Outboard support at x = 0, carrying radial load only.',
    keyNumbers: (st) => [`Reaction about ${fmt(st.RA)}N`, 'Life of at least 2.85×10⁸ revs at 915RPM', 'About 62mm OD, 16mm wide']
  },
  bearingB: {
    name: 'Bearing B',
    role: 'Second support. In config B it sits beside sprocket C at x = 460. In config A it moves to x = 400 and C overhangs.',
    keyNumbers: (st) => [`Reaction about ${fmt(st.RB)}N`, 'Life of at least 2.85×10⁸ revs at 915RPM', 'About 62mm OD, 16mm wide']
  },
  hubT1: {
    name: 'Hub T1',
    role: 'Taper-lock style hub. Clamps track sprocket T1 to the shaft and transmits half the track torque by friction and key.',
    keyNumbers: () => ['Carries T/2 = 104.4Nm', 'Sits at x = 50']
  },
  hubT2: {
    name: 'Hub T2',
    role: 'Taper-lock style hub. Clamps track sprocket T2 to the shaft and transmits its half of the track torque.',
    keyNumbers: () => ['Carries T/2 = 104.4Nm', 'Sits at x = 350']
  },
  trackSprocketT1: {
    name: 'Track sprocket T1',
    role: 'Drives the left track. Takes the track tractive load at its pitch radius.',
    keyNumbers: () => ['720N rearward, horizontal', 'T/2 = 104.4Nm', '290mm PCD, about 20 teeth']
  },
  trackSprocketT2: {
    name: 'Track sprocket T2',
    role: 'Drives the right track. Takes the track tractive load at its pitch radius.',
    keyNumbers: () => ['720N rearward, horizontal', 'T/2 = 104.4Nm', '290mm PCD, about 20 teeth']
  },
  hubC: {
    name: 'Hub C',
    role: 'Locates and keys the driven chain sprocket C on the shaft.',
    keyNumbers: (st) => ['Carries the full T = 208.8Nm', `Sits at x = ${st.xC}`]
  },
  sprocketC: {
    name: 'Driven sprocket C',
    role: 'Chain-driven sprocket that puts torque into the shaft. The chain pull acts along the 30° line towards D.',
    keyNumbers: () => ['Chain pull about 2122N', 'About 197mm PCD, 40 teeth', 'Turns at 915RPM']
  },
  sprocketD: {
    name: 'Drive sprocket D',
    role: 'Small sprocket on the motor side. Drives the chain at a ratio of 3.28:1.',
    keyNumbers: () => ['3000RPM motor side', '20kW', 'About 60mm PCD, line of centres at 30°']
  },
  chain: {
    name: 'Roller chain loop',
    role: 'Carries motor torque from D to C. The tight side pulls C towards D.',
    keyNumbers: () => ['Ratio 3.28:1, D to C', 'Centre distance about 410 to 490mm', 'Pull about 2122N']
  },
  motor: {
    name: 'Electric motor',
    role: 'Stylised electric drive behind sprocket D.',
    keyNumbers: () => ['20kW', '3000RPM', 'Torque 63.7Nm']
  }
};

/* ------------------------------------------------------------------ constants */
const S = 0.01;                          // mm to world
const R_C = 98.5, R_D = 30;              // chain pitch radii (197 and 60 PCD)
const CD = 450, ANG = Math.PI / 6;       // centre distance, 30 degrees
const D_A = -CD * Math.cos(ANG);         // plane coords (a = z, b = y), forward is -z
const D_B = CD * Math.sin(ANG);
const OMEGA_SHAFT = 1.4;                 // rad/s visual
const RATIO = 3.28;
const POS = { A: 0, T1: 50, T2: 350 };

const COLORS = {
  shaft: 0xd2d8de, bearing: 0xe4e8ec, housing: 0x5d6672, hub: 0x4a5565,
  track: 0x8c9bb0, sprocketC: 0x2a57e8, sprocketD: 0x3a4a68, motor: 0x4b5a78,
  chain: 0x2b3037, roller: 0xa3acb6, load: 0xd4506e, react: 0x2e55ea
};

/* ------------------------------------------------------------------ geometry helpers */
function cylX(x0, x1, r0, r1 = r0, seg = 48) {
  const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, seg);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}
function ringX(rin, rout, x0, x1, bevel = 0.6, seg = 64) {
  const depth = Math.max(0.1, x1 - x0 - 2 * bevel);
  const s = new THREE.Shape();
  s.absarc(0, 0, rout, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, rin, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: seg });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}
function sprocketGeo(pcd, N, toothH, thick, bore, holes = []) {
  const R = pcd / 2, rt = R + toothH * 0.45, rr = R - toothH * 0.55, step = (Math.PI * 2) / N;
  const sh = new THREE.Shape();
  const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  for (let i = 0; i < N; i++) {
    const a0 = i * step;
    const pts = [pol(rr, a0 - step * 0.42), pol(rt, a0 - step * 0.17), pol(rt, a0 + step * 0.17), pol(rr, a0 + step * 0.42)];
    pts.forEach((p, k) => (i === 0 && k === 0 ? sh.moveTo(p[0], p[1]) : sh.lineTo(p[0], p[1])));
  }
  sh.closePath();
  const b = new THREE.Path(); b.absarc(0, 0, bore, 0, Math.PI * 2, true); sh.holes.push(b);
  holes.forEach(({ n, at, r }) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, hp = new THREE.Path();
      hp.absarc(at * Math.cos(a), at * Math.sin(a), r, 0, Math.PI * 2, true);
      sh.holes.push(hp);
    }
  });
  const depth = thick - 1.2;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 1, curveSegments: 20 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
const ease = (t) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ chain path (plane coords a=z, b=y) */
function buildChainPath() {
  const L = CD, phi = Math.atan2(D_B, D_A), alpha = Math.acos((R_C - R_D) / L);
  const n1 = [Math.cos(phi - alpha), Math.sin(phi - alpha)];
  const n2 = [Math.cos(phi + alpha), Math.sin(phi + alpha)];
  const P1 = [R_C * n1[0], R_C * n1[1]], P2 = [D_A + R_D * n1[0], D_B + R_D * n1[1]];
  const Q1 = [D_A + R_D * n2[0], D_B + R_D * n2[1]], Q2 = [R_C * n2[0], R_C * n2[1]];
  const Lt = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
  const t1 = [(P2[0] - P1[0]) / Lt, (P2[1] - P1[1]) / Lt];
  const t2 = [(Q2[0] - Q1[0]) / Lt, (Q2[1] - Q1[1]) / Lt];
  const lenD = R_D * 2 * alpha, lenC = R_C * (Math.PI * 2 - 2 * alpha);
  const total = 2 * Lt + lenD + lenC;
  function sample(u) {
    u = ((u % total) + total) % total;
    if (u < Lt) return { a: P1[0] + t1[0] * u, b: P1[1] + t1[1] * u, ta: t1[0], tb: t1[1] };
    u -= Lt;
    if (u < lenD) { const ang = phi - alpha + u / R_D; return { a: D_A + R_D * Math.cos(ang), b: D_B + R_D * Math.sin(ang), ta: -Math.sin(ang), tb: Math.cos(ang) }; }
    u -= lenD;
    if (u < Lt) return { a: Q1[0] + t2[0] * u, b: Q1[1] + t2[1] * u, ta: t2[0], tb: t2[1] };
    u -= Lt;
    const ang = phi + alpha + u / R_C;
    return { a: R_C * Math.cos(ang), b: R_C * Math.sin(ang), ta: -Math.sin(ang), tb: Math.cos(ang) };
  }
  return { sample, total, Q1, Q2 };
}


/* ------------------------------------------------------------------ css (every rule scoped under .pfsh) */
function injectCss() {
  if (document.getElementById('pfsh-css')) return;
  const st = document.createElement('style');
  st.id = 'pfsh-css';
  st.textContent = `
.pfsh{--p-card:#FBFAF5;--p-card2:#FFFFFF;--p-ink:#0E1B2E;--p-ink2:#26344A;--p-mute:#5B6577;--p-acc:#1E48E0;--p-acc-t:#1E48E0;--p-acc-h:#1636B4;
  --p-wash:rgba(30,72,224,.07);--p-ring:rgba(30,72,224,.32);--p-line:rgba(14,27,46,.10);--p-line2:rgba(14,27,46,.18);
  --p-glass:rgba(251,250,245,.78);--p-glass-line:rgba(14,27,46,.08);--p-stage-a:#FDFCF8;--p-stage-b:#ECE9DA;--p-rose:#D4506E;--p-ok:#157A43;
  --p-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 2px 4px rgba(14,27,46,.04),0 30px 64px -30px rgba(14,27,46,.38);
  --p-pop:0 1px 2px rgba(14,27,46,.10),0 8px 22px -12px rgba(14,27,46,.30);
  --p-serif:"Instrument Serif","Iowan Old Style","Times New Roman",serif;
  --p-sans:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --p-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  position:relative;display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;isolation:isolate;overflow:hidden;
  border-radius:28px;background:var(--p-card);border:1px solid var(--p-line);box-shadow:var(--p-shadow);color:var(--p-ink);
  font-family:var(--p-sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;text-align:left}
.pfsh[data-theme="dark"]{--p-card:#121B30;--p-card2:#1B2744;--p-ink:#EAEEF7;--p-ink2:#C8D1E3;--p-mute:#9AA6BD;--p-acc:#3A62F0;--p-acc-t:#7F9CFF;--p-acc-h:#5C82F2;
  --p-wash:rgba(92,130,242,.15);--p-ring:rgba(127,156,255,.45);--p-line:rgba(234,238,247,.10);--p-line2:rgba(234,238,247,.20);
  --p-glass:rgba(18,27,48,.74);--p-glass-line:rgba(234,238,247,.09);--p-stage-a:#1A2744;--p-stage-b:#0A1020;--p-rose:#F07A93;--p-ok:#4CC38A;
  --p-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 2px 4px rgba(0,0,0,.3),0 34px 70px -30px rgba(0,0,0,.8);
  --p-pop:0 1px 2px rgba(0,0,0,.4),0 10px 24px -12px rgba(0,0,0,.7)}
.pfsh *,.pfsh *::before,.pfsh *::after{box-sizing:border-box}
.pfsh button{font-family:inherit;margin:0}
.pfsh [hidden]{display:none!important}

.pfsh .pfsh-stage{position:relative;flex:1 1 auto;min-height:230px;aspect-ratio:16/10;overflow:hidden;
  background:radial-gradient(120% 95% at 50% 18%,var(--p-stage-a) 0%,var(--p-stage-b) 78%)}
.pfsh .pfsh-stage::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:2;
  background-image:radial-gradient(var(--p-line) 1px,transparent 1.2px);background-size:22px 22px;opacity:.55;
  -webkit-mask-image:radial-gradient(90% 80% at 50% 50%,#000 25%,transparent 100%);mask-image:radial-gradient(90% 80% at 50% 50%,#000 25%,transparent 100%)}
.pfsh .pfsh-canvas{position:absolute;inset:0;display:block;width:100%;height:100%;z-index:1;outline:none}
.pfsh .pfsh-canvas:focus-visible{outline:2px solid var(--p-acc-t);outline-offset:-4px;border-radius:20px}
.pfsh .pfsh-labels{z-index:3}

.pfsh .pfsh-views{position:absolute;top:12px;left:12px;right:12px;z-index:5;display:flex;pointer-events:none}
.pfsh .pfsh-seg{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;pointer-events:auto;max-width:100%;
  background:var(--p-glass);-webkit-backdrop-filter:blur(16px) saturate(1.6);backdrop-filter:blur(16px) saturate(1.6);
  border:1px solid var(--p-glass-line);box-shadow:var(--p-pop);overflow-x:auto;scrollbar-width:none}
.pfsh .pfsh-seg::-webkit-scrollbar{display:none}
.pfsh .pfsh-seg button{flex:0 0 auto;min-height:32px;padding:0 14px;border:0;border-radius:999px;background:transparent;cursor:pointer;
  font-size:13px;font-weight:500;letter-spacing:-.005em;color:var(--p-ink2);white-space:nowrap;
  transition:background-color .18s cubic-bezier(.2,.7,.2,1),color .18s,box-shadow .18s}
.pfsh .pfsh-seg button:hover{color:var(--p-ink)}
.pfsh .pfsh-seg button[aria-pressed="true"]{background:var(--p-card2);color:var(--p-acc-t);font-weight:600;
  box-shadow:0 1px 2px rgba(14,27,46,.14),0 0 0 1px var(--p-line)}
.pfsh button:focus-visible,.pfsh a:focus-visible,.pfsh input:focus-visible{outline:2px solid var(--p-acc-t);outline-offset:2px}

.pfsh .pfsh-live{position:absolute;right:12px;bottom:12px;z-index:5;display:inline-flex;align-items:center;gap:8px;padding:7px 12px 7px 10px;border-radius:999px;
  background:var(--p-glass);-webkit-backdrop-filter:blur(16px) saturate(1.6);backdrop-filter:blur(16px) saturate(1.6);border:1px solid var(--p-glass-line);
  box-shadow:var(--p-pop);font:500 12px/1 var(--p-mono);color:var(--p-ink);font-variant-numeric:tabular-nums;pointer-events:none}
.pfsh .pfsh-live i{width:7px;height:7px;border-radius:50%;background:var(--p-ok);box-shadow:0 0 0 0 rgba(21,122,67,.5);animation:pfsh-pulse 2s infinite}
.pfsh .pfsh-live small{font:500 10.5px/1 var(--p-sans);letter-spacing:.1em;text-transform:uppercase;color:var(--p-mute)}
@keyframes pfsh-pulse{0%{box-shadow:0 0 0 0 rgba(21,122,67,.45)}70%{box-shadow:0 0 0 8px rgba(21,122,67,0)}100%{box-shadow:0 0 0 0 rgba(21,122,67,0)}}
.pfsh .pfsh-key{position:absolute;right:12px;bottom:12px;z-index:5;display:inline-flex;gap:14px;align-items:center;padding:8px 13px;border-radius:999px;
  background:var(--p-glass);-webkit-backdrop-filter:blur(16px) saturate(1.6);backdrop-filter:blur(16px) saturate(1.6);border:1px solid var(--p-glass-line);
  box-shadow:var(--p-pop);font-size:12px;font-weight:500;color:var(--p-ink2);pointer-events:none}
.pfsh .pfsh-key span{display:inline-flex;align-items:center;gap:7px}
.pfsh .pfsh-key i{width:14px;height:3px;border-radius:2px;display:block}
.pfsh .pfsh-key .l i{background:var(--p-rose)}.pfsh .pfsh-key .r i{background:var(--p-acc-t)}

.pfsh .pfsh-info{position:absolute;left:12px;bottom:12px;z-index:6;width:min(330px,calc(100% - 24px));padding:14px 16px 14px;border-radius:18px;
  background:var(--p-glass);-webkit-backdrop-filter:blur(20px) saturate(1.7);backdrop-filter:blur(20px) saturate(1.7);border:1px solid var(--p-glass-line);box-shadow:var(--p-pop)}
.pfsh .pfsh-info h4{margin:0 22px 4px 0;font:400 22px/1.1 var(--p-serif);letter-spacing:-.01em;color:var(--p-ink)}
.pfsh .pfsh-info p{margin:0 0 8px;font-size:13px;line-height:1.45;color:var(--p-mute)}
.pfsh .pfsh-info ul{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.pfsh .pfsh-info li{font:500 12px/1.35 var(--p-mono);color:var(--p-ink2);padding-left:14px;position:relative}
.pfsh .pfsh-info li::before{content:"";position:absolute;left:0;top:.5em;width:6px;height:6px;border-radius:50%;background:var(--p-acc-t);opacity:.8}
.pfsh .pfsh-info button{position:absolute;top:8px;right:8px;width:30px;height:30px;border:0;border-radius:50%;background:transparent;color:var(--p-mute);cursor:pointer;font-size:18px;line-height:1}
.pfsh .pfsh-info button:hover{background:var(--p-wash);color:var(--p-ink)}
.pfsh .pfsh-tip{position:absolute;pointer-events:none;z-index:7;font:500 12px/1.2 var(--p-sans);color:#fff;background:rgba(14,27,46,.92);padding:5px 9px;border-radius:7px;
  transform:translate(12px,12px);display:none;white-space:nowrap}

.pfsh .pfsh-chip{z-index:12000!important;font:700 12px/1 var(--p-sans);color:#fff;background:var(--p-ink,#0E1B2E);border:2px solid var(--p-card2);border-radius:999px;min-width:26px;height:26px;padding:0 7px;
  display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(14,27,46,.28);pointer-events:none;user-select:none}
.pfsh[data-theme="dark"] .pfsh-chip{background:#EAEEF7;color:#0A1020;border-color:#0A1020}
.pfsh .pfsh-tag{font:600 11px/1.15 var(--p-sans);padding:4px 8px;border-radius:7px;white-space:nowrap;pointer-events:none;user-select:none;color:#fff;box-shadow:0 2px 8px rgba(14,27,46,.22)}
.pfsh .pfsh-tag.load{background:#C23F5E}.pfsh .pfsh-tag.react{background:#2E55EA}
.pfsh .pfsh-dim{z-index:11000!important;font:600 10.5px/1 var(--p-sans);color:var(--p-ink2);background:var(--p-glass);padding:3px 7px;border-radius:6px;border:1px dashed var(--p-line2);pointer-events:none;white-space:nowrap}
.pfsh .pfsh-fl{position:relative;width:0;height:0;pointer-events:none}
.pfsh .pfsh-fl.pfsh-fl--dim{z-index:11000!important}
.pfsh .pfsh-fl>span{position:absolute;white-space:pre;line-height:1.25}
.pfsh .pfsh-fl.r>span{left:0;top:0;transform:translate(10px,-50%)}
.pfsh .pfsh-fl.l>span{right:0;top:0;transform:translate(-10px,-50%);text-align:right}
.pfsh .pfsh-fl.b>span{left:0;top:0;transform:translate(-50%,10px);text-align:center}
.pfsh .pfsh-fl.t>span{left:0;top:0;transform:translate(-50%,calc(-100% - 10px));text-align:center}
.pfsh .pfsh-fl .pfsh-tag,.pfsh .pfsh-fl .pfsh-dim{display:inline-block}

.pfsh .pfsh-bmd{position:relative;padding:12px 18px 8px;border-top:1px solid var(--p-line);background:var(--p-card)}
.pfsh .pfsh-bmd svg{display:block;width:100%;height:104px;overflow:visible}
.pfsh .pfsh-bmd text{font-family:var(--p-sans);fill:var(--p-mute);font-size:11px}
.pfsh .pfsh-bmd .pk{fill:var(--p-ink);font-weight:600;font-family:var(--p-mono);font-size:11.5px}

.pfsh .pfsh-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px 28px;padding:14px 18px;border-top:1px solid var(--p-line)}
.pfsh .pfsh-explode{display:flex;align-items:center;gap:12px;flex:1 1 280px;min-width:240px}
.pfsh .pfsh-explode label{font:600 11px/1 var(--p-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--p-mute);flex:0 0 auto}
.pfsh .pfsh-range{-webkit-appearance:none;appearance:none;flex:1 1 auto;min-width:80px;height:34px;margin:0;background:transparent;cursor:pointer;--v:0%}
.pfsh .pfsh-range::-webkit-slider-runnable-track{height:4px;border-radius:99px;background:linear-gradient(to right,var(--p-acc) var(--v),var(--p-line2) var(--v))}
.pfsh .pfsh-range::-moz-range-track{height:4px;border-radius:99px;background:linear-gradient(to right,var(--p-acc) var(--v),var(--p-line2) var(--v))}
.pfsh .pfsh-range::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-9px;border-radius:50%;background:#fff;border:1px solid var(--p-line2);
  box-shadow:0 1px 2px rgba(14,27,46,.2),0 4px 10px -3px rgba(14,27,46,.35);transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
.pfsh .pfsh-range::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid var(--p-line2);box-shadow:0 1px 2px rgba(14,27,46,.2),0 4px 10px -3px rgba(14,27,46,.35)}
.pfsh .pfsh-range:active::-webkit-slider-thumb{transform:scale(1.12)}
.pfsh .pfsh-range:disabled{cursor:not-allowed;opacity:.4}
.pfsh .pfsh-btn{flex:0 0 auto;min-height:36px;padding:0 16px;border-radius:999px;border:1px solid var(--p-line2);background:var(--p-card2);color:var(--p-ink);font-size:13px;font-weight:600;cursor:pointer;
  box-shadow:var(--p-pop);transition:transform .18s cubic-bezier(.2,.7,.2,1),border-color .18s,color .18s}
.pfsh .pfsh-btn:hover{border-color:var(--p-acc-t);color:var(--p-acc-t)}
.pfsh .pfsh-btn:active{transform:scale(.97)}
.pfsh .pfsh-btn:disabled{opacity:.4;cursor:not-allowed}
.pfsh .pfsh-toggles{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}
.pfsh .pfsh-tgl{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 14px 0 12px;border-radius:999px;border:1px solid var(--p-line2);background:transparent;color:var(--p-ink2);
  font-size:13px;font-weight:500;cursor:pointer;transition:background-color .18s,border-color .18s,color .18s}
.pfsh .pfsh-tgl i{width:8px;height:8px;border-radius:50%;border:1.5px solid var(--p-mute);transition:background-color .18s,border-color .18s,box-shadow .18s}
.pfsh .pfsh-tgl[aria-pressed="true"]{background:var(--p-wash);border-color:var(--p-ring);color:var(--p-acc-t)}
.pfsh .pfsh-tgl[aria-pressed="true"] i{background:var(--p-acc-t);border-color:var(--p-acc-t);box-shadow:0 0 0 3px var(--p-wash)}
.pfsh .pfsh-tgl:disabled{opacity:.4;cursor:not-allowed}
.pfsh .pfsh-controls .pfsh-seg{box-shadow:none;background:transparent;border-color:var(--p-line2);-webkit-backdrop-filter:none;backdrop-filter:none}

.pfsh .pfsh-train{display:grid;grid-template-columns:auto minmax(96px,1fr) auto;align-items:center;gap:6px 14px;padding:16px 18px;border-top:1px solid var(--p-line);background:var(--p-wash)}
.pfsh .pfsh-cell{display:flex;flex-direction:column;gap:3px;min-width:0}
.pfsh .pfsh-cell.out{text-align:right;align-items:flex-end}
.pfsh .pfsh-cell small{font:600 10.5px/1 var(--p-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--p-mute)}
.pfsh .pfsh-cell b{font:400 clamp(22px,3.6vw,32px)/1.05 var(--p-serif);letter-spacing:-.015em;color:var(--p-ink);white-space:nowrap}
.pfsh .pfsh-cell b em{font-style:italic;color:var(--p-acc-t)}
.pfsh .pfsh-cell span{font:500 12px/1.2 var(--p-mono);color:var(--p-ink2);white-space:nowrap}
.pfsh .pfsh-ratio{display:flex;align-items:center;gap:8px;min-width:96px;width:100%}
.pfsh .pfsh-ratio::before,.pfsh .pfsh-ratio::after{content:"";flex:1 1 0;min-width:8px;height:1px;background:var(--p-ring)}
.pfsh .pfsh-ratio::before{order:0}.pfsh .pfsh-ratio span{order:1}.pfsh .pfsh-ratio::after{order:2}.pfsh .pfsh-ratio svg{order:3;margin-left:-8px}
.pfsh .pfsh-ratio span{font:600 12px/1 var(--p-mono);color:var(--p-acc-t);padding:5px 10px;border-radius:999px;background:var(--p-card2);border:1px solid var(--p-ring);white-space:nowrap}
.pfsh .pfsh-ratio svg{width:9px;height:10px;display:block;color:var(--p-acc-t);flex:0 0 auto}

.pfsh .pfsh-foot{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 24px;padding:14px 18px 20px;border-top:1px solid var(--p-line)}
.pfsh .pfsh-cap{margin:0;flex:1 1 320px;font-size:13px;line-height:1.5;color:var(--p-mute);max-width:64ch;text-wrap:pretty}
.pfsh .pfsh-link{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 16px;border-radius:999px;background:var(--p-acc);color:#fff;text-decoration:none;
  font-size:13px;font-weight:600;box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 10px 24px -10px rgba(30,72,224,.6);transition:transform .18s cubic-bezier(.2,.7,.2,1),background-color .18s}
.pfsh .pfsh-link:hover{background:var(--p-acc-h);transform:translateY(-1px)}

.pfsh.pfsh-fallback .pfsh-controls,.pfsh.pfsh-fallback .pfsh-bmd,.pfsh.pfsh-fallback .pfsh-views,.pfsh.pfsh-fallback .pfsh-live,.pfsh.pfsh-fallback .pfsh-key,.pfsh.pfsh-fallback .pfsh-info{display:none}
.pfsh .pfsh-fb{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center;z-index:4}
.pfsh .pfsh-fb svg{width:min(560px,92%);height:auto;color:var(--p-ink2)}
.pfsh .pfsh-fb p{margin:0;font-size:13px;color:var(--p-mute);max-width:44ch}

.pfsh[data-reduced] *{transition:none!important;animation:none!important}

@media (min-width:900px) and (max-height:960px){
  .pfsh.pfsh-forces .pfsh-train{display:none}
}
@media (max-width:640px){
  .pfsh{border-radius:22px}
  .pfsh .pfsh-stage{aspect-ratio:1/1.02;min-height:340px}
  .pfsh .pfsh-labels>.pfsh-dim,.pfsh .pfsh-long{display:none}
  .pfsh .pfsh-fl .pfsh-dim{display:none}
  .pfsh .pfsh-explode label{display:none}
  .pfsh .pfsh-views{top:10px;left:10px;right:10px}
  .pfsh .pfsh-seg button{padding:0 12px}
  .pfsh .pfsh-controls{padding:12px 14px;gap:10px}
  .pfsh .pfsh-explode{flex:1 1 100%}
  .pfsh .pfsh-train{padding:14px;gap:6px 8px}
  .pfsh .pfsh-ratio{min-width:64px}
  .pfsh .pfsh-cell span{font-size:11px}
  .pfsh .pfsh-foot{padding:12px 14px 14px}
  .pfsh.pfsh-has-info .pfsh-live{display:none}
  .pfsh .pfsh-live{right:10px;bottom:10px}.pfsh .pfsh-key{right:10px;bottom:10px;gap:10px;padding:7px 11px}
  .pfsh .pfsh-info{left:10px;bottom:10px;width:calc(100% - 20px)}
  .pfsh .pfsh-bmd{padding:10px 14px 6px}
}
@media (pointer:coarse){
  .pfsh .pfsh-seg button,.pfsh .pfsh-tgl,.pfsh .pfsh-btn,.pfsh .pfsh-link{min-height:44px}
  .pfsh .pfsh-info button{width:44px;height:44px;top:2px;right:2px}
}
`;
  document.head.appendChild(st);
}

/* ------------------------------------------------------------------ core (scene, parts, loop) */
function initCore(container, o, renderer) {
  let theme = o.theme === 'dark' ? 'dark' : 'light';
  const reduced = !!o.reducedMotion;
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const anyTouch = coarse || !!(window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
  let visible = true, raf = 0, last = 0, time = reduced ? 0.4 : 0, disposed = false, dirty = true, ready = false;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  /* renderer */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const dom = renderer.domElement;
  dom.className = 'pfsh-canvas';
  dom.setAttribute('role', 'group');
  dom.setAttribute('aria-roledescription', '3D model viewer');
  dom.setAttribute('aria-label', 'Interactive 3D model of the snowmobile track drive shaft assembly. Focus it and use the arrow keys to orbit, plus and minus to zoom, Home to reset. The view buttons and the explode slider below give the same views by keyboard.');
  dom.tabIndex = 0;
  container.appendChild(dom);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.classList.add('pfsh-labels');
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
  container.appendChild(labelRenderer.domElement);
  const tip = document.createElement('div'); tip.className = 'pfsh-tip'; container.appendChild(tip);

  /* scene */
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 3; controls.maxDistance = 160;
  controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  controls.enableZoom = false;                       // wheel never hijacks page scroll; ctrl or cmd + wheel zooms (below)
  controls.enablePan = !coarse; controls.screenSpacePanning = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  dom.style.touchAction = anyTouch ? 'pan-y' : 'none';  // any touch input keeps vertical page scroll over the canvas
  controls.addEventListener('change', () => { if (typeof updateFloor === 'function') updateFloor(); poke(); });
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const off = camera.position.clone().sub(controls.target);
    off.setLength(THREE.MathUtils.clamp(off.length() * Math.exp(e.deltaY * 0.0025), 3, 160));
    camera.position.copy(controls.target).add(off); poke();
  };
  dom.addEventListener('wheel', onWheel, { passive: false });

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa7b6, 0.65); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(5, 10, 6); key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd2ff, 0.5); fill.position.set(-6, 3, -5); scene.add(fill);

  const GROUND_Y = -1.95;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; ground.receiveShadow = true; scene.add(ground);
  let grid = null;
  function applyTheme() {
    const dark = theme === 'dark';
    hemi.color.set(dark ? 0xb5c4dc : 0xffffff); hemi.groundColor.set(dark ? 0x232b36 : 0x9aa7b6); hemi.intensity = dark ? 0.55 : 0.65;
    ground.material.opacity = dark ? 0.5 : 0.18;
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid = new THREE.GridHelper(24, 48, dark ? 0x31405f : 0xc4cadb, dark ? 0x1d2944 : 0xdadfe9);
    grid.position.y = GROUND_Y + 0.002; grid.material.transparent = true; grid.material.opacity = dark ? 0.8 : 0.75;
    scene.add(grid);
    pulses.forEach((p) => { p.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending; p.material.needsUpdate = true; });
    poke();
  }

  const root = new THREE.Group();
  root.scale.setScalar(S);
  root.position.set(-3.1, 0, 0.2);
  scene.add(root);

  /* ---------------- part registry */
  const parts = {};
  const pickables = [];
  const spinners = [];
  let cfgK = o.config === 'A' ? 0 : 1;           // 1 = config B
  let cfgTarget = cfgK;

  function addPart(id, station, base = [0, 0], ex = 0, ey = 0, ez = 0) {
    const group = new THREE.Group();
    const spin = new THREE.Group();
    group.add(spin);
    root.add(group);
    const p = { id, station, base, ex, ey, ez, group, spin, mats: [] };
    parts[id] = p;
    return p;
  }
  function mat(p, color, metalness, roughness, extra = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, metalness, roughness, envMapIntensity: 1.0 }, extra));
    m.emissive = new THREE.Color(0x3b82f6); m.emissiveIntensity = 0;
    p.mats.push(m);
    return m;
  }
  function mesh(p, geo, m, parent = p.spin, pick = true) {
    const me = new THREE.Mesh(geo, m);
    me.castShadow = true; me.receiveShadow = true;
    me.userData.partId = p.id;
    parent.add(me);
    if (pick) pickables.push(me);
    return me;
  }
  const addSpinner = (obj, k) => spinners.push({ obj, k });

  /* ---------------- shaft */
  {
    const p = addPart('shaft', 'A', [0, 0]);
    const m = mat(p, COLORS.shaft, 1.0, 0.22);
    const seg = (x0, x1, r0, r1) => mesh(p, cylX(x0, x1, r0, r1, 56), m);
    seg(-30, -28, 11, 12.5); seg(-28, -8, 12.5, 12.5); seg(-8, 485, 15.5, 15.5);
    seg(485, 498, 12.5, 12.5); seg(498, 500, 12.5, 11);
    seg(66, 72, 15.5, 17.5); seg(72, 318, 17.5, 17.5); seg(318, 324, 17.5, 15.5);
    const km = mat(p, 0x8f98a3, 1.0, 0.35);
    [[22, 62], [335, 378]].forEach(([a, b]) => {
      const k = mesh(p, new THREE.BoxGeometry(b - a, 5, 8), km);
      k.position.set((a + b) / 2, 15.5 + 0.8, 0);
    });
    const mark = mat(p, 0xe5484d, 0.2, 0.5);
    const mk = mesh(p, new THREE.BoxGeometry(4, 1.2, 10), mark); mk.position.set(195, 17.5 + 0.2, 0);
    addSpinner(p.spin, 'shaft');
  }

  /* ---------------- bearings */
  function buildBearing(id, station, ex) {
    const p = addPart(id, station, [0, 0], ex, -45, 0);
    const steel = mat(p, COLORS.bearing, 0.8, 0.28);
    mesh(p, ringX(27.4, 31, -8, 8, 0.7), steel, p.group);
    const inner = new THREE.Group(); p.group.add(inner);
    mesh(p, ringX(15.5, 19.6, -8, 8, 0.7), steel, inner);
    const cage = new THREE.Group(); p.group.add(cage);
    const brass = mat(p, 0xc9a13a, 0.9, 0.3);
    mesh(p, ringX(20.6, 26.2, 5.0, 6.2, 0.2), brass, cage);
    mesh(p, ringX(20.6, 26.2, -6.2, -5.0, 0.2), brass, cage);
    const ballGeo = new THREE.SphereGeometry(4.5, 20, 16);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const b = mesh(p, ballGeo, steel, cage);
      b.position.set(0, 23.3 * Math.cos(a), 23.3 * Math.sin(a));
    }
    addSpinner(inner, 'shaft'); addSpinner(cage, 'cage');
    // housing
    const hm = mat(p, COLORS.housing, 0.3, 0.55);
    mesh(p, ringX(31, 41, -12, 12, 1.2), hm, p.group);
    const neck = mesh(p, new THREE.BoxGeometry(24, 13, 56), hm, p.group); neck.position.set(0, -40, 0);
    const base = mesh(p, new THREE.BoxGeometry(24, 14, 104), hm, p.group); base.position.set(0, -53, 0);
    const bolts = mat(p, 0x1d232b, 0.8, 0.4);
    [-40, 40].forEach((z) => { const b = mesh(p, new THREE.CylinderGeometry(5.5, 5.5, 4, 6), bolts, p.group); b.position.set(0, -44.5, z); });
    const gm = mat(p, 0xc9a13a, 0.9, 0.3);
    const gr = mesh(p, new THREE.CylinderGeometry(3, 3.5, 8, 16), gm, p.group); gr.position.set(0, 44, 0);
    return p;
  }
  buildBearing('bearingA', 'A', -110);
  buildBearing('bearingB', 'B', 150);

  /* ---------------- hubs + track sprockets */
  function buildHub(id, station, ex, cfg) {
    const p = addPart(id, station, [0, 0], ex);
    const m = mat(p, COLORS.hub, 0.5, 0.45);
    mesh(p, ringX(15.5, cfg.bossR, cfg.b0, cfg.b1, 0.8), m);
    mesh(p, ringX(15.5, cfg.flR, cfg.b1, cfg.f1, 1.0), m);
    const bm = mat(p, 0x9aa3ad, 1.0, 0.3);
    for (let i = 0; i < cfg.nb; i++) {
      const a = (i / cfg.nb) * Math.PI * 2;
      const b = mesh(p, cylX(cfg.f1, cfg.f1 + 4.5, 4, 4, 6), bm);
      b.position.y = cfg.boltR * Math.cos(a); b.position.z = cfg.boltR * Math.sin(a);
    }
    addSpinner(p.spin, 'shaft');
    return p;
  }
  function buildTrackSprocket(id, station, ex, label) {
    const p = addPart(id, station, [0, 0], ex);
    const m = mat(p, COLORS.track, 0.35, 0.45);
    mesh(p, sprocketGeo(290, 20, 14, 20, 25.5, [{ n: 8, at: 86, r: 27 }]), m);
    addSpinner(p.spin, 'shaft');
    // ghosted track belt
    const gm = new THREE.MeshStandardMaterial({ color: 0x1b1f24, transparent: true, opacity: 0.2, roughness: 0.9, metalness: 0, depthWrite: false });
    p.mats.push(gm); gm.emissive = new THREE.Color(0x3b82f6); gm.emissiveIntensity = 0;
    const sh = new THREE.Shape();
    sh.moveTo(-160, 0); sh.absarc(0, 0, 160, Math.PI, Math.PI * 2, false); sh.lineTo(153, 0); sh.absarc(0, 0, 153, Math.PI * 2, Math.PI, true); sh.closePath();
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 34, bevelEnabled: false, curveSegments: 40 });
    bg.translate(0, 0, -17); bg.rotateY(Math.PI / 2);
    const belt = new THREE.Mesh(bg, gm); belt.renderOrder = 1; p.group.add(belt);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 190), gm); tail.position.set(0, -156.5, 95); tail.renderOrder = 1; p.group.add(tail);
    // lugs on belt
    for (let i = 0; i < 6; i++) {
      const lug = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 8), gm); lug.position.set(0, -150, 28 + i * 30); lug.renderOrder = 1; p.group.add(lug);
    }
    return p;
  }
  const hubCfg = { bossR: 25, b0: -24, b1: 10, flR: 38, f1: 20, boltR: 31, nb: 6 };
  buildHub('hubT1', 'T1', -50, hubCfg);
  buildHub('hubT2', 'T2', -60, hubCfg);
  buildTrackSprocket('trackSprocketT1', 'T1', 10);
  buildTrackSprocket('trackSprocketT2', 'T2', -5);

  /* ---------------- C sprocket and hub */
  {
    buildHub('hubC', 'C', 20, { bossR: 22, b0: -22, b1: 4, flR: 34, f1: 14, boltR: 26, nb: 5 });
    const p = addPart('sprocketC', 'C', [0, 0], 60);
    const m = mat(p, COLORS.sprocketC, 0.35, 0.4);
    mesh(p, sprocketGeo(197, 40, 6.5, 8, 22.5, [{ n: 6, at: 56, r: 11 }]), m);
    addSpinner(p.spin, 'shaft');
  }

  /* ---------------- D sprocket + motor */
  {
    const p = addPart('sprocketD', 'C', [D_B, D_A], 60);
    const m = mat(p, COLORS.sprocketD, 0.35, 0.4);
    mesh(p, sprocketGeo(60, 12, 5, 8, 9), m);
    const dm = mat(p, 0x2b3138, 0.85, 0.4);
    mesh(p, ringX(9, 15, 4, 14, 0.5), dm);
    const sm = mat(p, 0xcfd5db, 1.0, 0.25);
    mesh(p, cylX(4, 40, 9, 9, 32), sm);
    addSpinner(p.spin, 'D');
    p.group.userData.isD = true;
    // pre-bake: stored in plane (b=y, a=z)
    p.base = [D_B, D_A];

    const mo = addPart('motor', 'C', [D_B, D_A], 130);
    const bm = mat(mo, COLORS.motor, 0.55, 0.38);
    const dk = mat(mo, 0x2b3138, 0.8, 0.45);
    const fm = mat(mo, 0x39475f, 0.55, 0.45);
    mesh(mo, cylX(36, 46, 60, 60, 48), dk, mo.group);
    mesh(mo, cylX(46, 200, 52, 52, 56), bm, mo.group);
    for (let i = 0; i < 9; i++) mesh(mo, cylX(58 + i * 15, 61 + i * 15, 55, 55, 48), fm, mo.group);
    mesh(mo, cylX(200, 214, 50, 48, 48), dk, mo.group);
    const box = mesh(mo, new THREE.BoxGeometry(46, 26, 38), dk, mo.group); box.position.set(122, 64, 0);
    const gl = mesh(mo, new THREE.CylinderGeometry(6, 6, 14, 20), bm, mo.group); gl.position.set(122, 82, 0);
    const foot = mesh(mo, new THREE.BoxGeometry(120, 10, 100), dk, mo.group); foot.position.set(120, -55, 0);
    const disc = new THREE.Group(); mo.group.add(disc);
    mesh(mo, cylX(214, 218, 36, 36, 40), mat(mo, 0x3a424c, 0.8, 0.4), disc);
    const stripe = mesh(mo, new THREE.BoxGeometry(5, 7, 30), mat(mo, 0x93b1ff, 0.2, 0.5), disc); stripe.position.set(220, 18, 0);
    addSpinner(disc, 'D');
  }

  /* ---------------- chain */
  const chain = buildChainPath();
  const chainPart = addPart('chain', 'C', [0, 0], 60);
  const chainInstA = (() => {
    const N = 2 * Math.round(chain.total / 15.5 / 2), pitch = chain.total / N;
    const cm = mat(chainPart, COLORS.chain, 0.9, 0.35);
    const rm = mat(chainPart, COLORS.roller, 1.0, 0.3);
    const outer = new THREE.InstancedMesh(new THREE.BoxGeometry(11, pitch * 0.82, 6), cm, N / 2);
    const inner = new THREE.InstancedMesh(new THREE.BoxGeometry(8, pitch * 0.74, 5), cm, N / 2);
    const rollers = new THREE.InstancedMesh(cylX(-6, 6, 3.4, 3.4, 14), rm, N);
    [outer, inner, rollers].forEach((im) => { im.castShadow = true; im.receiveShadow = true; im.userData.partId = 'chain'; chainPart.group.add(im); pickables.push(im); im.frustumCulled = false; });
    return { N, pitch, outer, inner, rollers };
  })();
  const dummy = new THREE.Object3D();
  let chainOffset = 0;
  function updateChain() {
    const { N, pitch, outer, inner, rollers } = chainInstA;
    for (let i = 0; i < N; i++) {
      const s = chain.sample(i * pitch + pitch / 2 + chainOffset);
      dummy.position.set(0, s.b, s.a);
      dummy.rotation.set(Math.atan2(s.ta, s.tb), 0, 0);
      dummy.updateMatrix();
      (i % 2 === 0 ? outer : inner).setMatrixAt(i >> 1, dummy.matrix);
      const r = chain.sample(i * pitch + chainOffset);
      dummy.position.set(0, r.b, r.a); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      rollers.setMatrixAt(i, dummy.matrix);
    }
    outer.instanceMatrix.needsUpdate = inner.instanceMatrix.needsUpdate = rollers.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- labels, arrows */
  const labelSets = { chips: [], loads: [] };
  let forcesOn = false;
  function chip(text, parent, pos) {
    const d = document.createElement('div'); d.className = 'pfsh-chip'; d.textContent = text;
    const l = new CSS2DObject(d); l.position.set(...pos); parent.add(l); labelSets.chips.push(l); return l;
  }
  chip('A', parts.bearingA.group, [0, 76, 0]);
  chip('B', parts.bearingB.group, [0, 76, 0]);
  chip('T1', parts.trackSprocketT1.group, [0, 172, 0]);
  chip('T2', parts.trackSprocketT2.group, [0, 172, 0]);
  chip('C', parts.sprocketC.group, [0, 128, 0]);
  chip('D', parts.sprocketD.group, [0, 52, 0]);

  function makeArrow(parent, cls, color, text, dirArr, lenMM, tipArr, ahead = false) {
    const dir = new THREE.Vector3(...dirArr).normalize();
    const g = new THREE.Group();
    const head = 24, rad = 3;
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, emissive: color, emissiveIntensity: 0.3 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, lenMM - head, 14), m);
    shaft.position.y = -(lenMM - head) / 2 - head;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad * 2.6, head, 18), m);
    cone.position.y = -head / 2;
    g.add(shaft, cone);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.position.set(...tipArr);
    const d = document.createElement('div'); d.className = 'pfsh-tag ' + cls; d.textContent = text;
    const l = new CSS2DObject(d); l.position.set(0, ahead ? 20 : -lenMM - 10, 0); g.add(l);
    parent.add(g); labelSets.loads.push(g);
    return g;
  }
  const lenOf = (F) => 20 + F * 0.1;
  let loadsWanted = o.showLoads !== false;
  // CSS2DObject visibility is not inherited from its parent group, so set it on every descendant
  const setTree = (g, v) => g.traverse((ob) => { ob.visible = v; });
  function setLoadsVisible(v) { loadsWanted = v; labelSets.loads.forEach((g) => setTree(g, v && !forcesOn)); }
  function clearLoads() {
    labelSets.loads.forEach((g) => {
      g.children.slice().forEach((c) => g.remove(c));          // fires 'removed' on CSS2D labels so their DOM is cleaned
      g.traverse((ob) => { if (ob.geometry) ob.geometry.dispose(); if (ob.material) ob.material.dispose(); });
      if (g.parent) g.parent.remove(g);
    });
    labelSets.loads.length = 0;
  }
  function buildLoads() {
    clearLoads();
    const st = statics(cfgTarget === 0 ? 'A' : 'B');
    makeArrow(parts.trackSprocketT1.group, 'load', COLORS.load, '720N', [0, 0, 1], lenOf(720), [-6, -150, 0]);
    makeArrow(parts.trackSprocketT2.group, 'load', COLORS.load, '720N', [0, 0, 1], lenOf(720), [-6, -150, 0]);
    makeArrow(parts.sprocketC.group, 'load', COLORS.load, '2122N', [0, Math.sin(ANG), -Math.cos(ANG)], lenOf(2122), [
      16, (R_C + lenOf(2122)) * Math.sin(ANG) + 14, -(R_C + lenOf(2122)) * Math.cos(ANG)], true);
    makeArrow(parts.bearingA.group, 'react', COLORS.react, `R_A ≈ ${fmt(st.RA)}N`, [0, st.Av, -st.Ah], lenOf(st.RA), [0, 0, 0]);
    makeArrow(parts.bearingB.group, 'react', COLORS.react, `R_B ≈ ${fmt(st.RB)}N`, [0, st.Bv, -st.Bh], lenOf(st.RB), [0, 0, 0]);
    setLoadsVisible(loadsWanted);
  }
  buildLoads();

  /* dimension line C to D */
  const dimGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 1)]);
  const dimLine = new THREE.Line(dimGeo, new THREE.LineDashedMaterial({ color: 0x7a8497, dashSize: 10, gapSize: 7, transparent: true, opacity: 0.85 }));
  dimLine.frustumCulled = false;   // its 2 points are rewritten every frame, so a cached bounding sphere would be stale or NaN
  root.add(dimLine);
  const dimEl = document.createElement('div'); dimEl.className = 'pfsh-dim'; dimEl.textContent = 'about 410 to 490mm at 30°';
  const dimLabel = new CSS2DObject(dimEl); root.add(dimLabel);

  /* ---------------- power flow pulses (cobalt torque path) */
  const pulseTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const pulseGroup = new THREE.Group(); root.add(pulseGroup);
  const NP = 150, pulses = [];
  for (let i = 0; i < NP; i++) {
    const sm = new THREE.SpriteMaterial({ map: pulseTex, color: 0x1e48e0, transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending });
    const sp = new THREE.Sprite(sm); sp.renderOrder = 20; pulseGroup.add(sp); pulses.push(sp);
  }
  const flowGeo = new THREE.BufferGeometry().setFromPoints(new Array(6).fill(0).map(() => new THREE.Vector3()));
  const flowLine = new THREE.Line(flowGeo, new THREE.LineBasicMaterial({ color: 0x1e48e0, transparent: true, opacity: 0.55, depthTest: false }));
  flowLine.renderOrder = 19; flowLine.frustumCulled = false; pulseGroup.add(flowLine);
  let power = o.powerFlow !== false, powerK = power ? 1 : 0;
  pulseGroup.visible = power;

  const flowPts = Array.from({ length: 6 }, () => new THREE.Vector3());
  const cum = new Array(6).fill(0);
  function updatePulses(t) {
    const D = parts.sprocketD.group.position, C = parts.sprocketC.group.position;
    const t2 = parts.trackSprocketT2.group.position, t1 = parts.trackSprocketT1.group.position;
    flowPts[0].set(D.x, D.y, D.z);
    flowPts[1].set(D.x, D.y + (chain.Q1[1] - D_B), D.z + (chain.Q1[0] - D_A));
    flowPts[2].set(C.x, C.y + chain.Q2[1], C.z + chain.Q2[0]);
    flowPts[3].set(C.x, C.y, C.z);
    flowPts[4].set(t2.x, 0, 0); flowPts[5].set(t1.x, 0, 0);
    for (let i = 1; i < 6; i++) cum[i] = cum[i - 1] + flowPts[i].distanceTo(flowPts[i - 1]);
    const tot = cum[5], pos = flowLine.geometry.attributes.position;
    for (let i = 0; i < 6; i++) pos.setXYZ(i, flowPts[i].x, flowPts[i].y, flowPts[i].z);
    pos.needsUpdate = true;
    const dark = theme === 'dark';
    for (let i = 0; i < NP; i++) {
      const d = (i / (NP - 1)) * tot;
      let k = 1; while (k < 5 && cum[k] < d) k++;
      const f = (d - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]);
      const sp = pulses[i];
      sp.position.lerpVectors(flowPts[k - 1], flowPts[k], f);
      const wave = Math.pow(Math.max(0, Math.sin(((d / 210) - t * 1.1) * Math.PI * 2)), 2);
      const half = k >= 5;                         // T2 to T1 carries T/2
      const base = half ? 15 : 24;
      sp.scale.setScalar(base * (0.45 + 1.0 * wave));
      sp.material.opacity = (0.25 + 0.75 * wave) * powerK * (dark ? 0.7 : 0.95);
      sp.material.color.set(half ? (dark ? 0x93b1ff : 0x5c82f2) : (dark ? 0x7f9cff : 0x1e48e0));
    }
    flowLine.material.color.set(dark ? 0x7f9cff : 0x1e48e0);
    flowLine.material.opacity = 0.5 * powerK;
    // dim line
    const a = parts.sprocketC.group.position, b = parts.sprocketD.group.position;
    const arr = dimLine.geometry.attributes.position;
    arr.setXYZ(0, a.x, a.y, a.z); arr.setXYZ(1, b.x, b.y, b.z); arr.needsUpdate = true;
    dimLine.computeLineDistances();
    dimLabel.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 22, (a.z + b.z) / 2);
  }

  /* ---------------- explode / config transforms */
  let exUser = Math.min(1, Math.max(0, +o.explode || 0)), exTarget = exUser, exCur = exTarget;
  function applyTransforms() {
    const te = ease(exCur), k = ease(cfgK);
    const xC = 460 + (400 - 460) * k, xB = 400 + (460 - 400) * k;
    const st = { A: POS.A, T1: POS.T1, T2: POS.T2, C: xC, B: xB };
    for (const id in parts) {
      const p = parts[id];
      p.group.position.set(st[p.station] + p.ex * te, p.base[0] + p.ey * te, p.base[1] + p.ez * te);
    }
  }

  /* ---------------- highlight */
  let selected = null, hovered = null;
  function refreshGlow() {
    for (const id in parts) {
      const lv = id === selected ? 0.55 : id === hovered ? 0.3 : 0;
      parts[id].mats.forEach((m) => { m.emissiveIntensity = lv; });
    }
    poke();
  }

  /* ---------------- picking */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = dom.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.partId : null;
  }
  let selectCb = null, down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
    if (moved > 5 || forcesOn) return;
    const id = pick(e.clientX, e.clientY);
    selected = id; refreshGlow();
    if (selectCb) selectCb(id);
  };
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (e.buttons || forcesOn) { tip.style.display = 'none'; return; }
    const id = pick(e.clientX, e.clientY);
    if (id !== hovered) { hovered = id; refreshGlow(); dom.style.cursor = id ? 'pointer' : 'grab'; }
    if (id) {
      const r = container.getBoundingClientRect();
      tip.textContent = PART_INFO[id].name; tip.style.display = 'block';
      tip.style.left = e.clientX - r.left + 'px'; tip.style.top = e.clientY - r.top + 'px';
    } else tip.style.display = 'none';
  };
  const onLeave = () => { hovered = null; refreshGlow(); tip.style.display = 'none'; };
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerleave', onLeave);
  dom.style.cursor = 'grab';

  /* ---------------- sizing + view */
  let camAnim = null;
  function resetView() {
    camAnim = null; camera.fov = 36; camera.updateProjectionMatrix();
    const asp = camera.aspect || 1.6;
    const dist = 13.2 * 0.92 * Math.max(1, 1.5 / asp);
    controls.target.set(0.35, 0.3, -1.0);
    camera.position.set(0.35 + dist * 0.42, 0.3 + dist * 0.34, -1.0 + dist * 0.84);
    controls.update();
  }
  // snap views: animated camera moves around the same target
  const VIEWS = {
    iso:    [0.42, 0.34, 0.84],
    front:  [0, 0.0001, 1],      // side elevation, shaft runs across the screen
    end:    [1, 0.0001, 0.0001], // look along the shaft axis: see the 30 degree chain line
    top:    [0, 1, 0.0001],
    forces: [1, 0.0001, 0.0001]  // end view + free-body force diagram, near-orthographic lens
  };
  const BASE_TGT = [0.35, 0.3, -1.0];
  const VIEW_TGT = { forces: [-0.6, -0.1, -0.95] };
  const VIEW_FOV = { forces: 8 };
  let viewName = 'iso';

  /* ---------------- forces view (free-body diagram, drawn in root space, mm) */
  // Conventions: x along the shaft, up = +y, forward = -z (from C towards D horizontally).
  // P(x, h, v): h = horizontal, forward positive; v = vertical, up positive.
  const P = (x, h, v) => new THREE.Vector3(x, v, -h);
  const FK = 0.26;                                   // mm of arrow per newton
  const forcesGroup = new THREE.Group(); forcesGroup.visible = false; root.add(forcesGroup);
  const ghostSaved = new Map();
  function disposeForces() {
    forcesGroup.traverse((ob) => { if (ob.geometry) ob.geometry.dispose(); if (ob.material) ob.material.dispose(); });
    while (forcesGroup.children.length) forcesGroup.remove(forcesGroup.children[0]);
  }
  function buildForces() {
    disposeForces();
    const G = forcesGroup;
    const st = statics(cfgTarget === 0 ? 'A' : 'B');
    const xC = st.xC, xB = st.xB;
    const dark = theme === 'dark';
    const Y = new THREE.Vector3(0, 1, 0);
    const matOf = (c) => new THREE.MeshBasicMaterial({ color: c });
    const mRed = matOf(COLORS.load), mGrn = matOf(dark ? 0x6f8dff : COLORS.react), mDark = matOf(dark ? 0x8a98b5 : 0x334155);
    const solid = (from, to, m, rad = 3.6) => {
      const d = to.clone().sub(from), len = d.length(), head = Math.min(30, len * 0.4);
      const g = new THREE.Group();
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len - head, 12), m); sh.position.y = (len - head) / 2;
      const cn = new THREE.Mesh(new THREE.ConeGeometry(rad * 2.8, head, 16), m); cn.position.y = len - head / 2;
      g.add(sh, cn); g.quaternion.setFromUnitVectors(Y, d.normalize()); g.position.copy(from); G.add(g);
    };
    const dashed = (from, to, m, rad = 1.8) => {
      const d = to.clone().sub(from), len = d.length(), dir = d.clone().normalize(), head = 16;
      const g = new THREE.Group(); const dash = 13, gap = 9; const lim = len - head;
      for (let t = 0; t < lim; t += dash + gap) {
        const l = Math.min(dash, lim - t);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, l, 8), m); c.position.y = t + l / 2; g.add(c);
      }
      const cn = new THREE.Mesh(new THREE.ConeGeometry(rad * 3.4, head, 12), m); cn.position.y = len - head / 2; g.add(cn);
      g.quaternion.setFromUnitVectors(Y, dir); g.position.copy(from); G.add(g);
    };
    const arc = (x, r, a0, a1, m) => {
      const pts = []; for (let i = 0; i <= 24; i++) { const a = a0 + (a1 - a0) * i / 24; pts.push(P(x, r * Math.cos(a), r * Math.sin(a))); }
      G.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 1.6, 6, false), m));
    };
    // text is [main, long?, detail?]; long and detail parts are hidden on narrow stages so labels never crowd the diagram
    const lab = (pos, anchor, text, cls) => {
      const el = document.createElement('div'); el.className = 'pfsh-fl ' + anchor + (cls.indexOf('pfsh-dim') >= 0 ? ' pfsh-fl--dim' : '');
      const sp = document.createElement('span'); const t = document.createElement('div'); t.className = cls; t.style.whiteSpace = 'pre';
      const parts3 = Array.isArray(text) ? text : [text];
      t.appendChild(document.createTextNode(parts3[0]));
      if (parts3[1]) { const lg = document.createElement('span'); lg.className = 'pfsh-long'; lg.textContent = parts3[1]; t.appendChild(lg); }
      if (parts3[2]) { const dt = document.createElement('span'); dt.className = 'pfsh-long'; dt.textContent = '\n' + parts3[2]; t.appendChild(dt); }
      sp.appendChild(t); el.appendChild(sp);
      const o2 = new CSS2DObject(el); o2.position.copy(pos); G.add(o2);
    };
    const rad = (d) => d * Math.PI / 180;
    const k = FK;
    // thin shaft line
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 530, 8), mDark); sl.rotation.z = Math.PI / 2; sl.position.set(235, 0, 0); G.add(sl);
    // track pulls at T1 and T2 (staggered 36mm so the two arrows do not hide each other end-on)
    [['T1', 50, -127], ['T2', 350, -163]].forEach(([n, x, v]) => {
      solid(P(x, 0, v), P(x, -LD.T * k, v), mRed);
      lab(P(x, 0, v), 'r', [n + ': 720N', ', horizontal, rearward'], 'pfsh-tag load');
    });
    // chain pull at C
    solid(P(xC, 0, 0), P(xC, LD.chH * k, LD.chV * k), mRed, 4.2);
    lab(P(xC, LD.chH * k, LD.chV * k), 'l', ['Chain pull 2122N', ' along the 30° line, towards D'], 'pfsh-tag load');
    dashed(P(xC, 0, 0), P(xC, LD.chH * k, 0), mRed);
    dashed(P(xC, LD.chH * k, 0), P(xC, LD.chH * k, LD.chV * k), mRed);
    lab(P(xC, LD.chH * k * 0.62, 0), 't', 'H 1838N forward', 'pfsh-dim');
    lab(P(xC, LD.chH * k, LD.chV * k / 2), 'r', 'V 1061N up', 'pfsh-dim');
    arc(xC, 150, 0, rad(30), mRed);
    lab(P(xC, 178 * Math.cos(rad(15)), 178 * Math.sin(rad(15))), 'r', '30°', 'pfsh-dim');
    // bearing reactions: each bearing reacts in BOTH planes, so the resultant is angled
    const reaction = (name, x, h, v, res, arcR) => {
      solid(P(x, 0, 0), P(x, h * k, v * k), mGrn, 4.2);
      dashed(P(x, 0, 0), P(x, h * k, 0), mGrn);
      dashed(P(x, h * k, 0), P(x, h * k, v * k), mGrn);
      const acute = Math.atan(Math.round(Math.abs(v)) / Math.round(Math.abs(h)));
      const a0 = h >= 0 ? 0 : Math.PI, rot = (h > 0 ? 1 : -1) * (v > 0 ? 1 : -1) * acute;
      const hd = h >= 0 ? 'forward' : 'rear', vd = v >= 0 ? 'up' : 'down', side = v >= 0 ? 'above' : 'below';
      lab(P(x, h * k, v * k), v >= 0 ? 't' : 'b',
        [`${name} = ${fmt(res)}N`, ` at ${fmt(acute * 180 / Math.PI, 1)}° ${side} horizontal`, `(H ${fmt(Math.abs(h))}N ${hd}, V ${fmt(Math.abs(v))}N ${vd})`], 'pfsh-tag react');
      arc(x, arcR, a0, a0 + rot, mGrn);
      const am = a0 + rot / 2;
      lab(P(x, (arcR + 9) * Math.cos(am), (arcR + 9) * Math.sin(am)), h >= 0 ? 'r' : 'l', fmt(acute * 180 / Math.PI, 1) + '°', 'pfsh-dim');
    };
    reaction('R_A', 0, st.Ah, st.Av, st.RA, 200);
    reaction('R_B', xB, st.Bh, st.Bv, st.RB, 110);
  }
  function setGhost(on) {
    if (on) {
      for (const id in parts) parts[id].mats.forEach((m) => {
        if (!ghostSaved.has(m)) ghostSaved.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
        m.transparent = true; m.opacity = 0.12; m.depthWrite = false; m.needsUpdate = true;
      });
    } else {
      ghostSaved.forEach((v, m) => { m.transparent = v.transparent; m.opacity = v.opacity; m.depthWrite = v.depthWrite; m.needsUpdate = true; });
      ghostSaved.clear();
    }
  }
  function setForces(on) {
    if (on === forcesOn) return;
    forcesOn = on;
    setGhost(on);
    if (on) buildForces(); else disposeForces();
    forcesGroup.visible = on;
    labelSets.loads.forEach((g) => setTree(g, on ? false : loadsWanted));
    labelSets.chips.forEach((c) => (c.visible = !on));
    dimLine.visible = !on; dimLabel.visible = !on;
    if (on) { selected = null; hovered = null; refreshGlow(); tip.style.display = 'none'; }
    exTarget = on ? 0 : exUser; if (on) exCur = 0;
  }
  function setView(name, immediate = false) {
    const k = VIEWS[name] ? name : 'iso';
    viewName = k;
    setForces(k === 'forces');
    const v = VIEWS[k];
    const fov = VIEW_FOV[k] || 36;
    const asp = camera.aspect || 1.6;
    const aspF = k === 'forces' ? Math.max(1, Math.pow(1.6 / asp, 1.0)) : Math.max(1, 1.5 / asp);
    const dist = 13.2 * aspF * Math.tan(THREE.MathUtils.degToRad(18)) / Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (k === 'forces' ? 0.95 : 0.92);
    const tgt = new THREE.Vector3(...(VIEW_TGT[k] || BASE_TGT));
    const n = new THREE.Vector3(v[0], v[1], v[2]).normalize();
    const to = tgt.clone().addScaledVector(n, dist);
    if (immediate || reduced) {
      camAnim = null; camera.position.copy(to); controls.target.copy(tgt); camera.fov = fov; camera.updateProjectionMatrix();
      controls.update(); updateFloor(); poke(); return;
    }
    camAnim = { t0: null, from: camera.position.clone(), fromT: controls.target.clone(), fromFov: camera.fov, to, toT: tgt, toFov: fov };
    poke();
  }
  function updateFloor() { const below = camera.position.y < GROUND_Y + 0.05 || forcesOn; ground.visible = !below; if (grid) grid.visible = !below; }
  function resize() {
    const w = Math.max(10, container.clientWidth), h = Math.max(10, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    poke();
  }
  resize(); resetView();
  const ro = new ResizeObserver(() => { resize(); if (!camAnim && viewName === 'iso' && !userMoved) resetView(); });
  ro.observe(container);
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });

  /* keyboard orbit: arrows rotate, plus and minus zoom, Home resets (A4) */
  const onKey = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = Math.PI / 18;
    const off = camera.position.clone().sub(controls.target);
    const sp = new THREE.Spherical().setFromVector3(off);
    switch (e.key) {
      case 'ArrowLeft': sp.theta -= step; break;
      case 'ArrowRight': sp.theta += step; break;
      case 'ArrowUp': sp.phi = Math.max(0.05, sp.phi - step); break;
      case 'ArrowDown': sp.phi = Math.min(Math.PI - 0.05, sp.phi + step); break;
      case '+': case '=': sp.radius = Math.max(3, sp.radius * 0.9); break;
      case '-': case '_': sp.radius = Math.min(160, sp.radius * 1.1); break;
      case 'Home': e.preventDefault(); userMoved = false; resetView(); setView(viewName, true); return;
      default: return;
    }
    e.preventDefault(); userMoved = true; camAnim = null;
    off.setFromSpherical(sp); camera.position.copy(controls.target).add(off);
    controls.update(); updateFloor(); poke();
  };
  dom.addEventListener('keydown', onKey);

  /* label collisions: nudge floating labels apart so no two ever overlap (V4) */
  const LABEL_GAP = 14;
  function resolveLabels() {
    const host = labelRenderer.domElement;
    const kids = Array.from(host.children);
    kids.forEach((el) => { el.style.translate = ''; });
    const hostR = host.getBoundingClientRect();
    const items = [];
    kids.forEach((el) => {
      if (el.style.display === 'none') return;
      const box = el.classList.contains('pfsh-fl') ? (el.querySelector('.pfsh-tag,.pfsh-dim') || el) : el;
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      items.push({ el, l: r.left, r: r.right, t: r.top, b: r.bottom, fixed: el.classList.contains('pfsh-chip'), dy: 0 });
    });
    /* the view tabs, legend and readouts float over the stage, so labels route around them too */
    container.querySelectorAll('.pfsh-views .pfsh-seg,.pfsh-key,.pfsh-live,.pfsh-info').forEach((el) => {
      if (el.hidden || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) items.push({ el, l: r.left, r: r.right, t: r.top, b: r.bottom, fixed: true, dy: 0, obstacle: true });
    });
    items.sort((a, b) => a.t - b.t);
    /* the round part chips never move, so seat them first and let every label route around them */
    const placed = items.filter((it) => it.fixed);
    for (const it of items) {
      if (!it.fixed) {
        let moved = true, guard = 0;
        while (moved && guard++ < 8) {
          moved = false;
          for (const o of placed) {
            const hOver = it.l < o.r + 6 && it.r > o.l - 6;
            if (!hOver) continue;
            const gap = o.fixed || it.fixed ? 6 : LABEL_GAP;
            const top = it.t + it.dy, bot = it.b + it.dy;
            if (top < o.b + o.dy + gap && bot > o.t + o.dy - gap) {
              it.dy = Math.min(140, o.b + o.dy + gap - it.t);
              moved = true;
            }
          }
        }
        const over = it.b + it.dy - (hostR.bottom - 6);
        if (over > 0) it.dy = Math.max(0, it.dy - over);
        if (it.dy) it.el.style.translate = '0 ' + it.dy.toFixed(1) + 'px';
        placed.push(it);
      }
    }
  }
  let lblSig = '';

  /* ---------------- loop */
  let angShaft = 0, angD = 0;
  function frame(now) {
    if (disposed || !visible) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    try {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      if (!reduced) time += dt;
      const sm = reduced ? 1 : 1 - Math.exp(-dt * 6);
      exCur += (exTarget - exCur) * sm; if (Math.abs(exTarget - exCur) < 1e-4) exCur = exTarget;
      const kc = reduced ? 1 : 1 - Math.exp(-dt * 4.5);
      cfgK += (cfgTarget - cfgK) * kc; if (Math.abs(cfgTarget - cfgK) < 1e-4) cfgK = cfgTarget;
      const kp = reduced ? 1 : 1 - Math.exp(-dt * 3);
      powerK += ((power ? 1 : 0) - powerK) * kp; if (Math.abs((power ? 1 : 0) - powerK) < 1e-3) powerK = power ? 1 : 0;
      const w = reduced ? 0 : OMEGA_SHAFT * powerK;
      angShaft += w * dt; angD += w * RATIO * dt;
      const angs = { shaft: angShaft, D: angD, cage: angShaft * 0.42 };
      spinners.forEach(({ obj, k }) => { obj.rotation.x = -angs[k]; });
      if (w > 0) { chainOffset += w * R_C * dt; updateChain(); }
      applyTransforms();
      pulseGroup.visible = powerK > 0.001 && !forcesOn;
      updatePulses(time);
      let animating = exCur !== exTarget || cfgK !== cfgTarget || powerK !== (power ? 1 : 0);
      if (camAnim) {
        animating = true;
        if (camAnim.t0 === null) camAnim.t0 = now;
        const t = Math.min(1, (now - camAnim.t0) / 700);   // wall-clock, not frame-count, so slow frames still finish
        const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
        camera.position.lerpVectors(camAnim.from, camAnim.to, e);
        controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e);
        camera.fov = camAnim.fromFov + (camAnim.toFov - camAnim.fromFov) * e; camera.updateProjectionMatrix();
        if (t >= 1) camAnim = null;
      }
      updateFloor();
      dirty = false;
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      const sig = camera.position.x.toFixed(2) + camera.position.y.toFixed(2) + camera.position.z.toFixed(2) + camera.fov.toFixed(1) + container.clientWidth + 'x' + container.clientHeight +
        exCur.toFixed(3) + cfgK.toFixed(3) + (forcesOn ? 'f' : 'i') + (loadsWanted ? 'l' : 'n') + labelRenderer.domElement.children.length;
      if (sig !== lblSig) { lblSig = sig; resolveLabels(); }
      // reduced motion: render on demand only, so the loop idles once nothing is changing
      if (reduced && !animating && !dirty) { cancelAnimationFrame(raf); raf = 0; }
    } catch (err) {
      disposed = true; cancelAnimationFrame(raf); raf = 0;
      if (o.onFail) o.onFail(err);
    }
  }
  function start() { if (!raf && !disposed && ready && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function poke() { dirty = true; start(); }
  let inView = true;
  const syncVisible = () => { visible = inView && !document.hidden; if (visible) start(); };
  const io = new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; syncVisible(); }, { threshold: 0.01 });
  io.observe(container);
  const onVis = () => syncVisible();
  document.addEventListener('visibilitychange', onVis);
  const onLost = (e) => { e.preventDefault(); disposed = true; if (o.onFail) o.onFail(new Error('webgl context lost')); };
  dom.addEventListener('webglcontextlost', onLost);

  applyTheme(); updateChain(); applyTransforms(); updatePulses(time);
  ready = true; start();

  /* ---------------- API */
  const stNow = () => statics(cfgTarget === 0 ? 'A' : 'B');
  return {
    setExplode(t, immediate = false) { exUser = Math.min(1, Math.max(0, +t || 0)); if (!forcesOn) { exTarget = exUser; if (immediate) exCur = exTarget; } poke(); },
    setConfig(c, immediate = false) {
      cfgTarget = c === 'A' ? 0 : 1; if (immediate) cfgK = cfgTarget;
      buildLoads(); if (forcesOn) buildForces(); poke();
    },
    setPowerFlow(b) { power = !!b; poke(); },
    setLoads(b) { setLoadsVisible(!!b); poke(); },
    setTheme(t) { theme = t === 'dark' ? 'dark' : 'light'; applyTheme(); if (forcesOn) buildForces(); },
    highlight(id) { selected = id && parts[id] ? id : null; refreshGlow(); },
    onSelect(cb) { selectCb = cb; },
    getInfo(id) {
      const p = PART_INFO[id]; if (!p) return null; const st = stNow();
      return { name: p.name, role: p.role, keyNumbers: p.keyNumbers(st) };
    },
    getStatics: stNow,
    resetView() { userMoved = false; resetView(); setView(viewName, true); },
    setView,
    get view() { return viewName; },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); raf = 0;
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('wheel', onWheel); dom.removeEventListener('webglcontextlost', onLost); dom.removeEventListener('keydown', onKey);
      controls.dispose();
      clearLoads(); disposeForces();
      scene.traverse((ob) => {
        if (ob.geometry) ob.geometry.dispose();
        if (ob.material) (Array.isArray(ob.material) ? ob.material : [ob.material]).forEach((m) => m.dispose());
      });
      pulseTex.dispose(); envTex.dispose(); pmrem.dispose(); renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      dom.remove(); labelRenderer.domElement.remove(); tip.remove();
    }
  };
}

/* ------------------------------------------------------------------ panel UI + mount */
const VIEW_LIST = [['iso', 'Assembly'], ['front', 'Side'], ['end', 'End'], ['top', 'Top'], ['forces', 'Forces']];
const CAPS = {
  iso: 'Exploded view of the track drive shaft. Torque enters at sprocket C and splits to the two track sprockets. Drag to orbit and tap any part for its role.',
  front: 'Side elevation. Bearing A supports the outboard end, the two track sprockets sit between the supports and the chain drives sprocket C.',
  end: 'Looking down the shaft axis. The chain runs from the motor sprocket D to sprocket C along a 30° line of centres.',
  top: 'Plan view of the same assembly. Switch the layout to watch sprocket C and bearing B swap places.'
};
const CFG_NOTE = { A: 'C overhangs bearing B', B: 'C sits between the bearings' };
let uidCounter = 0;

const TEMPLATE = (id) => `
  <div class="pfsh-stage">
    <div class="pfsh-views"><div class="pfsh-seg" role="group" aria-label="Camera view">
      ${VIEW_LIST.map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="false">${l}</button>`).join('')}
    </div></div>
    <div class="pfsh-live" data-live><i></i><span>915RPM · 209Nm</span><small>shaft</small></div>
    <div class="pfsh-key" data-key hidden><span class="l"><i></i>Loads</span><span class="r"><i></i>Reactions</span></div>
    <div class="pfsh-info" data-info hidden role="status"><button type="button" data-close aria-label="Close part details">×</button><h4></h4><p></p><ul></ul></div>
  </div>
  <div class="pfsh-bmd" data-bmd hidden><svg role="img" aria-label="Resultant bending moment diagram along the shaft"></svg></div>
  <div class="pfsh-controls">
    <div class="pfsh-explode">
      <label for="pfsh-ex-${id}">Explode</label>
      <input id="pfsh-ex-${id}" class="pfsh-range" type="range" min="0" max="100" value="0" step="1" aria-label="Explode the assembly along the shaft axis">
      <button type="button" class="pfsh-btn" data-explode>Explode</button>
    </div>
    <div class="pfsh-toggles">
      <button type="button" class="pfsh-tgl" data-power aria-pressed="true"><i></i>Power flow</button>
      <button type="button" class="pfsh-tgl" data-loads aria-pressed="true"><i></i>Loads</button>
      <div class="pfsh-seg" role="group" aria-label="Bearing layout">
        <button type="button" data-cfg="A" aria-pressed="false" title="Config A: sprocket C overhangs bearing B">Config A</button>
        <button type="button" data-cfg="B" aria-pressed="true" title="Config B: sprocket C sits between the bearings">Config B</button>
      </div>
    </div>
  </div>
  <div class="pfsh-train" role="group" aria-label="Drive train: 20kW motor at 3000RPM stepped down 3.28:1 to a 915RPM shaft carrying 209Nm">
    <div class="pfsh-cell"><small>Motor</small><b>3000<em>RPM</em></b><span>63.7Nm · 20kW</span></div>
    <div class="pfsh-ratio"><span>3.28:1</span><svg viewBox="0 0 9 10" aria-hidden="true"><path d="M1 1l6 4-6 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="pfsh-cell out"><small>Track shaft</small><b>915<em>RPM</em></b><span>209Nm · 50km/h</span></div>
  </div>
  <div class="pfsh-foot">
    <p class="pfsh-cap" data-cap></p>
    <a class="pfsh-link" href="${GUIDE_URL}" target="_blank" rel="noopener noreferrer">Explore the live design guide <span aria-hidden="true">↗</span></a>
  </div>`;

const FALLBACK_SVG = `
<svg viewBox="0 0 640 250" role="img" aria-label="Schematic of the drive shaft with two bearings, two track sprockets and a chain sprocket" fill="none" stroke="currentColor">
  <rect x="40" y="119" width="540" height="14" rx="7" fill="currentColor" fill-opacity=".18" stroke-opacity=".7" stroke-width="1.5"/>
  <g stroke-width="1.5" stroke-opacity=".8">
    <rect x="62" y="98" width="34" height="56" rx="8" fill="currentColor" fill-opacity=".08"/>
    <rect x="518" y="98" width="34" height="56" rx="8" fill="currentColor" fill-opacity=".08"/>
    <circle cx="150" cy="126" r="58"/><circle cx="150" cy="126" r="62" stroke-width="8" stroke-dasharray="5 6" stroke-opacity=".4"/><circle cx="150" cy="126" r="14"/>
    <circle cx="320" cy="126" r="58"/><circle cx="320" cy="126" r="62" stroke-width="8" stroke-dasharray="5 6" stroke-opacity=".4"/><circle cx="320" cy="126" r="14"/>
  </g>
  <g style="stroke:var(--p-acc-t)" stroke-width="2">
    <circle cx="438" cy="126" r="38"/><circle cx="438" cy="126" r="42" stroke-width="6" stroke-dasharray="3 4" stroke-opacity=".5"/>
    <circle cx="590" cy="42" r="14"/><path d="M425 90 L580 30 M453 94 L601 54" stroke-opacity=".7"/>
  </g>
  <g font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="600" fill="currentColor" stroke="none" text-anchor="middle">
    <text x="79" y="178">A</text><text x="535" y="178">B</text><text x="150" y="208">T1</text><text x="320" y="208">T2</text>
    <text x="438" y="184" style="fill:var(--p-acc-t)">C</text><text x="590" y="70" style="fill:var(--p-acc-t)">D</text>
  </g>
</svg>
<p>The interactive 3D model needs WebGL. Schematic shown instead: motor sprocket D drives sprocket C by chain at 3.28:1, and the shaft carries 209Nm to the two track sprockets.</p>`;

export function mount(container, opts = {}) {
  const o = Object.assign({ theme: 'light', reducedMotion: false, config: 'B', view: 'iso', explode: 0 }, opts || {});
  let theme = o.theme === 'dark' ? 'dark' : 'light';
  const reduced = !!o.reducedMotion;
  let root = null, core = null, renderer = null, ro2 = null, tweenRaf = 0, disposed = false, failed = false;
  const state = { view: 'iso', cfg: o.config === 'A' ? 'A' : 'B', power: true, loads: true };
  const listeners = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); listeners.push(() => el.removeEventListener(ev, fn, opt)); };

  function showFallback(err) {
    if (failed || disposed) return;
    failed = true;
    if (err) console.warn('[show-shaft] 3D unavailable, showing static schematic:', err && err.message ? err.message : err);
    try { cancelAnimationFrame(tweenRaf); } catch (e) { /* ignore */ }
    try { if (core) core.dispose(); } catch (e) { /* ignore */ }
    try { if (renderer && !core) { renderer.dispose(); } } catch (e) { /* ignore */ }
    core = null;
    if (!root) {
      container.textContent = '';
      const p = document.createElement('p');
      p.textContent = 'Drive-shaft showcase unavailable in this browser. Live guide: ' + GUIDE_URL;
      container.appendChild(p);
      return;
    }
    root.classList.add('pfsh-fallback');
    const stage = root.querySelector('.pfsh-stage');
    stage.textContent = '';
    const fb = document.createElement('div'); fb.className = 'pfsh-fb'; fb.innerHTML = FALLBACK_SVG; stage.appendChild(fb);
    const cap = root.querySelector('[data-cap]'); if (cap) cap.textContent = 'Electric snowmobile track drive shaft: 20kW at 3000RPM in, stepped down 3.28:1 to a 915RPM shaft carrying 209Nm.';
  }

  try {
    injectCss();
    const id = ++uidCounter;
    root = document.createElement('div');
    root.className = 'pfsh';
    root.setAttribute('data-theme', theme);
    if (reduced) root.setAttribute('data-reduced', '');
    root.innerHTML = TEMPLATE(id);
    container.appendChild(root);
    const q = (s) => root.querySelector(s);
    const qa = (s) => Array.from(root.querySelectorAll(s));
    const stage = q('.pfsh-stage');

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    core = initCore(stage, { theme, reducedMotion: reduced, config: state.cfg, explode: o.explode, onFail: showFallback }, renderer);

    const range = q('.pfsh-range'), exBtn = q('[data-explode]'), powerBtn = q('[data-power]'), loadsBtn = q('[data-loads]');
    const live = q('[data-live]'), key = q('[data-key]'), info = q('[data-info]'), bmd = q('[data-bmd]'), cap = q('[data-cap]');
    const cfgBtns = qa('[data-cfg]'), viewBtns = qa('[data-view]');

    /* explode slider + button (the button tweens the slider so thumb and model move together) */
    const setRange = (v) => { range.value = String(Math.round(v)); range.style.setProperty('--v', range.value + '%'); exBtn.textContent = +range.value > 50 ? 'Assemble' : 'Explode'; core.setExplode(+range.value / 100); };
    on(range, 'input', () => { cancelAnimationFrame(tweenRaf); setRange(+range.value); });
    on(exBtn, 'click', () => {
      const from = +range.value, to = from > 50 ? 0 : 100;
      cancelAnimationFrame(tweenRaf);
      if (reduced) { setRange(to); return; }
      const t0 = performance.now(), dur = 900;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        setRange(from + (to - from) * e);
        if (t < 1) tweenRaf = requestAnimationFrame(step);
      };
      tweenRaf = requestAnimationFrame(step);
    });

    /* power / loads / config */
    const syncLive = () => { live.hidden = !state.power || state.view === 'forces'; };
    on(powerBtn, 'click', () => { state.power = !state.power; powerBtn.setAttribute('aria-pressed', String(state.power)); core.setPowerFlow(state.power); syncLive(); });
    on(loadsBtn, 'click', () => { state.loads = !state.loads; loadsBtn.setAttribute('aria-pressed', String(state.loads)); core.setLoads(state.loads); });
    cfgBtns.forEach((b) => on(b, 'click', () => applyConfig(b.dataset.cfg)));
    function applyConfig(c) {
      state.cfg = c === 'A' ? 'A' : 'B';
      cfgBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cfg === state.cfg)));
      core.setConfig(state.cfg);
      if (state.view === 'forces') drawBmd();
      updateCaption();
      hideInfo();
    }

    /* part info card */
    function hideInfo() { info.hidden = true; root.classList.remove('pfsh-has-info'); core.highlight(null); }
    function showInfo(partId) {
      const d = partId && core.getInfo(partId);
      if (!d) { info.hidden = true; root.classList.remove('pfsh-has-info'); return; }
      info.querySelector('h4').textContent = d.name;
      info.querySelector('p').textContent = d.role;
      const ul = info.querySelector('ul'); ul.textContent = '';
      d.keyNumbers.slice(0, 3).forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      info.hidden = false; root.classList.add('pfsh-has-info');
    }
    core.onSelect(showInfo);
    on(info.querySelector('[data-close]'), 'click', hideInfo);

    /* bending moment strip (forces view) */
    function drawBmd() {
      const svg = bmd.querySelector('svg');
      const W = Math.max(200, Math.round(svg.getBoundingClientRect().width)), H = 104;
      const st = core.getStatics();
      const padL = 6, padR = 6, base = H - 24, top = 26, MAXM = Math.max(40, st.peak * 1.22);
      const X = (x) => padL + (x / 500) * (W - padL - padR), Y = (m) => base - (m / MAXM) * (base - top);
      let line = '';
      for (let x = 0; x <= 500; x += 4) line += (x ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(st.M(x)).toFixed(1) + ' ';
      const area = line + `L${X(500).toFixed(1)} ${base} L${X(0).toFixed(1)} ${base} Z`;
      const px = X(st.peakX), py = Y(st.peak), left = px < W * 0.62;
      const ticks = Object.keys(st.stations).map((k) => {
        const x = X(st.stations[k]);
        return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${base}" y2="${base + 5}" stroke="currentColor" stroke-opacity=".5"/><text x="${x.toFixed(1)}" y="${base + 17}" text-anchor="middle">${k}</text>`;
      }).join('');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML =
        `<text x="${padL}" y="11">Resultant bending moment along the shaft</text>` +
        `<path d="${area}" style="fill:var(--p-acc-t);fill-opacity:.16"/>` +
        `<path d="${line}" fill="none" style="stroke:var(--p-acc-t)" stroke-width="2" stroke-linejoin="round"/>` +
        `<line x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}" stroke="currentColor" stroke-opacity=".35" style="color:var(--p-mute)"/>` +
        `<g style="color:var(--p-mute)">${ticks}</g>` +
        `<line x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${py.toFixed(1)}" y2="${base}" stroke-dasharray="3 3" style="stroke:var(--p-acc-t)" stroke-opacity=".6"/>` +
        `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" style="fill:var(--p-acc-t);stroke:var(--p-card)" stroke-width="2"/>` +
        `<text class="pk" x="${(left ? px + 10 : px - 10).toFixed(1)}" y="${(py - 6).toFixed(1)}" text-anchor="${left ? 'start' : 'end'}">${st.peak.toFixed(1)}Nm${st.peakAt ? ' at ' + st.peakAt : ''}</text>`;
    }

    /* views */
    function updateCaption() {
      if (state.view === 'forces') {
        const st = core.getStatics();
        cap.textContent = `Free-body diagram, config ${state.cfg}: track pulls and chain pull in rose, bearing reactions in cobalt. Resultant bending peaks at ${st.peak.toFixed(1)}Nm${st.peakAt ? ' at ' + st.peakAt : ''}.`;
      } else {
        cap.textContent = CAPS[state.view] + (state.view === 'iso' ? '' : '') ;
      }
    }
    function applyView(name, immediate = false) {
      const k = VIEW_LIST.some(([v]) => v === name) ? name : 'iso';
      const f = k === 'forces';
      state.view = k;
      viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === k)));
      root.classList.toggle('pfsh-forces', f);
      key.hidden = !f; bmd.hidden = !f;
      range.disabled = f; exBtn.disabled = f; powerBtn.disabled = f; loadsBtn.disabled = f;
      if (f) hideInfo();
      syncLive();
      core.setView(k, immediate);
      if (f) drawBmd();
      updateCaption();
    }
    viewBtns.forEach((b) => on(b, 'click', () => applyView(b.dataset.view)));

    ro2 = new ResizeObserver(() => { if (state.view === 'forces' && !bmd.hidden) drawBmd(); });
    ro2.observe(root);

    /* initial state */
    setRange(Math.min(1, Math.max(0, +o.explode || 0)) * 100);
    cfgBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cfg === state.cfg)));
    applyView(o.view, true);
  } catch (err) {
    showFallback(err);
  }

  return {
    setTheme(t) {
      theme = t === 'dark' ? 'dark' : 'light';
      if (root) root.setAttribute('data-theme', theme);
      try { if (core) core.setTheme(theme); } catch (e) { /* ignore */ }
    },
    setExplode(t) {
      try {
        const r = root && root.querySelector('.pfsh-range');
        if (core && r && !r.disabled) { const v = Math.min(1, Math.max(0, +t || 0)) * 100; r.value = String(Math.round(v)); r.style.setProperty('--v', r.value + '%'); core.setExplode(v / 100); }
      } catch (e) { /* ignore */ }
    },
    setView(v) {
      try { const b = root && root.querySelector(`[data-view="${v}"]`); if (b) b.click(); } catch (e) { /* ignore */ }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { cancelAnimationFrame(tweenRaf); } catch (e) { /* ignore */ }
      try { if (ro2) ro2.disconnect(); } catch (e) { /* ignore */ }
      listeners.forEach((off) => { try { off(); } catch (e) { /* ignore */ } });
      try { if (core) core.dispose(); } catch (e) { /* ignore */ }
      try { if (root && root.parentNode) root.parentNode.removeChild(root); } catch (e) { /* ignore */ }
      core = null; root = null;
      try { const css = document.getElementById('pfsh-css'); if (css) css.remove(); } catch (e) { /* ignore */ }
    }
  };
}
