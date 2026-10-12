# Landing page design brief

You are designing one new landing page for one real local business: `landing-page/index.html` plus
`landing-page/assets/`. The owner will see it inside a sales proposal before a phone call, so it must
look like *their* business on a very good day: their logo, their colours, their photos, their reviews
and services, in a layout and typography that are clearly better than what they have now.

**Identity unchanged, presentation new.** Never redraw their logo, never invent a logo mark, never
use stock photos that pretend to be them, never invent facts.

## 1. Collect the identity

Start from `job.json` → `site.brand` (made by the website audit):

| Field | Use |
|---|---|
| `logo[]` | Candidates in order of trust: `img[alt~=logo]`, header image, `og:image`, `apple-touch-icon`, favicon. Open each; take the real logo at the best resolution. |
| `colors[]` | `css-var` and `theme-color` are usually deliberate; `inline` and `logo` are hints. High `weight` = used a lot. |
| `fonts[]` | Hints of their taste, not a requirement. Keep the feel (serif vs sans, condensed vs wide), choose a better font. |
| `photos[]` | Real photos of their place, team or work (`kind`: hero, team, work, gallery). |
| `tagline`, `description` | Their own words. Reuse phrases they already use. |

Also look at photos they publish themselves: their Google Maps listing, Instagram, Facebook. Download
with `PY CAPTURE fetch <url> landing-page/assets/<name>`. Keep 3-8 good photos. Prefer photos with
people, the storefront, the work itself; skip blurry, tiny, watermarked or third-party images. Check
each photo really shows *this* business.

### Picking the palette
1. If the logo or sign has strong colours, those are the brand: `PY PALETTE assets/logo.png`
   prints dominant non-neutral colours with contrast on white and the readable text colour.
2. If the site's CSS colours are generic (theme defaults such as WordPress blue `#0073aa`,
   Bootstrap `#007bff`, Wix/Squarespace template greys), ignore them and use the logo or sign.
3. Build a small system: one brand colour, one deep ink (a near-black tinted toward the brand), one
   light surface (a warm or cool off-white), one accent only if the logo has a second colour.
   Body text ≥ 4.5:1 contrast. Buttons use the brand colour only when white text on it reads
   (`text_on_it` from the palette tool); otherwise use the ink colour for buttons and the brand
   colour for details.
4. Write the colours as CSS variables at the top of the page and in `content.json` → `brand.colors`,
   with where each came from.

### No logo
Set their real name as a clean wordmark: one good font, well spaced, in the brand or ink colour, maybe
a simple rule or dot. No icon, no symbol, no "logo" you made up. For the proposal cover, make a PNG of
the wordmark: write `wordmark.html` with `<div class="mark">Name</div>` and run
`PY CAPTURE html wordmark.html assets/wordmark.png --selector .mark --transparent`.

### No photos
Design with typography, colour fields, simple geometric shapes, icons and real content (services,
reviews, hours, map). A strong typographic hero beats a fake photo every time.

## 2. Structure

One page, mobile first, in this order unless the business needs another:

