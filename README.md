# Austria Population Tracker

An interactive dashboard of Austria's population by region, from 2002 to today. Select a
Bundesland or Bezirk on the map to inspect its time series; the map colouring shows how
fast each region is growing or shrinking.

**Live demo:** [bethadata.github.io/austria-population-tracker](https://bethadata.github.io/austria-population-tracker/)

---

## Features

- **Interactive map** — Bundesländer (9) and politische Bezirke incl. Vienna's 23 Gemeindebezirke (116), click to select, zoom floored at the whole-country view
- **Change-rate colouring** — diverging scale centred on zero, switchable between annualised growth (CAGR), relative and absolute change over a 1 / 5 / 10 / 24-year window
- **Time series** — absolute values, relative change, absolute change and indexed views, with an optional citizenship breakdown; shown beside the map rather than below it, so both fit one screen
- **Region detail** — the map's own indicator as a single headline figure, plus a ten-year table with years across the columns and population, absolute and relative change down the rows
- **Quarterly detail** — at Bundesland level, with a 5-way citizenship split and provisional periods clearly marked
- **Searchable, sortable list** — all 2 256 regions down to municipality level, ranked by fastest growing / shrinking / largest
- **Bilingual** — German and English, with a persisted preference
- **Light and dark themes** — both selected and validated, not an automatic flip
- **Static deployment** — runs entirely in the browser, no server and no API keys

---

## Tech Stack

| Category | Library / Tool | Version |
|---|---|---|
| Framework | [Vue 3](https://vuejs.org/) | 3.5 |
| Language | TypeScript | ~5.9 |
| Build tool | [Vite](https://vitejs.dev/) | 8 |
| UI components | [Vuetify](https://vuetifyjs.com/) | 4 |
| Map | [MapLibre GL JS](https://maplibre.org/) | 6 |
| Charts | [Plotly.js](https://plotly.com/javascript/) (basic bundle) | 3.7 |
| State | [Pinia](https://pinia.vuejs.org/) | 4 |
| Routing | Vue Router (hash mode) | 5 |
| i18n | Vue I18n | 11 |
| Data pipeline | Python (standard library only) | 3.10+ |

---

## Getting Started

```bash
npm install
npm run dev            # http://localhost:5173
```

Other scripts:

```bash
npm run build          # type-check + production build
npm run typecheck
npm run data           # refresh data from Statistik Austria
npm run data:validate  # re-run validation on the current data
npm run data:geo       # rebuild boundary geometry (rarely needed)
```

### Browser tests

```bash
npm run build
npm run preview          # serves on :4174
npm run test:smoke       # functional assertions, exits non-zero on failure
npm run test:inspect     # console/network sweep + screenshots per route
```

`test:smoke` asserts the paths that fail *silently* — most importantly that
MapLibre's GeoJSON source actually loaded, since a dead worker leaves the map
blank with nothing in the console.

---

## Data

### Sources

| What | Source | Coverage |
|---|---|---|
| Annual population by region | [Statistik Austria — Bevölkerung zu Jahresbeginn](https://www.statistik.at/statistiken/bevoelkerung-und-soziales/bevoelkerung/bevoelkerungsstand/bevoelkerung-zu-jahres-/-quartalsanfang) | 2002–2026, 2 256 units, 3 citizenship classes |
| Quarterly population | Statistik Austria — Bevölkerung zu Quartalsbeginn | 2010-Q1–2026-Q3, Bundesländer, 5 citizenship classes |
| Boundary geometry | Statistik Austria WFS (`POLBEZ`, `NUTS2`) | current territorial status |
| Cross-validation | [Statistik Austria OGD API](https://data.statistik.gv.at/) | 2002–2026 |

All data is licensed CC BY 4.0 by Statistik Austria.

### Region hierarchy

| Level | Count | On the map | In the list |
|---|---|---|---|
| Country | 1 | — | — |
| NUTS 1 | 3 | — | ✓ |
| NUTS 2 (Bundesländer) | 9 | ✓ | ✓ |
| NUTS 3 | 35 | — | ✓ |
| Politische Bezirke | 116 | ✓ | ✓ |
| Gemeinden (LAU 2) | 2 092 | — | ✓ |

### Updating

```bash
python pipeline/update.py            # fetch, rebuild, validate
python pipeline/update.py --commit   # ... and push if anything changed
```

The same script runs monthly in [`update-data.yml`](.github/workflows/update-data.yml).
It commits only when the data actually changed, and **never commits a build that fails
validation**. The pipeline uses only the Python standard library, so the scheduled job
has nothing to install.

### Validation

Every build runs 22 checks before it can be published:

- **Structural** — hierarchy resolves, no gaps, `total == austrian + foreign`, every level sums to the national total, districts sum into their Bundesland, no implausible year-on-year jumps
- **Quarterly** — class arithmetic, Bundesländer sum to Austria, annual and quarterly agree on 1 January
- **Cross-source** — national and all 116 district totals reconciled against the OGD API, which is produced by an independent Statistik Austria pipeline

### A known upstream inconsistency

The three sheets of the annual workbook are not on a single territorial status. The
`Insgesamt` sheet is back-cast onto current district boundaries, but the two citizenship
sheets keep the pre-2020 assignment for a municipality that moved between **Leibnitz
(610)** and **Südoststeiermark (623)**. The result is that `austrian + foreign` misses
`total` by an identical amount with opposite sign in those two districts for 2002–2019.

`build_data.py` rebuilds the affected district splits from their member Gemeinden, whose
codes already reflect current boundaries. The fix is verified to reproduce the published
values exactly for all other districts in every year, and the corrections are recorded in
`manifest.json`. Totals are never modified — they are confirmed correct against the OGD API.

---

## Notes for maintainers

### Map level and list level are separate

`store.level` is the list's browsing level and reaches down to municipality;
`store.mapLevel` is the map's own and is restricted to the two levels that have
geometry. Keeping them separate is not cosmetic — sharing one level meant that
selecting a Gemeinde in the list left the map requesting
`geo/municipality.geojson`, which does not exist. The fetch failed, the source
never loaded, and the map went blank *and* stopped responding to clicks.

When a selection has no polygon of its own, `mapHighlight` walks up the hierarchy
and outlines the mapped region containing it, so the selection is still located on
screen while the chart and detail panel describe the Gemeinde.

### MapLibre's worker must be imported explicitly

MapLibre derives its worker URL from `import.meta.url` of its own bundle,
expecting `./maplibre-gl-worker.mjs` beside it. After bundling that file does not
exist, so the request falls through to the SPA fallback, the module worker is
handed `index.html`, and it dies parsing HTML. MapLibre swallows worker failures,
so the only symptom is that every GeoJSON source hangs forever — a blank map with
an empty console.

The fix is in [`RegionMap.vue`](src/components/RegionMap.vue): import the worker
through Vite (`?worker&url`) so it is emitted as a real asset with its
shared-chunk import intact, and hand the URL to `setWorkerUrl()`. This also
requires `worker: { format: 'es' }` in [`vite.config.ts`](vite.config.ts), since
Vite's default `iife` worker format cannot carry the worker's own `import`.

If the map ever goes blank after a dependency bump, check this first.

## Project Structure

```
austria-population-tracker/
├── pipeline/
│   ├── ods.py             minimal OpenDocument reader (stdlib)
│   ├── sources.py         upstream URL discovery + caching
│   ├── regions.py         region codes, hierarchy, English names
│   ├── build_data.py      .ods -> JSON artifacts
│   ├── build_geo.py       WFS -> simplified GeoJSON (run manually)
│   ├── validate.py        structural + cross-source checks
│   └── update.py          single entry point
├── public/data/           generated artifacts (committed)
│   ├── manifest.json      vintage, coverage, provenance, corrections
│   ├── regions.json       all 2 256 regions
│   ├── annual/*.json      series per level
│   ├── quarterly.json     Bundesländer, 5 classes
│   └── geo/*.geojson      simplified boundaries
├── src/
│   ├── views/             MapView · ListView · AboutView
│   ├── components/        RegionMap · PopulationChart · MapLegend · RegionDetail
│   ├── stores/            population.ts (shared view state)
│   ├── composables/       useTheme · useMetricLabel
│   ├── utils/             palette · metrics · format
│   └── locales/           de.json · en.json
└── .github/workflows/     deploy.yml · update-data.yml
```

---

## Deployment

Pushing to `main` triggers [`deploy.yml`](.github/workflows/deploy.yml), which builds and
publishes to GitHub Pages. The router uses hash mode because GitHub Pages serves static
files with no rewrite rules, so a deep link under history mode would 404 on reload.

To host under a different repository name, update `BASE` in [`vite.config.ts`](vite.config.ts).

---

## Licence

Source code: MIT. Data: CC BY 4.0, © Statistik Austria.
