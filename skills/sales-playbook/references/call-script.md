# The 6-minute call

From first ring to a booked screen share in about six minutes. These are guides, not lines
to read. Speak the owner's language. Before you dial, open the lead's package so you know
**one specific, true problem** on their current site (from the evidence line).

## Before you dial (30 seconds)

- [ ] One observed problem, in plain words ("the phone number can't be tapped on a phone")
- [ ] The landing-page PDF ready to send by message (one page, not the full proposal)
- [ ] Two specific times in their free window (see `30-day-plan.md` for call blocks)
- [ ] A typical job value for the niche, in case they won't give one

## 1. Open with a reason (0:00–0:30)

> "Hi {Name}, it's {You} from {Studio}. I'll be quick. I've already designed a new web
> page for {Business}. Can I send you a picture of it right now on {WhatsApp / text}, so
> you can see it while we talk? It's one page."

The goal of the first 30 seconds is the PDF opening, not a pitch. Send the one-page
landing-page PDF, never the multi-page proposal at this point.

If it's a bad time: "No problem. Is {7:15 tonight} or {8:00 tomorrow morning} better?"
Write the time down and confirm it by message right away.

## 2. Let them look (0:30–1:30)

> "That's your page, with your reviews and your number. On the real site that button
> calls you directly. What's your first impression?"

Then be quiet. Their first reaction tells you what they care about.

## 3. Diagnose: four questions (1:30–4:00)

1. **Source:** "Where do most of your new customers come from right now: referrals,
   Google, social media?"
2. **Value:** "What's a normal job worth to you, roughly?"
3. **Gap:** "When someone nearby searches '{service}' tonight, what do they find for you?"
   Use the observed problem: the error page, no mobile call button, no reviews on the page.
4. **Decision:** "If you like it, is it just you who decides, or someone else too?"

Write the answers in the CRM in their own words (columns: Their problem, Job value,
Decision maker). You'll use them on the demo and in every follow-up.

Optional for trades and professional services: ask an AI assistant or search engine
"best {service} in {city}" before the call and note whether they appear. "I asked this
morning and it named five companies; you weren't one of them" is specific and true. Only
say it if you actually checked that day.

## 4. Name the cost of waiting (4:00–4:45)

> "So one job is worth about {their number}. The page is {price}, once. One extra call a
> month and it has paid for itself. {Season} starts {soon}, and it takes {delivery_days}
> days to go live. If we start this week, you're live before {date}."

Use **their** number, not yours. Simple maths: price ÷ job value = jobs needed to break
even. If it's under 1, say so.

## 5. Book the next step with two times (4:45–6:00)

> "Let's do 15 minutes where I share my screen, show you the page working, you tell me what
> to change, and we pick a launch date. {Tomorrow at 7:30 pm} or {Thursday at 8 am}?"

- Always two specific times. Never "when suits you?"
- Send the calendar invite and a one-line confirmation before you hang up.
- Log it: `l2p queue --booked <id> --at <ISO time>`.
- **If they're ready now, skip the demo:** "Great. I take {deposit %} to book your build
  slot. I'll send the details now." Use the close kit (`templates/playbook/close-kit/`).

## The demo (15 minutes)

1. Share your screen (video call). Click through the live page yourself. They see it
   working; they don't get the link.
2. Recap their problem and job value in their words.
3. Ask: "What would you change?" Write every change down.
4. Show the package options (from `project.json → offer.plans`). Present the recommended
   plan first for high-ticket niches.
5. Close: "If this looks right, I'll send the agreement and deposit details now, and your
   page is live {delivery_days} days after we get your logo and photos."
6. After the call, send the full proposal PDF as the written recap, with the start date.

## Every call ends with

- a booked time (demo or callback), **or**
- a clear no (log `--lost <id> --reason`), **or**
- a callback time the owner chose (log it as the next step date).

Never "I'll send you something" alone.
