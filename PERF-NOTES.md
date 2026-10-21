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

## Status
(see git log)
