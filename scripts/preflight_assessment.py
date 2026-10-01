"""Check ClaimLens assessment inputs using the contract's own URL rules.

This is a local preflight only. It does not fetch sources, check DNS or
redirect destinations, connect a wallet, or submit a transaction.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence


_MAX_CLAIM_LENGTH = 280
_MAX_URL_LENGTH = 2048
_MAX_SOURCE_COUNT = 3


def validate_assessment_inputs(claim: str, source_urls: Sequence[str]) -> dict[str, object]:
    """Return normalized contract arguments, or raise ValueError if invalid."""
    normalized_claim = claim.strip()
    if not normalized_claim or len(normalized_claim) > _MAX_CLAIM_LENGTH:
        raise ValueError(f"Claim must contain 1 to {_MAX_CLAIM_LENGTH} characters.")

    urls = [line.strip() for item in source_urls for line in item.splitlines() if line.strip()]
    if not 2 <= len(urls) <= _MAX_SOURCE_COUNT:
        raise ValueError(f"Provide two or three source URLs; received {len(urls)}.")

    canonical_urls: list[str] = []
    for url in urls:
        if len(url) > _MAX_URL_LENGTH:
            raise ValueError(f"Each source URL must be {_MAX_URL_LENGTH} characters or fewer.")
        if not _is_public_https_url(url):
            raise ValueError("Sources must be public HTTPS URLs without credentials or local hosts.")
        canonical_urls.append(_canonical_source_url(url))

    if len(set(canonical_urls)) != len(canonical_urls):
        raise ValueError("Source URLs must be distinct after host, fragment, and whitespace normalization.")

    return {
        "claim": normalized_claim,
        "source_urls": canonical_urls,
        "source_urls_text": "\n".join(canonical_urls),
        "call": {
            "method": "assess",
            "args": [normalized_claim, "\n".join(canonical_urls)],
        },
        "limitations": [
            "This tool does not fetch or evaluate source content.",
            "It cannot verify DNS resolution, DNS rebinding, or redirect destinations.",
            "Distinct URLs may still return duplicate excerpts and be counted as one usable source on-chain.",
        ],
    }


def _is_public_https_url(url: str) -> bool:
    """Mirror the contract's conservative syntax checks; the contract is authoritative."""
    if not url.startswith("https://"):
        return False

    authority = url[len("https://"):].split("/", 1)[0]
    authority = authority.split("?", 1)[0].split("#", 1)[0].lower()
    if not authority or "@" in authority or ":" in authority:
        return False
    if len(authority) > 253 or not authority.isascii():
        return False

    labels = authority.split(".")
    if len(labels) < 2:
        return False
    for label in labels:
        if not label or len(label) > 63 or label[0] == "-" or label[-1] == "-":
            return False
        for character in label:
            if character not in "abcdefghijklmnopqrstuvwxyz0123456789-":
                return False
        if label.startswith("0x") and len(label) > 2 and all(
            character in "0123456789abcdef" for character in label[2:]
        ):
            return False

    if authority == "localhost" or authority.endswith(".localhost"):
        return False
    if authority.endswith(".local") or authority.endswith(".internal"):
        return False
    return not all(character in "0123456789." for character in authority)


def _canonical_source_url(url: str) -> str:
    """Mirror the contract's host-case and fragment normalization."""
    url_without_fragment = url.split("#", 1)[0]
    authority_start = len("https://")
    authority_end = len(url_without_fragment)
    for delimiter in ("/", "?"):
        delimiter_index = url_without_fragment.find(delimiter, authority_start)
        if delimiter_index >= 0 and delimiter_index < authority_end:
            authority_end = delimiter_index

    authority = url_without_fragment[authority_start:authority_end].lower()
    return "https://" + authority + url_without_fragment[authority_end:]


def _read_sources(source_args: Sequence[str] | None, source_file: Path | None) -> list[str]:
    if source_file is not None:
        try:
            return source_file.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError) as exc:
            raise ValueError(f"Could not read source file: {exc}") from exc
    return list(source_args or [])


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate ClaimLens input limits and URL syntax before submitting an assessment."
    )
    parser.add_argument("--claim", required=True, help="Public claim text (maximum 280 characters).")
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--source",
        action="append",
        dest="source_args",
        help="A source URL; repeat this flag two or three times.",
    )
    source_group.add_argument(
        "--source-file",
        type=Path,
        help="UTF-8 file containing two or three source URLs, one per line.",
    )
    args = parser.parse_args(argv)

    try:
        sources = _read_sources(args.source_args, args.source_file)
        result = validate_assessment_inputs(args.claim, sources)
    except ValueError as exc:
        parser.error(str(exc))

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
