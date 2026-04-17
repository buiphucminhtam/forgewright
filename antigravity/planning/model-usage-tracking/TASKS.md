# Model Usage Tracking - Tasks

## Progress Checklist

- [x] P0-01: Create CursorDBReader class
- [x] P0-02: Add `/api/cursor/models` endpoint
- [x] P0-03: Test Cursor DB reading
- [x] P1-01: Create UnifiedAggregator
- [x] P1-02: Add source tabs to dashboard
- [x] P1-03: Add model comparison chart
- [x] P2-01: Add cost estimation
- [x] P2-02: Add per-project breakdown

## All tasks completed ✅

---

---

## P0 Tasks (Foundation)

### P0-01: CursorDBReader Class ✅
**File:** `scripts/token-api-server.py`
**Effort:** 1h
**Status:** Completed

```python
class CursorDBReader:
    """Read usage data from Cursor's SQLite database"""
    
    DB_PATH = Path.home() / ".cursor/ai-tracking/ai-code-tracking.db"
    
    def __init__(self):
        if not self.DB_PATH.exists():
            raise FileNotFoundError(f"Cursor DB not found: {self.DB_PATH}")
        self.conn = sqlite3.connect(self.DB_PATH)
    
    def get_model_stats(self) -> List[Dict]:
        """Get aggregated model usage stats"""
        ...
```

**Acceptance Criteria:** ✅ All passed

---

### P0-02: API Endpoint ✅
**File:** `scripts/token-api-server.py`
**Effort:** 30m
**Status:** Completed

---

### P0-03: Test Cursor DB Reading ✅
**Effort:** 30m
**Status:** Completed

```bash
# Manual test
curl http://localhost:8890/api/cursor/models | python3 -m json.tool
```

**Expected Output:**
```json
{
    "models": [
        {"model": "claude-4.6-opus-max-thinking-fast", "call_count": 125061, "conversations": 150},
        {"model": "gpt-5.4-high-fast", "call_count": 27714, "conversations": 89},
        ...
    ]
}
```

---

## P1 Tasks (Dashboard) ✅

### P1-01: UnifiedAggregator ✅
**File:** `scripts/token-api-server.py`
**Effort:** 1h
**Status:** Completed

---

### P1-02: Source Tabs ✅
**File:** `scripts/token-dashboard.html`
**Effort:** 1h
**Status:** Completed

Add tabs:
- [x] All Sources
- [x] Cursor Only
- [x] Claude Code Only
- [x] Forgewright Only

---

### P1-03: Model Comparison Chart ✅
**File:** `scripts/token-dashboard.html`
**Effort:** 1h
**Status:** Completed

---

## P2 Tasks (Enhancements) ✅

### P2-01: Cost Estimation ✅
**Effort:** 1h
**Status:** Completed

---

### P2-02: Per-Project Breakdown ✅
**Effort:** 1h
**Status:** Completed

---

## Time Log

| Task | Started | Completed | Actual Time |
|------|---------|-----------|-------------|
| P0-01 | 2026-04-17 | 2026-04-17 | ~1h |
| P0-02 | 2026-04-17 | 2026-04-17 | ~30m |
| P0-03 | 2026-04-17 | 2026-04-17 | ~30m |
| P1-01 | 2026-04-17 | 2026-04-17 | ~1h |
| P1-02 | 2026-04-17 | 2026-04-17 | ~1h |
| P1-03 | 2026-04-17 | 2026-04-17 | ~1h |
| P2-01 | 2026-04-17 | 2026-04-17 | ~1h |
| P2-02 | 2026-04-17 | 2026-04-17 | ~1h |

**Total: ~7h (completed)**
