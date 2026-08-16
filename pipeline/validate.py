"""Validate the generated artifacts.

Two independent layers:

1. Structural / internal consistency - no network, runs every build. Catches
   parsing regressions: broken hierarchies, class arithmetic that stops adding
   up, missing values appearing mid-series.
2. Cross-source validation against the Statistik Austria OGD API, which
   publishes the same population counts derived from a different pipeline
   (by Gemeinde, sex and age). Aggregating it must reproduce our numbers
   exactly. This is what catches a silently corrupted upstream file.
"""

from __future__ import annotations

import csv
import io
import json
import pathlib
import sys
from collections import defaultdict

import regions as rg
import sources

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CACHE = ROOT / "raw_cache"

# OGD splits Vienna into its 23 districts and omits the city as a whole, so
# aggregating its Gemeinde codes yields our district level directly.
OGD_YEARS_DEFAULT = [2002, 2014, 2026]


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def check(self, ok: bool, label: str, detail: str = "") -> None:
        self.checks += 1
        if ok:
            print(f"  PASS  {label}")
        else:
            print(f"  FAIL  {label}{('  ' + detail) if detail else ''}")
            self.failures.append(label)


def load(name: str):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def load_annual() -> tuple[list[str], dict, dict]:
    meta = load("regions.json")
    by_code = {r["code"]: r for r in meta["regions"]}
    series: dict[str, dict] = {}
    dates: list[str] = []
    for level in meta["levels"]:
        payload = load(f"annual/{level}.json")
        dates = dates or payload["dates"]
        series.update(payload["series"])
    return dates, series, by_code


def structural(report: Report) -> None:
    print("\nStructural checks")
    dates, series, by_code = load_annual()

    codes = set(by_code)
    dangling = [r for r in by_code.values() if r["parent"] and r["parent"] not in codes]
    report.check(not dangling, "every parent reference resolves",
                 f"{len(dangling)} dangling: {[r['code'] for r in dangling][:5]}")

    report.check(all(len(s["total"]) == len(dates) for s in series.values()),
                 f"all series have {len(dates)} periods")

    gaps = [c for c, s in series.items() if any(v is None for v in s["total"])]
    report.check(not gaps, "no missing values in total series",
                 f"{len(gaps)} affected, e.g. {gaps[:5]}")

    # total must equal austrian + foreign in every region and every year.
    bad_sum = []
    for code, s in series.items():
        for i, (t, a, f) in enumerate(zip(s["total"], s["austrian"], s["foreign"])):
            if None in (t, a, f):
                continue
            if a + f != t:
                bad_sum.append((code, dates[i], t, a + f))
    report.check(not bad_sum, "total == austrian + foreign everywhere",
                 f"{len(bad_sum)} mismatches, e.g. {bad_sum[:3]}")

    # Each level must independently sum to the national total.
    country_total = series["AT"]["total"]
    for level in (rg.NUTS1, rg.NUTS2, rg.DISTRICT, rg.MUNICIPALITY):
        members = [c for c, r in by_code.items() if r["level"] == level]
        sums = [sum(series[c]["total"][i] for c in members) for i in range(len(dates))]
        report.check(sums == country_total, f"{level} sums to national total",
                     f"first diff {next((f'{dates[i]}: {sums[i]} vs {country_total[i]}' for i in range(len(dates)) if sums[i] != country_total[i]), '')}")

    # Districts must aggregate into their Bundesland.
    by_parent = defaultdict(list)
    for code, r in by_code.items():
        if r["level"] == rg.DISTRICT:
            by_parent[r["parent"]].append(code)
    bad_parent = []
    for parent, children in by_parent.items():
        for i in range(len(dates)):
            got = sum(series[c]["total"][i] for c in children)
            if got != series[parent]["total"][i]:
                bad_parent.append((parent, dates[i], got, series[parent]["total"][i]))
                break
    report.check(not bad_parent, "districts sum into their Bundesland",
                 f"{len(bad_parent)} bad, e.g. {bad_parent[:3]}")

    # Series should be monotonic in time only in the sense of being plausible:
    # flag any year-on-year jump beyond a sane bound for a mid-size region.
    suspicious = []
    for code, s in series.items():
        if by_code[code]["level"] != rg.DISTRICT:
            continue
        for i in range(1, len(dates)):
            prev, cur = s["total"][i - 1], s["total"][i]
            if prev and prev > 5000 and abs(cur - prev) / prev > 0.25:
                suspicious.append((code, dates[i], prev, cur))
    report.check(not suspicious, "no implausible year-on-year district jumps",
                 f"{suspicious[:3]}")


