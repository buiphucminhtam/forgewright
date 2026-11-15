"""Minimum redaction shared by Python memory and the portable shell helper."""

import json
import re
import sys

# Keep the portable helper usable without importing the continuity/evidence
# runtime. These cover the continuity credential families plus the token and
# personal-data shapes that automatic per-turn capture can echo from tool output.
PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"sk-[A-Za-z0-9_-]{20,}",
        r"ghp_[A-Za-z0-9]{20,}",
        r"gh[ousr]_[A-Za-z0-9]{20,}",
        r"github_pat_[A-Za-z0-9_]{20,}",
        r"xox[abposr]-[A-Za-z0-9-]{10,}",
        r"AIza[0-9A-Za-z_-]{30,}",
        r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}",
        r"\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b",
        r"\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b",
        r"AKIA[A-Z0-9]{16}",
        r"-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----",
        r"key-[a-zA-Z0-9]{20,}",
        r"Bearer\s+[a-zA-Z0-9\-._~+/]+=*",
        r"(?i)(?:password|secret|token)\s*[:=]\s*['\"]?[^\s'\"]{4,}",
        r"(?:postgres|postgresql|mysql|mongodb(?:\+srv)?)://\S+:\S+@",
    )
)


_CARD_CANDIDATE = re.compile(r"(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])")


def _luhn_valid(digits):
    total = 0
    for index, char in enumerate(reversed(digits)):
        number = int(char)
        if index % 2:
            number *= 2
            if number > 9:
                number -= 9
        total += number
    return total % 10 == 0


def _redact_card(match):
    digits = re.sub(r"[ -]", "", match.group(0))
    return "[REDACTED]" if 13 <= len(digits) <= 19 and _luhn_valid(digits) else match.group(0)


def redact(value):
    if isinstance(value, dict):
        return {redact(str(key)): redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        for pattern in PATTERNS:
            value = pattern.sub("[REDACTED]", value)
        value = _CARD_CANDIDATE.sub(_redact_card, value)
    return value


if __name__ == "__main__":
    raw = sys.stdin.read()
    if sys.argv[1:] == ["--json"]:
        print(json.dumps(redact(json.loads(raw))))
    else:
        sys.stdout.write(redact(raw))
