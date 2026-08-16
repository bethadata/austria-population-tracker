"""Build simplified boundary GeoJSON for the mapped levels.

Geometry comes from Statistik Austria's own WFS - the same authority that
publishes the population figures - so g_id joins to our region codes without a
crosswalk table.

This is deliberately NOT part of the scheduled data refresh. Administrative
boundaries change at most once a year, the source layers are ~30 MB, and
simplification needs mapshaper (Node). Run it by hand when boundaries change:

    python build_geo.py [--force]

Output is GeoJSON rather than TopoJSON because MapLibre consumes GeoJSON
natively; at ~120 polygons the extra shared-arc compression is not worth an
additional decoding dependency in the browser.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import urllib.request

import regions as rg

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "geo"
CACHE = ROOT / "raw_cache"

WFS = "https://www.statistik.gv.at/gs-open/GEODATA/ows"

# Simplification is tuned per level: Bundeslaender are drawn at country zoom and
# tolerate heavy generalisation, districts are inspected closely enough that
# their outlines need to stay recognisable.
LAYERS = {
    rg.NUTS2: {
        "layer": "STATISTIK_AUSTRIA_NUTS2_20210101",
        "simplify": "2%",
        "drop": set(),
    },
    rg.DISTRICT: {
        "layer": "STATISTIK_AUSTRIA_POLBEZ_20260101",
        "simplify": "2%",
        # '900' is Vienna as a single unit. Our district level uses Vienna's 23
        # Gemeindebezirke (901-923) instead, so keeping both would overlay the
        # whole city on top of its own districts.
        "drop": {"900"},
    },
}


def fetch_layer(layer: str, force: bool = False) -> pathlib.Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / f"{layer}.geojson"
    if target.exists() and not force:
        print(f"  cached: {target.name} ({target.stat().st_size:,} bytes)")
        return target

    url = (f"{WFS}?service=WFS&version=2.0.0&request=GetFeature"
           f"&typeName=GEODATA:{layer}&outputFormat=application/json&srsName=EPSG:4326")
    print(f"  fetching {layer} ...")
    with urllib.request.urlopen(url, timeout=600) as response:
        payload = response.read()
    target.write_bytes(payload)
    print(f"  fetched: {target.name} ({len(payload):,} bytes)")
    return target


def normalise(src: pathlib.Path, drop: set[str], expected: set[str]) -> pathlib.Path:
    """Rewrite to minimal properties and verify the codes join to our regions."""
    data = json.loads(src.read_text(encoding="utf-8"))

    features = []
    seen = set()
    for feature in data["features"]:
        code = str(feature["properties"].get("g_id", "")).strip()
        if not code or code in drop:
            continue
        seen.add(code)
        features.append({
            "type": "Feature",
            "properties": {"code": code},
            "geometry": feature["geometry"],
        })

    missing = expected - seen
    extra = seen - expected
    if missing or extra:
        raise SystemExit(
            f"code mismatch for {src.name}: {len(missing)} missing "
            f"{sorted(missing)[:5]}, {len(extra)} unexpected {sorted(extra)[:5]}"
        )

    target = CACHE / f"norm_{src.name}"
    target.write_text(json.dumps({"type": "FeatureCollection", "features": features}),
                      encoding="utf-8")
    return target


def simplify(src: pathlib.Path, dest: pathlib.Path, percent: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "npx", "--yes", "mapshaper",
        str(src),
        "-simplify", f"visvalingam", percent, "keep-shapes",
        "-clean",
        "-o", str(dest), "format=geojson", "precision=0.0001",
    ]
    subprocess.run(cmd, check=True, shell=(sys.platform == "win32"),
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def main(force: bool = False) -> int:
    meta = json.loads((ROOT / "public" / "data" / "regions.json").read_text(encoding="utf-8"))
    by_level: dict[str, set[str]] = {}
    for region in meta["regions"]:
        by_level.setdefault(region["level"], set()).add(region["code"])

    for level, spec in LAYERS.items():
        print(f"\n{level}:")
        raw = fetch_layer(spec["layer"], force=force)
        normalised = normalise(raw, spec["drop"], by_level[level])
        dest = OUT / f"{level}.geojson"
        simplify(normalised, dest, spec["simplify"])
        n = len(json.loads(dest.read_text(encoding="utf-8"))["features"])
        print(f"  wrote {dest.relative_to(ROOT)}: {n} features, "
              f"{dest.stat().st_size:,} bytes (from {raw.stat().st_size:,})")

    return 0


if __name__ == "__main__":
    sys.exit(main(force="--force" in sys.argv))
