"""Region codes, hierarchy and English naming.

Austrian region codes are positional, which is what makes the whole pipeline
cheap: a Gemeindekennzahl encodes its parents. 10101 -> district 101 -> the
leading 1 -> Burgenland. No lookup tables needed for the administrative chain.
"""

from __future__ import annotations

COUNTRY = "country"
NUTS1 = "nuts1"
NUTS2 = "nuts2"
NUTS3 = "nuts3"
DISTRICT = "district"
MUNICIPALITY = "municipality"

LEVELS = [COUNTRY, NUTS1, NUTS2, NUTS3, DISTRICT, MUNICIPALITY]

# Levels that get a clickable choropleth. Everything else is data-only:
# browsable in the list view, chartable, but not drawn.
MAPPED_LEVELS = [NUTS2, DISTRICT]

# Section headers as they appear in the .ods, mapped to our level keys. Matching
# is done on a normalised prefix so that footnote markers and whitespace drift
# in the source file do not silently drop an entire level.
SECTION_TO_LEVEL = {
    "bundeslandergruppen (nuts 1)": NUTS1,
    "bundeslander (nuts 2)": NUTS2,
    "nuts 3-regionen": NUTS3,
    "politische bezirke": DISTRICT,
    "gemeinden (lau 2)": MUNICIPALITY,
}

# Vienna is simultaneously a Bundesland, a Gemeinde and 23 Gemeindebezirke.
# Several places need to special-case it; naming it once keeps that visible.
WIEN_MUNICIPALITY = "90001"

# First digit of a Bezirks-/Gemeindekennzahl -> NUTS 2 code.
BL_DIGIT_TO_NUTS2 = {
    "1": "AT11",  # Burgenland
    "2": "AT21",  # Kaernten
    "3": "AT12",  # Niederoesterreich
    "4": "AT31",  # Oberoesterreich
    "5": "AT32",  # Salzburg
    "6": "AT22",  # Steiermark
    "7": "AT33",  # Tirol
    "8": "AT34",  # Vorarlberg
    "9": "AT13",  # Wien
}

# English names exist officially only for the country, the NUTS 1 groups and the
# Bundeslaender. Bezirk and Gemeinde names have no English form and are left in
# German in both locales rather than machine-translated into something wrong.
EN_NAMES = {
    "AT": "Austria",
    "90001": "Vienna",
    "AT1": "Eastern Austria",
    "AT2": "Southern Austria",
    "AT3": "Western Austria",
    "AT11": "Burgenland",
    "AT12": "Lower Austria",
    "AT13": "Vienna",
    "AT21": "Carinthia",
    "AT22": "Styria",
    "AT31": "Upper Austria",
    "AT32": "Salzburg",
    "AT33": "Tyrol",
    "AT34": "Vorarlberg",
}


def normalise_section(text: str) -> str:
    """Fold umlauts and whitespace so section matching survives encoding drift."""
    lowered = text.strip().lower()
    for src, dst in (("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "ss")):
        lowered = lowered.replace(src, dst)
    return " ".join(lowered.split())


def level_for_section(text: str) -> str | None:
    key = normalise_section(text)
    for prefix, level in SECTION_TO_LEVEL.items():
        if key.startswith(prefix):
            return level
    return None


def parent_of(code: str, level: str) -> str | None:
    """Parent in the tree the UI navigates.

    NUTS 3 hangs off NUTS 2 by code prefix, but districts deliberately point at
    NUTS 2 as well rather than at NUTS 3. Austrian Bezirke nest into NUTS 3
    regions only via a 116-row lookup table, and since NUTS 3 is not a mapped
    level, carrying that table would buy nothing.
    """
    if level == COUNTRY:
        return None
    if level == NUTS1:
        return "AT"
    if level == NUTS2:
        return code[:3]
    if level == NUTS3:
        return code[:4]
    if level == DISTRICT:
        return BL_DIGIT_TO_NUTS2[code[0]]
    if level == MUNICIPALITY:
        # Vienna is a single Gemeinde (90001) but is split into 23 Gemeinde-
        # bezirke at district level, so there is no district '900' to point at.
        # It attaches straight to the Bundesland instead.
        if code == WIEN_MUNICIPALITY:
            return "AT13"
        return code[:3]
    raise ValueError(f"unknown level {level!r}")


def english_name(code: str, german: str) -> str:
    return EN_NAMES.get(code, german)


def tidy_name(raw: str) -> str:
    """Clean the display name coming out of the spreadsheet.

    The country row is shouted ('OESTERREICH') and Vienna's districts are
    written without a space after the comma ('Wien 23.,Liesing').
    """
    name = " ".join(raw.split())
    if name.isupper() and len(name) > 3:
        name = name.capitalize()
    name = name.replace(".,", "., ").replace(",  ", ", ")
    return " ".join(name.split())
