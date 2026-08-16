import hashlib
from typing import Dict, Optional

import httpx

HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/{prefix}"
REQUEST_DELAY_SECONDS = 1.6


def sha1_hex(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest().upper()


def password_to_hibp_lookup(password: str) -> tuple[str, str]:
    digest = sha1_hex(password)
    return digest[:5], digest[5:]


async def is_password_breached(password: str) -> bool:
    prefix, suffix = password_to_hibp_lookup(password)
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            HIBP_RANGE_URL.format(prefix=prefix),
            headers={"User-Agent": "VaultKey-BreachChecker"},
        )
        response.raise_for_status()

    for line in response.text.splitlines():
        candidate, _, _ = line.partition(":")
        if candidate.strip().upper() == suffix.upper():
            return True
    return False


async def get_hibp_matches_for_prefix(prefix: str) -> Dict[str, int]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            HIBP_RANGE_URL.format(prefix=prefix),
            headers={"User-Agent": "VaultKey-BreachChecker"},
        )
        response.raise_for_status()

    suffix_counts: Dict[str, int] = {}
    for line in response.text.splitlines():
        suffix, _, count = line.partition(":")
        suffix = suffix.strip().upper()
        try:
            suffix_counts[suffix] = int(count.strip())
        except ValueError:
            suffix_counts[suffix] = 0
    return suffix_counts


async def check_hibp_for_password(password: str) -> Optional[int]:
    prefix, suffix = password_to_hibp_lookup(password)
    suffix_counts = await get_hibp_matches_for_prefix(prefix)
    count = suffix_counts.get(suffix.upper())
    return count if count is not None else 0
