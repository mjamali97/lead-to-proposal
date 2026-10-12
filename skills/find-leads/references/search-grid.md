# Designing the search grid

The grid is **segments × locations × depth**. The aim: the smallest set of searches that
covers the market without paying for the same business twice.

## Segments

One segment per kind of business you sell to, ranked:

| Field | Meaning | Tip |
|---|---|---|
| `key` | short id (`plumbing`) | Use it in `--source` and reports |
| `tier` | A/B/C run order | Highest ticket and clearest need = A, run first |
| `ticket` | premium / mid / low | What one new customer is worth to them |
| `search` | 2–5 terms | Most specific first; Google's own category names |
| `locations` | search strings | "Austin, TX", "Lyon, France" |
| `max_per_search` | depth | 20 for pilots, 40–60 for full runs, 120 only for dense niches |

## Locations

Group places as core (main city), ring 1 (big suburbs), ring 2, rural. Start with core.

Big cities expand: a search on the main city already returns most districts. Add a
district only when the city search returns exactly `max_per_search` results (it was cut
off, so there is more to find). Otherwise you pay twice for the same places.

## Cost

```
ceiling (places) = Σ segments ( locations × terms × max_per_search )
ceiling ($)      = places × price per place
```

Example (fictional): 2 segments × 2 locations × 3 terms × 40 = 480 places ≈ $3 without
reviews. The dry run (`l2p collect`) prints the real figure. Keep the pilot under $1.

## Local-language terms

Use Google's category names in the local language. A few examples:

| Business | en | de | fr | es | it | nl |
|---|---|---|---|---|---|---|
| Plumber | plumber | Sanitärinstallateur, Klempner | plombier | fontanero | idraulico | loodgieter |
| Dentist | dentist | Zahnarzt | dentiste | dentista | dentista | tandarts |
| Hair salon | hair salon | Friseur | salon de coiffure | peluquería | parrucchiere | kapper |
| Lawyer | lawyer | Rechtsanwalt | avocat | abogado | avvocato | advocaat |
| Car repair | auto repair shop | Autowerkstatt | garage automobile | taller mecánico | officina meccanica | autogarage |

For other niches and countries, run this prompt (you can answer it yourself):

```text
I want to find {TYPE OF BUSINESS} in {CITY / REGION, COUNTRY} on Google Maps.
1. Give 8–12 search terms in the local language(s), using the exact category names
   Google Maps uses in that country, most specific first. Mark heavy overlaps.
2. Split the region into core, ring 1, ring 2, rural. Say which districts a search on
   the main city already returns.
3. List the 15–30 largest franchises, chains and group-owned brands in this niche and
   country (for scoring.disqualify.chain_patterns).
4. Name any public registry, licensing board or association directory that lists these
   businesses, and whether it offers an export or API.
```

## Checklist before the full run

- [ ] Every term tested by hand in Google Maps in the target city
- [ ] No district that the city search already covers
- [ ] `max_reviews: 0`
- [ ] Pilot output checked (right businesses, right fields)
- [ ] Dry-run ceiling under budget, user said yes
