"""Utilities to fetch issuer benefit pages for ingestion."""
from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from urllib.parse import urlparse

from urllib import request

from .models import FetchedPage


def _build_snapshot_key(url: str, content_hash: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.replace(".", "-") or "snapshot"
    return f"{host}-{content_hash[:12]}"


def fetch_perk_page(url: str, *, timeout: int = 10) -> FetchedPage:
    """Fetch a card benefit page and compute its metadata."""
    with request.urlopen(url, timeout=timeout) as response:
        content_bytes = response.read()
    content = content_bytes.decode("utf-8", errors="replace")
    content_hash = sha256(content.encode("utf-8")).hexdigest()
    snapshot_key = _build_snapshot_key(url, content_hash)
    return FetchedPage(
        url=url,
        content=content,
        content_hash=content_hash,
        snapshot_key=snapshot_key,
        fetched_at=datetime.utcnow(),
    )
