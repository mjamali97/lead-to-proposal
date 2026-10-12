# Contributing

Thanks for helping. Bug reports, source adapters, new signals, proposal languages, niche
profiles and documentation fixes are all welcome. Open an issue first for anything large.

## Ground rules

1. **No real people or businesses in the repo.** Fixtures, examples, docs and tests use
   fictional names, `.example` domains (or `.test`, `.invalid`), and phone numbers in the
   fictional `555-01xx` range. Never paste a real lead, website, review, owner name, email or
   phone number, even in an issue. Anonymise HTML before adding it as a fixture: replace the
   business name, address, phone, email, people's names and any distinctive text.
   `node scripts/privacy-scan.mjs` runs in CI and fails on real-looking contacts, tokens and
   local paths. You can add private terms to a git-ignored `.privacy-denylist` file (one per
   line) to scan for them locally.
2. **Node: standard library only.** No npm dependencies. ESM, Node 20+.
3. **Python: only** `openpyxl`, `playwright`, `Pillow` (and `pytest` for tests).
4. **Nothing sends messages.** No email, SMS or messaging integrations. Outreach stays manual.
5. **Money is explicit.** Any paid call is a dry run unless `--go`, respects a budget, is
   resumable, never repeats a paid lookup, and reports its cost in the stage's `log`.
6. **Polite crawling.** Use `lib/http.mjs` (robots.txt, per-host gap, cache). Don't add a way
   around robots.txt beyond the existing `crawl.respect_robots` setting.
7. **Unknown is not false.** A signal the crawler couldn't observe is `null`.

## Dev setup

```bash
git clone https://github.com/mjamali97/lead-to-proposal.git
cd lead-to-proposal
python3 -m venv .venv && . .venv/bin/activate     # optional; lib/python.mjs finds .venv
pip install -r requirements.txt
python -m playwright install chromium
npm link                                          # optional: `l2p` on your PATH
node bin/l2p.mjs doctor
node bin/l2p.mjs demo --out demo-output           # full offline run on fictional data
```

## Tests

```bash
npm test                       # everything
node --test test/node/         # Node tests
node --test test/node/queue.test.mjs
python -m pytest -q test/python
node scripts/privacy-scan.mjs  # must pass before you open a PR
```

Tests must run offline. Use local HTTP servers (`node:http`) and fixtures in
`test/fixtures/`. Create temporary projects with `initProject()` in `os.tmpdir()`.

Layout: see `docs/ARCHITECTURE.md` (stages, data shapes, file ownership).

## Adding a source adapter

1. Create `sources/<name>.mjs` exporting:
   ```js
   // args: { go, limit, label, prev: { items, state }, checkpoint({ items, state }) }
   export async function collect(project, sc, args) {
     return { items /* Listing[] */, cost_usd: 0, state: {} };
     // paid sources: return { dry_run: true, plan } unless args.go, and export formatPlan(plan, label)
   }
   ```
   Each `Listing` uses the Business fields from `docs/ARCHITECTURE.md` plus `source`,
   `source_url` and a stable `source_id` (`"<name>:<id>"`). Normalise with
   `lib/normalize.mjs`; fetch with `lib/http.mjs`.
2. Be resumable: start from `args.prev`, call `args.checkpoint()` every 25 items or so.
3. Register the type in `stages/collect.mjs` (`MODULES`) and in `validate()` in
   `lib/project.mjs` (the list of allowed `type` values).
4. Document the config keys in `docs/CONFIG.md` and `skills/find-leads/references/sources.md`,
   with an example block in `config/project.example.json` (disabled by default).
5. Test it offline against a fixture (`test/fixtures/<name>/`), including: field mapping,
   resume from `prev`, `limit`, and (for paid sources) that nothing is spent without `go`.

## Adding a signal

A signal has two halves: detection (what the crawler sees) and scoring (what it's worth).

1. **Detect** in `lib/site.mjs` (`auditSignals`) and add the field to `site.signals`.
   Return `null` when the page wasn't reached. Prefer patterns that can't misfire on
   plugin or theme names (see `AGENCY_LINK`: only outbound links count).
2. **Score** in `lib/score.mjs`: add an entry to `DEFAULT_SIGNALS` with
   `S(kind, id, weight, when, text, detect, fire)`. `kind` is `need`, `interest` or
   `negative`; `when` says which data must exist (`listing`, `crawled`, `reached`, `seo`,
   `google`, `reviews`); `text` is the plain sentence an owner would understand; `fire(c)`
   returns `null`, `true`, or `{ scale, text }`. Never let one fact score twice: check
   `c.fired` if another signal uses the same evidence.
3. **Document** it in `docs/SCORING.md` (id, default weight, detection, caveats) and, if it
   changes how the website audit is explained, in `skills/audit-websites/references/signals.md`.
4. **Test** with a fictional fixture site in `test/fixtures/sites/<case>/` and a case in
   `test/node/site.test.mjs` and `test/node/score.test.mjs`. Include a negative case (a page
   that must not fire).

## Adding a proposal language

1. Copy `templates/proposal/strings/en.json` to `<lang>.json` (ISO 639-1, e.g. `de.json`)
   and translate the values. Keep `{placeholders}` exactly. Missing keys fall back to English.
2. Set `_dir` (`ltr` or `rtl`). For non-Latin scripts set `_fonts_css` (a Google Fonts URL)
   and `_font_stack`.
3. Render the demo package in that language (`proposals.language: "<lang>"` in a test
   project) and check both Letter and A4: long words must not overflow. The limits in
   `templates/proposal/limits.json` are checked by the QA step.
4. Native-speaker review is required before merge. Plain, polite business language; no hype.

## Adding a niche profile or sales material

Edit `skills/score-leads/references/niche-profiles.md` or the files in
`skills/sales-playbook/references/`. Use real signal ids, fictional examples, and label
example prices as examples. Compliance statements must cite the law by name and end with
"not legal advice" where they give rules.

## Pull requests

- One change per PR, with tests.
- `npm test` and `node scripts/privacy-scan.mjs` pass.
- Update `CHANGELOG.md` under "Unreleased".
- By contributing you agree your work is released under the MIT License.
