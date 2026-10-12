---
name: sales-playbook
description: Turn leads and proposals into paying web-design clients. Use when the user asks how to call, pitch, follow up or close; wants a call script, objection answers, follow-up messages (phone, WhatsApp, Telegram, SMS, email), pricing or offer advice, pipeline stages, a CRM sheet, a scoreboard or a 30-day sales plan; asks why prospects say "send me the proposal" but never buy; wants their call log or CRM export reviewed and diagnosed; wants a sales report or plan page; or runs l2p queue (weekly outreach list, follow-ups due, logging touches, suppression).
---

# Sales playbook: from call list to deposit

The pipeline ends with a call list and a redesign package per lead. This skill gets the
user from there to paid clients. It is a method, not a script to read aloud.

CLI for the outreach clock: `node <plugin-root>/bin/l2p.mjs queue …` (plugin root = two
levels above this skill's base directory), or `l2p queue`. It **never sends anything**.

## The core idea (explain this first)

Owners who say "sure, send it" are not interested; they are ending the call politely.
A sample or proposal costs them nothing to accept and commits them to nothing. Urgency
comes from three things: a cost they pay today (in their own numbers), a real deadline,
and an easy next step. So:

1. **The goal of a call is a booked 15-minute screen share at a fixed time**, not
   "send the proposal". On the screen share you walk through their page together, take
   their changes and agree a start date.
2. **Show the page during the call** as a one-page PDF (the landing-page PDF from their
   package), sent by message while you talk. Not a link: the work stays yours until they pay.
3. **Every call ends with one of three outcomes:** a booked time, a clear no, or a callback
   time the owner chose. "I'll send you something" is not an outcome.
4. **The proposal PDF is the recap after the demo**, not the opener.

## References (load the one you need)

| File | Use it for |
|---|---|
| `references/call-script.md` | The 6-minute call: reason → page on screen → 4 diagnosis questions → cost of waiting → two times |
| `references/objections.md` | Answers that always lead back to a booked time |
| `references/follow-up-cadence.md` | Day 0, 1, 3, 6, 9, 14 and monthly, with copyable templates per channel |
| `references/offer-and-pricing.md` | Packages, no phone discounts, founding-client deal, care plan, deposit, honest scarcity, seasons |
| `references/pipeline-stages.md` | Stages with exit tests (Reached → Diagnosed → Demo booked → Demo held → Deposit paid → Live) |
| `references/crm-sheet.md` | CRM columns, formulas, conditional formatting, source dropdown |
| `references/scoreboard.md` | Weekly numbers, assumed conversion rates, how to find the weakest step |
| `references/30-day-plan.md` | A part-time plan to the first paying clients, call blocks by niche |
| `references/call-log-review.md` | Diagnose a user's call log or CRM export and write an action plan |
| `references/everything-else.md` | Close-ready kit, studio credibility, referrals, walk-ins, case studies, stop-doing list, anti-spam cautions |

Templates the user can copy: `<plugin-root>/templates/playbook/` (`crm-columns.csv`,
`call-log-template.csv`, `weekly-review.md`, `close-kit/`).

## The outreach clock (`l2p queue`)

```bash
l2p queue --n 20                       # this week's list → out/queue-<date>.csv and .md
l2p queue --n 10 --tier A --group trades
l2p queue --due                        # follow-ups and demos due today
l2p queue --sent <id> --channel phone  # log a touch (phone|whatsapp|email|sms|walk-in|dm|telegram)
l2p queue --replied <id>               # a reply ends the automatic sequence
l2p queue --booked <id> --at 2026-10-14T19:30
l2p queue --won <id>
l2p queue --lost <id> --reason "built it themselves"
l2p queue --stop <email|phone|id>      # never contact again; no command undoes it
```

- The queue skips disqualified and tier-D leads, anyone suppressed, and anyone already in
  a sequence. It balances across category groups so one niche never fills the week. Each
  lead comes with its evidence and, if built, the path to its landing-page and proposal PDFs.
- Touch days come from `outreach.touch_days` (default `0, 1, 3, 6, 9, 14`); the number of
  days is the maximum number of touches. After the last one, stop.
- Use `--on YYYY-MM-DD` to log something done on an earlier day.
- When someone asks to be left alone, run `--stop` immediately, on every channel.

## How to help, by request

- **"Help me call these leads."** Open the queue `.md`, pick the first lead, read its
  evidence, and prepare a call card: one true problem to mention, the four diagnosis
  questions, a cost-of-waiting line using a typical job value for the niche, two specific
  times in their free window. Use `call-script.md`.
- **"Write the follow-up."** Use `follow-up-cadence.md`. Fill in only facts from the lead's
  evidence or the user's notes. Keep the compliance footer for commercial email
  (`project.json → compliance.sender_identity`, see `docs/COMPLIANCE.md`).
- **"They said X."** Use `objections.md`. The answer always ends with two times.
- **"What should I charge?"** Use `offer-and-pricing.md` with the plans in `project.json`.
- **"Nobody is buying" or a call log / CRM export is attached.** Follow
  `call-log-review.md`: count, diagnose, then write the plan.
- **"Make me a plan / report."** See below.

## Producing a report or plan for the user

When the user asks for a sales review, a 30-day plan, or "put this somewhere I can read
it", produce a polished, self-contained page (HTML is a good default; use an artifact or
page-publishing tool if one is available, otherwise write `out/sales-plan-<date>.html` in
the project folder). Use **their real numbers** from the call log, `data/touches.json`
and `data/scored.json`, never the planning assumptions presented as facts.

Structure: the verdict (3 sentences) · targets with dates · the numbers (counted, with
definitions) · why there is no urgency · the new process · call script tailored to their
niche · objections from their own notes · follow-up cadence with copy buttons · hot list
for the next 72 hours (ordered by closeness to money) · offer and pricing · 30-day plan ·
scoreboard (assumed rates marked as assumptions) · sheet fixes.

Keep it private: it contains their prospects' names and numbers. Never copy it into the
plugin repo. State which rates are assumptions and the date the data was read.

## Rules for anything sent to a prospect

- Only facts observed on their site or listing, or the user's notes. Never invent results,
  reviews, statistics or urgency. Scarcity and deadlines must be real.
- One message to one person, written by the user. No bulk messaging, no automation.
- Respect the compliance regime in `project.json` and any "no unsolicited email" statement.
- Prices are the user's (from `project.json → offer`). Never discount on the phone.
