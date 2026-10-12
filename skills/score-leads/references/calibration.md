# Calibration and reweighting

## Before outreach: the hand check

Use this as your own checklist (or paste it to another session with the files attached):

```text
Read data/scored.json and project.json.
Take the top 20 live leads by priority and 10 random tier-C leads. For each, open the
website and the listing, and check every claim in why_they_need_you and why_they_care
against what is really there.

Report a table: business | tier | claim | true / false / can't tell | what is there.
Then:
- Count false positives in the top 20 (franchise, closed, site actually fine, wrong
  niche, claim not true, blocked site treated as broken).
- Count tier-C leads that should be A or B.
- For each error, name the rule or weight in project.json that caused it and the exact
  change that fixes it.
Do not change anything yet. Wait for the OK, then apply and re-score.
```

Common causes and fixes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Franchises in the top 20 | Missing brand | Add to `chain_patterns` |
| "Site broken" but it loads | Blocked crawler counted as broken | Check `site_state`; report the bug if `blocked` scored as broken |
| Modern sites ranked high | `well_served` too loose | Raise `min_seo` or `min_footer_year` |
| Top 20 all one group | Ticket or group weights | Lower the dominant group's ticket, or use `l2p queue --group` |
| A is 20%+ of leads | Thresholds too low | Raise `tiers.A` |
| Strong leads stuck in C | Interest signals missing | Check reviews and ad tags were collected |

## After outreach: reweight from results (50+ contacts)

You need outcomes. Use `data/touches.json` (status: replied, booked, won, lost + reason)
joined with `data/scored.json` on `id`, or the user's CRM sheet.

1. Reply and demo rates by tier. Does A clearly beat B and C? Say so plainly if not.
2. For every need and interest signal: how often it appears among responders vs
   non-responders (lift = rate among responders ÷ rate among non-responders). Lift under
   1.1 is noise; over 1.5 is strong.
3. Group the lost reasons and objections. Which ones point to a missing disqualifier
   ("has an agency", "head office decides", "closing down")?
4. Propose new weights and DQ rules as a diff of `project.json`, one line of reasoning each.
5. Wait for the OK, apply, `l2p score`, `l2p export`.

With fewer than 50 contacts, the sample is too small: change only obvious errors.
