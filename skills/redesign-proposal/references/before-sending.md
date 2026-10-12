# Before a package goes to a client

QA catches layout, limits, prices, jargon, missing files and unsourced numbers. It cannot judge
truth or taste. A person (or Claude, interactively) checks these, in this order:

## 1. It is the right business
- [ ] `business.name` and phone in the proposal match the Google listing and their own site.
- [ ] The landing page shows *their* logo (crisp, not stretched, right colours) and *their* photos.
      Open each photo: is it their place, team or work? Not a supplier's, a franchise HQ's or a stock image.
- [ ] No other business's name, phone, address or domain anywhere (qa.py checks names of other
      packages in the same folder only).

## 2. Every claim is true today
- [ ] Open `agent-report.json`: read `verified_problems`, `dropped_claims`, `concerns`.
- [ ] Re-open their website. Each evidence screenshot still shows a real, current problem.
      Problems get fixed; a proposal that shows a fixed problem kills trust.
- [ ] Years, credentials, awards, owner name, languages: each one is in `content.json` → `sources`.
- [ ] Reviews quoted on the page are real, attributed, and not edited beyond trimming.
- [ ] The cost fact fits their industry (a restaurant is not "home services"). Non-US market:
      the figure says US data.
- [ ] Strengths are shown as strengths (green), never as problems.

## 3. It reads well for an owner
- [ ] Cover headline is specific to them and makes sense in one read.
- [ ] No technical words; numbers like ratings can't be misread ("4.8 of 5", "41 out of 100").
- [ ] Prices and delivery days are what you actually sell (`project.json` → `offer`).
- [ ] Your contact name, phone and email on the cover and last page are right.

## 4. It looks premium
- [ ] Open `<Business> - Proposal.pdf` in a normal PDF viewer (and on a phone if you'll send it by
      message). All 7 pages: nothing cut off, overlapping or blurry.
- [ ] Page 4: every numbered marker sits beside the element its label names, never on text or faces.
- [ ] Page 2: evidence images readable; nothing important cut off.
- [ ] `<Business> - Landing Page.pdf` and `landing-page/screenshots/landing-mobile-hires.png`
      (phone resolution) look right.
- [ ] Right-to-left text, if any: letters joined, numbers and phone numbers not reversed.

## 5. Sending
- Nothing in lead-to-proposal sends anything. Follow your outreach plan (`l2p queue`) and the
  compliance rules for your market (`docs/COMPLIANCE.md`): call first where it is allowed, send the
  PDF only when the owner says yes, honour "no unsolicited email" statements.
