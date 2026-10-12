---
name: lead-workbook
description: Export and use the lead workbook (out/leads.xlsx) from l2p export. Use when the user wants the Excel or Google Sheets call list, asks what a column means, how to filter or sort it, how to work the list day to day, how to record calls, statuses and next steps, how to move it into Google Sheets, Notion or a CRM, or wants a CSV of a subset of leads.
---

# Lead workbook: `l2p export`

CLI: `node <plugin-root>/bin/l2p.mjs export` (plugin root = two levels above this skill's
base directory), or `l2p export`. Needs Python 3.10+ with `openpyxl` (`l2p doctor` checks).
Writes `<project>/out/leads.xlsx` from `data/scored.json`. Free; re-run after every
`l2p score`.

## What's in it

Four sheets:

| Sheet | What | Use |
|---|---|---|
| **Call list** | Tiers A and B, not disqualified, best first | What you call this week. Type your notes here |
| **All leads** | Every live row with the full evidence trail (reasons, source links, place id, flags) | Research and filtering |
| **Disqualified** | What was cut and why | Reverse a judgement call by fixing the rule and re-scoring |
| **Read me** | What each column means, how the score works, counts per source and tier, the compliance note | Send this to anyone else working the list |

Call list columns, left to right (check the header row; versions may differ slightly):

| Group | Columns | Use |
|---|---|---|
| Ranking | Tier, Priority, Need, Interest | Work A first |
| Business | Business, Category, City, Sources, Owner | Who; "Not published" owner means none was found |
| Phone | Phone, Phone check, Phone on website, Phone on Google | MISMATCH = the two disagree; confirm before calling |
| Email | Email, Email found at | The page it was published on (your consent record under CASL / Spam Act) |
| Web | Website, Website type, SEO score and band, Google rating, reviews, Maps link, Runs ads, Incumbent agency, Defects | The evidence |
| Talk track | Why they need you, Why they will care, Risk | Plain sentences to use on the call; check Risk first |
| Rules | Channel, Outreach rule | How first contact is allowed under your compliance regime |
| **Working** | Called on, Outcome, Next step, Next step date, Objection, Notes | Yours to fill in |
| Key | ID | Matches the row to `data/scored.json`, `l2p queue` and proposal folders |

## How to work the list (daily)

1. On **Call list**, filter Outcome = empty, sort by Next step date, then Priority.
2. Before each call, read Why they need you and Risk, and open the lead's landing-page PDF
   if a package exists (`proposals/<slug>/`). Pick one specific, true problem to mention.
3. After each call, fill **Called on**, **Outcome**, **Next step** and **Next step date**
   (required: a booked time, a clear no, or a callback time the owner chose), and the
   **Objection** in their words.
4. Log the touch in the follow-up clock too: `l2p queue --sent <id> --channel phone`.
   Each morning, `l2p queue --due` lists what is due.
5. Friday: count outcomes for the scoreboard (sales-playbook skill, `scoreboard.md`).

Suggested Outcome values (the sales-playbook stages): Reached · Diagnosed · Demo booked ·
Demo held · Deposit paid · Live · Nurture · Lost (with a reason in Notes). Use the same
spelling every time so counts work.

## Re-exporting keeps your notes

`l2p export` rebuilds the workbook from `data/scored.json` and carries the working columns
(Called on ... Notes) over from the previous `out/leads.xlsx`, matched by **ID**. So re-score
and re-export freely, as long as:
- the file stays at `out/leads.xlsx` and is closed in Excel while exporting;
- the ID column is not edited or deleted;
- notes are typed in the working columns (other cells are overwritten).

If the user needs more working fields (Their problem, Job value, Decision maker, Demo date,
Package, Deposit date), keep a separate CRM sheet joined on ID (header row:
`<plugin-root>/templates/playbook/crm-columns.csv`).

Export refuses to write (exit 1) if two rows share a phone, website domain, Instagram handle or
Google place id. That means merge missed a duplicate: read the message, fix the data or the
merge rule, then `l2p merge && l2p score && l2p export`.

## Google Sheets, Notion, CRMs

- **Google Sheets:** File → Import → Upload `leads.xlsx` → "Replace spreadsheet". Add a
  data-validation dropdown on Outcome and conditional formatting: amber when Next step date
  is today, red when it has passed (`=AND($N2<>"", $N2<TODAY())`, where N is the Next step
  date column).
- **Notion / Airtable / a CRM:** import the CSV version. Make one yourself from
  `data/scored.json` with the columns the user wants (use `toCSV` from `lib/io.mjs`, or a
  short Python script). Keep the `id` column so later exports can be matched.
- **Days in process:** add `=TODAY()-<first contact date>` so stale leads stand out.

## Subsets on request

For "give me only dentists in tier A with no website", filter `data/scored.json` and write
a CSV to `out/` (never inside the plugin folder). For the weekly call list with evidence
and package links, use `l2p queue --n 20 [--tier A] [--group health]` instead.

## Privacy

The workbook holds business contact data. Keep it in the project folder, share it only
with people working the list, and delete leads who ask to be removed
(`l2p queue --stop <email|phone|id>` keeps them out of every future queue).
