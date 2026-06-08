# RealOEM ↔ Cars DB alignment

## Goal

Two-step:

1. Add an **engine** dimension to `Car` so the same chassis/model split-by-engine variant is representable.
2. Use realoem as the canonical source of truth for the BMW catalogue, **so a part-number lookup on realoem can be auto-matched 1:1 to our `Car` rows** during the add-part flow.

Currently parts→cars compatibility is filled in manually — long, tedious. Once the schema matches realoem's vehicle key, lookup becomes deterministic.

## Current state of `Car`

```prisma
model Car {
  id         String       @id @default(cuid())
  make       String       // "BMW" | "Land Rover"
  series     String       // "5 Series", "X5", ...
  generation String       // "E60 (2002 - 2007)" — display string, brittle
  model      String       // "540i", "M3", ...
  body       String?      // partial; some empty strings ""
  Donor      Donor[]
  parts      PartDetail[]
}
```

- 602 rows. BMW: 598. Land Rover: 4.
- 600 / 602 are linked from `PartDetail.cars` (M2N). 31 carIds linked from `Donor`. **IDs must be preserved** — update or insert only, never destructive.
- 22 dupe groups today (same `make,series,generation,model`), all differentiated by `body` (Coupe / Sedan / Convertible / Touring). One exception: two `ActiveHybrid 7` rows under `F01 LCI` with no body diff — pre-existing data bug.
- 77 rows have `body` set; some are the empty string `""` (X5 G05 etc.) — needs normalisation.
- `series` `PE000` / `SS000` are placeholders (excluded from public dropdowns) — skip on import.

## Why realoem can't be matched cleanly today

RealOEM's vehicle key on a part-detail page is:

```
5' E60, 540i, Sedan, N62N, EUR, (NB11)
└────┘ └─┘  └──┘  └───┘  └──┘  └───┘
series chass model body  engine market vehId
```

Our DB has `series`, `generation` (display string containing chassis), `model`, `body?`. Missing:

- A clean **chassis code** field — currently embedded in `generation`, format-fragile.
- An **engine code** field — entirely absent.

## Schema change

Add two columns to `Car`:

```prisma
model Car {
  id          String       @id @default(cuid())
  make        String
  series      String       // display: "5 Series"
  generation  String       // display: "E60 (2002 - 2007)"
  chassisCode String?      // realoem join key: "E60", "E60N", "Z3", "F92", ...
  model       String
  body        String?      // verbatim from realoem ("Sedan", "5 doors", "Gran Coupé"...)
  engine      String?      // realoem short engine code: "N62", "N62N", "S54", "B58"
  Donor       Donor[]
  parts       PartDetail[]

  @@unique([make, chassisCode, model, body, engine])
  @@index([chassisCode])
}
```

- Both new fields **nullable** in schema (Land Rover stays NULL forever; realoem is BMW-only).
- For BMW rows, NOT NULL is enforced at the **Zod / app layer**, not at DB level.
- Compound unique index supports idempotent upserts.

### Engine: string vs separate `Engine` model

Decision: **inline `engine: String`** (short realoem code, e.g. `N62N`).

- Lighter, no joins, matches realoem text directly.
- Promote to a separate `Engine` model later only if engine attributes (displacement, fuel, power) are needed. Cheap FK refactor at that point.

## Match function (the whole point)

For each parsed realoem `<li>`:

```
{ series:"5'", chassis:"E60",  model:"540i", body:"Sedan", engine:"N62N", market:"EUR", vehId:"NB11" }
                                       ↓
DB:  Car where chassisCode="E60" AND model="540i" AND body="Sedan" AND engine="N62N"
```

- `series` shorthand is redundant given chassis is unique; ignore for lookup.
- `market` is collapsed (EUR / USA / ROW all → same Car). Australian dismantler doesn't care.
- `vehicleId` (e.g. `NB11`) is realoem's per-spec sub-variant (transmission/equipment) — discard.

## Series shorthand → series name (scrape-side dict)

```
"1'" → "1 Series"     "X1" → "X1"
"2'" → "2 Series"     "X2" → "X2"
"3'" → "3 Series"     "X3" → "X3"
"4'" → "4 Series"     "X4" → "X4"
"5'" → "5 Series"     "X5" → "X5"
"6'" → "6 Series"     "X6" → "X6"
"7'" → "7 Series"     "X7" → "X7"
"8'" → "8 Series"     "Z3" → "Z3"
"i"  → "i Series"     "Z4" → "Z4"
```

Only used during scrape; stored data uses the full name.

## ChassisCode derivation rules

From DB `generation` strings:

