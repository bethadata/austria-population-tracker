"""Turn the Statistik Austria .ods time series into the site's JSON artifacts.

Outputs (all under public/data/):
    manifest.json          data vintage, coverage, provenance
    regions.json           every region: code, names, level, parent
    annual/<level>.json    columnar series per level, 3 citizenship classes
    quarterly.json         Bundeslaender only, 5 classes, provisional flags
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from datetime import datetime, timezone

import ods
import regions as rg
import sources

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CACHE = ROOT / "raw_cache"

# Sheet name -> our key. Sheets are matched on a normalised prefix because the
# umlauts in 'Oesterreichische_Staatsang_' round-trip inconsistently.
ANNUAL_SHEETS = {
    "insgesamt": "total",
    "osterreichische_staatsang": "austrian",
    "nichtosterreichische_staatsang": "foreign",
}

# Column blocks in the quarterly sheet, in order. Each spans the 10 regions
# (Austria + 9 Bundeslaender).
QUARTERLY_CLASSES = ["total", "austrian", "foreign", "eu_efta_uk", "third_country"]
QUARTERLY_REGIONS = ["AT", "AT11", "AT21", "AT12", "AT31", "AT32", "AT22", "AT33", "AT34", "AT13"]

DATE_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})")
SOURCE_RE = re.compile(r"Erstellt am (\d{2}\.\d{2}\.\d{4})")


def parse_date(raw: str) -> tuple[str, bool]:
    """Parse a 'DD.MM.YYYY' header cell, tolerating appended footnote markers.

    The two most recent quarterly columns read '01.04.20261' and '01.07.20262'.
    Those trailing digits are footnote references, not part of the year: they
    mark provisional figures computed under a different residence rule. Losing
    that distinction would silently corrupt the most recent data points.
    """
    match = DATE_RE.match(raw.strip())
    if not match:
        raise ValueError(f"unparseable date cell: {raw!r}")
    day, month, year = match.groups()
    provisional = bool(raw.strip()[len(match.group(0)):].strip())
    return f"{year}-{month}-{day}", provisional


def to_int(raw: str) -> int | None:
    text = raw.strip().replace(" ", "").replace(".", "").replace(",", ".")
    if not text or text in {"-", "x", "."}:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def normalise_sheet(name: str) -> str:
    return rg.normalise_section(name).replace(" ", "_").replace("-", "_").strip("_")


def parse_annual(path: pathlib.Path) -> tuple[dict, list[str], dict, str | None]:
    """Return (series, dates, region_meta, vintage)."""
    series: dict[str, dict[str, list]] = {}
    region_meta: dict[str, dict] = {}
    dates: list[str] = []
    vintage: str | None = None

    for sheet_name, rows in ods.iter_sheets(str(path)):
        key = ANNUAL_SHEETS.get(normalise_sheet(sheet_name or ""))
        if key is None:
            continue

        header = next(r for r in rows if r and r[0].strip() == "Gebietseinheit")
        sheet_dates = [parse_date(c)[0] for c in header[1:] if c.strip()]
        if not dates:
            dates = sheet_dates
        elif sheet_dates != dates:
            raise ValueError(f"sheet {sheet_name!r} has divergent date columns")

        level: str | None = None
        for row in rows:
            if not row:
                continue
            if len(row) == 1:
                text = row[0]
                if vintage is None:
                    found = SOURCE_RE.search(text)
                    if found:
                        vintage = found.group(1)
                mapped = rg.level_for_section(text)
                if mapped:
                    level = mapped
                continue

            code = row[0].strip()
            if not code or code == "Gebietseinheit":
                continue

            # The country row precedes any section header.
            row_level = rg.COUNTRY if code == "AT" else level
            if row_level is None:
                continue

            values = [to_int(c) for c in row[2:2 + len(dates)]]
            values += [None] * (len(dates) - len(values))
            series.setdefault(code, {})[key] = values

            if code not in region_meta:
                german = rg.tidy_name(row[1])
                region_meta[code] = {
                    "code": code,
                    "name_de": german,
                    "name_en": rg.english_name(code, german),
                    "level": row_level,
                    "parent": rg.parent_of(code, row_level),
                }

    return series, dates, region_meta, vintage


def parse_quarterly(path: pathlib.Path) -> dict:
    rows = next(rows for _, rows in ods.iter_sheets(str(path)) if rows)

    dates: list[str] = []
    provisional: list[bool] = []
    values: dict[str, dict[str, list]] = {
        code: {cls: [] for cls in QUARTERLY_CLASSES} for code in QUARTERLY_REGIONS
    }

    for row in rows:
        if not row or not DATE_RE.match(row[0].strip()):
            continue
        date, is_provisional = parse_date(row[0])
        dates.append(date)
        provisional.append(is_provisional)

        numbers = [to_int(c) for c in row[1:]]
        for block, cls in enumerate(QUARTERLY_CLASSES):
            chunk = numbers[block * 10:(block + 1) * 10]
            chunk += [None] * (10 - len(chunk))
            for code, value in zip(QUARTERLY_REGIONS, chunk):
                values[code][cls].append(value)

    return {"dates": dates, "provisional": provisional, "series": values}


def reconcile_districts(series: dict, region_meta: dict, dates: list[str]) -> list[dict]:
    """Rebuild district citizenship splits from their member Gemeinden.

    The workbook's three sheets are not on a single Gebietsstand. The
    'Insgesamt' sheet is back-cast onto current district boundaries, but the two
    citizenship sheets keep the historical assignment for a municipality that
    moved between Leibnitz (610) and Suedoststeiermark (623) with effect from
    2020. The result is that 'austrian + foreign' misses 'total' by an identical
    amount, with opposite sign, in those two districts for 2002-2019.

    The Gemeinde-level data is internally consistent and keyed by codes that
    already reflect current boundaries, so aggregating it yields the correct
    split. Verified to reproduce the published values exactly for all other
    districts in every year, and the totals are left untouched - they are
    confirmed against the OGD API in validate.py.

    Vienna's 23 Gemeindebezirke have no Gemeinde children (Vienna is a single
    Gemeinde) and are already consistent, so they are skipped.
    """
    children: dict[str, list[str]] = {}
    for code, meta in region_meta.items():
        if meta["level"] == rg.MUNICIPALITY and code != rg.WIEN_MUNICIPALITY:
            children.setdefault(code[:3], []).append(code)

    corrections = []
    for district, members in children.items():
        if district not in series:
            continue
        for cls in ("austrian", "foreign"):
            rebuilt = [sum(series[m][cls][i] or 0 for m in members) for i in range(len(dates))]
            published = series[district][cls]
            changed = [i for i in range(len(dates)) if rebuilt[i] != published[i]]
            if not changed:
                continue
            corrections.append({
                "region": district,
                "name": region_meta[district]["name_de"],
                "series": cls,
                "periods": [dates[i] for i in changed],
                "max_delta": max(abs(rebuilt[i] - published[i]) for i in changed),
            })
            series[district][cls] = rebuilt

    return corrections


def write_json(path: pathlib.Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


def main(force: bool = False) -> int:
    print("Resolving upstream URLs...")
    urls = sources.discover_urls()

    print("\nFetching...")
    annual_file = sources.fetch(urls["annual"], CACHE, force=force)
    quarterly_file = sources.fetch(urls["quarterly"], CACHE, force=force)

    print("\nParsing annual series...")
    series, dates, region_meta, vintage = parse_annual(annual_file)
    print(f"  {len(region_meta):,} regions x {len(dates)} years, vintage {vintage}")

    counts: dict[str, int] = {}
    for meta in region_meta.values():
        counts[meta["level"]] = counts.get(meta["level"], 0) + 1
    for level in rg.LEVELS:
        print(f"    {level:14s} {counts.get(level, 0):>5,}")

    print("\nReconciling district citizenship splits...")
    corrections = reconcile_districts(series, region_meta, dates)
    if corrections:
        for c in corrections:
            print(f"  corrected {c['region']} ({c['name']}) {c['series']}: "
                  f"{len(c['periods'])} periods, max delta {c['max_delta']:,}")
    else:
        print("  nothing to correct")

    print("\nParsing quarterly series...")
    quarterly = parse_quarterly(quarterly_file)
    n_prov = sum(quarterly["provisional"])
    print(f"  {len(quarterly['dates'])} quarters, {n_prov} provisional")

    print("\nWriting artifacts...")
    write_json(OUT / "regions.json", {
        "levels": rg.LEVELS,
        "mapped_levels": rg.MAPPED_LEVELS,
        "regions": sorted(region_meta.values(), key=lambda r: (rg.LEVELS.index(r["level"]), r["code"])),
    })

    for level in rg.LEVELS:
        codes = sorted(c for c, m in region_meta.items() if m["level"] == level)
        write_json(OUT / "annual" / f"{level}.json", {
            "level": level,
            "dates": dates,
            "series": {c: series[c] for c in codes},
        })

    write_json(OUT / "quarterly.json", quarterly)

    write_json(OUT / "manifest.json", {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_vintage": vintage,
        "annual": {
            "first": dates[0],
            "last": dates[-1],
            "n_periods": len(dates),
            "classes": list(ANNUAL_SHEETS.values()),
        },
        "quarterly": {
            "first": quarterly["dates"][0],
            "last": quarterly["dates"][-1],
            "n_periods": len(quarterly["dates"]),
            "classes": QUARTERLY_CLASSES,
            "n_provisional": n_prov,
        },
        "region_counts": counts,
        "sources": urls,
        "corrections": corrections,
        "license": "CC BY 4.0 - Statistik Austria",
    })
    return 0


if __name__ == "__main__":
    sys.exit(main(force="--force" in sys.argv))
