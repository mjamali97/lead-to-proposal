# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

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
  `score-leads`, `lead-workbook`, `sales-playbook`.
- Sales playbook: call script, objections, follow-up templates, offer and pricing rules,
  pipeline stages, CRM sheet, scoreboard, 30-day plan, call-log review method, close kit.
- Docs: architecture, configuration, costs, compliance, sales.
- Offline demo on fictional data.
