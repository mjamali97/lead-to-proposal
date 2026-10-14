---
name: redesign-proposal
description: Build redesign packages for top leads - a new landing page made from the business's own logo, colours, photos, reviews and services, plus a 7-page sales proposal PDF with verified evidence - one business by hand or a batch with headless Claude. Use when the user asks for a proposal, mock-up, redesign, landing page or pitch for a business, wants to queue, run, render, QA or check proposal packages (l2p proposals ...), fix a failing package, change the proposal design or language, or check a package before sending it to a client.
---

# Redesign proposals

CLI: `node <plugin-root>/bin/l2p.mjs proposals <queue|run|render|qa|status>` (plugin root = two
levels above this skill's base directory), or `l2p proposals ...`. Needs `data/scored.json` from
`l2p score`. Uses Claude usage only (no paid APIs). Python with Playwright for screenshots and PDFs
(`l2p doctor` checks it).

A package (`proposals/<Business>/`) holds: `job.json` (everything known), `landing-page/` (the new
page, `content.json` with every fact and its source, assets, screenshots), `proposal-data.json`,
`<Business> - Landing Page.pdf`, `<Business> - Proposal.pdf`, previews, `agent-report.json`,
`status.json`. Contract: `<plugin-root>/docs/ARCHITECTURE.md` → "Proposal package".

## The rules that make proposals sell

1. Only facts you verified today; drop anything you can't confirm. Industry numbers only from
   `job.json` → `facts`, with their source line (qa.py checks the ids, numbers and sources).
2. Their identity, new presentation: their logo, colours, real photos, real reviews and services.
   No stock photos posing as them, no invented logo marks.
3. Plain words for an owner. Specific headlines (a number, a place, a year, a person), never
   "Clients love you. Your website hides it."
4. Prices only from `project.json` → `offer` (qa.py compares them).
5. Nothing is sent. The studio reviews every package and makes the call.

## One business, by hand (interactive)

1. Queue it: `l2p proposals queue --only "<business name or id>"` (works for any tier, never for a
   disqualified row). This writes `proposals/<Business>/job.json` with the business, its site audit,
   your agency, market, offer, matching cited facts and all script paths.
2. Build it: follow `<plugin-root>/agents/proposal-builder.md` step by step in that folder (or spawn
   the `proposal-builder` subagent there). The design brief for the page is
   `<plugin-root>/templates/landing/brief.md`.
3. Render and check: `l2p proposals render "<Business>"`, then `l2p proposals qa "<Business>"`
   until it prints `QA PASSED`.
4. Look at the images yourself (see "Before sending").

The scripts the agent uses, all with `--help`-style docstrings at the top:
`python/capture.py` (site/text/html screenshots with pop-up removal, image downloads),
`python/render.py`, `python/qa.py`, `python/markers.py` (marker preview, `--set`, `--auto`),
`python/brand_palette.py` (colours from a logo or sign), `templates/proposal/proposal.mjs`.

## A batch, unattended

```
l2p proposals queue --tiers A --limit 5      # start small: 5 packages
l2p proposals run --concurrency 2            # headless `claude -p` per package, resumable
l2p proposals status                         # counts by stage, failures with the error
```

- `run` gives each worker the proposal-builder brief, the package folder as working directory,
  file tools plus WebFetch/WebSearch, and `proposals.minutes_per_package` (default 40) before it is
  stopped. After the worker: render + QA decide `done`; otherwise one retry, then `failed`.
- Ctrl-C, a crash or a usage limit loses nothing: run it again and it continues. A package left
  `working` is put back in the queue.
- `skip.json` (`skipped`) only when the business is permanently closed, not a local business, or
  the listing is wrong, with evidence. Read the reasons in `status`.
- `--model <name>` picks the model; `--limit N` and `--only <name>` narrow the run.
- Pilot first: open the first 2 finished PDFs yourself before queueing more.

## Before sending (do this for every package)

Checklist in `references/before-sending.md`. In short: QA passed; open the landing page and both
PDFs; check name, phone, prices and every claim against `agent-report.json` and `content.json`;
markers sit beside the right elements; evidence still true today; no other business's name; the
photos are really theirs. Fixes and QA messages: `references/troubleshooting.md`.

## Changing the look or the language

- Agency name, logo, colour, contact: `project.json` → `agency`. Paper (Letter/A4), currency:
  `market`. Plans, care plan, delivery days: `offer`. Re-render after changes.
- UI strings: `<plugin-root>/templates/proposal/strings/en.json`. Add a language by copying it to
  `<lang>.json` (`_dir: "rtl"` for right-to-left; Persian and Arabic get the Vazirmatn font unless
  `_font_stack` names another) and set `proposals.language`. Prices may use any digits
  (`"۱۸ میلیون تومان"`, up to 24 characters). One-off wording:
  `proposals.strings` in `project.json` or `strings` in a package's `proposal-data.json`.
- Template changes: edit `templates/proposal/proposal.mjs`, then prove nothing overflows with
  `python python/stress_test.py` (both paper sizes, max and min content) before shipping.
