---
name: find-leads
description: Collect and merge business listings for a lead-to-proposal project. Use when the user wants to choose or configure lead sources (Google Maps via Apify, OpenStreetMap, a business directory site, or their own CSV), design search segments and locations, estimate or cap Apify cost, add a directory to crawl, import or map a CSV, run l2p collect, l2p merge or l2p google, or review duplicates, the area filter, merge-report.json or dropped.json.
---

# Find leads: collect → merge → (google)

Goal: one clean record per real business inside the area, at the lowest cost.

CLI: `node <plugin-root>/bin/l2p.mjs` (plugin root = two levels above this skill's base
directory), or `l2p` if linked. Long material: `references/sources.md` (every source's
config), `references/search-grid.md` (segments × locations, local search terms),
`references/osm-tags.md`.

## 1. Choose sources

| Source | Cost | Best for | Weak spot |
|---|---|---|---|
| `google_maps` (Apify) | paid, ~$4–9 per 1,000 places (check current Apify pricing) | Almost every local, physical business; rating, reviews, phone, website | Costs money; caps results per search |
| `osm` (Overpass API) | free | A quick free base list; good in Europe | Patchy coverage; few phones and websites in many cities |
| `directory` | free | A trade association, chamber or niche directory you may crawl | Needs robots/permission check and a sitemap |
| `csv` | free | The user's own list, a registry export, an event attendee list | Quality depends on the file |

Default plan: Google Maps for the best segment, plus any free source the user has. If the
budget is tiny, start with OSM + CSV and add Google Maps for one segment later. Several
sources can run in one project; `merge` combines them.

## 2. Design the search grid (Google Maps)

Each segment = one kind of business: `key`, `tier`, `ticket`, `search` terms, `locations`,
`max_per_search`. Ceiling = locations × terms × max_per_search places. Rules:

- Test each search term in Google Maps by hand first. Keep terms that return the right
  businesses; drop junk. Use Google's own category names in the local language.
- Big-city searches already return their districts. Add a district only if the city
  search came back full (exactly `max_per_search` results).
- Put the highest-ticket, clearest-need segment at tier A and run it first.
- Keep `max_reviews: 0` for discovery. Reviews add roughly 50% to the cost. Buy them
  later for a shortlist only (step 3, reviews pass).

Details and a term-localising prompt: `references/search-grid.md`.

## 3. Run collect: dry run, pilot, full

```bash
l2p collect                          # dry run: prints runs, place ceiling and dollars per segment
l2p collect --source google_maps --go --limit 20   # pilot: small, after the user says yes
l2p collect --go                     # full run, stops at budget_usd
l2p collect --source osm             # free sources run without --go
```

Before any `--go`: show the dry-run ceiling, the budget and money already spent
(`l2p status`), and get an explicit yes. After the pilot, open `data/raw/<source>.json`
and check 10 items: right kind of business, right area, fields filled. Expect the real
bill near the ceiling (about 90–95% of it); treat the ceiling as the cost.

Collect saves state as it goes and skips finished runs. A crash or Ctrl-C never pays twice.
Rerun the same command to continue. `--fresh` ignores saved results for that source (a
free source re-collects; for Google Maps it means paying again, so ask first).

**Reviews pass (optional, paid).** Review signals (owner replies, review velocity, dormant
listings) need a sample of recent reviews. Buy them only for businesses that could buy:

```bash
l2p collect --source google_maps --reviews 5 --min-reviews 30 --min-rating 4   # dry run
l2p collect --source google_maps --reviews 5 --min-reviews 30 --min-rating 4 --go
```

Typically a few thousand places shrink to a few hundred. Lower `--min-reviews` (10–15) for
niches that get few reviews (legal, B2B) or rural areas.

## 4. Apify setup

1. The user creates an account at apify.com (the free plan includes a small monthly credit).
2. Settings → Integrations → copy the API token.
3. Put it in `<project>/.env` as `APIFY_TOKEN=...`. Never print it, log it or commit it.
4. `l2p doctor` confirms the token is present.

## 5. Add a directory or a CSV

- **Directory:** check permission first (robots.txt, site terms, or written OK from the
  owner). Find the sitemap, write a `url_pattern` regex that matches only listing pages,
  test on 20 pages (`max_pages: 20`), then raise it. If listing pages carry JSON-LD
  (`LocalBusiness`, `Organization`), fields fill automatically; otherwise add `fields`
  regexes. Step by step: `references/sources.md#directory`.
- **CSV:** put the file in the project folder. Comma, semicolon and tab files work, and
  common headers are detected in several languages ("Business Name", "Telefon", "Ville").
  Read the header row; if a column isn't detected, add `map` from plugin field names to the
  user's column names (`name`, `phone`, `website`, `email`, `address`, `city`, `category`,
  ...). Show the user the mapping, run `l2p collect --source csv`, check 5 rows.

## 6. Merge

```bash
l2p merge
```

Normalises phones and addresses, keeps listings inside the area (bbox, radius or cities:
any one match keeps it), and merges duplicates across sources on phone, website domain,
source id, or name + location. Then read:

- `data/merge-report.json`: every merge decision, plus clusters flagged for review. Open the
  review clusters and check a few: two branches merged into one, or one business left as
  two? Tell the user what you found.
- `data/dropped.json`: listings outside the area with the reason. If good businesses were
  dropped, widen `area.cities`, `area.bbox` or `radius_km` and run `merge` again (free).
- Shared platforms (Facebook, Instagram, Linktree, free site builders) never count as a
  shared website between two businesses. Chains are businesses that truly share one domain.

Expect 15–30% duplicates from Google Maps alone; different terms overlap on purpose.

## 7. Google lookup (optional, paid)

For businesses that came from OSM, a directory or a CSV, `l2p google` looks each one up on
Google Maps once (rating, reviews, phone, website, status). It never repeats a lookup.

```bash
l2p google                   # dry run: lookups × price_per_lookup_usd
l2p google --go --budget 5   # after a yes
```

Check `google.match.confidence`. `low` matches are flagged `verify-match`; treat their
rating and reviews as unconfirmed until a person checks.

## Report back

After collect and merge, tell the user: listings per source, unique businesses, how many
dropped (top reasons), clusters to review, money spent, and the next step (`l2p enrich`).
