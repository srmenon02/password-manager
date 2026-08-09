import httpx
import asyncio
from collections import defaultdict
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import BreachResult

HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/{prefix}"
REQUEST_DELAY_SECONDS = 1.6


async def check_and_update_breaches():
    db = SessionLocal()
    try:
        rows = db.query(BreachResult).all()
        if not rows:
            return

        by_prefix = defaultdict(list)
        for row in rows:
            prefix = row.password_sha1[:5].upper()
            by_prefix[prefix].append(row)

        async with httpx.AsyncClient(timeout=10.0) as client:
            for prefix, prefix_rows in by_prefix.items():
                try:
                    response = await client.get(
                        HIBP_RANGE_URL.format(prefix=prefix),
                        headers={"User-Agent": "VaultKey-BreachChecker"}
                    )
                    response.raise_for_status()
                except httpx.HTTPError:
                    await asyncio.sleep(REQUEST_DELAY_SECONDS)
                    continue

                suffix_counts = {}
                for line in response.text.splitlines():
                    suffix, _, count = line.partition(":")
                    suffix = suffix.strip().upper()
                    try:
                        suffix_counts[suffix] = int(count.strip())
                    except ValueError:
                        suffix_counts[suffix] = 0

                for row in prefix_rows:
                    suffix = row.password_sha1[5:].upper()
                    if suffix in suffix_counts:
                        row.breached = True
                        row.last_seen_count = suffix_counts[suffix]
                    else:
                        row.breached = False
                        row.last_seen_count = 0
                    row.checked_at = datetime.now(timezone.utc)
                    row.source = "hibp"

                await asyncio.sleep(REQUEST_DELAY_SECONDS)

        db.commit()
    finally:
        db.close()