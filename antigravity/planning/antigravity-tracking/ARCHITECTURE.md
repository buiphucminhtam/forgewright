# Antigravity Usage Tracking - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Unified Usage Dashboard                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌───────────┐  │
│  │ Cursor DB   │   │ Claude Tel  │   │ Forgewright │   │ Ollama    │  │
│  │ Reader      │   │ Reader      │   │ Reader      │   │ Reader    │  │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └─────┬─────┘  │
│         │                  │                  │               │         │
│         └──────────────────┼──────────────────┼───────────────┘         │
│                            ▼                                      │
│               ┌────────────────────────┐                          │
│               │   Unified Aggregator    │                          │
│               │   - Normalize models   │                          │
│               │   - Merge by time      │                          │
│               │   - Estimate costs     │                          │
│               └───────────┬────────────┘                          │
│                           ▼                                      │
│               ┌────────────────────────┐                          │
│               │   REST API Server      │                          │
│               │   /api/unified/*       │                          │
│               └───────────┬────────────┘                          │
│                           ▼                                      │
│               ┌────────────────────────┐                          │
│               │   Dashboard (HTML/JS)  │                          │
│               │   - Source tabs        │                          │
│               │   - Charts             │                          │
│               └────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Reader Classes

### 1. CursorDBReader

```python
class CursorDBReader:
    """Read from ~/.cursor/ai-tracking/ai-code-tracking.db"""
    DB_PATH = "~/.cursor/ai-tracking/ai-code-tracking.db"
    
    def get_model_stats(self) -> List[Dict]:
        """Returns: [{model, call_count, conversations, last_used}]"""
        
    def get_projects(self) -> List[Dict]:
        """Returns: [{name, path, total_changes, models, estimated_cost}]"""
```

### 2. ClaudeTelemetryReader

```python
class ClaudeTelemetryReader:
    """Read from ~/.claude/telemetry/*.json"""
    TELEMETRY_PATH = "~/.claude/telemetry"
    
    def get_sessions(self) -> List[Dict]:
        """Returns: [{session_id, model, start_time, end_time, project}]"""
        
    def get_model_usage(self) -> List[Dict]:
        """Returns: [{model, session_count, total_duration}]"""
```

### 3. ForgewrightReader

```python
class ForgewrightReader:
    """Read from ~/.forgewright/usage/{project}/*.jsonl"""
    USAGE_PATH = "~/.forgewright/usage"
    
    def get_usage(self, project: str, period: int) -> List[Dict]:
        """Returns: [{timestamp, model, input_tokens, output_tokens, cost}]"""
```

## Unified Schema

```python
@dataclass
class UnifiedUsage:
    timestamp: datetime
    platform: str
    session_id: str
    project: str
    model: str
    provider: str
    calls: int
    estimated_tokens: int
    estimated_cost: float
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/platforms` | GET | List available platforms |
| `/api/unified/summary` | GET | Aggregated summary |
| `/api/unified/by-project` | GET | Breakdown by project |
| `/api/unified/by-model` | GET | Breakdown by model |
| `/api/unified/trend` | GET | Usage over time |
| `/api/cursor/models` | GET | Cursor-specific data |
| `/api/claude/sessions` | GET | Claude Code sessions |
| `/api/forgewright/usage` | GET | Forgewright data |

## Dashboard Views

### 1. Overview (All Sources)
- Total calls, estimated cost
- Usage by platform (pie chart)
- Model distribution (bar chart)
- Top projects (table)

### 2. Cursor-Only View
- Model usage statistics
- Conversation count
- Per-project breakdown

### 3. Claude Code View
- Session history
- Model usage by session
- Environment info

### 4. Forgewright View
- Token counts (actual)
- Cost (actual)
- By skill/mode

## Data Flow

```
1. Server starts → Initialize all readers
2. API request → Load relevant data from readers
3. Aggregator normalizes → Unified format
4. Response returned → Dashboard renders
```

## Storage

| Data | Location | Format |
|------|----------|--------|
| Cache | `~/.forgewright/cache/` | JSON |
| Logs | `~/.forgewright/usage/` | JSONL |
| Config | `~/.forgewright/config.yaml` | YAML |
