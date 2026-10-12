# OpenStreetMap tags by niche

Use in `sources[osm].tags` as `[key, value]` pairs. Reference:
https://wiki.openstreetmap.org/wiki/Map_features. Coverage varies a lot by city; run a
pilot and count results before relying on OSM alone.

| Niche | Tags |
|---|---|
| Plumbing / HVAC / electrical | `["craft","plumber"]`, `["craft","hvac"]`, `["craft","electrician"]`, `["craft","heating_engineer"]` |
| Roofing / building | `["craft","roofer"]`, `["craft","carpenter"]`, `["craft","builder"]`, `["office","construction_company"]` |
| Painting / flooring | `["craft","painter"]`, `["craft","floorer"]`, `["craft","tiler"]` |
| Landscaping | `["craft","gardener"]`, `["shop","garden_centre"]` |
| Restaurants / cafés | `["amenity","restaurant"]`, `["amenity","cafe"]`, `["amenity","fast_food"]`, `["shop","bakery"]` |
| Hair / beauty | `["shop","hairdresser"]`, `["shop","beauty"]`, `["shop","cosmetics"]`, `["leisure","spa"]` |
| Dental / medical | `["amenity","dentist"]`, `["healthcare","dentist"]`, `["amenity","clinic"]`, `["amenity","doctors"]`, `["healthcare","physiotherapist"]` |
| Legal / accounting | `["office","lawyer"]`, `["office","notary"]`, `["office","accountant"]`, `["office","tax_advisor"]` |
| Real estate | `["office","estate_agent"]` |
| Auto | `["shop","car_repair"]`, `["shop","tyres"]`, `["amenity","car_wash"]`, `["shop","car"]` |
| Fitness | `["leisure","fitness_centre"]`, `["sport","yoga"]` |
| Pets | `["shop","pet"]`, `["amenity","veterinary"]`, `["shop","pet_grooming"]` |

OSM records often carry `phone`, `website`, `email`, `opening_hours` and `addr:*` tags.
Many do not. Plan a `google` lookup for OSM-only businesses if rating and review count
matter to your scoring.
