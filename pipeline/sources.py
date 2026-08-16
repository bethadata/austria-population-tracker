"""Locating and fetching the upstream Statistik Austria files."""

from __future__ import annotations

import hashlib
import pathlib
import re
import urllib.request

BASE = "https://www.statistik.at"

LANDING_PAGE = (
    BASE + "/statistiken/bevoelkerung-und-soziales/bevoelkerung/bevoelkerungsstand/"
    "bevoelkerung-zu-jahres-/-quartalsanfang"
)

OGD_DATA = "https://data.statistik.gv.at/data/"

USER_AGENT = "austria-population-tracker/1.0 (+https://github.com/bethadata/austria-population-tracker)"

# The landing page is scraped for these rather than hardcoding the paths: sibling
# datasets on the same page have been republished under renamed files (one
# currently carries a '_NEU' suffix), so pattern matching survives a rename that
# a fixed URL would not. FALLBACK_URLS covers the page itself changing shape.
DATASETS = {
    "annual": {
        "pattern": re.compile(r"Bev_Zeitreihe_Jahresbeginn_Gebietseinheiten[^\"']*\.ods", re.I),
        "fallback": "/fileadmin/pages/405/Bev_Zeitreihe_Jahresbeginn_Gebietseinheiten.ods",
    },
    "quarterly": {
        "pattern": re.compile(r"Bev_Zeitreihe_Quartalsbeginn_Bundesland_Staatsangeh[^\"']*\.ods", re.I),
        "fallback": "/fileadmin/pages/405/Bev_Zeitreihe_Quartalsbeginn_Bundesland_Staatsangeh.ods",
    },
}


def _get(url: str, timeout: int = 120) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def discover_urls() -> dict[str, str]:
    """Resolve each dataset key to an absolute download URL."""
    try:
        page = _get(LANDING_PAGE).decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 - degrade to known-good paths
        print(f"  ! landing page unreachable ({exc}); using fallback URLs")
        page = ""

    urls = {}
    for key, spec in DATASETS.items():
        match = spec["pattern"].search(page) if page else None
        # The pattern matches a bare filename, so recover the surrounding href
        # when present; otherwise fall back to the known directory.
        path = f"/fileadmin/pages/405/{match.group(0)}" if match else spec["fallback"]
        urls[key] = path if path.startswith("http") else BASE + path
        print(f"  {key:10s} -> {urls[key]}{'' if match else '  (fallback)'}")
    return urls


def fetch(url: str, cache_dir: pathlib.Path, force: bool = False) -> pathlib.Path:
    """Download to a content-addressed cache; reuse unless forced."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / url.rsplit("/", 1)[-1]

    if target.exists() and not force:
        print(f"  cached: {target.name} ({target.stat().st_size:,} bytes)")
        return target

    payload = _get(url)
    target.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()[:12]
    print(f"  fetched: {target.name} ({len(payload):,} bytes, sha256:{digest})")
    return target


def fetch_ogd_year(year: int, cache_dir: pathlib.Path) -> str:
    """Fetch one OGD yearly population file (used only for validation)."""
    url = f"{OGD_DATA}OGD_bevstandjbab2002_BevStand_{year}.csv"
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / f"ogd_bevstand_{year}.csv"
    if target.exists():
        return target.read_text("utf-8-sig", errors="replace")
    payload = _get(url, timeout=300)
    target.write_bytes(payload)
    return payload.decode("utf-8-sig", "replace")
