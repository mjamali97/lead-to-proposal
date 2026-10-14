# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-14

Iran and Persian-language support, stable business ids, and fixes from the first review.

### Added
- Iranian phone numbers: `IR` in the phone table (`0912 555 0123` → `+989125550123`,
  `021 8555 0123` → `+982185550123`, 10-digit national numbers), with the Iranian display
  format.
- Persian and Arabic digits and separators are understood wherever numbers are parsed or
  compared: listings, websites (Persian phone labels too), the stop list and QA.
- `data/ids.json`: a registry that keeps every business id stable across merges. Existing
  projects get one from their current `businesses.json` on the next `l2p merge`, so no id
  changes. Ids that disappear when two known businesses merge are kept in `former_ids`.
- CSV import detects Persian and Arabic column headers (`نام`, `تلفن`, `وب‌سایت`, `آدرس`,
  `شهر`, `اینستاگرام`, …), and WhatsApp, Telegram, YouTube and X columns.
- Proposals in Persian or Arabic use Vazirmatn when the language file names no font.

### Changed
- `offer.plans[].price` and `sales.plans[].price` may be up to 24 characters (was 10), in
  any digits; prices shrink to fit their box.
- `l2p init`: Google Maps (paid) is off in a new project, with a note on how to enable it;
  OpenStreetMap (free) is on.
- Sales playbook: the founding price is traded for a testimonial and case-study
  permission, never for a review. Reviews are asked for after delivery with nothing
  attached (Google's policy forbids incentivised reviews).
- `l2p queue --stop <phone>` saves the number in international form.

### Fixed
- Prices in Persian digits vanished from the proposal cover and were treated as "Quote";
  prices with Persian words were forced left-to-right ("میلیون 18").
- Letter-spacing broke joined Persian/Arabic letters in proposal labels; headings fell back
  to a system font.
- Adding a source could change a business's id and detach its touches, stop-list entries,
  proposal package and workbook notes. Records saved under an old id now follow the business.
- `l2p queue --stop "0917…"` did not match leads stored as `+98…`.
- `l2p doctor` said "none here yet" for a broken `project.json`.
- `l2p proposals render|qa "<Business>"` said "No package found" inside a project.
- The demo's sample package was not linked to its business, so `l2p queue` showed no PDFs.
- `python/stress_test.py` failed on a fresh clone (landing screenshots are build outputs).
- The 1.0.0 entry below listed six skills; `redesign-proposal` was missing.

## [1.0.0] - 2026-10-12

First public release.

### Added
- `l2p` CLI: `init`, `doctor`, `collect`, `merge`, `google`, `enrich`, `score`, `export`,
  `status`, `proposals`, `queue`, `demo`.
- Lead sources: Google Maps via Apify (dry run by default, hard budget cap, resumable),
  OpenStreetMap (Overpass), any directory with a sitemap (JSON-LD, microdata or regex
  fields, robots.txt respected), and CSV import with column mapping.
- Merge and dedupe across sources with an area filter (bbox, radius, cities), a merge
  report and a dropped-listings report.
- Optional Google Maps lookup for non-Google businesses, never repeated.
- Website audit: site state (ok, blocked, broken, dns, timeout, parked, coming soon),
  need and interest signals, 8-category SEO score with plain-language issues, contacts with
  the page they were found on, owner extraction, brand assets (logo, colours, fonts,
  photos), optional Wayback dating.
- Scoring: need × interest → priority → tiers, disqualifiers (chains, competitors, well
  served), evidence sentences, channel and outreach rule per lead.
- Excel workbook export.
- Proposal packages: landing page built from the business's own brand and photos, proposal
  PDF, screenshots, QA.
- Outreach queue: balanced weekly list with evidence and package paths, follow-up clock,
  touch logging, outcomes, one-way suppression list. Never sends anything.
- Skills: `lead-to-proposal` (orchestrator), `find-leads`, `audit-websites`,
  `score-leads`, `lead-workbook`, `redesign-proposal`, `sales-playbook`.
- Sales playbook: call script, objections, follow-up templates, offer and pricing rules,
  pipeline stages, CRM sheet, scoreboard, 30-day plan, call-log review method, close kit.
- Docs: architecture, configuration, costs, compliance, sales.
- Offline demo on fictional data.
