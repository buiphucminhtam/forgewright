"""Bounded EN/VI System-1 selection, with no model or network dependency.

This is a lexical rule score, never a probability. It only suggests a configured
mode; it grants no tool capability or execution authority. Callers own config,
shortlists, and an optional process-local cache (there is no global cache).
"""

from __future__ import annotations

from collections import OrderedDict
import hashlib
import json
from pathlib import Path
import re
import threading
import unicodedata

MAX_INTENT_CHARS = 8192
MAX_CANDIDATES = 64
RULE_VERSION = "local-en-vi-1"
_NAME = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z")

# Whole Unicode words/phrases only. Specific design/game signals absorb generic
# creation verbs, but multiple independent task families always abstain.
_RULES = {
    "game-build": (
        "unity",
        "unreal",
        "roblox",
        "godot",
        "phaser",
        "gameplay",
        "game",
        "video game",
        "level design",
        "trò chơi",
        "tro choi",
    ),
    "design": (
        "concept art",
        "concept artist",
        "visual concept",
        "art direction",
        "art director",
        "moodboard",
        "visual style",
        "visual identity",
        "character design",
        "environment design",
        "illustration",
        "thiết kế nhân vật",
        "minh họa",
        "bảng cảm hứng",
        "định hướng mỹ thuật",
    ),
    "full-build": (
        "full build",
        "build",
        "create",
        "scaffold",
        "new project",
        "tạo dự án",
        "xây dựng ứng dụng",
        "khởi tạo dự án",
        "tạo trang web",
    ),
    "feature": ("feature", "implement", "add functionality", "tính năng", "chức năng"),
    "test": (
        "test",
        "tests",
        "testing",
        "qa",
        "coverage",
        "validation",
        "kiểm thử",
        "kiem thu",
    ),
    "review": (
        "code review",
        "pull request",
        "review",
        "rà soát",
        "đánh giá mã nguồn",
        "xem xét bản vá",
    ),
    "ship": (
        "ship",
        "release",
        "deploy",
        "phát hành",
        "đưa ứng dụng lên máy chủ",
        "triển khai lên production",
    ),
    "architect": (
        "architecture",
        "architect",
        "design system",
        "kiến trúc",
        "thiết kế hệ thống",
    ),
    "document": ("documentation", "document", "readme", "tài liệu", "tai lieu"),
    "research": ("research", "investigate", "nghiên cứu", "khảo sát", "tìm hiểu"),
    "optimize": (
        "optimize",
        "optimise",
        "performance",
        "latency",
        "tối ưu",
        "độ trễ",
        "hiệu năng",
    ),
    "mobile": ("ios", "android", "mobile", "di động"),
    "marketing": ("marketing", "campaign", "landing page", "tiếp thị", "chiến dịch"),
    "ai-build": ("llm", "ai agent", "machine learning", "học máy", "trí tuệ nhân tạo"),
    "xr-build": ("xr", "ar", "vr", "mixed reality", "thực tế ảo", "thực tế tăng cường"),
    "analyze": ("analyze", "analyse", "analysis", "metrics", "phân tích"),
}
# These inputs need controller interpretation. No prompt text is ever parsed as
# config, an explicit mode argument, capability grants, or cache entries.
_UNCERTAIN = (
    "not",
    "never",
    "without",
    "don't",
    "do not",
    "không",
    "đừng",
    "ignore",
    "bypass",
    "override",
    "disabled",
    "enable skills",
    "system prompt",
    "bỏ qua",
    "vô hiệu",
    "maybe",
    "perhaps",
    "có thể",
    "hoặc",
    "or",
)


def normalize_intent(value: str) -> str:
    """Preserve accents; unify compatibility characters, case and whitespace."""
    if not isinstance(value, str):
        raise ValueError("intent must be a string")
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def valid_name(value: object) -> bool:
    return isinstance(value, str) and len(value) <= 80 and bool(_NAME.fullmatch(value))


