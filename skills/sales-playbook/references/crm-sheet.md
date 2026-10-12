# CRM sheet

One row per lead. Header row ready to paste: `templates/playbook/crm-columns.csv`.
Works in Google Sheets, Excel, Notion or Airtable.

## Columns

| Column | Required | What goes in it |
|---|---|---|
| Lead ID | yes | The `id` from `scored.json` (e.g. `b_1a2b3c4d5e6f`), so exports can be matched |
| Business | yes | |
| Contact name | | Owner or decision maker |
| Phone, Email, Website | | From the workbook (three columns) |
| Source | yes | Dropdown: one spelling per source (Google Maps, OSM, Directory, CSV, Referral, Walk-in, Community group, Social) |
| Group, Tier | | From the workbook (two columns) |
| Stage | yes | Dropdown: New, Reached, Diagnosed, Demo booked, Demo held, Deposit paid, Live, Nurture, Lost |
| First contact date | yes | |
| Last contact date | | |
| Next step | yes | A concrete action: "Demo", "Call back", "Send agreement" |
| Next step date | **yes, always** | A date (and time) the owner agreed or chose |
| Their problem | | In their own words |
| Job value | | Their number |
| Decision maker | | "Owner only", "Owner + partner" |
| Demo date | | |
| Package | | Plan name |
| Price | | |
| Deposit date | | |
| Lost reason | | Required when Stage = Lost |
| Objection | | The exact objection, for the weekly review |
| Package link | | Path or private link to their PDFs (for your use, not the client's) |
| Days in process | formula | `=IF(K2="","",TODAY()-K2)` (K = First contact date) |
| Notes | | |

## Formatting

- **Data validation** dropdowns on Source and Stage. One spelling per value, so counts work.
- **Conditional formatting** on the row (column letters as in `crm-columns.csv`:
  J = Stage, N = Next step date):
  - amber when due today: `=$N2=TODAY()`
  - red when overdue: `=AND($N2<>"", $N2<TODAY(), $J2<>"Lost", $J2<>"Live")`
- Freeze the header row and the Business column.
- Sort by Next step date every morning.

## Habits

- Fill Next step date before you hang up. A blank Next step date is a bug.
- Write Their problem and Job value in their words on the diagnosis call.
- Keep stages honest: move a row only when the exit test (`pipeline-stages.md`) is met.
- Log the same touches in `l2p queue --sent` so `l2p queue --due` stays right, or work
  only from the sheet and skip the CLI clock. Pick one source of truth for follow-ups.
