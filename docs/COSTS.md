# Costs

Most of the pipeline is free. Two steps cost money (Apify), and proposals use Claude time.

## Rules that protect your money

1. **Dry run by default.** `l2p collect` (Google Maps) and `l2p google` print what they
   would run and the dollar ceiling, and spend nothing. Only `--go` spends.
2. **Hard budget caps.** `sources[google_maps].budget_usd` and `google_lookup.budget_usd`
   (or `--budget`). A stage stops before it would pass the cap.
3. **Never pay twice.** Progress is saved after every paid run; finished runs and lookups
   are skipped on re-run. A crash or Ctrl-C does not repeat a charge.
4. **Logged.** Every stage appends what it ran and what it cost to `out/run-log.jsonl`.
   `l2p status` shows money spent so far.
5. **Pilot first.** One segment, one location, `--limit 20` before the full run.

## Price table (planning figures)

Prices change. Check the current Apify pricing for the actors you use. Figures below were
measured on one account in autumn 2026.

| Item | Planning price | Notes |
|---|---|---|
| Google Maps places, no reviews | ~$4–6 per 1,000 places | Discovery. Keep `max_reviews: 0` |
| Google Maps places, 5 reviews each | ~$8–9 per 1,000 places | Reviews add roughly 50% |
| Google lookup (one business) | ~$0.004 | `google_lookup.price_per_lookup_usd` |
| Apify free plan | small monthly credit | Enough for a pilot |
| OSM, directory, CSV | free | Be polite to public servers |
| Website audit, Wayback, scoring, export, queue | free | Your bandwidth and time |
| Proposals | Claude usage | ~40 minutes of agent time per package (`proposals.minutes_per_package`) |

In practice the bill lands close to the ceiling (about 90–95%), so treat the ceiling as
the cost, not a worst case.

## Estimating a run

```
places  = Σ segments ( locations × search terms × max_per_search )
dollars = places ÷ 1000 × price per 1,000
```

Examples (fictional, at $5.50 per 1,000):

| Plan | Places | Cost |
|---|---:|---:|
| Pilot: 1 segment × 1 location × 2 terms × 20 | 40 | $0.22 |
| One niche, one city: 1 × 1 × 4 × 60 | 240 | $1.32 |
| Two niches, metro area: 2 × 5 × 4 × 60 | 2,400 | $13.20 |
| Five niches, region: 5 × 8 × 4 × 80 | 12,800 | $70.40 |

After merging, expect 15–30% fewer unique businesses than places paid for: search terms
overlap on purpose.

## Spending less

- Test search terms by hand in Google Maps before paying.
- Don't list districts the main city search already returns.
- Start with the highest-ticket segment.
- Use OSM or a directory for the base list, then `l2p google` only for businesses that
  survive merging and the area filter.
- Re-run `merge`, `enrich`, `score` and `export` as often as you like; they're free.