def validate_candidates(candidates: object) -> tuple[str, ...]:
    if not isinstance(candidates, (list, tuple)) or len(candidates) > MAX_CANDIDATES:
        raise ValueError("candidates must be a list/tuple of at most 64 mode names")
    if any(not valid_name(name) for name in candidates):
        raise ValueError("invalid candidate name")
    return tuple(dict.fromkeys(candidates))


def _has(text: str, phrase: str) -> bool:
    return re.search(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text) is not None


def _decision(mode=None, *, source="local-rules", score=0, reason="no-rule-match"):
    return {
        "status": "selected" if mode else "abstain",
        "mode": mode,
        "source": source,
        "rule_score": score,
        "score_kind": "rule-score-not-calibrated",
        "reason": reason,
        "backend": "python-stdlib",
        "rule_version": RULE_VERSION,
    }


class ExactRoutingCache:
    """Host-owned LRU; at most 512 immutable decisions and hashed intent keys.

    Only this selector fills it. Config/catalog/policy fingerprints are supplied
    by the trusted host, never prompt text. Hits still require path validation by
    route_skills. A lock protects the bounded LRU for shared-thread callers.
    """

    def __init__(self, max_entries: int = 512):
        if type(max_entries) is not int or not 1 <= max_entries <= 512:
            raise ValueError("max_entries must be an integer between 1 and 512")
        self._limit = max_entries
        self._entries = OrderedDict()
        self._lock = threading.Lock()

    def __len__(self):
        with self._lock:
            return len(self._entries)

    def _get(self, key):
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None:
                self._entries.move_to_end(key)
            return entry

    def _put(self, key, mode, score):
        with self._lock:
            self._entries[key] = (mode, score)
            self._entries.move_to_end(key)
            while len(self._entries) > self._limit:
                self._entries.popitem(last=False)


def select_mode(
    *,
    prompt: str,
    candidates,
    project_root,
    fingerprint: str,
    explicit: str | None = None,
    cache: ExactRoutingCache | None = None,
):
    """Explicit -> valid exact cache -> bounded lexical rules -> abstain.

    Selection sees all recognized families before restricting to the host's
    shortlist, so removing one competing mode cannot turn ambiguity into success.
    """
    choices = validate_candidates(candidates)
    if explicit is not None:
        mode = normalize_intent(explicit).replace(" ", "-")
        if mode not in choices:
            raise ValueError(f"unknown explicit mode: {mode} (or disallowed by host)")
        return _decision(mode, source="explicit", reason="host-explicit-selection")
    if not isinstance(prompt, str):
        raise ValueError("intent must be a string")
    if len(prompt) > MAX_INTENT_CHARS:
        return _decision(reason="intent-too-long")
    text = normalize_intent(prompt)
    if not text or len(text) > MAX_INTENT_CHARS:
        return _decision(reason="empty-or-oversized-intent")
    # Cache stores selections only, and cannot bypass a changed shortlist.
    key = hashlib.sha256(
        json.dumps(
            [
                str(Path(project_root).resolve()),
                fingerprint,
                RULE_VERSION,
                choices,
                text,
            ],
            ensure_ascii=False,
        ).encode()
    ).hexdigest()
    if cache is not None:
        entry = cache._get(key)
        if entry is not None and entry[0] in choices:
            return _decision(
                entry[0],
                source="exact-cache",
                score=entry[1],
                reason="validated-exact-match",
            )
    if any(_has(text, phrase) for phrase in _UNCERTAIN):
        return _decision(reason="uncertain-or-policy-language")
    # Treat hyphens as token boundaries without weakening Unicode word matching.
    lexical = text.replace("-", " ")
    hits = {
        mode: sum(_has(lexical, p) for p in phrases) for mode, phrases in _RULES.items()
    }
    hits = {mode: score for mode, score in hits.items() if score}
    if "design" in hits or "game-build" in hits:
        hits.pop("full-build", None)
    if len(hits) != 1:
        return _decision(reason="ambiguous-intent" if hits else "no-rule-match")
    mode, score = next(iter(hits.items()))
    if mode not in choices:
        return _decision(reason="mode-not-allowed")
    if cache is not None:
        cache._put(key, mode, score)
    return _decision(mode, score=score, reason="single-rule-family")
