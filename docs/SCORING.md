# Scoring

`l2p score` reads `data/businesses.json` and `data/sites.json` and writes `data/scored.json`:
one row per business with a **need**, an **interest**, a **priority**, a **tier**, the reasons
behind each number in plain English, a phone check, a disqualification (if any), and the
outreach channel and rule for your compliance regime. `l2p export` turns it into the workbook.

Code: `lib/score.mjs` (signals, `scoreRow`, `scoreAll`, `tierFor`) and `stages/score.mjs`.

## The model

```
NEED      what a stranger can see is wrong with their web presence   0-100 (sum of need signals, capped)
INTEREST  will they pick up the phone and pay                        0-100 (interest signals minus negatives, capped)
PRIORITY  round( sqrt( NEED x INTEREST ) )
TIER      A >= 55   B >= 38   C >= 24   D below          (scoring.tiers)
```

The square root is a geometric mean: it punishes imbalance. Need 90 with interest 10 gives 30
(tier C); need 60 with interest 60 gives 60 (tier A). You want the balanced one.

Tune `scoring.tiers` so tier A is roughly 5-10% of live leads, which is about how many you can
research properly in a week. A disqualified row keeps its computed tier but carries
`disqualified: { reason, detail }`; the Call list and proposals only use rows where it is `null`.

## Signals fire only on data that exists

Every signal declares what it needs. If that data is missing the signal is skipped, never
guessed:

| needs | meaning |
|---|---|
| always | the listing itself (website kind, socials, owner, sources, ticket) |
| site crawled | the business has a website of its own and `sites.json` has an entry for it |
| site reached | the crawl got the real page (`state: "ok"`). `blocked` (403/429, our crawler was refused) is **not** a broken site and fires nothing |
| SEO measured | site reached and `seo.score` is a number |
| Google match | `business.google` is present and its match confidence is not `none` |
| reviews sampled | Google match and at least one dated review in `google.reviews_sample` |
| community lens | `community.enabled` with `mode: "boost"` and the business matches |

So a row with no crawl yet is scored only on its listing, and a row with no Google match never
gets Google-based reasons (no "loved but weak", no phone mismatch, no review velocity).

## scoring.signals: the default catalogue

Weights are points. Some signals award part of their weight (shown as a scale, e.g. "0.5");
partial points scale with any weight you set. The plain-English text is what appears in
`need_reasons`, `why_they_need_you`, and the workbook; many signals add the observed detail
(e.g. "Footer still says 2019", "Replied to 3 of the last 5 Google reviews").

### Need

