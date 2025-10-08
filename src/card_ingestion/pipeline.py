"""High level orchestration for processing issuer links."""
from __future__ import annotations

from typing import Callable, Dict, Optional

from .fetcher import fetch_perk_page
from .models import CardRuleSet, FetchedPage
from .parser import extract_perk_schema
from .storage import LocalRulesetStorage
from .validator import validate_rules

FetchFunc = Callable[[str], FetchedPage]


def process_card_link(
    url: str,
    *,
    region: str,
    storage: LocalRulesetStorage,
    fetch_func: Optional[FetchFunc] = None,
) -> Dict[str, str]:
    """Run the end-to-end ingestion flow for a card URL."""
    fetcher = fetch_func or (lambda target: fetch_perk_page(target))
    page = fetcher(url)
    ruleset = extract_perk_schema(page, region)
    validation = validate_rules(ruleset)
    if not validation.valid:
        issues = "; ".join(f"{issue.field}: {issue.message}" for issue in validation.issues)
        raise ValueError(f"Ruleset validation failed: {issues}")
    return storage.publish(ruleset)