| Input                     | Output                                  |
| ------------------------- | --------------------------------------- |
| `"E60 (2002 - 2007)"`     | `E60`                                   |
| `"E60 LCI (2006 - 2010)"` | `E60N`                                  |
| `"F92 M8 (2017 - 2025)"`  | `F92`                                   |
| `"G90 M5 (...)"`          | `G90`                                   |
| `"G81 M3 Touring (...)"`  | `G81`                                   |
| `"E36/7 (1995 - 2002)"`   | `Z3` (special remap, body = `Roadster`) |
| `"E36/8 (1995 - 2002)"`   | `Z3` (special remap, body = `Coupe`)    |

Algorithm:

1. Apply explicit remap table first (`E36/7 → Z3`, `E36/8 → Z3`).
2. Otherwise: strip ` (year - year)` suffix → take all whitespace tokens → if any token is `LCI`, replace it with `N` appended to the chassis token. Trim trailing labels (`M8`, `M5`, `M3 Touring`, etc.).

## Data-quality bugs surfaced (existing rows)

These pre-date this work; flag in dry-run report, do **not** auto-fix:

- Two `F20` generations (`(2010 - 2015)`, `(2014 - 2019)`) — the latter should be `F20 LCI`.
- Two `E66` rows (`2001-2008`, `2002-2008`).
- Two `F95` rows (`2017-2023`, `2018-2023`).
- `F40 (2011 - 2013)` — F40 is the post-2019 1-Series chassis; year range wrong.
- `F98 (2019 - Current)` — inconsistent: should be `Present`.
- Two `ActiveHybrid 7` rows under `F01 LCI` with no body diff — actual chassis is `F04`.

## Confirmed gotchas

1. **N-suffix rule for LCI is universal** in realoem URLs: `E60→E60N`, `E70→E70N`, `E83→E83N`, `E87→E87N`, `E90/91/92/93→E90N/E91N/E92N/E93N`, `F01→F01N`, `F30/31/34→…N`, `G07→G07N`, `G11→G11N`, `G20/G21/G28/G81→…N`. Verified by sampling.
2. **Z3 chassis is `Z3`** — realoem does not split E36/7 vs E36/8. Body distinguishes (Roadster / Coupe).
3. **M-cars use distinct chassis** (F80/F82/F83 for M3/M4 F-gen, G80/G81/G82/G83 for M3/M4 G-gen, F91/F92/F93 for M8). DB already uses these. ✓
4. **Bodies are verbatim**: `Sedan`, `Coupe`, `Convertible`, `Touring`, `Roadster`, `Hatchback`, `Compact`, `Gran Coupé` (with é), `3 doors`, `5 doors`, `SAV`, `Cabrio`. Take from realoem as-is.
5. **Hybrid chassis are distinct**: `E72` (X6 ActiveHybrid), `F04` (ActiveHybrid 7). DB doesn't have these correctly today — see data bugs.
6. **Motorcycle series** (`C`, `F`, `G`, `K`, `R` as standalone letters in the realoem series index) — **skip** during scrape.
7. **Alpina** rows in realoem (`BMW_ALPINA_D3s` etc.) — **skip** during scrape.
8. **Markets** — collapse EUR / USA / ROW into a single Car row.
9. **VehicleId** (NB11 etc.) — discard during match.

## Decisions

- Backfill `body` and `engine` from realoem, verbatim short form for engine.
- BMW NOT NULL on `chassisCode` / `engine` enforced at Zod / app layer; column stays nullable for Land Rover.
- Manual review of orphans (DB-only BMW rows) before any cleanup.
- Land Rover (4 rows): never touched. `chassisCode` / `engine` stay NULL.
- Skip Alpina, motorcycles, PE000, SS000.
- Collapse markets, discard vehicleId.

## Implementation steps

### 1. Migration: add columns

```prisma
chassisCode String?
engine      String?
@@unique([make, chassisCode, model, body, engine])
@@index([chassisCode])
```

Plus one-shot SQL: normalise `body = ''` to `NULL` for the rows where it applies.

### 2. Backfill `chassisCode` from existing `generation`

Deterministic script. Uses derivation rules above. Applies to all BMW rows (and any LR rows: leave NULL).

### 3. Scraper: `scripts/scrape-realoem.ts` (one-time)

Headless Chrome via Playwright. Walks:

```
/bmw/enUS/vehicles?series=<shorthand>&page=<n>
```

For each car-series shorthand (1'–8', X1–X7, Z3, Z4, Z8, i3/i4/i5/i7/i8/iX). Each page row gives:

```
{ seriesText, model, typeCode, body, productionRange, market }
```

Engine code is **not** on the index page — it lives on the part-search drill-in (`partxref?q=…&series=…`). Two scrape paths possible:

- **(A)** Walk the index page → for engine, scrape each `partgrp?id=…` page. Slow but complete.
- **(B)** Use a single popular part number's xref tree to harvest a wide engine-code map quickly, then top up via the index walk. Faster but partial.

