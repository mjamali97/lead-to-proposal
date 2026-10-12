# Architecture

lead-to-proposal turns "find me every plumber in Austin who needs a better website" into a
scored call list, an Excel workbook, and a ready-to-send redesign package (landing page built
from the business's own brand and photos + a sales proposal PDF) for each top lead, plus a
sales playbook to close them.

It is a Claude Code plugin: skills tell Claude what to do; deterministic scripts do the
heavy, repeatable work. Two runtimes, no npm dependencies:

- **Node ≥ 20** (ESM, standard library only): collecting, merging, crawling, scoring, CLI.
- **Python ≥ 3.10** with `openpyxl`, `playwright`, `Pillow`: workbook, screenshots, PDFs, QA.

## Pipeline

```
          ┌────────────┐   ┌────────┐   ┌──────────────┐   ┌────────┐   ┌───────┐   ┌────────┐   ┌───────────┐
sources → │  collect   │ → │ merge  │ → │ google (opt) │ → │ enrich │ → │ score │ → │ export │ → │ proposals │ → playbook
          └────────────┘   └────────┘   └──────────────┘   └────────┘   └───────┘   └────────┘   └───────────┘
          raw/<src>.json   businesses   google.json         sites.json   scored     leads.xlsx   proposals/<slug>/
```

| Stage | Command | Cost | Module |
|---|---|---|---|
| init | `l2p init <dir>` | free | `bin/l2p.mjs` |
| doctor | `l2p doctor` | free | `bin/l2p.mjs` |
| collect | `l2p collect [--source <name>] [--go] [--limit N]` | Google Maps via Apify is paid (dry run by default); OSM, directory, CSV are free | `stages/collect.mjs` + `sources/*.mjs` |
| merge | `l2p merge` | free | `stages/merge.mjs` + `lib/dedupe.mjs` |
| google | `l2p google [--go] [--budget USD]` | paid (dry run by default) | `stages/google.mjs` + `lib/apify.mjs` |
| enrich | `l2p enrich [--limit N] [--wayback]` | free | `stages/enrich.mjs` + `lib/site.mjs` + `lib/seo.mjs` + `lib/brand.mjs` |
| score | `l2p score` | free | `stages/score.mjs` + `lib/score.mjs` |
| export | `l2p export` | free | `python/export_xlsx.py` |
| proposals | `l2p proposals queue|run|render|qa|status` | Claude usage only | `stages/proposals.mjs` + `python/*.py` + `templates/proposal/*` |
| queue | `l2p queue …` | free | `stages/queue.mjs` (outreach queue, touches, suppression) |
| demo | `l2p demo` | free, offline | `stages/demo.mjs` + `examples/demo/` |

Every stage is resumable (state saved every 25 items), never repeats a paid call, and every
paid stage is a dry run unless `--go` is passed. Paid stages stop at a budget.

## Project workspace (the user's folder, never inside the repo)

```
my-project/
  project.json            config (see config/project.example.json and docs/CONFIG.md)
  .env                    APIFY_TOKEN=... (never committed)
  data/
    raw/<source>.json     per-source listings, resumable
    businesses.json       merged businesses (one per real business)
    merge-report.json     every merge decision + clusters to review
    dropped.json          listings outside the area, with reasons
    google.json           Google lookups (paid, never repeated)
    sites.json            one crawl per website, keyed by siteKey
    scored.json           final rows
    http-cache/           gzip cache of fetched pages
    touches.json, suppression.json   outreach state (queue stage)
  out/
    leads.xlsx            the workbook
    run-log.jsonl         one line per stage run (what, when, cost)
  proposals/
    <slug>/job.json       written by `proposals queue`
    <slug>/...            package (see "Proposal package")
```

`lib/project.mjs` resolves the workspace: `--project <dir>`, else `L2P_PROJECT`, else the
nearest parent folder of the cwd containing `project.json`.

## Module contracts

All Node modules are ESM, standard library only. Shared helpers live in `lib/io.mjs`
(`readJSON, writeJSON` (atomic), `load(path, default)`, `toCSV, parseCSV`, `args` parsing,
`sleep, today, slugify, log`). Every stage module exports:

```js
export async function run(project, args) { ... }   // project = loadProject() result, args = parsed CLI flags
```

`project` (from `lib/project.mjs`):
```js
{ dir, config /* project.json merged over defaults */, paths: { data, raw, out, proposals, cache,
  businesses, sites, scored, google, mergeReport, dropped, workbook, touches, suppression, runLog },
  env /* process.env + .env */, plugin /* repo root */ }
```

Python scripts take the project dir as first positional argument and read the same files.

### Raw listing (`data/raw/<source>.json`)

```json
{ "source": "osm", "updated": "2026-10-12", "state": {}, "items": [ Listing, ... ] }
```
`Listing` = any subset of the Business fields below plus
`{ "source": "<source label>", "source_url": "<listing url>", "source_id": "<stable id>" }`.

### Business (`data/businesses.json` → `{ "updated", "items": [Business] }`)

```json
{
  "id": "b_<12 hex>",                       // stable: hash of first source_id
  "name": "Northwind Plumbing",
  "names": ["Northwind Plumbing", "Northwind Plumbing & Drain"],
  "category": "Plumber",                   // most specific label seen
  "category_group": "trades",              // from config.categories (see CONFIG.md)
  "ticket": "premium",                     // premium | mid | low, from config
  "address": "123 Example St", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US",
  "lat": 30.27, "lng": -97.74,
  "phones": [{ "e164": "+15125550123", "key": "1:5125550123", "ext": "", "type": "main", "raw": "(512) 555-0123", "valid": true }],
  "emails": ["hello@example.com"],
  "website": "https://northwind.example", "website_kind": "site",   // site | none | social | free_subdomain | aggregator | corporate | directory
  "socials": { "instagram": "", "facebook": "", "linkedin": "", "tiktok": "", "youtube": "", "x": "", "whatsapp": "", "telegram": "" },
  "owner": { "name": "", "role": "", "source": "", "confidence": "" },
  "hours": "",
  "sources": [{ "source": "osm", "url": "https://www.openstreetmap.org/node/1", "id": "osm:node/1" }],
  "google": null,                          // filled by collect(google_maps) or google stage:
  // { "place_id", "name", "rating", "reviews", "phone", "website", "maps_url", "categories": [],
  //   "status": "OPERATIONAL|CLOSED_TEMPORARILY|CLOSED_PERMANENTLY", "claimed": bool|null,
  //   "photos_count": n|null, "match": { "basis": "phone|website|place_id|name+geo", "confidence": "high|medium|low" },
  //   "reviews_sample": [{ "date", "rating", "text", "owner_reply": bool }] }
  "flags": []                              // e.g. "switchboard", "verify-match"
}
```

### Site (`data/sites.json` → `{ "updated", "items": { "<siteKey>": Site } }`)

```json
{
  "url": "...", "final_url": "...", "status": 200, "ok": true,
  "state": "ok | blocked | broken | dns | timeout | parked | coming_soon | redirect_offsite",
  "pages": [{ "url", "status", "kind": "home|contact|about|services|legal|privacy|other" }],
  "signals": {                              // detection results used by scoring
    "https": true, "viewport": true, "tel_link": true, "form": true, "booking_widget": "", "chat_widget": "",
    "builder": "WordPress|Wix|Squarespace|...", "footer_year": 2019, "ua_tag": false, "gtm": true,
    "google_ads": false, "meta_pixel": false, "tiktok_pixel": false, "incumbent_agency": "",
    "no_cem_statement": false, "coming_soon": false, "parked": false, "has_impressum": false,
    "wayback_first": null, "wayback_last_change": null
  },
  "seo": { "score": 62, "band": "Needs significant work", "measured_pct": 85,
           "categories": { "crawl": 70, "meta": 55, "headings": 80, "images": 40, "perf": 60, "schema": 0, "links": 90, "mobile": 80 },
           "issues": ["No business details for Google (structured data)", "..."] },
  "phones": [Phone + { "page": "url" }], "emails": [{ "email", "page" }],
  "socials": { ...same keys as Business },
  "owner": { "name", "role", "source", "confidence" },
  "brand": {                                // used by the redesign skill
    "logo": [{ "url", "source": "img[alt~=logo]|og:image|apple-touch-icon|favicon|header-img", "w": null, "h": null }],
    "colors": [{ "hex": "#1F4E79", "weight": 12, "source": "css-var|theme-color|inline|logo" }],
    "fonts": ["Montserrat"],
    "photos": [{ "url", "alt", "w", "h", "page", "kind": "hero|team|work|gallery|other" }],
    "tagline": "", "description": ""
  },
  "crawled_at": "2026-10-12"
}
```

### Scored row (`data/scored.json` → `{ "updated", "items": [Row] }`)

Business + flattened site fields + scoring:
```json
{ ...Business, "site_key": "...", "site_state": "ok", "seo_score": 62, "seo_band": "...", "seo_issues": [],
  "need": 48, "interest": 31, "priority": 39, "tier": "B",
  "need_reasons": [{ "id": "no_booking", "points": 11, "text": "No way to book or request a quote online" }],
  "interest_reasons": [...], "negatives": [...],
  "disqualified": null,                    // or { "reason": "chain", "detail": "..." }
  "phone_check": { "verdict": "MATCH|MISMATCH|...", "site": "...", "google": "..." },
  "why_they_need_you": "plain sentence", "why_they_care": "plain sentence", "risk": "",
  "channel": "phone|email|walk-in|dm", "outreach_rule": "..." }
```

### Field notes (what the modules add beyond the shapes above)

- **Raw files** also carry `type` (the source type).
- **Business**: `phones[].type` is the line type from `parsePhone` (`mobile | toll_free | fixed`), a role given by the source is kept, and phones added from Google carry `from: "google"`. Extra fields: `categories`, `links`, `description`, `segment`/`tier` (Google Maps segments), `osm_tags`. `google` also has `lat`, `lng`, `address`. Flags: `switchboard`, `shared-toll-free`, `verify-match`.
- **Site**: also `key`, `state_detail`, `business_ids`. `siteKey(url)` = hostname without `www` (plus `:port` when not default). Extra signals: `https_redirect`, `https_error`, `whatsapp_link`, `call_tracking`, `generator`, `gtag`, `incumbent_agency_host`, `has_privacy`, `mixed_content`, `js_shell`, `lang`, `hreflang`, `page_kb`, `title`, `wayback_checked`. Page-dependent signals are `null` (not `false`) when no page could be read. `seo` also has `technical` (jargon list, same order as `issues`) and `checks`. `brand.logo[]` has `score` and optional `svg`; `brand` also has `stock_photos` and `profiles {instagram, facebook}`; photo kinds are `hero | team | work | place | product | other`. An owner that was not found is `{ name: "", confidence: "not published" }` — never guessed from an email address.
- **Scored row**: also `phone` (display), `email`, `email_ok`, `email_page`, `ads`, `incumbent_agency`, `builder`, `footer_year`, `seo_measured_pct`, `wayback_last_change`, `community_match`. `site_state` can be `none` (no own site) or `not_crawled`. **Disqualified rows keep their computed tier**; anything that selects leads must check `!row.disqualified` as well as the tier.
- **Outreach state** (`l2p queue`): `data/touches.json` = `{ updated, leads: { <id>: { id, name, status, touches: [{ step, date, channel, note? }], events: [], booked_at?, lost_reason? } } }`; `data/suppression.json` = `{ updated, entries: [{ kind: "email|phone|id", value, added }] }` (one-way).

### Proposal package (`proposals/<slug>/`)

```
job.json                 written by `l2p proposals queue`: { business: Row, site: Site, agency, market, offer, facts, date, paths }
skip.json                optional: { reason, evidence } → package intentionally not built
landing-page/
  index.html             self-contained redesign, built from THEIR logo, colours and photos
  content.json           every fact used + where it came from
  assets/                their logo + photos (downloaded), generated wordmark if no logo
  screenshots/           current-site.png, evidence/*.png, landing-*.png (render.py)
proposal-data.json       data for the proposal template (shape: templates/proposal/schema.json)
proposal/proposal.html   generated by templates/proposal/proposal.mjs
proposal/preview/page-N.png, layout-report.json
<Business> - Landing Page.pdf
<Business> - Proposal.pdf
agent-report.json        verified problems, dropped claims, design direction, concerns
status.json              { stage: queued|working|done|failed|skipped, updated, attempts, error }
```

## File ownership (for contributors)

| Area | Files |
|---|---|
| Core & CLI | `bin/l2p.mjs`, `lib/io.mjs`, `lib/project.mjs`, `config/*`, plugin manifests |
| Lead data | `lib/http.mjs`, `lib/normalize.mjs`, `lib/dedupe.mjs`, `lib/apify.mjs`, `sources/*`, `stages/collect.mjs`, `stages/merge.mjs`, `stages/google.mjs` |
| Website audit | `lib/site.mjs`, `lib/seo.mjs`, `lib/brand.mjs`, `lib/wayback.mjs`, `stages/enrich.mjs` |
| Scoring & workbook | `lib/score.mjs`, `stages/score.mjs`, `python/export_xlsx.py` |
| Proposals | `templates/proposal/*`, `templates/landing/*`, `python/capture.py`, `python/render.py`, `python/qa.py`, `python/markers.py`, `python/stress_test.py`, `python/brand_palette.py`, `stages/proposals.mjs`, `agents/proposal-builder.md` |
| Sales | `stages/queue.mjs`, `templates/playbook/*` |
| Skills | `skills/*/SKILL.md` (+ `references/`) |
| Demo & tests | `examples/demo/*`, `stages/demo.mjs`, `test/**` |

## Principles

1. **Only true, checked facts** reach a client. Every claim in a proposal is traceable to the
   business's own site, its listings, or a cited source in `facts/`.
2. **Their brand, not ours.** A redesign keeps the business's logo, colours and real photos.
   Typography and layout are new; identity is theirs. No stock photos pretending to be them.
3. **Money is explicit.** Paid calls are dry runs by default, capped by a budget, logged.
4. **Polite crawling.** robots.txt respected by default, ≤ 1 request/second per host, cached.
5. **No sending.** Nothing in this repo sends email or messages. Outreach is manual by design.
6. **Resumable and idempotent.** Re-running a stage continues; it never pays twice.
