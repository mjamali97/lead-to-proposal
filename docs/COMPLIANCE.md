# Compliance

> **Not legal advice.** This is a plain-language overview to help you ask the right
> questions. Laws change and differ by country, state and province. The law that usually
> applies is the one where the **recipient** is. If you're unsure, ask a local lawyer, or
> stick to phone calls and in-person visits, which are the least regulated channels for
> business-to-business contact in most places.

lead-to-proposal is built to keep you on the safe side: it never sends anything, records
where each email address was found, flags businesses that say they don't want unsolicited
email, keeps a permanent suppression list, and caps follow-ups. The rest is up to you.

Set your regime in `project.json → compliance.regime` and your identity in
`compliance.sender_identity`.

## Rules that hold almost everywhere

- **One-to-one, written by a person.** No bulk sends, no automation.
- **Be who you say you are.** Real name, business, contact details; truthful subject lines.
- **Easy opt-out, honoured fast and for ever.** `l2p queue --stop <email|phone|id>` the
  same day, on every channel.
- **Business channels only.** Contact the business through what it publishes for business
  enquiries. Don't use personal social profiles or private numbers.
- **Data minimisation.** Keep only what you need to contact the business. Delete the rest.
- **Respect "no unsolicited email" statements** (`honor_no_cem_statement: true`).
- **No paid-for reviews.** Never give a discount, a gift or a better price in exchange for a
  Google (or any public) review: Google's review policy forbids incentivised reviews, and
  consumer-protection law in many countries restricts them (for example the US FTC Rule on
  the Use of Consumer Reviews and Testimonials, 2024). Ask for an honest review after
  delivery with nothing attached. A testimonial and case-study permission can be part of a
  founding-price deal. Not legal advice.

## United States: CAN-SPAM (+ TCPA for calls and texts)

- **Email:** cold B2B email is allowed without prior consent. Every commercial email must
  have accurate header and "from" information, a non-deceptive subject line, your valid
  physical postal address, and a clear way to opt out. Honour opt-outs within 10 business
  days and keep the opt-out working for at least 30 days after sending. You're responsible
  even if someone else sends for you. Penalties are per email and large.
- **Calls and texts (TCPA):** don't use autodialers or prerecorded messages, and don't send
  marketing texts to mobile numbers without prior consent. Manual, one-to-one calls to a
  business's published number are generally lower risk; respect do-not-call requests.
  Several states have stricter rules (calling hours, consent for texts); check yours.

## Canada: CASL (+ telemarketing rules)

- **Applies to email, texts and messages to accounts** (commercial electronic messages).
  You need **consent**, express or implied, before the first message.
- **Implied consent by conspicuous publication:** the person or business published the
  address conspicuously (for example on its own website), did not say it doesn't want
  unsolicited messages, and your message relates to their business role. Addresses copied
  from third-party directories are weaker; record where you found it (the plugin stores the
  page URL).
- **Every message must** identify you (name, business, mailing address and a phone, email
  or web contact) and include an unsubscribe mechanism that works for 60 days and is
  honoured within 10 business days.
- **Calls:** CASL doesn't cover voice calls. The national Do Not Call List rules exempt
  calls to businesses, but keep your own do-not-call list and honour requests.
- Penalties can be very large. When in doubt, call first and email only after they agree.

## European Union: GDPR + national ePrivacy law

Two layers apply:

1. **ePrivacy rules (national law)** decide whether you may send marketing email or make
   marketing calls at all. They differ by country, especially for messages to businesses.
2. **GDPR** applies whenever you process personal data, which includes a named person's
   work email or phone. You need a lawful basis (usually legitimate interest, with a
   documented balancing test), must tell people where you got their data and how to object
   (GDPR Article 14, at the latest at first contact), must stop on objection to direct
   marketing (Article 21), and must keep data minimal and for a limited time.

National examples (check the current law in the recipient's country):

| Country | Cold email to businesses | Cold calls to businesses |
|---|---|---|
| Germany (UWG §7) | **Prior express consent required**, also for B2B, apart from narrow existing-customer exceptions | Only with at least **presumed consent**: a concrete reason to assume the business wants the call. Unsolicited sales calls to businesses are risky |
| Austria | Prior consent generally required, also for B2B | Prior consent required |
| France | Allowed to professional addresses if the message relates to the recipient's job, with an opt-out | Allowed; respect objections |
| Other countries | Vary. Check the national telecoms or e-commerce law and the data protection authority's guidance | Vary |

For Germany and similar countries: a well-researched, in-person visit or a letter is often
the lower-risk first contact. Don't rely on cold email.

## United Kingdom: PECR + UK GDPR

- **Email and texts:** you may send marketing to **corporate subscribers** (limited
  companies, LLPs, public bodies) without prior consent, but must identify yourself and
  give a valid address to opt out. **Sole traders and some partnerships count as
  individuals**: they need consent (or the "soft opt-in" for existing customers).
- **Calls:** live calls are allowed unless the number is registered with the TPS or CTPS
  (screen against both) or the business has told you not to call.
- **UK GDPR** applies to named contacts (same principles as the EU). The Data (Use and
  Access) Act 2025 raises maximum PECR fines to UK GDPR levels; check the ICO's current
  guidance.

## Australia: Spam Act 2003 (+ Do Not Call Register Act)

- **Email, SMS and instant messages** need consent, express or inferred. Inferred consent
  by conspicuous publication: the address is published, there's no statement refusing
  unsolicited messages, and your message relates to the recipient's business role.
- **Every message** must identify the sender with contact details and include a
  functional unsubscribe, honoured within 5 business days.
- **Calls:** the Do Not Call Register and the telemarketing industry standard apply,
  including permitted calling hours and identification rules. Check before calling.

## Anywhere else

Search for the country's anti-spam law, its data protection law, and its telemarketing or
do-not-call rules. Ask Claude to summarise them for your `project.json`, then verify the
summary against the official regulator's website.

## Messaging apps and social platforms

- **WhatsApp, Telegram, Messenger, Instagram:** platform terms restrict unsolicited bulk
  messages and ban accounts that get reported or blocked often. Message a business after
  a call where they agreed, or on a number or account the business publishes for
  enquiries. One message, no attachments until they say yes.
- In Canada and Australia, messages to these accounts count as electronic messages under
  the anti-spam law.

## Scraping and crawling etiquette

- **robots.txt is respected by default** (`crawl.respect_robots: true`). Turn it off only
  with the site owner's written permission.
- **Rate limits:** at most one request per second per host (`crawl.gap_ms`), a capped number
  of hosts at once, a cache so pages aren't fetched twice, and a clear user agent.
- **Site terms:** some directories forbid automated collection in their terms even where
  it's legal. Read them; if they forbid it, ask the owner or don't use the site.
- **Platforms that prohibit scraping** (for example LinkedIn) are for looking people up by
  hand, not bulk collection.
- **Personal data:** collect business contact details only. Don't collect personal social
  profiles, home addresses or data about employees beyond a published owner or contact name.
- **Licences:** OpenStreetMap data is ODbL; credit "© OpenStreetMap contributors" if you
  publish it. Apify actors have their own terms.

## Your checklist before the first message

- [ ] `compliance.regime` and `sender_identity` set in `project.json`
- [ ] You know whether cold email to businesses is allowed in the recipients' country
- [ ] Email template has your identity, postal address and an opt-out line
- [ ] Phone numbers screened against do-not-call registers where required
- [ ] Suppression list in use (`l2p queue --stop`), checked before every send
- [ ] Follow-ups capped (`outreach.touch_days`)
- [ ] You can say where you got every address (the plugin records the page)
