# lead-to-proposal

A Claude Code plugin for web-design studios and freelancers. It finds local businesses
that need a better website, checks each site, ranks them, gives you a call list, builds
each top lead a redesign from **their own** logo, colours and photos with a sales
proposal PDF, and gives you a sales playbook to close them.

```
find businesses → merge → (Google lookup) → audit websites → score → Excel call list
                → redesign + proposal PDF per lead → weekly outreach queue → sales playbook
```

## What you get

- **A clean lead list** from Google Maps (via Apify, with a hard budget cap) or free
  sources: OpenStreetMap, any business directory you're allowed to crawl, or your own CSV.
  Duplicates merged, out-of-area listings dropped with reasons.
- **A website audit per business:** HTTPS, mobile layout, tappable phone, forms and
  booking, builder, stale footers, dead analytics, ad pixels, incumbent agency, an
  8-category SEO score with plain-language issues, published contacts and owner, and the
  brand assets (logo, colours, fonts, photos).
- **A ranking you can explain:** need × interest → priority → tiers A–D, with
  disqualifiers for chains, competitors and businesses that are already well served.
  Every row says why they need you and why they'd care.
- **An Excel workbook** (`leads.xlsx`) to work the list day to day.
- **A redesign package per top lead:** a landing page built from the business's own brand
  and photos, plus a proposal PDF. Every claim is traceable to their site, their listing
  or a cited source.
- **An outreach clock** (`l2p queue`): a balanced weekly list with evidence per lead,
  follow-ups due today, touch logging and a permanent suppression list. It never sends.
- **A sales playbook:** a 6-minute call script, objection answers, follow-up templates for
  phone, WhatsApp, Telegram, SMS and email, pricing rules, pipeline stages, a CRM sheet, a
  scoreboard, a 30-day plan, and a method to diagnose your own call log.

## Install

### As a Claude Code plugin (recommended)

In Claude Code:

```
/plugin marketplace add mjamali97/lead-to-proposal
/plugin install lead-to-proposal@lead-to-proposal
```

Then install the Python side once (needed for the workbook, screenshots and PDFs):

```bash
pip install -r <plugin folder>/requirements.txt
python -m playwright install chromium
```

Claude will tell you the plugin folder and run `l2p doctor` for you on first use.

### Manual

Requires Node 20+ and Python 3.10+.

```bash
git clone https://github.com/mjamali97/lead-to-proposal.git
cd lead-to-proposal
npm link                                   # makes the `l2p` command available
pip install -r requirements.txt            # openpyxl, playwright, Pillow
python -m playwright install chromium
l2p doctor
```

No npm dependencies. Node uses the standard library only.

## Quick start in Claude Code

Open Claude Code in an empty folder and say:

> Use lead-to-proposal to find plumbers in Austin who need a new website.

Claude interviews you (offer, prices, area, budget, sources, compliance), writes
`project.json`, shows you the cost of every paid step before running it, runs a small
pilot, checks the top 20 by hand with you, exports the workbook, builds proposals for the
best leads, and hands you this week's call list and the playbook.

Other things to ask:

- "Add the dentists in Round Rock to this project."
- "Why is this lead tier A?" / "Tune the scoring for restaurants."
- "Build proposals for the top 10."
- "Who do I follow up with today?"
- "Here's my call log. Why isn't anyone buying?"

## CLI quick start

```bash
l2p init plumbers-austin && cd plumbers-austin   # creates project.json and .env
# edit project.json (or let Claude do it); put APIFY_TOKEN in .env for Google Maps
l2p doctor
l2p collect                    # dry run: prints the cost, spends nothing
l2p collect --go --limit 20    # small paid pilot
l2p collect --go               # full run, stops at budget_usd
l2p merge
l2p enrich
l2p score
l2p export                     # out/leads.xlsx
l2p proposals queue --tiers A --limit 5 && l2p proposals run
l2p queue --n 20               # this week's call list
l2p queue --due                # follow-ups due today
l2p status                     # counts per stage and money spent
```

`l2p help` lists every command and flag.

## Try it offline

```bash
l2p demo
```

Runs the whole pipeline on fictional businesses, with no network and no cost, and writes
the results to a folder you can open.

## Costs

| Step | Cost |
|---|---|
| OpenStreetMap, directory, CSV sources | free |
| Google Maps via Apify | about $4–9 per 1,000 places (planning figure; check current Apify pricing). Dry run by default, hard budget cap |
| Google lookup for non-Google leads | about $0.004 per lookup (configurable), dry run by default |
| Website audit, scoring, workbook, queue | free |
| Proposals | your Claude usage (about 40 minutes of agent time per package) |

A typical first project costs a few dollars for the pilot and $10–30 for a city-wide
niche. Details: [docs/COSTS.md](docs/COSTS.md).

## What it never does

- **Never sends messages.** No email, SMS, WhatsApp or DMs. You write and send every
  message yourself, one to one.
- **Never spends money without `--go`.** Paid steps are dry runs by default, stop at your
  budget, never repeat a paid lookup, and log every cent to `out/run-log.jsonl`.
- **Respects robots.txt** and crawls politely (≥ 1 second between requests to a host,
  cached, identifiable).
- **Never invents facts.** A defect that wasn't observed is never pitched. Proposals cite
  their sources.
- **Never uses stock photos as the business's own.** Redesigns use their real brand.

## Project layout

Your project folder (anywhere, never inside the plugin):

```
my-project/
  project.json        your settings (docs/CONFIG.md)
  .env                APIFY_TOKEN (never commit)
  data/               raw listings, businesses, sites, scored rows, touches, suppression
  out/                leads.xlsx, queue-<date>.csv/.md, run-log.jsonl
  proposals/<slug>/   landing page, proposal PDF, evidence, QA report
```

The plugin:

```
bin/l2p.mjs           CLI
stages/               one module per command
sources/              google_maps, osm, directory, csv adapters
lib/                  shared helpers (http, normalise, dedupe, seo, brand, score)
python/               workbook, screenshots, PDFs, QA
templates/            proposal, landing page, sales playbook templates
skills/               what Claude follows for each part of the job
facts/                cited statistics allowed in proposals
docs/                 architecture, config, costs, compliance, sales
```

## Responsible use

- Contact businesses, not private individuals, through their published business channels.
- Follow your country's anti-spam and privacy law: CAN-SPAM, CASL, GDPR and national rules,
  UK PECR, Australia's Spam Act and others. Read [docs/COMPLIANCE.md](docs/COMPLIANCE.md).
  It is not legal advice.
- Honour every opt-out at once (`l2p queue --stop`) and every "no unsolicited email"
  statement (the plugin flags them).
- Only crawl directories you're allowed to crawl. Keep lead data in your project folder,
  share it only with people working the list, and delete what you don't need.

## Contributing

Bug reports, source adapters, new signals and proposal languages are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md). Tests: `npm test`. Fixtures must be fictional.

## License

[MIT](LICENSE)
