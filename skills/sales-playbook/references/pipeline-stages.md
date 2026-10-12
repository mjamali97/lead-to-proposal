# Pipeline stages with exit tests

A lead moves forward only when the exit test is met. "Proposal sent" is **not** a stage:
the proposal is the recap you send after the demo.

| # | Stage | Exit test (all must be true) | Typical next step |
|---|---|---|---|
| 0 | New | In this week's queue | First call or walk-in |
| 1 | Reached | Talked to the decision maker for at least 2 minutes | Diagnose on the same call |
| 2 | Diagnosed | You know where their customers come from, what a job is worth, and one thing that's broken today (in their words) | Book the demo |
| 3 | Demo booked | A date and time is in both calendars and confirmed by message | Hold the demo |
| 4 | Demo held | You walked through their page together and wrote down their changes | Send agreement + deposit details |
| 5 | Deposit paid | Money received. **The only thing that counts as a client** | Collect logo, photos, logins; build |
| 6 | Live | Site launched; review and referral asked for | Care plan, case study |
| — | Nurture | "Not now" with a date the owner gave | Monthly useful message; call on the date |
| — | Lost | A clear no, with the reason recorded | Ask for a referral if polite |

## The rule

**No call ends without one of three outcomes:** a booked time, a clear no, or a callback
time the owner chose themselves. "I'll send you something" is not an outcome.

## Mapping to `l2p queue`

| Stage change | Command |
|---|---|
| Any contact attempt | `l2p queue --sent <id> --channel <channel>` |
| They answer a message or call back | `l2p queue --replied <id>` |
| Demo booked | `l2p queue --booked <id> --at <ISO time>` |
| Deposit paid | `l2p queue --won <id>` |
| Clear no | `l2p queue --lost <id> --reason "<their words>"` |
| "Don't contact me" | `l2p queue --stop <email|phone|id>` |

Diagnosed, Demo held, Live and Nurture live in the CRM sheet (`crm-sheet.md`).

## Red flags in a pipeline

- Leads sitting in "proposal sent" with no next step date.
- Proposals older than 3 days with no follow-up.
- Stage doesn't match the notes (a proposal went out but the stage says "new").
- More than a third of "Reached" leads have no recorded problem or job value.