1. **Header:** logo, 3-5 anchor links, phone number, primary button. Sticky is fine; keep it slim.
2. **Hero (first screen):** one `<h1>` that says something specific (name, place, speciality, year:
   "Austin's family plumbers since 2004", not "Quality service you can trust"), one short supporting
   line, the primary call to action plus tap-to-call, and the trust element **above the fold**:
   Google rating with review count (written so it can't be misread: "4.8 out of 5 from 127 Google
   reviews"), credentials, years in business (only if stated by them). Their best photo.
3. **Services:** their real services, in their words, each with a link that pre-fills the form.
4. **Proof:** real reviews (short quotes, first name + initial, source and date in `content.json`),
   team or owner, credentials, before/after or gallery of their work.
5. **How it works / what to expect** (optional, only what they actually do).
6. **Area and hours:** towns or neighbourhoods they serve, opening hours, address, a **static map
   image** (download a map tile they may use, or draw a simple area graphic) with a link to Google Maps.
   No `<iframe>`: embeds do not print or screenshot reliably.
7. **Contact / quote form:** 3-5 fields, no backend. Submit opens a pre-filled WhatsApp message
   (`https://wa.me/<number>?text=...`), SMS (`sms:`) or email (`mailto:`), whichever they use.
8. **Footer:** name, address, phone, email, hours, social links they own, © current year.
9. **Mobile call bar:** fixed at the bottom on small screens: Call · WhatsApp/Text · primary action.
   Add `padding-bottom` to `body` so it never covers content. Mark it `data-capture-hide` so
   full-page screenshots leave it out.

### Main call to action by industry
| Industry | Primary action | Secondary |
|---|---|---|
| Trades and home services | Get a free quote | Call now |
| Legal, immigration, notary | Book a free consultation / case assessment | Call |
| Dental, medical, clinics | Book an appointment (new patients) | Call |
| Beauty, salons, spas | Book online | See results / gallery |
| Restaurants, cafés, food | Order / reserve / see the menu | Call, directions |
| Auto | Book a service | Call |
| Real estate, mortgage | Free home evaluation / pre-approval call | Call |
| Accounting, insurance, consulting | Free consultation / get a quote | Call |
| Education, driving schools | Enrol / book a lesson | Call |
| Retail | Visit (directions, hours) / order on WhatsApp | Call |

Always also: tap-to-call (`tel:` with the full international number), WhatsApp if they use it.

## 3. Design quality

- **Original for this business.** Choose a direction that fits the trade and the brand: split hero,
  full-bleed photo, editorial, bold typographic, card-based, warm craft. Vary type pairing, spacing
  and section rhythm. It must not look like a template or like any other package.
- Typography: one or two families (Google Fonts are fine, or `woff2` files in `assets/fonts/`).
  Big confident headings, 16-18 px body, line length 50-75 characters.
- Spacing: a consistent scale; generous section padding (64-110 px desktop, 48-72 px mobile).
- Images: `width`/`height` attributes, `object-fit: cover` with sensible focus, compressed (< 300 KB
  each; resize big photos with Pillow).
- Motion: none needed. If you add any, it must not hide content: every reveal is disabled under
  `prefers-reduced-motion: reduce` (screenshots are taken that way).
- Test at 1440 px and 390 px wide (render.py does both). Nothing may overflow horizontally.

## 4. Technical checklist (qa.py checks these)

- Self-contained: inline CSS and JS, no frameworks, no external scripts. Only Google Fonts may load
  from outside. Every `src` points to a file in `assets/` (or a data URI).
- Exactly one `<h1>`; one `<title>` (name + what + where, ≤ 60 characters); one meta description
  (≤ 155 characters, real facts); `<meta name="viewport" content="width=device-width, initial-scale=1">`;
  Open Graph `og:title`, `og:description`, `og:image`, `og:type`.
- JSON-LD with the right schema.org type (`Plumber`, `Dentist`, `LegalService`, `Restaurant`,
  `BeautySalon`, `AutoRepair`, `RealEstateAgent`, or `LocalBusiness`) and real data only: name,
  url, telephone, address, geo if known, openingHoursSpecification, aggregateRating only with the
  real rating and count, areaServed, image, logo.
- `alt` on every image, describing what it shows ("The Northwind van outside a house in Austin"),
  `alt=""` only for pure decoration. `loading="lazy"` on images below the first screen.
- Tap-to-call link with the business's phone; no placeholder text (lorem ipsum, TODO, "[your ...]").
- `lang` on `<html>`; a secondary language block gets its own `lang`.

## 5. Language

Write in the language the customers use (`job.json` → `language`, from `market.language` or
`proposals.language`). Use the business's own spelling of names and places.

Optional secondary language (`job.json` → `secondary_language`), e.g. the community language of the
owner and customers: add a short line under each main heading, or a language switch. Correct spelling
and typography matter; if you are not sure of a phrase, leave it out.

**Right-to-left scripts (Arabic, Persian, Hebrew, Urdu):** set `dir="rtl"` and `lang` on that block
(or on `<html>` for a full RTL page), use a font made for the script, use CSS logical properties
(`margin-inline-start`, `inset-inline-end`, `text-align: start`). Wrap phone numbers, prices, opening
hours, dates, URLs, emails and Latin-script names or quotes in `<bdi dir="ltr">` / `<span dir="ltr">`
islands so they don't flip. Persian needs the zero-width non-joiner (U+200C) where words require it.
Check the rendered screenshot: letters joined correctly, punctuation on the right side.

## 6. `content.json`

Every fact on the page, and where it came from, so the studio can verify it and reuse it later:

```json
{
  "collected": "YYYY-MM-DD",
  "business": { "name", "category", "owner", "address", "phone", "email", "website", "hours", "area", "google": { "rating", "reviews" } },
  "brand": { "logo", "colors": { "name": "#hex" }, "color_source", "fonts", "photos": [], "photo_sources" },
  "services": [{ "name", "source" }],
  "reviews": [{ "name", "rating", "text", "source", "date" }],
  "sources": [{ "fact", "source" }]
}
```

`sources` is required. A source is a URL, "job.json → business.google", or a screenshot file.

## 7. README

Copy `paths.readme_template` to `landing-page/README.md` and fill in the `{{...}}` values.
