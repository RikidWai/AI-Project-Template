"""Parse issuer pages into structured card rules."""
from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Iterable, List

from .models import CardRule, CardRuleSet, FetchedPage


class _BenefitHTMLParser(HTMLParser):
    """Lightweight parser to extract relevant text snippets."""

    def __init__(self) -> None:
        super().__init__()
        self.title: str = ""
        self._current_tags: List[str] = []
        self._texts: List[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs):
        self._current_tags.append(tag.lower())

    def handle_endtag(self, tag: str):
        if self._current_tags:
            self._current_tags.pop()

    def handle_data(self, data: str):
        if not self._current_tags:
            return
        tag = self._current_tags[-1]
        text = data.strip()
        if not text:
            return
        if tag == "title":
            self.title += (text if not self.title else f" {text}")
        if tag in {"p", "li", "h1", "h2", "title"}:
            self._texts.append((tag, text))

    @property
    def lines(self) -> List[str]:
        return [text for _, text in self._texts if len(text) >= 4]

    @property
    def headings(self) -> List[str]:
        return [text for tag, text in self._texts if tag in {"h1", "h2"}]


PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
CURRENCY_RE = re.compile(r"(?:HK|US|SG|CA|AU)?\$\s*(\d+(?:\.\d+)?)")
CARD_NAME_HINT_RE = re.compile(r"([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,5})\s+(?:Card|Visa|Mastercard|American Express)")


def _detect_currency(text: str) -> str:
    if "HK$" in text:
        return "HKD"
    if "US$" in text or "USD" in text or "$" in text:
        return "USD"
    if "SG$" in text:
        return "SGD"
    return "USD"


def _extract_card_name(parser: _BenefitHTMLParser, fallback_url: str) -> str:
    if parser.title:
        match = CARD_NAME_HINT_RE.search(parser.title)
        if match:
            return match.group(1)
    for heading in parser.headings:
        match = CARD_NAME_HINT_RE.search(heading)
        if match:
            return match.group(1)
        if "card" in heading.lower():
            return heading
    return fallback_url.split("//")[-1].split("/")[0].split("?")[0]


def _extract_annual_fee(lines: Iterable[str]) -> float | None:
    for line in lines:
        if "annual fee" in line.lower():
            currency_match = CURRENCY_RE.search(line)
            if currency_match:
                return float(currency_match.group(1))
            percent = PERCENT_RE.search(line)
            if percent:
                return float(percent.group(1))
    return None


def _extract_fx_fee(lines: Iterable[str]) -> float | None:
    for line in lines:
        lower = line.lower()
        if any(keyword in lower for keyword in ["foreign transaction", "fx fee", "overseas transaction"]):
            percent = PERCENT_RE.search(line)
            if percent:
                return float(percent.group(1))
    return None


def _extract_promotions(lines: Iterable[str]) -> List[str]:
    promos: List[str] = []
    for line in lines:
        lower = line.lower()
        if any(keyword in lower for keyword in ["limited time", "bonus", "promotion", "offer", "spend"]):
            promos.append(line)
    return promos


def _categorize_line(line: str) -> str:
    lower = line.lower()
    if any(keyword in lower for keyword in ["dining", "restaurant", "food"]):
        return "dining"
    if any(keyword in lower for keyword in ["grocer", "supermarket"]):
        return "groceries"
    if any(keyword in lower for keyword in ["online", "e-commerce", "internet"]):
        return "online"
    if any(keyword in lower for keyword in ["travel", "airline", "hotel", "flight"]):
        return "travel"
    if any(keyword in lower for keyword in ["gas", "fuel", "petrol"]):
        return "fuel"
    if "welcome" in lower or "bonus" in lower:
        return "welcome-offer"
    return "general"


def extract_perk_schema(page: FetchedPage, region: str) -> CardRuleSet:
    """Convert a fetched page into a structured ruleset."""
    parser = _BenefitHTMLParser()
    parser.feed(page.content)

    lines = parser.lines
    currency = _detect_currency(page.content)
    card_name = _extract_card_name(parser, page.url)
    annual_fee = _extract_annual_fee(lines)
    fx_fee = _extract_fx_fee(lines)
    promotions = _extract_promotions(lines)

    rules_by_category: dict[str, CardRule] = {}
    for line in lines:
        percent_match = PERCENT_RE.search(line)
        if not percent_match:
            continue
        rate = float(percent_match.group(1))
        category = _categorize_line(line)
        if category not in rules_by_category or rate > rules_by_category[category].rate:
            rules_by_category[category] = CardRule(
                category=category,
                rate=rate,
                description=line,
                source=page.url,
            )

    base_rate = 0.0
    if "general" in rules_by_category:
        base_rate = rules_by_category["general"].rate
    elif rules_by_category:
        base_rate = min(rule.rate for rule in rules_by_category.values())

    return CardRuleSet(
        card_name=card_name,
        region=region,
        currency=currency,
        base_rate=base_rate,
        rules=list(rules_by_category.values()),
        annual_fee=annual_fee,
        fx_fee=fx_fee,
        promotions=promotions,
        source_url=page.url,
        content_hash=page.content_hash,
        fetched_at=page.fetched_at,
    )
