# Source configuration

Every source is one object in `project.json → sources[]`. Set `enabled: false` to keep a
source in the file without running it. Run one source with `l2p collect --source <type|name>`.
Output: `data/raw/<source>.json` (`{ source, updated, state, items: [Listing] }`).

## google_maps (paid, Apify)

```json
{
  "type": "google_maps", "enabled": true, "budget_usd": 10, "max_reviews": 0,
  "segments": [
    { "key": "plumbing", "tier": "A", "ticket": "premium",
      "search": ["plumber", "drain cleaning"],
      "locations": ["Austin, TX", "Round Rock, TX"], "max_per_search": 40 }
  ]
}
```

- Runs the Apify Google Maps actor once per (segment, location) with that segment's terms.
- **Cost ceiling** = Σ locations × terms × `max_per_search` × price per place. The dry run
  prints it per segment. As a planning figure (one account, autumn 2026): about $5–6 per
  1,000 places without reviews and $8–9 with 5 reviews each. Check the actor's pricing page.
- `budget_usd` is a hard stop. The stage stops starting new runs once spent + next run
  would pass it.
- `max_reviews: 0` during discovery. Reviews are billed per item. Buy them later for a
  shortlist with the reviews pass: `l2p collect --source google_maps --reviews 5
  --min-reviews 30 --min-rating 4` (dry run; add `--go`).
- `--limit N` turns the plan into a pilot: the first run only, the first search term, at
  most N places.
- Result fields: name, category, address, phone, website, rating, review count, Google
  place id, Maps URL, status (open/closed), socials when listed.

## osm (free, Overpass API)

```json
{ "type": "osm", "enabled": true, "tags": [["craft", "plumber"], ["shop", "hairdresser"]] }
```

- Queries every element with one of the tags inside `area.bbox` (bbox is required).
- Be polite: one query per tag, no tight loops. The public Overpass servers are shared.
- Good tags per niche: `references/osm-tags.md`.
- OSM data is open (ODbL). Credit "© OpenStreetMap contributors" if you publish it.

## directory (free, any site you may crawl)

```json
{
  "type": "directory", "enabled": true, "name": "city-chamber",
  "sitemap": "https://directory.example/sitemap.xml",
  "url_pattern": "^https://directory\\.example/members/[^/]+/?$",
  "max_pages": 2000,
  "fields": {
    "phone": "<a href=\"tel:([^\"]+)\"",
    "website": "class=\"member-site\"[^>]*href=\"(https?://[^\"]+)\""
  }
}
```

Step by step:

1. **Permission.** Read `https://<site>/robots.txt` and the site terms. If listing pages
   are disallowed, or the terms forbid automated collection, stop and tell the user. The
   crawler obeys robots.txt and waits `crawl.gap_ms` between requests (≥ 1 s).
   With written permission from the site owner, the user may set
   `crawl.respect_robots: false` for that project. Record who gave permission.
2. **Sitemap.** robots.txt usually lists it (`Sitemap:` line). Otherwise try
   `/sitemap.xml` and `/sitemap_index.xml`. Nested sitemap indexes are followed.
3. **url_pattern.** Open 3–4 listing pages and the sitemap. Write a regex that matches only
   listing pages, not categories, search pages or blog posts. Test it against 20 sitemap
   URLs before running.
4. **Fields.** If listing pages carry JSON-LD (`<script type="application/ld+json">` with
   `LocalBusiness`, `Organization` or a subtype) or microdata, name, address, phone,
   website and geo fill automatically. Only add `fields` for what is missing. Each value
   is a regex with one capture group, run on the page HTML.
5. **Pilot.** `max_pages: 20`, run, open `data/raw/<name>.json`, check 5 items against the
   pages. Then raise `max_pages`.

## csv (free, your own list)

```json
{ "type": "csv", "enabled": true, "file": "my-leads.csv",
  "map": { "name": "Business Name", "phone": "Phone", "website": "Website",
           "address": "Address", "city": "City", "category": "Category", "email": "Email" } }
```

- `file` is relative to the project folder. UTF-8, header row first. Excel "CSV UTF-8"
  works; the delimiter (comma, semicolon, tab) is detected.
- `map` is optional. Without it, common headers are detected in English, German, French,
  Italian, Spanish and Dutch. With it, keys are plugin field names and values are the
  user's column headers, exactly. Fields: `name`, `phone`, `website`, `email`, `address`,
  `city`, `region`, `postcode`, `country`, `category`, `lat`, `lng`, `instagram`,
  `facebook`, `linkedin`, `tiktok`, `notes`, `id`.
- Unmapped columns are ignored. Rows without a name are skipped.
- Only import lists the user has the right to use (their own contacts, a purchased list
  with a licence, a public registry export). Note the origin in the source `name`.

## Area rules (merge)

A listing is kept if it matches **any** of: inside `area.bbox`, within `radius_km` of
`area.center`, or its city is in `area.cities` (lower-case, exact names). Everything
dropped goes to `data/dropped.json` with a reason. If a listing has neither coordinates
nor a city, check how merge treated it in `data/merge-report.json` before trusting it.

## Google lookup

`google_lookup: { enabled, budget_usd, price_per_lookup_usd }`. One lookup per business
that has no Google data yet, matched on phone, website, then name + location.
`match.basis` and `match.confidence` record how. Never repeated: results live in
`data/google.json`.
