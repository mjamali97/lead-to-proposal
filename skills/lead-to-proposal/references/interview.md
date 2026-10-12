# Interview: questions and where each answer goes

Ask one or two questions at a time, in this order. Offer a sensible default with each
question so the user can just say "yes". Every key is explained in `docs/CONFIG.md`.

## 1. The offer (most important)

| Ask | Goes to | Notes |
|---|---|---|
| What do you sell, in one sentence? How long does delivery take? | `offer.summary`, `offer.delivery_days` | "A mobile-first site built from your own brand, live in 14 days." |
| What are your packages and prices? Which one do you recommend? | `offer.plans[]` (`name`, `price`, `tag`, `rec`, `items`) | Three plans work best: entry, recommended, custom quote. Prices are strings with the currency symbol. |
| Do you offer a monthly plan (hosting, edits)? | `offer.care_plan` | Recommend one. Every site needs hosting; recurring revenue builds the business. |
| Who can say yes without asking anyone? | (notes for the sales plan) | Usually the owner of a 1–20 person business. |

Push back if the offer has no observable signal. Ask: "What could a stranger see on their
website or Google listing that proves they need this?" Each answer becomes a scoring signal.

## 2. The niche

| Ask | Goes to |
|---|---|
| Which kinds of business? Rank them: which first? | `sources[google_maps].segments[]` (`key`, `tier`, `search`) |
| How much is one new customer worth to each? (premium / mid / low) | `categories.ticket`, segment `ticket` |
| Which words identify each group in a name or category? | `categories.groups` |
| Which franchises and chains in this niche and country look right but can't buy? | `scoring.disqualify.chain_patterns` |

Default groups already cover trades, food, beauty, health, legal, auto, real estate and
professional services. Add local-language keywords for non-English markets (for example
`"zahnarzt"`, `"dentista"`). Build the chain list yourself if the user doesn't know it:
think through the largest brands in that niche and country, then confirm with the user.

## 3. The area

| Ask | Goes to |
|---|---|
| Which city or region? Name the towns you serve. | `area.name`, `area.cities` (lower-case) |
| Do you prefer a radius? | `area.center` `[lat, lng]` + `area.radius_km` |
| (Work it out yourself) the bounding box | `area.bbox` `[south, west, north, east]` |

A listing is kept if it matches any one of bbox, radius or cities. OSM needs a bbox. For
Google Maps segments, `locations` are the search strings ("Austin, TX"). Don't list a
suburb the main city search already returns: you pay for the same places twice.

## 4. Market

| Ask | Goes to |
|---|---|
| Country | `market.country` (2 letters, e.g. `"DE"`) |
| Currency and symbol | `market.currency`, `market.currency_symbol` |
| Language of proposals (and an optional second one) | `market.language`, `proposals.language`, `proposals.secondary_language` |
| Paper size | `market.paper` (`"Letter"` in US/CA, `"A4"` elsewhere) |
| Time zone | `market.timezone` (IANA name, e.g. `"Europe/Berlin"`) |

## 5. Budget and sources

| Ask | Goes to |
|---|---|
| How much may I spend on paid lookups, in USD? | `sources[google_maps].budget_usd`, `google_lookup.budget_usd` |
| Google Maps (paid, best coverage) or free sources first? | `sources[].enabled` |
| Is there a directory you're allowed to crawl? | a `directory` source (see find-leads skill) |
| Do you already have a list (CSV)? Which columns? | a `csv` source with `map` |
| Should I look up non-Google businesses on Google for rating and reviews? | `google_lookup.enabled` |

If the budget is under $5, start with OSM and CSV, and run Google Maps only for the best
segment in one location.

## 6. Studio details (printed on proposals)

`agency.name`, `agency.contact_name`, `agency.phone`, `agency.email`, `agency.website`,
`agency.logo` (path to a PNG/SVG in the project folder), `agency.color` (hex).

## 7. Compliance

Ask which country the leads are in (not where the user lives). Set `compliance.regime`:
`CAN-SPAM` (US), `CASL` (Canada), `GDPR` (EU, plus national law), `PECR` (UK),
`Spam Act` (Australia), or the local law's name. Set `compliance.sender_identity` to the
name, business and postal address that must appear in commercial email. Keep
`honor_no_cem_statement: true`. Summarise the rules from `docs/COMPLIANCE.md` in 3–5 bullets
and say it is not legal advice.

## 8. Outreach rhythm

| Ask | Goes to |
|---|---|
| How many new businesses can you contact a week, properly? | `outreach.new_per_week` (default 20 per person) |
| Which channels will you use? | `outreach.channels` |
| Follow-up days | `outreach.touch_days` (default `[0, 1, 3, 6, 9, 14]`) |

## Finish

Write `project.json`, then show a 6-line summary: offer, niche + segments, area, sources
with their budgets, compliance regime, and the dry-run step that comes next.