Default to (A). Output `data/realoem-bmw.json`:

```json
[
  {
    "series": "5 Series",
    "chassisCode": "E60",
    "model": "540i",
    "body": "Sedan",
    "engine": "N62N",
    "yearFrom": "2005-02",
    "yearTo": "2007-02"
  },
  ...
]
```

Filters during scrape:

- Skip motorcycles (series=C/F/G/K/R standalone).
- Skip rows where model contains `ALPINA`.
- Collapse rows differing only in `market` or `typeCode`.

CF challenge: scraper relies on a real Chromium with cached CF clearance cookie. Throttle ~1 req/sec, jittered. Resumable.

### 4. Importer: `scripts/upsert-cars-from-realoem.ts`

Per realoem entry `e`:

1. Match candidates: DB rows where `make='BMW' AND chassisCode=e.chassisCode AND model=e.model AND (body=e.body OR body IS NULL OR body='')`.
2. Bucket:
   - If a candidate already has `engine = e.engine` → no-op.
   - If a candidate has `engine IS NULL` → **update** that row: set `engine = e.engine`, set `body = e.body` if currently null/empty. First-come-first-served per `(chassisCode, model, body)` group.
   - Else → **insert** a new `Car` with the realoem fields.

Flags:

- `--dry` (default) — print report, no DB writes.
- `--apply` — wrap all writes in one transaction.

### 5. Dry-run report (four sections)

1. **WILL INSERT** — realoem variants not in DB. Grouped by `(chassisCode, model, body)`.
2. **WILL UPDATE** — existing rows getting `engine` / `body` backfilled. FK relations preserved.
3. **DB-ONLY (BMW)** — BMW rows realoem does not list. Includes:
   - Genuine orphans (deprecated / typo chassis)
   - The data-quality bugs listed above
   - PE000 / SS000 (skipped placeholders, listed for completeness)
     **Manual review required before cleanup.** No auto-delete (FK-linked).
4. **UNTOUCHED** — Land Rover (4 rows).

### 6. Apply

After user reviews section 3, run with `--apply`.

### 7. Backwards-compat & app surface

- `src/server/api/routers/car.ts`: add `chassisCode` and `engine` to `carSchema`, add `getMatchingEngines` (mirrors `getMatchingModels`), update `create`/`update`. Zod requires `chassisCode` + `engine` when `make === 'BMW'`.
- `src/app/admin/cars/_components/car-form.tsx`: add engine input.
- Public car-picker page: append engine step after model (skippable = "any").
- Donor / Part flows where car is shown — surface engine.

### 8. Live part-lookup endpoint (the actual goal)

`POST /api/realoem/lookup` `{ partNo }`:

1. Headless browser session (long-running, CF clearance cached) → `GET https://www.realoem.com/bmw/enUS/partxref?q=<partNo>`.
2. Parse top-level `<li>` chassis links.
3. For each chassis: `GET partxref?q=<partNo>&series=<chassisURLToken>`.
4. Parse drill-in `<li>` lines into `(chassis, model, body, engine, market, vehicleId)`.
5. Collapse by `(chassis, model, body, engine)`; drop market + vehicleId.
6. Lookup each tuple in `Car` via the unique compound index. Collect matched `carId[]`.
7. Return `{ matched: Car[], unmatched: ParsedRow[] }` so the form can flag misses.

Wire into the add-part form: paste part number → autofills compatible cars → user confirms → save to `PartDetail.cars` M2N.

### 9. CF infrastructure

RealOEM is behind Cloudflare managed challenge. Plain `curl` / `WebFetch` returns 403.

Recommended: **persistent server-side headless Chromium** with cached CF clearance cookie + throttling + retries. Same browser used for the one-time bulk scrape and the live lookup endpoint. Alternative options (browser extension on user's machine, third-party CF-bypass service) rejected as either too manual or too fragile.

## File layout

```
prisma/
  migrations/<timestamp>_add_car_chassis_engine/
scripts/
  scrape-realoem.ts
  upsert-cars-from-realoem.ts
  data/
    realoem-bmw.json          (generated)
src/
  server/
    api/
      routers/
        car.ts                (chassisCode + engine added)
    realoem/
      browser.ts              (CF-clearance browser pool)
      lookup.ts               (part-number → matched Cars)
  app/
    admin/cars/_components/car-form.tsx   (engine input)
    api/realoem/lookup/route.ts           (live endpoint)
realoem.md                    (this file)
```

## Open / future

- Engine attribute promotion to its own `Engine` model (deferred until needed).
- Whether to surface the chassis code in the public picker (probably no — keep display strings).
- Soft-delete pattern for orphaned BMW rows that lose their FK relations after manual review.
