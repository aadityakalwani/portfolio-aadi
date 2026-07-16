# portfolio-aadi

Aadi Kalwani's personal portfolio website. Showcases everything he has built/shipped (trackers, bots, client sites, ML research) as ammunition for placement applications (Sept 2026 campaign) and general credibility.

## Stack & deploy pipeline
- **Static site.** Plain HTML/CSS/JS, no framework, no build step. Single `index.html` at repo root (may grow to a few static files/assets).
- **Host:** Vercel, project name `aadikalwani`, live at `aadikalwani.vercel.app` (the literal `portfolio-aadi.vercel.app` was taken globally by a stranger, so the project was renamed to Aadi's name — cleaner anyway). GitHub repo stays `aadityakalwani/portfolio-aadi`.
- **CI/CD:** GitHub repo `aadityakalwani/portfolio-aadi` connected to Vercel. **Every push to `main` auto-deploys to production.** No manual deploy step needed — just commit and push.
  - Manual deploy if ever required: `vercel --prod --yes` from this folder.
  - Local preview: just open `index.html`, or `python3 -m http.server`.

## Design North Star
Match the aesthetic of `maths-agency.vercel.app` (his other site): premium, clean, dark, intentional, NOT template/AI-looking. Phase 2 uses the `/ui-ux-pro-max` skill to build the real thing. Keep it fast (static, no heavy libs) and self-contained.

## Content
Real project inventory is gathered separately (see MEMORY.md for location). Lead with the highest-leverage builds: SOC battery ML research and the Ruby's Rasoi client site. Everything else is supporting evidence of build velocity. Do not oversell or invent — every claim maps to a real shipped thing.

## Conventions (inherited from global CLAUDE.md)
- Never attribute commits to Claude/AI. Write commits as Aadi.
- British English, no em dashes, no Oxford comma.
- Ask before big/irreversible changes; simplest solution first.