| id | default | fires only when | plain-English text | detection |
|---|---:|---|---|---|
| `no_website` | +24 | always | No website at all | website_kind is none (no website on any source) |
| `aggregator_only` | +20 | always | No website of their own, only a social or platform page | website_kind is social, aggregator or directory |
| `free_subdomain` | +18 | always | Only a free subdomain page | website_kind is free_subdomain (wixsite, business.site, blogspot, ...) |
| `profile_page_only` | +14 | always | Only a profile page on a larger company's site | website_kind is corporate (a page on a brokerage, bank or franchisor site) |
| `broken_site` | +20 | site crawled | Their website does not load | site.state is broken, dns, timeout or redirect_offsite (blocked = our crawler was refused, never counted) |
| `parked` | +20 | site crawled | Their domain shows a parked or for-sale page | site.state is parked or signals.parked |
| `coming_soon` | +14 | site crawled | Their website is a "coming soon" placeholder | site.state is coming_soon or signals.coming_soon |
| `not_responsive` | +11 | site reached | Not built for phones (no mobile layout) | site reached and signals.viewport === false |
| `no_https` | +8 | site reached | No secure connection (browsers show "Not secure") | signals.https === false full; https works but visitors are not sent there (https_redirect === false) 0.5; mixed_content 0.6 |
| `no_phone_on_site` | +9 | site reached | No phone number anywhere on the website | site reached and no phone number found on any crawled page |
| `no_tel_link` | +7 | site reached | Phone number cannot be tapped to call on a mobile | site reached, a phone number is shown, signals.tel_link === false |
| `no_booking` | +11 | site reached | No way to book or request a quote online | site reached, signals.form === false and no booking widget |
| `slow_page` | +14 | site reached | Slow to load on a phone | signals.psi_mobile < 50 (measured, full weight); else seo.categories.perf < 40 (inferred, half weight) |
| `heavy_page` | +6 | site reached | Very heavy home page | signals.page_kb >= 4000 (or page_bytes >= 4 MB) |
| `stale_site` | +14 | site reached | Website not updated in years | last content change (Wayback) or, failing that, footer year is 5+ years old |
| `old_footer` | +6 | site reached | Old copyright year in the footer | footer year 4+ years old, skipped when stale_site already used the footer year |
| `dead_ua_tag` | +6 | site reached | Still runs Google Universal Analytics, which stopped working in July 2023 | signals.ua_tag (a UA-xxxx tag in the page source) |
| `low_seo` | +16 | SEO measured | Weak basic SEO | seo.score < 40 full, < 55 at 0.7, < 70 at 0.4 |
| `missing_legal_page` | +10 | site reached | No legal notice page where the law requires one | country in scoring.legal_page_countries (default DE, AT) and signals.has_impressum === false |
| `phone_mismatch` | +8 | Google match | Phone on the website differs from Google | phone check verdict is MISMATCH (not a corporate profile page) |
| `unclaimed_google` | +6 | Google match | Google Business Profile not claimed | google.claimed === false |
| `loved_but_weak_site` | +22 | Google match | Customers love them, the website does not show it | Google rating >= 4.3 with >= 40 reviews and a weak web presence (partial 0.4 at >= 4.0 with >= 15) |

### Interest

| id | default | fires only when | plain-English text | detection |
|---|---:|---|---|---|
| `google_ads` | +18 | site reached | Already pays for Google Ads | signals.google_ads (AW- tag / googleadservices) |
| `meta_pixel` | +14 | site reached | Meta (Facebook) Pixel installed | signals.meta_pixel |
| `tiktok_pixel` | +6 | site reached | TikTok pixel installed | signals.tiktok_pixel |
| `gtm_only` | +7 | site reached | Someone set up tracking once (tag manager) | signals.gtm and no Google Ads or Meta tag |
| `chat_widget` | +6 | site reached | Pays for a chat widget | signals.chat_widget |
| `booking_widget` | +6 | site reached | Already buys booking software | signals.booking_widget |
| `replies_reviews` | +15 | reviews sampled | Replies to Google reviews | >= 40% of sampled reviews have an owner reply (any reply: 0.47) |
| `review_velocity` | +13 | reviews sampled | Gets new reviews every month | >= 3 new reviews a month from sampled dates (>= 1: 0.54), capped at reviews / 12 |
| `fresh_review` | +5 | reviews sampled | Reviewed in the last 30 days | newest sampled review <= 30 days old |
| `well_reviewed` | +6 | Google match | Lots of Google reviews | >= 100 Google reviews |
| `instagram` | +7 | always | Has an Instagram profile | an Instagram profile on any source or on their site |
| `instagram_dead_site` | +10 | site crawled | Keeps an Instagram profile while the website is down | Instagram profile and the site is broken, parked or coming soon |
| `owner_named` | +7 | always | Owner-run, one decision-maker | owner.name known (business or site) |
| `email_own_domain` | +5 | site crawled | Uses an email address on their own domain | an email whose domain is the website domain |
| `ticket` | +12 | always | One customer is worth a lot to them | ticket premium full, mid 0.5, low 0.1 (from config.categories.ticket) |
| `multi_source` | +10 | always | Listed on several sources | 3+ distinct sources full, 2 sources 0.6 |
| `tried_diy` | +14 | always | Already tried a do-it-yourself site | website_kind is free_subdomain |
| `rents_platform` | +8 | always | Rents their web presence from a platform | website_kind is social, aggregator or directory |
| `stalled_build` | +10 | site crawled | A website build that stalled | coming soon placeholder |
| `new_business` | +6 | site reached | Recently established | Wayback first seen within the last 3 years |
| `community` | +10 | community lens | Part of the community you serve | config.community enabled in boost mode and the name or reviews match (weight defaults to community.bonus) |

