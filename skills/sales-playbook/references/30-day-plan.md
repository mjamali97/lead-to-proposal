# 30-day plan to the first paying clients

Built for one person working part-time (about 15 hours a week) with 20–60 finished
packages from the pipeline. Scale the numbers for full-time or a team. Replace the targets
with the user's after week 1.

**Target (example):** 5 deposits in 30 days, about 20 demos held. Month one is about proof:
five live sites, five reviews and the first referrals make month two much easier.

## Call blocks (local time; adjust to the niche and country)

| Block | Who | Why |
|---|---|---|
| 7:30–9:00 am | Trades (plumbing, HVAC, electrical, roofing) | Before they leave for jobs. 15–20 dials |
| 10:00–11:30 am | Professional offices (legal, accounting, real estate) | After the morning rush |
| 2:30–4:30 pm | Restaurants, cafés, salons: calls or walk-ins | Between lunch and dinner |
| 6:30–8:00 pm | Booked callbacks and screen-share demos | Owners are free after work |

Use two blocks a day, five days a week. Build in the blocks you don't use, or at weekends.
Many salons close one weekday (often Monday); restaurants are hard to reach at meal times;
clinics are easiest at lunch or end of day.

## Prep (2–3 days before week 1)

- [ ] Close-ready kit: one-page agreement, payment details, invoice template, onboarding
      form (`templates/playbook/close-kit/`). A yes on the phone must be finishable on the call.
- [ ] Studio's own site credible: a "Websites" page with 3–5 example pages (as images),
      the packages and a phone number. Owners look you up after a cold call.
- [ ] CRM sheet set up (`crm-sheet.md`), with Next step date required.
- [ ] Messaging app set up as a business profile, quick replies for day 0, 3 and 14.
- [ ] `l2p queue --n 20` for week 1. Order: no website / social only / free subdomain /
      broken site first (visible need), then trades in season, then the rest.
- [ ] Packages built for at least the first 20 (`l2p proposals queue --tiers A --limit 20`).

## Week 1: open conversations

- Work any warm leads (people who already got a sample) first, by day 2.
- From day 3, 20 dials a day, opening with the landing-page PDF.
- Score every call against the rule: a date, a no, or a chosen callback time.
- `l2p queue --due` every morning.
- **Target:** 4 demos held, first deposit.

## Week 2: volume and the first build

- 100 dials. Demos in the evening block.
- Build client #1. At handover ask for a review and two referrals.
- First case-study post (before/after, with permission) where your prospects gather.
- **Target:** 6 demos, 2 clients in total.

## Week 3: deadlines

- Use the real deadline (founding price end date, build slots) in every follow-up.
- Day-9 and day-14 messages to everyone from weeks 1–2 who hasn't decided.
- DIY check-ins on the dates you set.
- **Target:** 5 demos, 4 clients in total.

## Week 4: deliver and compound

- Deliver; collect reviews and referrals.
- Review the scoreboard. If one niche converted best, pull more of it
  (`l2p collect` for a new segment, or `l2p queue --group <it>`).
- **Target:** 5 paying clients. Stretch: 8 if referrals come in.

## Friday review (30 minutes, every week)

Use `templates/playbook/weekly-review.md`: update the scoreboard, find the weakest step,
change one thing for next week.