def quarterly_checks(report: Report) -> None:
    print("\nQuarterly checks")
    q = load("quarterly.json")
    dates, series = q["dates"], q["series"]

    report.check(all(len(s["total"]) == len(dates) for s in series.values()),
                 f"all quarterly series have {len(dates)} periods")

    bad = []
    for code, s in series.items():
        for i, (t, a, f) in enumerate(zip(s["total"], s["austrian"], s["foreign"])):
            if None in (t, a, f) or a + f != t:
                bad.append((code, dates[i]))
    report.check(not bad, "quarterly total == austrian + foreign", f"{bad[:3]}")

    bad_split = []
    for code, s in series.items():
        for i, (f, eu, third) in enumerate(zip(s["foreign"], s["eu_efta_uk"], s["third_country"])):
            if None in (f, eu, third) or eu + third != f:
                bad_split.append((code, dates[i]))
    report.check(not bad_split, "foreign == eu_efta_uk + third_country", f"{bad_split[:3]}")

    lands = [c for c in series if c != "AT"]
    mismatched = [dates[i] for i in range(len(dates))
                  if sum(series[c]["total"][i] for c in lands) != series["AT"]["total"][i]]
    report.check(not mismatched, "Bundeslaender sum to Austria each quarter", f"{mismatched[:3]}")

    report.check(any(q["provisional"]), "provisional periods are flagged",
                 "expected the most recent quarters to be marked provisional")

    # The annual series and the quarterly series must agree on 1 January.
    _, annual, _ = load_annual()
    conflicts = []
    for i, date in enumerate(dates):
        if not date.endswith("-01-01"):
            continue
        for code in series:
            a_dates = load("annual/nuts2.json")["dates"] if code != "AT" else load("annual/country.json")["dates"]
            if date not in a_dates:
                continue
            expected = annual[code]["total"][a_dates.index(date)]
            got = series[code]["total"][i]
            if expected != got:
                conflicts.append((code, date, expected, got))
    report.check(not conflicts, "annual and quarterly agree on 1 January",
                 f"{len(conflicts)} conflicts, e.g. {conflicts[:3]}")


def cross_source(report: Report, years: list[int]) -> None:
    print(f"\nCross-source validation against OGD ({', '.join(map(str, years))})")
    dates, series, by_code = load_annual()

    for year in years:
        date = f"{year}-01-01"
        if date not in dates:
            print(f"  SKIP  {year}: outside our series")
            continue
        idx = dates.index(date)

        try:
            raw = sources.fetch_ogd_year(year, CACHE)
        except Exception as exc:  # noqa: BLE001
            print(f"  SKIP  {year}: OGD unreachable ({exc})")
            continue

        per_gemeinde: dict[str, int] = defaultdict(int)
        for row in csv.DictReader(io.StringIO(raw), delimiter=";"):
            code = row["C-GRGEMAKT-0"].split("-", 1)[1]
            per_gemeinde[code] += int(float(row["F-ISIS-1"] or 0))

        national = sum(per_gemeinde.values())
        report.check(national == series["AT"]["total"][idx], f"{year}: national total matches OGD",
                     f"ours {series['AT']['total'][idx]:,} vs OGD {national:,}")

        districts: dict[str, int] = defaultdict(int)
        for code, value in per_gemeinde.items():
            districts[code[:3]] += value
        diffs = [(c, series[c]["total"][idx], districts.get(c))
                 for c in by_code if by_code[c]["level"] == rg.DISTRICT
                 and series[c]["total"][idx] != districts.get(c)]
        report.check(not diffs, f"{year}: all 116 districts match OGD",
                     f"{len(diffs)} differ, e.g. {diffs[:3]}")


def main() -> int:
    report = Report()
    structural(report)
    quarterly_checks(report)

    if "--offline" not in sys.argv:
        years = OGD_YEARS_DEFAULT
        if "--all-years" in sys.argv:
            years = list(range(2002, 2027))
        cross_source(report, years)
    else:
        print("\nSkipping cross-source validation (--offline)")

    print(f"\n{report.checks - len(report.failures)}/{report.checks} checks passed")
    if report.failures:
        print("FAILED: " + "; ".join(report.failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
