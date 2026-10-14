# Configuration: `project.json`

`l2p init <folder>` copies `config/project.example.json` into your project as
`project.json`. Every key you leave out falls back to `config/defaults.json` (deep merge:
objects merge, arrays are replaced). Keys starting with `_` are notes and are ignored.
`l2p doctor` and every stage validate the file and say exactly what is wrong.

Secrets never go in `project.json`. The Apify token goes in `<project>/.env` as
`APIFY_TOKEN=...`.

## `name`

Short project name (`"plumbers-austin"`). Used in logs and file names.

## `agency`: your studio (printed on proposals)

| Key | Example | Notes |
|---|---|---|
| `name` | `"Your Studio"` | |
| `contact_name` | `"Your Name"` | Signs the proposal |
| `phone` | `"+1 512 555 0100"` | International format recommended |
| `email` | `"you@yourstudio.example"` | |
| `website` | `"yourstudio.example"` | Owners will look you up; make it credible |
| `logo` | `"assets/logo.svg"` | Path relative to the project folder; empty = text wordmark |
| `color` | `"#1F4E79"` | Your accent colour on proposals (the redesign uses the client's colours) |

## `market`

| Key | Example | Notes |
|---|---|---|
| `country` | `"US"` | ISO 3166 two-letter code (required). Drives phone parsing and defaults: numbers written the national way (`0912 555 0123` with `"IR"`, `(512) 555-0123` with `"US"`) are read as that country's. Persian, Arabic and other non-Latin digits are understood everywhere |
| `currency` | `"USD"` | ISO 4217 code (required) |
| `currency_symbol` | `"$"` | Shown in prices |
| `language` | `"en"` | Default language of proposals |
| `paper` | `"Letter"` | `"Letter"` (US, Canada) or `"A4"` |
| `timezone` | `"America/Chicago"` | IANA name. Used for "today" in the outreach queue |

## `area`: where leads must be

A listing is kept if it matches **any one** of these. Set at least one.

| Key | Example | Notes |
|---|---|---|
| `name` | `"Austin metro"` | Label |
| `bbox` | `[30.0, -98.1, 30.7, -97.4]` | `[south, west, north, east]` in degrees. Required for OSM |
| `center` | `[30.27, -97.74]` | `[lat, lng]`, used with `radius_km` |
| `radius_km` | `25` | |
| `cities` | `["austin", "round rock"]` | Lower-case names as they appear in addresses |

## `offer`: what you sell (printed on proposals)

| Key | Notes |
|---|---|
| `summary` | One sentence |
| `plans[]` | Usually three. Each: `name`, `price` (a string with currency, e.g. `"$900"`, `"۱۸ میلیون تومان"` or `"Quote"`; up to 24 characters, digits in any script; it is shrunk to fit its box and shown in its own reading direction), `tag` (short label), `rec` (true for the recommended plan), `items` (bullet list) |
| `care_plan` | Monthly plan, one line (`""` for none) |
| `delivery_days` | Days from materials received to site ready |

The example prices in `project.example.json` are placeholders. Use your own.

## `sources[]`

Each source has `type` (`google_maps`, `osm`, `directory`, `csv`) and `enabled`.
Full detail and examples: `skills/find-leads/references/sources.md`.

### `google_maps` (paid)

Off in a new project (`l2p init`), so nothing paid runs and `l2p doctor` asks for no token. To use
it: set `"enabled": true`, put `APIFY_TOKEN=...` in `.env`, run `l2p doctor`, then `l2p collect`
(a dry run that prints the cost) and `l2p collect --go`. OpenStreetMap is the source a new
project starts with.

| Key | Notes |
|---|---|
| `budget_usd` | Hard stop for this source |
| `max_reviews` | Reviews per place. Keep `0` for discovery |
| `segments[]` | `key`, `tier` (A/B/C run order), `ticket` (`premium`/`mid`/`low`), `search` (terms), `locations` (search strings like `"Austin, TX"`), `max_per_search` (places per term per location) |

### `osm` (free)

| Key | Notes |
|---|---|
| `tags` | List of `[key, value]` OpenStreetMap tags, e.g. `[["craft","plumber"]]`. Searched inside `area.bbox` |

### `directory` (free)

| Key | Notes |
|---|---|
| `name` | Label, used as the source name |
| `sitemap` | Sitemap URL of the directory |
| `url_pattern` | Regex matching listing-page URLs only |
| `max_pages` | Cap on listing pages fetched |
| `fields` | Optional `{ field: regex with one capture group }` for data not in JSON-LD |

Only use directories you are allowed to crawl. robots.txt is respected.

### `csv` (free)

| Key | Notes |
|---|---|
| `file` | Path relative to the project folder |
| `map` | Optional. `{ plugin field: "Your Column Header" }` for `name`, `phone`, `website`, `address`, `city`, `category`, `email`, … Without it, common headers are detected (English, German, French, Italian, Spanish, Dutch, Persian, Arabic) |

## `google_lookup` (paid, optional)

Looks up businesses from non-Google sources on Google Maps once each.

| Key | Default | Notes |
|---|---|---|
| `enabled` | `false` | |
| `budget_usd` | `5` | Hard stop (override per run with `l2p google --budget`) |
| `price_per_lookup_usd` | `0.004` | Used for the dry-run estimate. Check current pricing |

## `crawl`: website audit

| Key | Default | Notes |
|---|---|---|
| `max_pages` | `5` | Pages per site (home + contact, about, services, legal) |
| `gap_ms` | `1000` | Minimum gap between requests to the same host |
| `concurrency` | `6` | Sites crawled at once (different hosts) |
| `timeout_ms` | `15000` | Per request |
| `respect_robots` | `true` | Only set `false` with the site owner's permission |
| `wayback` | `false` | Also query the Internet Archive (slow); same as `l2p enrich --wayback` |

## `categories`

| Key | Notes |
|---|---|
| `groups` | `{ group: [keywords] }`. A business gets the first group whose keyword appears in its category or name. Add local-language keywords for non-English markets |
| `ticket` | `{ group: "premium" | "mid" | "low" }`: what one new customer is worth to them |
| `ads_benchmark_industry` | `{ group: industry id }` mapping to `facts/ads-benchmarks.json`, used for cited cost-per-lead figures in proposals |

## `scoring`

| Key | Notes |
|---|---|
| `weights` | `{ signal id: points }` overriding the default weights. `0` turns a signal off. Signal ids: see `lib/score.mjs` |
| `tiers` | Priority thresholds, default `{ "A": 55, "B": 38, "C": 24 }`; below C is D |
| `disqualify.chain_patterns` | Regexes (case-insensitive) for franchises and chains (`brand_patterns` is accepted too) |
| `disqualify.max_locations` | Optional, default `3`: more businesses than this sharing one domain = a chain |
| `disqualify.competitor_patterns` | Regexes for web/marketing agencies |
| `disqualify.well_served` | `{ min_seo, min_footer_year, requires_form_or_widget, modern_builders? }`: a modern, mobile, secure site that converts is not a lead |
| `legal_page_countries` | Optional, default `["DE","AT"]`: countries where a missing legal notice (Impressum) counts as a defect |

Tuning guide and niche profiles: `skills/score-leads/`.

## `community` (optional lens)

Boost or filter businesses connected to one language community.

| Key | Notes |
|---|---|
| `enabled` | `false` by default |
| `mode` | `"boost"` (add points) or `"filter"` (keep only matches) |
| `script_regex` | A Unicode script class to look for in names or reviews, e.g. `"\\p{Script=Greek}"` |
| `name_tokens` | Words that suggest the community (place names, common words) |
| `bonus` | Points added in boost mode |

Use it to serve a community you belong to or work with, never to exclude people.

## `compliance`

| Key | Notes |
|---|---|
| `regime` | `"CAN-SPAM"`, `"CASL"`, `"GDPR"`, `"PECR"`, `"Spam Act"` or another name. Shown in queues and used to word outreach rules |
| `sender_identity` | Name, business and postal address required in commercial email |
| `honor_no_cem_statement` | `true`: a business that says "no unsolicited email" gets no email channel |

See `docs/COMPLIANCE.md`. Not legal advice.

## `proposals`

| Key | Default | Notes |
|---|---|---|
| `tiers` | `["A","B"]` | Tiers queued by `l2p proposals queue` (override with `--tiers`) |
| `limit` | `25` | Max packages queued per run (override with `--limit`) |
| `language` | `"en"` | Proposal language |
| `secondary_language` | `""` | Optional second language |
| `concurrency` | `2` | Packages built at once by `l2p proposals run` |
| `minutes_per_package` | `40` | Planning figure for agent time |

## `outreach`

| Key | Default | Notes |
|---|---|---|
| `new_per_week` | `20` | Default size of `l2p queue` |
| `touch_days` | `[0, 1, 3, 6, 9, 14]` | Days after the first touch when each follow-up is due. Its length is the maximum number of touches |
| `max_touches` | (length of `touch_days`) | Optional lower ceiling |
| `channels` | `["phone","whatsapp","email"]` | Channels you use (shown in plans) |
