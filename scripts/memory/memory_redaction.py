"""Minimum redaction shared by Python memory and the portable shell helper."""

import json
import re
import sys

# Keep the portable helper usable without importing the continuity/evidence
# runtime. These are the same minimum credential families as continuity.
PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"sk-[A-Za-z0-9]{20,}",
        r"ghp_[A-Za-z0-9]{20,}",
        r"AKIA[A-Z0-9]{16}",
        r"-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----",
        r"key-[a-zA-Z0-9]{20,}",
        r"Bearer\s+[a-zA-Z0-9\-._~+/]+=*",
        r"(?i)(?:password|secret|token)\s*[:=]\s*['\"]?[^\s'\"]{4,}",
        r"(?:postgres|postgresql|mysql|mongodb(?:\+srv)?)://\S+:\S+@",
    )
)


def redact(value):
    if isinstance(value, dict):
        return {redact(str(key)): redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        for pattern in PATTERNS:
            value = pattern.sub("[REDACTED]", value)
    return value


if __name__ == "__main__":
    raw = sys.stdin.read()
    if sys.argv[1:] == ["--json"]:
        print(json.dumps(redact(json.loads(raw))))
    else:
        sys.stdout.write(redact(raw))
