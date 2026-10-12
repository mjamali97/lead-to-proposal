# Niche profiles

Starting points for `project.json → scoring`. Ids are the real signal ids from
`lib/score.mjs` (full catalogue with detection rules: `docs/SCORING.md`). Only list the
weights you change; everything else keeps its default. Need and interest are each capped
at 100. Adjust after the top-20 hand check.

All profiles assume a **website offer** (a new or rebuilt site from the business's own
brand). For other offers, rewrite the need side from what you fix.

## Default weights (for reference)

**Need:** `no_website` 24 · `loved_but_weak_site` 22 · `aggregator_only` 20 · `broken_site` 20
· `parked` 20 · `free_subdomain` 18 · `low_seo` 16 · `profile_page_only` 14 · `coming_soon` 14
· `slow_page` 14 · `stale_site` 14 · `not_responsive` 11 · `no_booking` 11 ·
`missing_legal_page` 10 · `no_phone_on_site` 9 · `no_https` 8 · `phone_mismatch` 8 ·
`no_tel_link` 7 · `heavy_page` 6 · `old_footer` 6 · `dead_ua_tag` 6 · `unclaimed_google` 6.

**Interest:** `google_ads` 18 · `replies_reviews` 15 · `meta_pixel` 14 · `tried_diy` 14 ·
`review_velocity` 13 · `ticket` 12 (premium; scaled down for mid and low) · `community` 10 ·
`instagram_dead_site` 10 · `multi_source` 10 · `stalled_build` 10 · `rents_platform` 8 ·
`gtm_only` 7 · `instagram` 7 · `owner_named` 7 · `chat_widget` 6 · `booking_widget` 6 ·
`tiktok_pixel` 6 · `well_reviewed` 6 · `new_business` 6 · `email_own_domain` 5 · `fresh_review` 5.

**Negatives:** `incumbent_agency` −20 · `dormant` −14 · `multi_location` −10 · `no_cem_statement` −8.

Check `lib/score.mjs` for the current values; they may change between versions.

## Trades (plumbing, HVAC, electrical, roofing, pest control)

Why they buy: one job is worth a lot; emergency searches happen on phones, often at night.

```json
"scoring": {
  "weights": { "no_tel_link": 12, "not_responsive": 14, "no_booking": 14, "google_ads": 22, "no_phone_on_site": 14 },
  "disqualify": { "chain_patterns": ["<national franchise brands in your country>"] }
}
```

- Call-tracking numbers make `phone_mismatch` noisy; check those by hand.
- DQ: national franchises, lead-generation networks posing as local firms, very large
  contractors with in-house marketing.
- Seasons: heating before winter, cooling before summer, frozen pipes at the first deep
  freeze, pests indoors in autumn, roofing after storms.

## Restaurants and cafés

Why they buy: menus, bookings, catering; delivery apps take a large cut.

```json
"weights": { "aggregator_only": 24, "no_booking": 15, "instagram_dead_site": 12, "low_seo": 8, "review_velocity": 15, "well_reviewed": 3 }
```

- Restaurants collect reviews fast, so `well_reviewed` and `loved_but_weak_site` fire
  easily; lower them if every restaurant ranks high.
- Ticket is low (`categories.ticket.food: "low"`): quote the entry plan; walk in between
  lunch and dinner.
- DQ: chains and franchises (build a long list), ghost kitchens, hotel restaurants.
- Seasons: holiday parties and catering (bookings 6–10 weeks ahead), patio season.

## Salons, barbers, spas, beauty

Why they buy: bookings and photos. Instagram is often their real website.

```json
"weights": { "no_booking": 16, "aggregator_only": 22, "instagram_dead_site": 12, "low_seo": 8, "instagram": 10 }
```

- A paid booking widget (`booking_widget`) shows they buy software; `no_booking` won't fire
  for them anyway, so keep the interest points.
- DQ: national salon chains; booth-rental listings without an owner.
- Seasons: weddings and graduations (spring), holidays.

## Dental and medical clinics

Why they buy: high value per patient; trust and credentials sell.

```json
"weights": { "no_booking": 16, "no_https": 12, "not_responsive": 14, "low_seo": 18, "google_ads": 20 },
"disqualify": { "chain_patterns": ["<dental groups and corporate clinic networks>"], "max_locations": 2 }
```

- DQ: group-owned practices (their brand list; `redirect_offsite` often points to the
  group's platform), hospitals, public clinics.
- Health advertising rules vary; never invent patient results.
- Lead with the recommended (higher) plan; an entry-price site looks cheap here.

## Legal (lawyers, notaries, immigration consultants)

Why they buy: one client is worth thousands; credibility is everything.

```json
"weights": { "not_responsive": 14, "no_https": 12, "no_booking": 12, "old_footer": 8, "dead_ua_tag": 8, "loved_but_weak_site": 14, "well_reviewed": 10 }
```

- Many firms have few reviews, so lean less on review-based signals.
- DQ: large firms (several offices, many lawyers), legal-directory profiles.
- Bar or law-society rules limit advertising claims; no guarantees of outcome.

## Real estate (agents, brokers, mortgage)

Why they buy: personal brand, listings, lead capture.

```json
"weights": { "profile_page_only": 18, "no_booking": 14, "not_responsive": 12, "meta_pixel": 16, "instagram": 10 }
```

- `profile_page_only` fires when their "website" is a page on the brokerage's site.
- DQ: brokerage head offices, franchise portals, agents whose site the brokerage controls.
- Season: spring market (prepare in late winter).

## Auto (repair, body shops, tyres, detailing)

Why they buy: local searches, quotes, trust.

```json
"weights": { "no_booking": 14, "no_tel_link": 10, "aggregator_only": 18, "replies_reviews": 18, "review_velocity": 15 }
```

- DQ: dealership service departments (manufacturer rules), national tyre and quick-lube chains.
- Seasons: winter tyre changeover, pre-holiday road trips.

## How to adapt a profile (5 steps)

1. List every problem your offer fixes. For each, name what a stranger can see from
   outside. Map each to a signal id; if none exists, see CONTRIBUTING.md "Adding a signal".
2. Keep the default interest signals; set ticket per group in `categories.ticket`.
3. Build the chain list: search the niche + city and note every franchise on the first
   three pages. Add them to `chain_patterns` (regexes, case-insensitive).
4. Weight by strength of evidence: observed beats inferred.
5. Score, hand-check 30 rows, adjust, re-score until the top 20 look right.
