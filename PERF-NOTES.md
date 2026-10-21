# PERF-NOTES

Branch: perf-mobile-gate (from main eb06f17). Started 2026-10-21.

## Baseline (live https://aadikalwani.vercel.app, Lighthouse 12, headless Chrome)
| | Perf | FCP | LCP | TBT | CLS | Bytes |
|---|---|---|---|---|---|---|
| Mobile (sim. Moto G Power, 4x CPU) | 0.72 | 1.1s | 3.5s | 740ms | 0.015 | 392KiB |
| Desktop | 1.00 | 0.3s | 0.6s | 20ms | 0 | 392KiB |
Mobile a11y 0.93 (color-contrast, link-name fail), desktop a11y 0.97, best-practices 1.
Main mobile cost: assets/js/hero.js long task 973ms + three.js (688KB raw) loaded on every phone.

## Old (non-3D) version
Last tree with no three.js: 6239b48 (14 Aug). It is stale (no Conduir/Fifth9 case, pre-redaction Locus copy).
Used instead: 04cd106 (20 Sep, last pre-remake page, current numbers 0.57%/0.79%, redactions in place) with
all WebGL stripped and the SVG forward-pass hero from 6239b48 put back. Served as m.html.

## Plan
1. m.html = lite page (no three, no Lenis, no canvases). 
2. Gate: vercel.json rewrite on mobile UA (no redirect), plus inline head script in index.html (viewport/touch) that location.replace()s to /m.html before any 3D import.
3. Cache headers for fonts/vendor/images.

## Result (live, Lighthouse 12 mobile, 3 runs each; before = /?view=3d which still serves the 3D page)
Mobile before: perf 0.88-0.91, TBT 210-260ms, 392KiB, observed FCP 590ms / LCP 1.3s, three.js + hero.js loaded.
Mobile after (m.html): perf 0.87-0.99 (lab FCP swings 1.1-2.9s with font timing, observed FCP 245-455ms), TBT 0ms, 201KiB, 16 requests, 0 three/WebGL requests.
Desktop: 1.00 before, 0.99 after (noise). 3D unchanged.

## How the gate works
1. middleware.js (Vercel Routing Middleware) rewrites / to /m.html for phone UAs or Sec-CH-UA-Mobile ?1. No redirect hop.
2. index.html head script (first thing): width<768 or (pointer:coarse and hover:none) sets window.__lite and location.replace('/m.html'). site.js is only injected when not lite, so no 3D code is requested.
3. ?view=3d forces the 3D site on any device.

## Next action
None required. Possible: stop the idle rAF loop in site.js when nothing moves.
