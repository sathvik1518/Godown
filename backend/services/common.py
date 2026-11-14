"""Small helpers shared by several routers."""
import csv
import io
import math

from fastapi.responses import Response


def paged(items, total, page, page_size):
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)) if page_size else 1,
    }


def csv_text(value):
    """Neutralise spreadsheet formulas (=, +, -, @) that start a text cell."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        return "'" + value
    return value


def csv_response(filename, header, rows):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return Response(
        content="﻿" + buffer.getvalue(),  # BOM so Excel reads UTF-8 (₹, names) correctly
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
