# QA messages and fixes

Fix the data or the landing page, then re-render (`python/render.py <pkg>`, or `--proposal-only`
when only `proposal-data.json` changed) and re-run `python/qa.py <pkg>`. Never hand-edit
`proposal/proposal.html`: it is regenerated on every render.

| QA says | Fix |
|---|---|
| `... is N characters, max M` | Shorten the text. Limits are what the template is proven to fit (`templates/proposal/limits.json`). |
| `... has N items, needs ...` | Exactly 6 values, 3 before/after/seo_big, 8 seo categories, 2 found steps, 1-4 evidence images, 3-4 markers, 0-2 stats. |
| `jargon in sales...` | Say it the owner's way: "main headline", "photo descriptions", "your rating, hours and address built in for Google", "fits phone screens", "slow on phones". |
| `cover_headline is the worn-out formula` | Lead with what only they have: a number, a year, a place, a person, a striking verified problem. |
| `fact_id ... is not in facts/web-facts.json` / `number ... is not in fact` / `source should name` | Use a fact from `job.json` → `facts` exactly: its `fact_id`, its number, its `source_line`. |
| `uses ads:X but the job's category maps to ads:Y` | If the listing is mis-categorised, keep X and explain in `agent-report.json` → `industry_note`; otherwise use Y. |
| `"53%" is a statistic outside the cited facts` | Move the number into `sales.fact` or `sales.stats` with its fact_id, or remove it. |
| `price ... is not in the offer` | Use the prices from `job.json` → `offer` exactly (same symbol and format). |
| `sales.plans[i] is ..., the offer says ...` | Plan names and prices must equal the offer; only item wording may change. |
| `marker N sits on text or a busy area` | `python/markers.py <pkg>` and open `proposal/preview/markers.png`; move it to plain background beside the element with `--set`. |
| `markers N and M overlap` / `partly outside the screenshot` | Move them apart / inwards (keep x within 3-97, y within 5-95). |
| `layout page N: ...` | Usually text at its limit in a narrow spot: shorten that field. If it happens with valid data, the template needs a fix: run `python/stress_test.py`. |
| `landing page: needs exactly one <h1>` / title / description / viewport / Open Graph / JSON-LD | See `templates/landing/brief.md` § 4. |
| `landing page: images without alt text` | Describe what each image shows; `alt=""` only for decoration. |
| `landing page: has an <iframe>` | Replace maps and embeds with a static image plus a link. |
| `must be self-contained` | Inline the CSS/JS; only Google Fonts may load from outside. Download images into `assets/`. |
| `needs a tap-to-call link` | Add `<a href="tel:+1...">` with the business's phone. |
| `... changed after the last render` | Run render.py again. |
| `another business's name appears` | Remove it. Packages must never borrow from each other. |
| `business.phone ... is not one of the phones in job.json` | Use the phone from the listing / their site; if it truly changed, say so in `agent-report.json` → `concerns`. |

## Render problems

- **Fonts look like Times/Arial:** Google Fonts could not load (offline). Put `woff2` files in
  `landing-page/assets/fonts/` and use `@font-face`.
- **Landing screenshots show half-loaded sections:** content hidden until scrolled. Show it by
  default or under `prefers-reduced-motion: reduce` (render.py emulates it).
- **A today screenshot still has a cookie banner:** `capture.py site` removes common ones; if one
  survives, capture again, or crop the evidence with Pillow (top/bottom only, never the sides).
- **`capture failed: text not found`:** the text isn't visible as written (check spelling, case
  doesn't matter, spaces do).
