from __future__ import annotations

import asyncio
from dataclasses import dataclass

from .alternative_frontends import (
    AlternativeFrontendMatch,
    resolve_validated_alternative_frontend,
)
from .clearurls import clean_url_with_rules, fetch_clearurls_rules
from .url_expander import expand_url


@dataclass
class CleanUrlResult:
    original: str
    expanded: str | None
    cleaned: str
    was_expanded: bool


@dataclass
class AlternativeUrlResult:
    original: str
    expanded: str | None
    cleaned: str
    service: str | None
    alternative: str | None
    is_custom_frontend: bool
    match: AlternativeFrontendMatch | None = None


async def get_cleaned_url(url: str) -> CleanUrlResult:
    expansion_task = asyncio.create_task(expand_url(url))
    rules_task = asyncio.create_task(fetch_clearurls_rules())

    expansion_result, rules = await asyncio.gather(expansion_task, rules_task)
    effective_url = expansion_result.expanded

    cleaned_url = clean_url_with_rules(effective_url, rules)

    return CleanUrlResult(
        original=url,
        expanded=effective_url if expansion_result.was_expanded else None,
        cleaned=cleaned_url,
        was_expanded=expansion_result.was_expanded,
    )


async def get_alternative_frontend(url: str) -> AlternativeUrlResult:
    clean_result = await get_cleaned_url(url)
    match = await resolve_validated_alternative_frontend(clean_result.cleaned)

    if not match:
        return AlternativeUrlResult(
            original=url,
            expanded=clean_result.expanded,
            cleaned=clean_result.cleaned,
            service=None,
            alternative=None,
            is_custom_frontend=False,
            match=None,
        )

    return AlternativeUrlResult(
        original=url,
        expanded=clean_result.expanded,
        cleaned=clean_result.cleaned,
        service=match.service,
        alternative=match.frontend_url,
        is_custom_frontend=match.is_custom_override,
        match=match,
    )
