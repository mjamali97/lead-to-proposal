# Follow-up cadence

For every lead who talked to you but didn't book, and for first contacts who didn't
answer. The aim of every touch is **a booked time**, not a reply. Each touch adds one new,
true, useful thing. No "just checking in".

Default clock (`outreach.touch_days`): **day 0, 1, 3, 6, 9, 14**, then monthly nurture.
`l2p queue --due` tells you who is due; log each with `l2p queue --sent <id> --channel …`.
A reply stops the clock (`--replied`). Stop requests are permanent (`--stop`).

| Day | Channel | What |
|---|---|---|
| 0 | Message (WhatsApp / text / Telegram), within 10 minutes of the call | The one-page landing-page PDF + two times. Optional 20-second voice note |
| 1 | Phone | Call at the time they gave. No voicemail; one line by message if no answer |
| 3 | Message | One specific finding from their site + one question + two times |
| 6 | Email | The full proposal PDF, a real start date, the deposit step |
| 9 | Phone | Last call: "Is this a yes for this month, or should I check back in {season}?" |
| 14 | Message | Close the file. Gets more replies than any other message |
| Monthly | Message or email | Nurture "not now" leads: one useful thing, never a discount |

Channel choice: use what the owner uses. Trades and small shops often prefer WhatsApp or
text; professionals prefer email; some communities live on Telegram. Email carries the
PDFs and the paper trail. Only message a mobile number by chat after the owner agreed on
the call, or where the business publishes that number for messages.

**Compliance:** commercial email needs your identity, postal address and an opt-out line
in most countries (see `docs/COMPLIANCE.md`). Messages and texts count as electronic
messages under CASL (Canada) and the Spam Act (Australia). Never bulk-send.

Placeholders: `{Name}` owner's first name · `{Business}` · `{You}` · `{Studio}` ·
`{finding}` an observed problem from the evidence · `{time1}`/`{time2}` two specific times
· `{price}` from your plans · `{date}` a real start date · `{phone}` your number.

---

## Day 0: message with the page (WhatsApp / Telegram / text)

```text
Hi {Name}, {You} from {Studio}. Attached is the new page I designed for {Business} (PDF, one page).
Have a look on your phone. What would you change? I have 15 minutes {time1} or {time2} to go through it with you.
```

Voice-note version (20 seconds): who you are, "the page I mentioned is in the message
above", "what would you change?", the two times.

## Day 0: if they asked for email instead

```text
Subject: The page for {Business}

Hi {Name},

As promised, the new page for {Business} is attached (one page, PDF).
What would you change? I can walk you through it in 15 minutes, {time1} or {time2}. Reply with the one that suits you.

{You}
{Studio} · {phone}
{postal address}
If you'd rather not hear from me again, reply "stop" and I won't contact you.
```

## Day 1: missed call follow-up (text / WhatsApp)

```text
Tried you just now, {Name}. When's good today, {time1} or {time2}?
```

## Day 3: one finding + one question

```text
{Name}, one thing I noticed: {finding, e.g. your website link on Google goes to an error page}.
Customers who search at night see that and call the next company. The new page fixes it.
Can I show you in 10 minutes, {time1} or {time2}?
```

SMS version (≤ 160 characters):

```text
{Name}, {You} here. {short finding}. The new page fixes it. 10 min to show you: {time1} or {time2}?
```

## Day 6: email with the full proposal

```text
Subject: Your new page for {Business}

Hi {Name},

Attached is the plan for {Business}: the page I built, what it fixes, and the options.

I start new builds on {weekday} and have {n} slots left before {date}. If you want one, reply "yes" and I'll send the agreement and deposit details. Your page would be live {delivery_days} days later.

{You}
{Studio} · {phone}
{postal address}
Reply "stop" and I won't email you again.
```

Only state slots and dates that are true.

## Day 9: last call (phone)

> "{Name}, it's {You}. I don't want to keep chasing you. Is this a yes for this month, or
> should I check back in {season / month}?"

Log the answer as the next step date, a booking, or `--lost` with the reason.

## Day 14: close the file (message)

```text
{Name}, I'll close your file so I stop bothering you. If you'd like the page later, just reply "page" and I'll pick it up. All the best with {Business}.
```

## Monthly nurture (for "not now")

```text
{Name}, a quick one for {season}: {one useful tip for their trade, e.g. "add your winter hours to your Google profile, people check it before they call"}. If you want the page live before {busy period}, I have a slot on {date}.
```

Or a before/after of a client page (with that client's permission). Never a discount.

## Walk-in follow-up (restaurants, salons, shops)

```text
{Name}, thanks for your time today at {Business}. Here's the page I showed you on my phone (PDF). Shall we pick the launch date, {time1} or {time2}?
```

## Social DM (Instagram / Facebook), only where the business uses DMs for enquiries

```text
Hi {Business}, {You} here, a local web designer. I built a one-page redesign for you using your own photos and logo. Could I send it to you here, or is there a better number to reach the owner?
```

Short, no attachment until they say yes, one message only.
