---
name: lead-to-proposal
description: Run the whole lead-to-proposal pipeline for a web-design studio or freelancer. Use when the user asks to find clients or local businesses that need a website, build or refresh a lead list or call list, run or resume the full pipeline, change the niche or area of an existing project, check what a run will cost, or go from "I want clients" to scored leads, redesign proposals and a sales plan. Also use when the user mentions l2p or a project.json created by l2p init.
---

# lead-to-proposal: the orchestrator

You run the pipeline with the user, one stage at a time:
interview → `project.json` → doctor → collect → merge → (google) → enrich → score →
hand-check → export → proposals → queue → sales playbook.
Each stage has its own skill with the detail. This skill decides the order, asks for
confirmation, and keeps the money safe.

## Find the plugin and the CLI

- The skill's base directory is shown when this skill loads. The plugin root is two
  levels up from it (`<base>/../..`). Call it `<plugin-root>`.
- Run the CLI as `node <plugin-root>/bin/l2p.mjs <command>`. If `l2p --help` works in the
  shell (installed with `npm link`), use `l2p` instead. Below, `l2p` means either.
- Command reference: `l2p help`. Data shapes: `<plugin-root>/docs/ARCHITECTURE.md`.
  Every config key: `<plugin-root>/docs/CONFIG.md`.
- The project folder is the user's, never inside the plugin. Pass `--project <folder>` or
  `cd` into it. Stages find the nearest folder with `project.json`.

## Hard rules

1. **Never spend money without a yes.** `l2p collect` (Google Maps source) and `l2p google`
   are dry runs unless `--go` is passed. Always run the dry run first, show the user the
   printed cost and budget, and wait for an explicit "yes, run it" before adding `--go`.
2. **Pilot first.** The first paid run is small: one segment, one location,
   `max_per_search` 20 (or `--limit 20`). Check the output before the full run.
3. **Never send anything.** The plugin builds lists and documents. The user sends every
   message by hand. Do not use email, SMS or messaging tools to contact leads.
4. **Only true facts reach a client.** If a claim was not observed, it does not go in a
   message, page or proposal.
5. **Respect robots.txt and site terms.** Keep `crawl.respect_robots: true` unless the user
   confirms they have the site owner's permission.
6. **Keep personal data minimal** and inside the project folder. Never copy lead data into
   the plugin repo, issues or examples.

## Step 1: interview (new project)

Ask one or two questions at a time. Skip anything the user already told you. Full question
list and how each answer maps to `project.json`: `references/interview.md`.

Cover: the offer and price plans · the niche(s) and what one client is worth to them ·
the area (cities, radius or bounding box) · country, currency, language, paper size ·
budget in USD for paid lookups · which sources (Google Maps paid, OpenStreetMap free,
a directory they may crawl, their own CSV) · studio details for proposals (name, contact,
phone, email, website, logo, colour) · the anti-spam regime for their country.

Push back on vague answers. "Every business needs a website" is not a signal. Ask what a
stranger could see from outside that proves the business has the problem.

## Step 2: create the project

```bash
l2p init <folder>            # writes project.json, .env, .gitignore, data/, out/, proposals/
```

Then edit `<folder>/project.json` with the interview answers (keep `_help` notes or drop
them, both work). Show the user a short summary of what you set, not the whole file.
If a paid source is on, ask them to paste their Apify token into `<folder>/.env`
(`APIFY_TOKEN=...`). Never print the token back.

```bash
l2p doctor --project <folder>
```

Fix every `FIX` line before going on (it prints the exact command). Missing Chromium or
Python packages only block `export` and `proposals`; collection can start without them.

## Step 3: run the stages

| Stage | Command | Skill with the detail | Check before moving on |
|---|---|---|---|
| Collect | `l2p collect` (dry run) → pilot `--go --limit 20` → full `--go` | find-leads | Right kind of businesses? Cost matched the dry run? |
| Merge | `l2p merge` | find-leads | `data/merge-report.json` clusters, `data/dropped.json` reasons |
| Google (optional) | `l2p google` → `--go --budget N` | find-leads | Only for non-Google sources; match confidence |
| Enrich | `l2p enrich --limit 30` → `l2p enrich` | audit-websites | Share of `blocked`/`timeout` sites under ~10% |
| Score | `l2p score` | score-leads | Tier counts; A is 5–10% of live leads |
| Hand-check | (you, with the browser or web fetch) | score-leads | Under 3 false positives in the top 20 |
| Export | `l2p export` | lead-workbook | `out/leads.xlsx` opens; columns look right |
| Proposals | `l2p proposals queue --tiers A --limit 5` → `run` → `status` | redesign-proposal | Open 2 PDFs yourself before building more |
| Queue | `l2p queue --n 20` | sales-playbook | `out/queue-<date>.md` reads well |

`l2p status` prints counts per stage and money spent so far. Run it whenever you resume.

**Before every paid step**, say in one line: what will run, how many lookups, the dry-run
cost, the budget cap, and the money already spent (from `l2p status`). Then ask.

**After every stage**, report three things in plain words: what came out (counts), anything
odd, and the next step. Keep it short.

## Step 4: the hand-check (do not skip)

Before trusting the ranking, open the top 20 live leads and 10 random tier-C leads. For
each, visit the website and listing and test every claim in `why_they_need_you` and
`why_they_care`. Report a table (business · tier · claim · true/false/can't tell · what is
really there). If more than 3 of the top 20 are wrong (franchise, closed, site actually
fine, wrong niche), find the rule that let them through, propose the fix in `project.json`,
wait for the OK, then `l2p score` again. Re-scoring is free. Details: score-leads skill.

## Step 5: proposals for the top N

Build packages only for leads the user would actually call this week. Start with 5.
`l2p proposals queue --tiers A --limit 5`, then `l2p proposals run`, then `l2p proposals status`.
Each package is a landing page built from the business's own logo, colours and photos plus
a proposal PDF; the redesign-proposal skill has the detail.
Open at least two PDFs and check names, phone numbers and claims before
building more. Usage is Claude time, not money: about `proposals.minutes_per_package` each.

## Step 6: hand over to sales

Run `l2p queue --n <outreach.new_per_week>` and load the sales-playbook skill. Walk the user
through the call goal (a booked 15-minute screen share, not "send the proposal"), the
follow-up clock (`l2p queue --due`) and how to log touches.

## Resuming, re-running, changing course

- **Resume:** run `l2p status`, read `out/run-log.jsonl` tail, and continue from the first
  stage whose output is missing or older than its input. Stages are resumable and never
  pay twice for the same lookup.
- **Re-run cheaply:** `merge`, `enrich`, `score`, `export` and `queue` are free. Re-run them
  after any config change. `enrich` reuses `data/http-cache/`.
- **Change scoring:** edit `scoring` in `project.json`, then `l2p score` and `l2p export`.
- **New niche or area in the same market:** add a segment or source and run `collect` again;
  existing raw data is kept. For a different market or offer, create a new project folder.
- **Costs:** see `<plugin-root>/docs/COSTS.md`. Typical first run: a few dollars of Apify
  credit for a pilot, $10–30 for a city-wide niche. OSM, directories and CSV are free.

## When something fails

Read the error. `UserError` messages say what to fix. For stage bugs, re-run with a small
`--limit` to reproduce, and tell the user plainly what broke and what you changed.
