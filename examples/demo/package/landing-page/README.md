# Northwind Plumbing: new landing page

> Fictional demo. Northwind Plumbing does not exist; the pictures are illustrations drawn by `examples/demo/make_assets.py`.

A single self-contained page: `index.html` plus `assets/`. No build step, no framework.
Designed by Fieldwork Studio on 12 October 2026 from Northwind Plumbing's own logo, colours, van, reviews and services.

- **Preview:** open `index.html` in a browser.
- **Go live:** upload this folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, or the current host) and point the domain at it.
- **Before launch, with the owner:**
  - Confirm every service, opening hour and review shown on the page (`content.json` lists each one and where it came from).
  - Connect the form to a real inbox (Formspree, Netlify Forms or the business's email). Until then it opens a pre-filled email to hello@northwind-plumbing.example.
  - Swap any photo the owner prefers; keep only photos of their own place, team and work.
- **Facts and sources:** `content.json` holds every fact, colour, font, service and review used on the page, with the source of each.
- **Screenshots:** `screenshots/` holds today's site (`current-site.png`), the evidence shown in the proposal, and the new page on desktop and phone (`landing-*.png`, made by `render.py`).
- **Bigger site later:** build extra pages from `content.json` and the CSS variables at the top of `index.html`.
