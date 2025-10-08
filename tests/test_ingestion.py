from __future__ import annotations

import json

from datetime import datetime
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from card_ingestion.models import FetchedPage
from card_ingestion.pipeline import process_card_link
from card_ingestion.storage import LocalRulesetStorage

SAMPLE_HTML = """
<html>
<head>
    <title>HSBC Red Credit Card Benefits | Earn up to 4% Cashback</title>
</head>
<body>
    <h1>HSBC Red Credit Card</h1>
    <p>Earn 1% cashback on all local spend with no minimum.</p>
    <p>Enjoy 4% cashback on online shopping worldwide.</p>
    <p>Groceries get 2.5% rebate at supermarkets and grocery stores.</p>
    <p>Welcome bonus: Limited time offer of extra 8% cashback when you spend HK$8,000.</p>
    <p>Annual fee: HK$400 waived for first year.</p>
    <p>Foreign transaction fee of 3.5% applies to overseas purchases.</p>
</body>
</html>
"""


def fake_fetch(url: str) -> FetchedPage:
    return FetchedPage(
        url=url,
        content=SAMPLE_HTML,
        content_hash="abc123",
        snapshot_key="hsbc-red-demo",
        fetched_at=datetime.utcnow(),
    )


def test_process_card_link_publishes_ruleset(tmp_path: Path) -> None:
    storage = LocalRulesetStorage(tmp_path)
    result = process_card_link(
        "https://www.example.com/hsbc-red",
        region="HK",
        storage=storage,
        fetch_func=fake_fetch,
    )

    assert result["card_key"].startswith("hsbc-red")
    assert result["version"] == "1"

    saved = storage.get_latest(result["card_key"])
    assert saved is not None
    ruleset_path = tmp_path / saved["path"]
    assert ruleset_path.exists()
    data = json.loads(ruleset_path.read_text())
    descriptions = " ".join(rule["description"] for rule in data["rules"])
    assert "4% cashback on online shopping" in descriptions
    assert data["fx_fee"] == 3.5
