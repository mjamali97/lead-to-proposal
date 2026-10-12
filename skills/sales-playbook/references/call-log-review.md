# Call-log review: diagnose and plan

Use when the user shares a call log, CRM export or spreadsheet of prospects and asks why
deals aren't closing, or asks for a sales review or plan. Output: a diagnosis with counted
numbers and a dated action plan. Their data is private: work on it in place, never copy it
into the plugin repo, and don't quote more personal detail than the plan needs.

## 1. Read and normalise

- Load the file (CSV/XLSX/Google Sheet export). Also read `data/touches.json` and
  `data/scored.json` if the project has them.
- Map columns to: lead, business, source, niche/group, stage, dates (first contact, last
  contact, proposal sent, next step), notes, outcome.
- Read the notes column row by row. Notes hold the truth; stage columns are often wrong.
- Note the data date ("as of …") and the time window covered.

## 2. Count (define each count, then count it)

| Count | Definition |
|---|---|
| Leads | Rows that are real prospects |
| Talked | Notes show a real conversation with the decision maker (not a missed call or "bad time") |
| Proposal / sample sent | Something was sent or promised |
| Dated next step | A specific date (and time) for the next action exists |
| Demo / meeting booked | A fixed time to walk through the work together |
| Paid | Deposit or payment received |
| Lost | With the reason, grouped |
| Never reached | Only missed calls / "call later" |
| By source | Lead source, normalised spelling |
| In target market | Rows in the niches the offer is built for |
| Per day | Leads ÷ days in the window |

Show the counts as a funnel: Leads → Talked → Sent → Dated next step → Demo → Paid.

## 3. Look for these red flags

| Red flag | How to spot it | What it means |
|---|---|---|
| Proposal sent with no dated next step | Sent, but next step blank or "follow up" | Sending became the goal of the call |
| Stale proposals | Sent more than 3 days ago, no touch since | Deals drifting; easiest wins are here |
| Open-ended callbacks | "Call in the evening", "later", "next week" with no time | Callbacks that never happen |
| No pain recorded | Notes never mention lead source, job value or a problem the owner admitted | No cost of waiting can be named |
| Discounting on the phone | Notes show a lower price than the proposal | Price looks soft; waiting looks smart |
| ICP drift | Large share of rows outside the target niche (friends, freelancers, other niches) | Effort spent on people who refer, not buy |
| Low volume | Fewer than ~10 new conversations a week | Too few chances to close, even with a good script |
| Stage ≠ notes | Stage says "new" but a proposal went out | The pipeline can't be managed |
| Messy sources | Same source spelled several ways | Can't tell which source works |
| Empty helper columns | "Days in process" etc. blank | Stale leads don't stand out |
| Lost reasons | Group them | "Building it myself", "has a team", "paused" are not price problems |

## 4. Diagnose "why no urgency"

Check the three ingredients of urgency against the notes:
1. **A cost they pay today:** was a problem and a job value recorded? If not, no cost of
   waiting was named.
2. **A real deadline:** season, build slot, price change? If nothing has a date, the deal
   drifts for ever.
3. **An easy next step:** was a time booked, and could they pay on the spot? If the call
   asked for permission to send something, the next step was free to accept and free to ignore.

Usually the finding is: the call asks to send a sample, the owner says yes to end the call,
and the PDF waits unread. Say it plainly, with the counts as proof.

## 5. Write the plan

1. **Verdict:** three sentences. What happened, the one main cause, the fix.
2. **Three changes that fix most of it** (usually: change the ask to a booked screen share;
   show the page as a one-page PDF on the call; every call ends with a date, a no, or a
   chosen callback time).
3. **Targets with dates:** deposits by a date, demos held in 30 days, first deposit date.
4. **The numbers** (section 2), each with its definition.
5. **New process:** stages with exit tests (`pipeline-stages.md`).
6. **Call script** tailored to their niche and offer (`call-script.md`).
7. **Objections from their own notes**, each with an answer that books a time (`objections.md`).
8. **Follow-up cadence** with templates in their channels and language (`follow-up-cadence.md`).
9. **Hot list for the next 72 hours:** every open lead ordered by closeness to money
   (warm and promised first, real visible pain next, stale proposals next, never-reached
   callbacks last), each with the next action and a date and time.
10. **Offer and pricing fixes** (`offer-and-pricing.md`): stop discounts, founding deal,
    care plan, deposit, real deadlines, seasons.
11. **Where new leads come from:** which source worked (by count), what to call next
    (`l2p queue`), packages ready to use.
12. **30-day plan** (`30-day-plan.md`) with their real dates, holidays and hours.
13. **Scoreboard** (`scoreboard.md`), today's column filled from their data, assumed rates
    labelled as assumptions.
14. **Sheet fixes:** missing columns, stage dropdown, days-in-process formula, conditional
    formatting, package links, one spelling per source (`crm-sheet.md`).
15. **Everything else** that stands between them and paying clients
    (`everything-else.md`), ordered by how much each moves the first deposits.

Deliver it as a polished page (see the SKILL.md section "Producing a report or plan").
Mark every number as counted (from their data) or assumed (planning figure). Date it.
