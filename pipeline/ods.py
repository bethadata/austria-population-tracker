"""Minimal OpenDocument Spreadsheet reader (stdlib only).

Statistik Austria publishes its population time series as .ods. Rather than
pull in pandas + odfpy for what amounts to reading a handful of flat tables,
this walks content.xml directly. Keeps the scheduled GitHub Action dependency
free, which matters because that job runs unattended.
"""

from __future__ import annotations

import zipfile
import xml.etree.ElementTree as ET

NS = {
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
}

_TBL = "{%s}" % NS["table"]
_OFF = "{%s}" % NS["office"]

# Guards against the repeat-count blowups ODS uses to encode trailing blanks:
# a single cell can claim to repeat 16k times purely as padding.
MAX_COL_REPEAT = 200
MAX_ROW_REPEAT = 50


def _cell_text(cell: ET.Element) -> str:
    """Prefer the typed office:value over rendered text.

    The rendered text carries locale formatting (thousands separators) and, in
    these files, footnote markers glued onto the displayed string.
    """
    val = cell.get(_OFF + "value")
    if val is not None:
        return val
    return "".join(cell.itertext()).strip()


def _row_cells(row: ET.Element) -> list[str]:
    out: list[str] = []
    for cell in row.findall("table:table-cell", NS):
        repeat = int(cell.get(_TBL + "number-columns-repeated", "1"))
        out.extend([_cell_text(cell)] * min(repeat, MAX_COL_REPEAT))
    while out and out[-1] == "":
        out.pop()
    return out


def read_sheet(path: str, sheet_name: str) -> list[list[str]]:
    """Return one named sheet as a list of rows."""
    for name, rows in iter_sheets(path):
        if name == sheet_name:
            return rows
    raise KeyError(f"sheet {sheet_name!r} not found in {path}")


def sheet_names(path: str) -> list[str]:
    return [name for name, _ in iter_sheets(path, rows=False)]


def iter_sheets(path: str, rows: bool = True):
    """Yield (sheet_name, rows) for every table in the document.

    These workbooks carry a tail of junk sheets that are cached external links
    ('file:///J:/_TEAM/...'), left over from the publisher's own toolchain.
    Callers select sheets by name, so they are simply yielded and ignored.
    """
    with zipfile.ZipFile(path) as zf:
        root = ET.fromstring(zf.read("content.xml"))

    for table in root.iter(_TBL + "table"):
        name = table.get(_TBL + "name")
        if not rows:
            yield name, []
            continue

        collected: list[list[str]] = []
        for row in table.findall("table:table-row", NS):
            repeat = min(int(row.get(_TBL + "number-rows-repeated", "1")), MAX_ROW_REPEAT)
            cells = _row_cells(row)
            collected.extend([list(cells) for _ in range(repeat)])
        while collected and not collected[-1]:
            collected.pop()
        yield name, collected