### Negatives (subtracted from interest)

| id | default | fires only when | plain-English text | detection |
|---|---:|---|---|---|
| `incumbent_agency` | −20 | site reached | An agency already credits itself on their site | signals.incumbent_agency (outbound "designed by" link) |
| `dormant` | −14 | reviews sampled | Dormant online | reviews sampled, no owner replies, newest review older than a year |
| `no_cem_statement` | −8 | site reached | Says it refuses unsolicited email | signals.no_cem_statement |
| `multi_location` | −10 | always | Several locations share one website | more than 2 businesses in this run share the website domain |

## Changing weights

In `project.json`:

```json
"scoring": {
  "weights": { "no_booking": 18, "heavy_page": 0, "incumbent_agency": 30 },
  "tiers": { "A": 50, "B": 35, "C": 20 }
}
```

- A number replaces the default for that id. `0` switches the signal off.
- Negatives always subtract: `"incumbent_agency": 30` and `-30` mean the same.
- The `community` weight defaults to `community.bonus`.
- Re-scoring is free. Run `l2p score`, check 30 rows by hand, adjust, repeat until the top 20 look
  right to you.

To adapt the model to another offer (local SEO, ads management, booking software), write down
what a stranger could see from outside that proves the problem you fix, map it to the signals
above, switch off the ones unrelated to your offer, and raise the ones that are direct evidence.
Directly observed facts (a dead analytics tag in the source) deserve more weight than inferred
ones (an old footer year).

## Disqualified

Checked in this order; the first match wins and is written as `{ reason, detail }`:

| reason | rule | config |
|---|---|---|
| `closed` | Google status is `CLOSED_PERMANENTLY` | |
| `chain` | a name matches a chain or brand pattern, or more than `max_locations` businesses share one website domain | `scoring.disqualify.chain_patterns`, `brand_patterns`, `max_locations` (default 3) |
| `competitor` | name or category matches a web, SEO or marketing pattern | `scoring.disqualify.competitor_patterns` |
| `outside_community` | community lens in `filter` mode and the business does not match | `community` |
| `unreachable` | no phone, email, social profile or address anywhere | |
| `well_served` | own site reached, footer year >= `min_footer_year`, has a form or booking widget (if `requires_form_or_widget`), responsive, HTTPS, SEO >= `min_seo`, and (if `modern_builders` is set) built on one of them | `scoring.disqualify.well_served` |

A "no unsolicited email" statement on their site is **not** a disqualification: it closes the
email channel only (see outreach) and costs 8 interest points.

## Phone check

Compares the numbers on their own website with the number on their Google profile.

| verdict | meaning |
|---|---|
| `NO WEBSITE` | no website of their own to check |
| `NOT CHECKED` | website not crawled yet, crawl was blocked, or no Google match to compare with (`note` says which) |
| `SITE UNREACHABLE` | the site is broken, gone, parked or a placeholder |
| `NO PHONE ON WEBSITE` | the site was reached and shows no number |
| `SITE ONLY` | Google matched but lists no phone |
| `MATCH` | the Google number is on the site |
| `MATCH (different extension)` | same line, different extension or direct-dial block |
| `MISMATCH` | both shown and they differ (`note` flags call tracking or a corporate profile page) |

`phone_check` = `{ verdict, site, google, note }` with numbers formatted for display.

## Plain sentences

