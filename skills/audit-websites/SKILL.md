---
name: audit-websites
description: Crawl and audit lead websites with l2p enrich. Use when the user wants to run or resume the website audit, understand what a signal or site state means (blocked, broken, parked, coming soon), read or explain a lead's SEO score and issues, check how contacts, emails or owner names were found, extract a business's logo, colours, fonts and photos for a redesign, run the Wayback Machine check, or debug why a site shows as unreachable.
---

# Audit websites: `l2p enrich`

Each website is crawled once (home page plus up to `crawl.max_pages` linked pages:
contact, about, services, legal). The result goes to `data/sites.json`, keyed by site.
It feeds scoring (signals, SEO), the call list (contacts, owner) and the redesign (brand).

CLI: `node <plugin-root>/bin/l2p.mjs` (plugin root = two levels above this skill's base
directory), or `l2p`. Signal and score reference: `references/signals.md`.

## Run it

```bash
l2p enrich --limit 30          # pilot: 30 sites, check the output
l2p enrich                     # everything not crawled yet (resumable, saves every 25)
l2p enrich --only https://northwind.example   # re-crawl one site
l2p enrich --wayback           # also ask the Wayback Machine when each home page last changed
```

Free. Polite by default: robots.txt respected, ≥ 1 s between requests to the same host
(`crawl.gap_ms`), `crawl.concurrency` hosts at a time, pages cached in `data/http-cache/`.
Re-running is cheap: cached pages are not fetched again.

After the pilot, check the share of each `state`. If `blocked` + `timeout` is over ~10%,
something is wrong (too much concurrency, a VPN, or a host blocking the default agent).
Lower `crawl.concurrency`, raise `crawl.timeout_ms`, and re-run. Do not disable robots.txt
to get around a block.

## Site states (`site.state`)

| State | Meaning | How to treat it |
|---|---|---|
| `ok` | Page loaded | Signals are observed facts |
| `blocked` | 401/403/429 or a bot wall (often Cloudflare) | **Not broken.** Signals unknown. Look at the site in a browser before claiming anything |
| `broken` | 5xx error | Real problem. A strong, checkable reason to call |
| `dns` | Domain does not resolve | Site is gone, or the domain lapsed. Check the listing for a new site |
| `timeout` | No answer in time | Retry once later before calling it down |
| `parked` | Domain parked or for sale | Effectively no website |
| `coming_soon` | Under construction page | A build that stalled; warm lead |
| `redirect_offsite` | Sends visitors to another domain | Often a franchise or group site; check for disqualify |

**Unknown is not false.** If the crawler never saw a page, "no booking form" is unknown.
Never pitch a defect nobody observed.

## Signals (what scoring reads)

Quick reference (full table with how each is detected: `references/signals.md`):
- **Need side:** no HTTPS, no mobile viewport, phone not tappable (`tel_link`), no form
  or booking widget, old builder, old footer year, dead Universal Analytics tag
  (`ua_tag`, stopped collecting in July 2023), parked / coming soon.
- **Interest side:** Google Ads tag, Meta or TikTok pixel, tag manager, paid chat or
  booking widget (they already buy software).
- **Negatives:** `incumbent_agency` (an outbound "designed by" link in the footer),
  `no_cem_statement` (the business says it does not want unsolicited email).

Footer years can be printed automatically by the template; `wayback_last_change` is the
stronger staleness proof. Say which source a date came from.

## SEO score (`site.seo`)

A 0–100 score from eight categories measured on the crawled HTML (weights in brackets):
crawl (20: can Google find and read it), meta (20: titles and descriptions), headings (10),
images (10), perf (10: speed signals), schema (10: business details for Google), links (10),
mobile (10: phones and accessibility). Checks that need a rendered page are not guessed:
`measured_pct` says how much was scored; below ~60% treat the score as rough.

Bands (`seo.band`): **90+ Excellent · 70–89 Good · 50–69 Needs significant work · under 50
Critical**. "(partial: JavaScript-only page)" means the HTML was an empty shell.
`seo.issues` are plain-language problems; `seo.technical` has the developer version.
Scoring adds need points for a score under 70 (`low_seo`).

Use the issues, not the number, when talking to an owner. "Google can't read your opening
hours or service area" is better than "your SEO score is 41".

## Contacts and owner (ethics)

- Phones and emails come from the business's own pages, with the page URL recorded
  (`site.emails[].page`). Prefer the business's general address over a person's.
- The owner name comes only from what the business publishes about itself (about page,
  legal notice, JSON-LD). `owner.confidence` says how sure. Never guess an owner from
  social media, and never look up home addresses or personal profiles.
- `no_cem_statement: true` closes the email channel for that business. Phone stays open.
- Store only what you need to contact the business. Leads data stays in the project folder.

## Brand assets (for the redesign)

`site.brand` holds the business's own identity: `logo` candidates (best first), `colors`
(weighted; from CSS variables, theme colour, inline styles, the logo), `fonts`, `photos`
(with `kind`: hero, team, work, gallery), `tagline`, `description`. The proposal builder
uses these so the new page looks like **their** business. If there is no usable logo, a
clean wordmark is generated from the name. Never substitute stock photos presented as
theirs. Low-resolution logos: use the largest candidate and flag it in the package report.

## Wayback (optional, slow)

`--wayback` (or `crawl.wayback: true`) asks the Internet Archive when the home page HTML
last really changed (`wayback_last_change`) and when it was first seen (`wayback_first`).
It is free but slow (tens of seconds per domain). Run it after the main crawl, and re-run
until it stops finding new dates. Shared platforms (Facebook pages, free subdomains) are
never dated.

## Report back

Counts per `state`, how many sites have an SEO score, top 5 most common issues, and how
many have a usable logo and at least 3 photos. Then the next step: `l2p score`.
