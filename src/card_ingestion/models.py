"""Data models for the KaCard ingestion pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Optional, Dict, Any


@dataclass
class CardRule:
    """Represents a single earning or cost rule for a card."""

    category: str
    rate: float
    description: str
    unit: str = "%"
    source: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the rule to a dictionary suitable for JSON storage."""
        return asdict(self)


@dataclass
class CardRuleSet:
    """Structured representation of a card's benefits and costs."""

    card_name: str
    region: str
    currency: str
    base_rate: float
    rules: List[CardRule] = field(default_factory=list)
    annual_fee: Optional[float] = None
    fx_fee: Optional[float] = None
    promotions: List[str] = field(default_factory=list)
    source_url: str = ""
    content_hash: str = ""
    fetched_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the ruleset to a JSON-friendly dictionary."""
        return {
            "card_name": self.card_name,
            "region": self.region,
            "currency": self.currency,
            "base_rate": self.base_rate,
            "rules": [rule.to_dict() for rule in self.rules],
            "annual_fee": self.annual_fee,
            "fx_fee": self.fx_fee,
            "promotions": list(self.promotions),
            "source_url": self.source_url,
            "content_hash": self.content_hash,
            "fetched_at": self.fetched_at.isoformat(),
        }

    @property
    def card_key(self) -> str:
        """Return a deterministic key for storage based on card name and region."""
        normalized = f"{self.card_name}-{self.region}".lower()
        return "".join(ch if ch.isalnum() or ch in {"-"} else "-" for ch in normalized)


@dataclass
class ValidationIssue:
    """Represents a problem found during validation."""

    field: str
    message: str


@dataclass
class ValidationResult:
    """Result of validating a ruleset."""

    valid: bool
    issues: List[ValidationIssue] = field(default_factory=list)

    def add_issue(self, field: str, message: str) -> None:
        self.issues.append(ValidationIssue(field, message))
        self.valid = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "valid": self.valid,
            "issues": [asdict(issue) for issue in self.issues],
        }


@dataclass
class FetchedPage:
    """Represents the raw content returned by ``fetch_perk_page``."""

    url: str
    content: str
    content_hash: str
    snapshot_key: str
    fetched_at: datetime

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "content_hash": self.content_hash,
            "snapshot_key": self.snapshot_key,
            "fetched_at": self.fetched_at.isoformat(),
        }
