"""Non-persistent Teaching List XLSX export, preserved from Phase 2I.4."""

from __future__ import annotations

import io
import zipfile
from typing import Any
from xml.sax.saxutils import escape


HEADERS = (
    "Teacher order", "Selected form order", "Selected word form", "Word family",
    "Selection type", "Candidate/reference status", "Overall rank", "Overall score",
    "General availability", "General Zipf", "Educational tokens", "ICE-HK tokens",
    "GloWbE-HK tokens", "NOW-HK tokens (evaluation only)",
    "HK corpus frequency band", "HK corpus frequency rank", "Teaching depth",
    "Teacher notes", "Semantic notes", "Lesson context",
)


def _column(index: int) -> str:
    output = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        output = chr(65 + remainder) + output
    return output


def _cell(reference: str, value: Any) -> str:
    content = "" if value is None else str(value)
    return f'<c r="{reference}" t="inlineStr"><is><t xml:space="preserve">{escape(content)}</t></is></c>'


def teacher_list_xlsx(payload: dict[str, Any]) -> bytes:
    items = payload.get("items")
    if not isinstance(items, list) or len(items) > 500:
        raise ValueError("items must be a list with at most 500 families")
    context = str(payload.get("context") or "")[:2000]
    rows: list[list[Any]] = [list(HEADERS)]
    for default_order, item in enumerate(items, 1):
        if not isinstance(item, dict):
            raise ValueError("every item must be an object")
        forms = item.get("selected_forms") or [""]
        if not isinstance(forms, list) or len(forms) > 250:
            raise ValueError("selected_forms must be a list with at most 250 values")
        for form_order, form in enumerate(forms, 1):
            selected = str(form or "")[:256]
            rows.append([
                item.get("teacher_order", default_order), form_order if selected else "", selected,
                str(item.get("word_family") or "")[:256], "selected_form" if selected else "word_family",
                str(item.get("status") or "")[:80], item.get("overall_frequency_rank"), item.get("overall_score"),
                str(item.get("general_availability") or "")[:80], item.get("general_zipf"),
                item.get("educational_tokens"), item.get("ice_hk_tokens"), item.get("glowbe_hk_tokens"), item.get("now_hk_tokens"),
                str(item.get("hk_corpus_frequency_band") or "")[:80],
                str(item.get("hk_corpus_frequency_rank") or "")[:80],
                str(item.get("teaching_depth") or "")[:160],
                str(item.get("teacher_notes") or "")[:4000],
                str(item.get("semantic_notes") or "")[:4000], context,
            ])
    xml_rows = []
    for row_number, row in enumerate(rows, 1):
        cells = "".join(_cell(f"{_column(column)}{row_number}", value) for column, value in enumerate(row, 1))
        xml_rows.append(f'<row r="{row_number}">{cells}</row>')
    sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="2" width="16" customWidth="1"/><col min="3" max="6" width="24" customWidth="1"/><col min="7" max="16" width="20" customWidth="1"/><col min="17" max="20" width="32" customWidth="1"/></cols><sheetData>' + ''.join(xml_rows) + '</sheetData><autoFilter ref="A1:T' + str(len(rows)) + '"/></worksheet>'
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="TEACHING_LIST" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": sheet,
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content.encode("utf-8"))
    return buffer.getvalue()
