"""Validation utilities for card rulesets."""
from __future__ import annotations

from .models import CardRuleSet, ValidationResult


REQUIRED_FIELDS = ["card_name", "region", "currency", "base_rate"]


def validate_rules(ruleset: CardRuleSet) -> ValidationResult:
    result = ValidationResult(valid=True)

    if not ruleset.card_name.strip():
        result.add_issue("card_name", "Card name cannot be empty.")
    if not ruleset.region.strip():
        result.add_issue("region", "Region cannot be empty.")
    if not ruleset.currency.strip():
        result.add_issue("currency", "Currency cannot be empty.")

    if ruleset.base_rate < 0:
        result.add_issue("base_rate", "Base rate must be non-negative.")

    for rule in ruleset.rules:
        if rule.rate < 0:
            result.add_issue("rules", f"Rule '{rule.category}' has a negative rate.")

    if ruleset.annual_fee is not None and ruleset.annual_fee < 0:
        result.add_issue("annual_fee", "Annual fee must be non-negative.")

    if ruleset.fx_fee is not None and ruleset.fx_fee < 0:
        result.add_issue("fx_fee", "FX fee must be non-negative.")

    return result
