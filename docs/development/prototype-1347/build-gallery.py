"""Bundle the throwaway review captures into one offline HTML artifact."""
import base64
import json
from pathlib import Path

root = Path(__file__).parent
rows = json.loads((root / "evidence/observations.json").read_text())
payload = {
    "rows": rows,
    "images": {
        row["filename"]: "data:image/png;base64,"
        + base64.b64encode((root / "evidence" / row["filename"]).read_bytes()).decode()
        for row in rows
    },
    "guide": (root / "README.md").read_text(),
}
html = (root / "gallery-template.html").read_text().replace(
    "__PAYLOAD__", json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
)
(root / "review.html").write_text(html)
print(f"Bundled {len(rows)} captures into {root / 'review.html'}")
