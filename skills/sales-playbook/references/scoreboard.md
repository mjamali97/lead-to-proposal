# Scoreboard

Track every Friday. The conversion rates below are **planning assumptions**. Replace them
with the user's real numbers after week 1. If one rate is far below plan, fix that step
before adding more dials.

| Measure | Per week (example) | Assumed rate |
|---|---|---|
| Dials (calls attempted) | 100 | 20 a day, 5 days |
| Conversations with an owner | 25 | 1 in 4 dials |
| Demos booked | 8 | 1 in 3 conversations |
| Demos held | 5–6 | 70% show up |
| Deposits paid | 1–2 | 1 in 4 demos held |
| Calls ending with a date, a no, or a chosen time | 100% | the rule |
| Proposals older than 3 days with no follow-up | 0 | the rule |

Working backwards: 5 clients in a month needs about 20 demos held, about 28 booked, about
85 conversations, about 350 dials, at these rates.

## Where the numbers come from

- `data/touches.json` (from `l2p queue`): touches per channel, replies, bookings, wins,
  losses with reasons. Count by date range.
- The CRM sheet: stages, next step dates, objections.
- Count definitions matter: "talked" means a real conversation with the decision maker,
  not a missed call or "not a good time".

## Finding the weakest step

| Symptom | Weak step | First fix |
|---|---|---|
| Few conversations per dial | Calling at the wrong time, wrong numbers | Call blocks per niche; check phone_check mismatches |
| Conversations but few demos | The ask | Ask for a demo with two times, not "can I send it" |
| Demos booked but not held | Confirmation | Calendar invite + message on the call, reminder 2 hours before |
| Demos held but no deposits | Offer, trust, or payment friction | Close kit ready; studio site credible; founding deal; deposit guarantee |
| Deposits but slow delivery | Building eats selling time | Fixed call blocks; split selling from building |

Change one thing a week, then measure again.
