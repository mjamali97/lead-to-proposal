---
name: score-leads
description: Score, tier and disqualify leads with l2p score, and tune the model. Use when the user asks why a lead ranks high or low, wants to change weights or tier thresholds, adapt scoring to a niche (trades, restaurants, salons, dental or medical, legal, real estate, auto), add chain or competitor disqualifiers, hand-check the top 20, recalibrate after outreach results, or understand need, interest and priority.
---

# Score leads: need × interest

CLI: `node <plugin-root>/bin/l2p.mjs score` (plugin root = two levels above this skill's
base directory), or `l2p score`. Free; re-run as often as you like. Niche profiles with
starting weights: `references/niche-profiles.md`. Calibration and reweighting:
`references/calibration.md`.

## The model

```
need      0–100   how badly they need what you sell (observed problems)
interest  0–100   how likely they are to act and pay (spending and activity)
priority  = round( sqrt(need × interest) )      geometric mean, punishes imbalance
tier      A ≥ 55 · B ≥ 38 · C ≥ 24 · D below     (scoring.tiers)
disqualified overrides everything (kept in the file with a reason)
```

Why the square root: need 90 with interest 10 gives 30 (tier C); need 60 with interest 60
gives 60 (tier A). A business that needs you but never spends wastes a morning. An average
would hide that.

Each row in `data/scored.json` explains itself: `need_reasons`, `interest_reasons`,
`negatives` (each with `id`, `points`, `text`), plus `why_they_need_you`, `why_they_care`,
`risk`, `channel` and `outreach_rule`. When the user asks "why is X ranked here?", read
these fields and answer in plain words.

## Tuning weights

Weights live in `project.json → scoring.weights` as `{ "<signal id>": points }`. They
override the defaults; `0` switches a signal off; negatives stay negative. Signal ids,
default points and detection rules: `<plugin-root>/docs/SCORING.md` (source of truth:
`DEFAULT_SIGNALS` in `lib/score.mjs`). A signal only fires when its data exists (a site
that was never reached can't score "no booking form").

Rules:
1. **Rewrite need from the offer.** Every signal must be a problem the user's offer fixes
   and that a stranger can observe. Drop the rest.
2. **Keep most of interest.** Spending on ads, buying software, recent reviews and owner
   replies predict buying for almost any offer.
3. **Weight by strength of evidence.** Directly observed (no viewport, UA tag, 5xx) beats
   inferred (old footer year).
4. **Never count one fact twice.** If "site unchanged since 2019" scored, the old footer
   year must not score again.
5. **Change a few weights at a time,** re-score, and compare the top 20.

Tell the user, per change, one line on why. Then `l2p score` and show the new tier counts.

## Disqualify rules

`scoring.disqualify` in `project.json`, checked in this order:

| Reason | Rule |
|---|---|
| `closed` | Permanently closed on Google |
| `chain` | Name matches `chain_patterns` (or `brand_patterns`): head office owns the website. Or more than `max_locations` (default 3) businesses share one domain |
| `competitor` | Name or category matches `competitor_patterns` (web, SEO, marketing businesses) |
| `outside_community` | Community lens in `filter` mode and no match |
| `unreachable` | No phone, email, social profile or address |
| `well_served` | `well_served: { min_seo, min_footer_year, requires_form_or_widget, modern_builders? }`: a modern, mobile, secure site with a form that already converts |

A DQ row keeps `disqualified: { reason, detail }` and its computed tier, so the user can
see what was cut (the workbook's "Disqualified" sheet). "No unsolicited email" is **not** a
DQ; it only closes email.

## Tier thresholds

Aim for **tier A = 5–10% of live leads**: about what one person can research and call in a
week or two. If A is bigger, raise `tiers.A`; if A is nearly empty, lower it or check that
interest signals are being found (enrich ran? reviews present?). Typical healthy shape:
A 5–10%, B 15–25%, C 25–35%, rest D.

## Sanity-check the top 20 (always, before export)

1. Take the top 20 live leads by priority and 10 random tier-C leads.
2. For each, open the website and the listing (browser or web fetch). Check every claim in
   `why_they_need_you` and `why_they_care` against what is really there.
3. Report a table: business · tier · claim · true / false / can't tell · what is there.
4. Count false positives in the top 20: franchise or chain, closed, site actually fine,
   wrong niche, a claim that isn't true, a blocked site scored as broken.
5. For each error name the rule or weight that caused it and the exact change that fixes it.
6. Propose the changes, wait for the user's OK, apply, `l2p score`, and repeat until fewer
   than 3 of the top 20 are wrong.

## Learning from outreach (after 50+ contacts)

Compare reply and demo rates by tier. A must clearly beat C; if not, the weights are wrong.
Find signals that winners share (raise them) and signals as common among non-responders
(cut them). Recurring objections often become new DQ rules. Method and prompt:
`references/calibration.md`. With fewer than 50 contacts, change only the obvious things.