- `why_they_need_you`: the three strongest need reasons. If only "customers love them" fired, or
  nothing did, it says "No website problem found yet; research before calling."
- `why_they_care`: the three strongest interest reasons.
- `risk`: every negative, plus "site blocked our check", an uncertain Google match, merge flags,
  and phone-mismatch notes.

## Outreach: channel and rule

`channel` is `email` when emailing is allowed under `compliance.regime`, otherwise `phone` when
there is a number, otherwise `dm` (Instagram, Facebook or WhatsApp), otherwise `walk-in`.
`email_ok`, `email` and `email_page` are on the row too. Nothing is ever sent by this tool.

| regime | email allowed when | rule text |
|---|---|---|
| `CASL` (Canada) | the address is published on their own site (a page on their domain, with an address on that domain or a consumer mailbox shown there) and the site has no refusal notice | conspicuous publication; identify yourself, unsubscribe; business phones are DNCL-exempt but keep your own list |
| `Spam Act` (Australia) | same test as CASL (inferred consent from conspicuous publication) | |
| `GDPR` (EU) | never for cold outreach | phone or letter first, email after they agree, document legitimate interest; Germany/Austria get the UWG note |
| `PECR` (UK) | an address exists and the business name shows a company (Ltd, LLP, plc) | sole traders need consent; check TPS/CTPS |
| `CAN-SPAM` (US) | any address, unless the site refuses unsolicited email | real identity and postal address (`compliance.sender_identity`), honest subject, opt-out within 10 business days |
| anything else | never | call or visit first and check local law |

`compliance.honor_no_cem_statement` (default true) closes email for sites that refuse it under
every regime. This is a starting point, not legal advice.

## Community lens (optional)

```json
"community": { "enabled": true, "mode": "boost", "script_regex": "[\\u0590-\\u05FF]", "name_tokens": ["shalom"], "bonus": 10 }
```

A business matches when `script_regex` finds the script in its names, Google name or sampled
review text, or a `name_tokens` entry starts a word in its names. `boost` adds the `community`
interest signal; `filter` disqualifies everyone else (`outside_community`). Rows carry
`community_match`.

## Config keys read

| key | default if missing |
|---|---|
| `scoring.weights` | `{}` |
| `scoring.tiers` | `{ A: 55, B: 38, C: 24 }` |
| `scoring.legal_page_countries` | `["DE", "AT"]` |
| `scoring.disqualify.chain_patterns`, `brand_patterns`, `competitor_patterns` | `[]` |
| `scoring.disqualify.max_locations` | `3` |
| `scoring.disqualify.well_served.{min_seo, min_footer_year, requires_form_or_widget, modern_builders}` | `70`, none, false, any builder |
| `community.{enabled, mode, script_regex, name_tokens, bonus}` | off |
| `compliance.{regime, sender_identity, honor_no_cem_statement}` | unknown regime (no email), "", true |
| `market.country` | used when a business has no `country` |

## Fields read from the pipeline

- Business: `name, names, category, ticket, country, address, phones[].{key,ext,valid}, emails,
  website, website_kind, socials, owner.name, sources[].source, flags, google.{place_id, name,
  rating, reviews, phone, status, claimed, categories, match.confidence, reviews_sample[].{date,
  owner_reply, text}}`.
- Site: `ok, state, final_url, phones[].{key,ext,page}, emails[].{email,page}, socials, owner,
  seo.{score, band, measured_pct, issues, categories.perf}`, and `signals.{https, viewport,
  tel_link, form, booking_widget, chat_widget, builder, footer_year, ua_tag, gtm, google_ads,
  meta_pixel, tiktok_pixel, incumbent_agency, no_cem_statement, coming_soon, parked,
  has_impressum, wayback_first, wayback_last_change}`; plus `signals.https_redirect`, `mixed_content`,
  `page_kb`, `call_tracking` when present; optional `signals.psi_mobile` (PageSpeed) and `page_bytes`.
