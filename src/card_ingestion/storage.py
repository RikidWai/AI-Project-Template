"""Storage helpers for persisting card rulesets locally."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional

from .models import CardRuleSet


class LocalRulesetStorage:
    """Persist rulesets to versioned JSON files on disk."""

    def __init__(self, base_path: Path) -> None:
        self.base_path = base_path
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.index_path = self.base_path / "index.json"
        if not self.index_path.exists():
            self.index_path.write_text(json.dumps({}, indent=2))

    def _load_index(self) -> Dict[str, Dict[str, str]]:
        return json.loads(self.index_path.read_text())

    def _write_index(self, data: Dict[str, Dict[str, str]]) -> None:
        self.index_path.write_text(json.dumps(data, indent=2, sort_keys=True))

    def publish(self, ruleset: CardRuleSet) -> Dict[str, str]:
        index = self._load_index()
        card_key = ruleset.card_key
        card_dir = self.base_path / card_key
        card_dir.mkdir(exist_ok=True)

        card_index = index.get(card_key, {})
        latest_version = int(card_index.get("version", 0))
        latest_hash = card_index.get("content_hash")

        if latest_hash == ruleset.content_hash:
            return {
                "card_key": card_key,
                "version": str(latest_version),
                "path": card_index.get("path", ""),
                "content_hash": latest_hash,
            }

        new_version = latest_version + 1
        file_path = card_dir / f"v{new_version}.json"
        file_path.write_text(json.dumps(ruleset.to_dict(), indent=2, sort_keys=True))

        index[card_key] = {
            "version": str(new_version),
            "path": str(file_path.relative_to(self.base_path)),
            "content_hash": ruleset.content_hash,
        }
        self._write_index(index)

        return {
            "card_key": card_key,
            "version": str(new_version),
            "path": str(file_path.relative_to(self.base_path)),
            "content_hash": ruleset.content_hash,
        }

    def get_latest(self, card_key: str) -> Optional[Dict[str, str]]:
        index = self._load_index()
        return index.get(card_key)
