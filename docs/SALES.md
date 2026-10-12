# Sales

The pipeline gives you a ranked call list and a redesign package for each top lead. The
sales playbook turns those into paying clients. It lives in the `sales-playbook` skill:
ask Claude things like "help me call these leads", "they said send me the proposal, what
now?" or "here's my call log, why isn't anyone buying?".

## The method in five lines

1. The goal of a call is a **booked 15-minute screen share at a fixed time**, not "send
   the proposal". "Sure, send it" is how busy owners end calls.
2. **Show their new page during the call** as a one-page PDF, not a link.
3. Ask **four diagnosis questions** (where customers come from, what a job is worth, what
   they find when they search, who decides) and name the **cost of waiting** in their numbers.
4. **Every call ends with a booked time, a clear no, or a callback time the owner chose.**
5. Follow up on **day 0, 1, 3, 6, 9 and 14**, each touch adding one new true thing, then
   monthly. Never discount on the phone.

## Where things are

| What | Where |
|---|---|
| Call script, objections, follow-up templates (phone, WhatsApp, Telegram, SMS, email) | `skills/sales-playbook/references/` |
| Offer and pricing rules, pipeline stages, CRM sheet, scoreboard, 30-day plan | `skills/sales-playbook/references/` |
| Call-log review method (diagnosis + action plan) | `skills/sales-playbook/references/call-log-review.md` |
| CRM header row, call-log template, weekly review | `templates/playbook/` |
| Agreement, onboarding form, invoice fields, deposit message | `templates/playbook/close-kit/` (not legal advice) |

## The outreach clock

```bash
l2p queue --n 20                        # this week's list with evidence and PDF paths
l2p queue --due                         # follow-ups and demos due today
l2p queue --sent <id> --channel phone   # log a touch
l2p queue --replied <id> | --booked <id> --at <ISO> | --won <id> | --lost <id> --reason "..."
l2p queue --stop <email|phone|id>       # permanent suppression
```

It never sends anything. Data: `data/touches.json`, `data/suppression.json`.

Before contacting anyone, read [COMPLIANCE.md](COMPLIANCE.md).
