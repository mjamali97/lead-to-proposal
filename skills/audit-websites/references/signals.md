# Signal reference

Every signal lives in `site.signals` (see `docs/ARCHITECTURE.md`). A signal the crawler
could not observe is `null`, never `false`. Scoring turns signals into points; the weights
are in `config/defaults.json` / `lib/score.mjs` and can be overridden per project.

## Need signals (the business has a problem you fix)

| Signal | Detected from | What to say to an owner | Caveats |
|---|---|---|---|
| `website_kind: none` | No website on any listing | "Customers who search for you find only the map listing." | Check the listing yourself; some sites are just missing from Maps |
| `website_kind: social` | Website field is a Facebook/Instagram page | "Your website link goes to Facebook. People who don't use it hit a login wall." | |
| `website_kind: free_subdomain` | wixsite, business.site, blogspot, etc. | "Your site is on a free address, which looks temporary to new customers." | Warm lead: they already tried |
| `website_kind: aggregator` | Linktree, delivery apps, booking marketplaces | "You rent your web presence from a platform that takes a cut." | |
| `state: broken / dns / parked` | 5xx, no DNS, parking page | "Your website link on Google goes to an error page." | Confirm in a browser on the day you call |
| `coming_soon` | Under-construction text | "Your site still says coming soon." | |
| `https: false` | URL scheme, mixed content | "Browsers mark your site 'Not secure'." | |
| `viewport: false` | No viewport meta | "On a phone the page shows desktop-size and tiny." | Strong, objective |
| `tel_link: false` | No `tel:` link | "Your phone number can't be tapped to call." | Only if the number is on the page |
| `form: false` and no `booking_widget` | No real form, no widget | "There's no way to ask for a quote or book online." | Only if the site was reached |
| `footer_year` 4+ years old | Footer copyright | "The footer still says 2019." | Templates may print the current year; old years are reliable, new ones aren't |
| `has_impressum: false` (DE, AT) | No legal-notice page | "The legal notice the law requires here is missing." | Only in countries that require one (`scoring.legal_page_countries`) |
| `ua_tag: true` | `UA-` Google Analytics tag | "Your analytics stopped recording in July 2023." | Means nobody has checked the site since |
| `builder` | Generator meta, asset paths | (context, not a defect) | An old builder plus other defects strengthens the case |
| `wayback_last_change` | Internet Archive CDX | "Your home page hasn't changed since 2018." | Say "according to the Internet Archive" |

## Interest signals (they spend money to grow)

| Signal | Detected from | Meaning |
|---|---|---|
| `google_ads: true` | `AW-` tag, googleadservices | Pays for customers today. Best single predictor |
| `meta_pixel: true` | `fbq('init'` / fbevents | Runs or ran social ads |
| `tiktok_pixel: true` | `ttq.load` | Same |
| `gtm: true` | `GTM-` container | Someone set up tracking once |
| `chat_widget` | Known widget scripts | Already pays for software |
| `booking_widget` | Known booking tools | Already pays for software (and is less likely to need a form) |
| Google reviews, rating, recent reviews, owner replies | Listing data | Real customers, cares about reputation |

## Negative signals

| Signal | Meaning |
|---|---|
| `incumbent_agency` | Footer links out to a web agency. Someone is already in the chair. Only counted when it is an outbound link, never plugin or theme names |
| `no_cem_statement` | Business says it does not want unsolicited email. Email closed; phone open |
| `redirect_offsite` | Site redirects to another domain: often a franchise or group |

## SEO categories (`site.seo.categories`)

| Category | Checks (examples) |
|---|---|
| crawl | Status codes, robots.txt, sitemap, canonical, noindex |
| meta | Title present and specific, meta description, length |
| headings | One H1, sensible H2s, headings that say what the business does |
| images | Alt text, oversized images, modern formats |
| perf | Page weight, number of requests, render-blocking scripts |
| schema | `LocalBusiness` (or subtype) JSON-LD with name, address, phone, hours |
| links | Broken internal links, links to dead pages |
| mobile | Viewport, tap-target size, font size |

`seo.score` is the weighted average of the categories that could be measured (crawl and
meta weigh 20 each, the rest 10). `measured_pct` is the share of the weight that could be
scored. `seo.band`: 90+ Excellent, 70–89 Good, 50–69 Needs significant work, under 50
Critical. `seo.issues` are plain-language problems; `seo.technical` the developer version.

The scoring signal ids that read these facts (`no_website`, `broken_site`,
`not_responsive`, `low_seo`, `google_ads`, ...) are listed in `docs/SCORING.md`.

## Blocked vs broken

| Response | State | Pitch it? |
|---|---|---|
| 200 | ok | Yes, the observed defects |
| 401 / 403 / 429, bot challenge page | blocked | No. Open the site yourself first |
| 500–599 | broken | Yes, after checking in a browser the same day |
| DNS failure | dns | Yes, "your website no longer loads" (check spelling first) |
| Timeout | timeout | Retry; pitch only if a browser also fails |
