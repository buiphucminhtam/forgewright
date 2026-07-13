# Bài viết Facebook: Token Efficiency + Forgewright Studio

> **Historical marketing draft — all product, performance, and quality claims are unverified.** Percentages, test counts, cost reductions, and quality statements in every version below are retained as draft copy, not current product evidence. Use `docs/active-roadmap.md` and generated verifier output for release claims.

---

## VERSION 1: Kỹ thuật / Developer-focused

---

🚀 **[Forgewright v8.1] Tiết kiệm 90% Token khi dùng AI - Không phải marketing, đây là số thật**

---

Một trong những vấn đề lớn nhất khi dùng Claude/GPT cho development: **tiền cháy túi vì token**.

Với Forgewright, mình đã build một **token efficiency stack** thật sự hoạt động:

---

**📊 Số liệu thực tế:**

| Trước | Sau | Giảm |
|--------|------|-------|
| Shell outputs nguyên si | Structured summary | **60-80%** |
| Duplicate tool calls | SHA-256 dedup | **90%** |
| Conversation context | Intelligent pruning | **50-70%** |
| Memory retrieval | Progressive disclosure | **75%** |
| Code execution output | Summarized | **95-98%** |
| Symbol navigation | Minimal signatures | **97%** |

**→ Tổng cộng: ~90% token reduction**

---

**🔧 Architecture Stack:**

```
Input Layer:
├── Session Deduplication (SHA-256, LRU cache, 10-turn window)
└── Context Loader (progressive disclosure)

Processing Layer:
├── Shell Filter (native awk/sed)
├── Tool Sandbox (ANSI strip, truncate, prompt injection detection)
└── Conversation Pruning (DyCP KadaneDial algorithm)

Output Layer:
├── Outline Mode (>200 lines → signatures only)
├── ctx_execute (sandboxed execution, structured summary)
└── Memory v2 (SQLite + FTS5 + RRF, 3-layer disclosure)
```

---

**💡 Ví dụ thực tế:**

1. **Shell output**: `git diff` 500 dòng → chỉ 5 dòng summary
2. **File reading**: 2000 dòng file → chỉ function signatures
3. **Memory**: Lấy 15 tokens summary thay vì 200 tokens full context
4. **Tool calls**: Kết quả trùng lặp → bỏ qua, không đưa vào context

---

**🎨 Forgewright Studio - Real-time Pipeline Monitor**

Song song, mình cũng release Forgewright Studio - dashboard monitor pipeline:

**Features:**
- Pipeline Monitor: Theo dõi DEFINE → BUILD → HARDEN → SHIP
- Memory Trace: Timeline memory operations
- Token Tracker: Chi phí theo thời gian thực
- Session History: Lịch sử các phiên

**Tech stack:**
- WebSocket server (port 7892)
- React components (React 18)
- OpenTelemetry-compatible tracing

```
┌─────────────┐     WebSocket      ┌──────────────┐
│   IDE/CLI   │ ─────────────────► │  WS Server   │
│ (Emitter)   │   port 7892       │  (run.js)    │
└─────────────┘                    └──────────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │  Studio UI   │
                                   │ (React App)  │
                                   └──────────────┘
```

---

**🔗 Link:**
- GitHub: https://github.com/buiphucminhtam/forgewright
- Studio: `node src/studio/run.js --demo`

---

**Tiết kiệm token không phải cheat - đó là architecture decision đúng cách.**

#AI #Claude #Development #Forgewright #TokenEfficiency #CodingAssistant

---

## VERSION 2: Ngắn gọn / General audience

---

🚀 **Mình vừa build xong hệ thống tiết kiệm 90% chi phí API khi dùng AI coding assistant**

---

Vấn đề: Dùng Claude/GPT cho development thì rất mạnh, nhưng token cháy nhanh như... đốt tiền.

Giải pháp: **Forgewright Token Efficiency Stack**

**8 layers tối ưu:**

1. **Shell Filter** - Lọc output lệnh terminal (60-80% reduction)
2. **Session Deduplication** - Không lặp lại cùng 1 query
3. **Conversation Pruning** - Cắt bớt context thông minh
4. **Memory v2** - Lấy có chọn lọc, 3 layers (15 tokens thay vì 200)
5. **Outline Mode** - Đọc code >200 lines → chỉ signatures
6. **ctx_execute** - Sandboxed execution, output có cấu trúc
7. **Tool Sandbox** - Bảo mật + nén output
8. **Prompt Injection Detection** - An toàn

**→ Tổng: 90% token giảm, chất lượng không đổi**

---

**Plus: Forgewright Studio**

Dashboard monitor pipeline theo thời gian thực - thấy được AI đang làm gì, token bao nhiêu, cost bao nhiêu.

Mở bằng: `node src/studio/run.js --demo`

---

Code is open source: https://github.com/buiphucminhtam/forgewright

#AI #Coding #Development #Productivity #Tech

---

## VERSION 3: Technical Deep-dive

---

**[TECH DEEP-DIVE] Token Optimization Architecture trong Forgewright**

---

Bài viết dành cho ai quan tâm đến implementation chi tiết.

---

**1. Shell Output Filter (60-80% reduction)**

Native shell script - không dependency:

```bash
bash scripts/run_shell_filter.sh --pipe
```

Auto-detect best compressor: `rtk > chop > snip > ctx > native`

Supported commands: git, npm, cargo, pytest, docker, kubectl, tsc, eslint...

Example: `git diff` 500 lines → 3-line summary với color-coded diff

---

**2. Session Deduplication (90% reduction)**

```typescript
// SHA-256 normalized keys
// Sliding window: 10 turns / 5 minutes
// LRU eviction: 500 entries max
```

Không gửi cùng 1 tool call 2 lần vào context.

---

**3. DyCP Conversation Pruning (50-70% reduction)**

KadaneDial algorithm:
- Z-score normalized span scoring
- Pre-processing: tool dedup + error purge
- Strategies: structured_summary | truncate | offload

---

**4. Memory v2 (SQLite + FTS5 + RRF)**

3-layer progressive disclosure:

| Layer | Tokens | Content |
|-------|--------|---------|
| Layer 1 | ~15 | Single-line summary |
| Layer 2 | ~60 | Key facts only |
| Layer 3 | ~200 | Full detail |

Chỉ lấy đủ thông tin cần thiết.

---

**5. ForgeNexus Outline Mode (97% reduction)**

```typescript
// >200 lines OR >6000 tokens → Outline mode
// <200 lines → Full content
// Session dedup: "[shown earlier]" on revisit
```

Pattern-based structural extraction. Không đọc toàn bộ file khi chỉ cần signature.

---

**6. ctx_execute Sandbox (95-98% reduction)**

Sandboxed code execution:

```typescript
// Supports: python, node, bash, go, rust, ruby, php
// Language auto-detection via shebang or syntax
// Configurable: timeout_ms, max_output_chars
```

---

**7. Tool Output Sandboxing**

Features:
- ANSI stripping
- Prompt injection detection
- Compression (truncate >10KB)
- Audit log: `.forgewright/audit/{session}/{turn}/{tool}/`

---

**8. Token-Savior Integration (97% reduction)**

Optional ultra-efficient symbol navigation via Token-Savior MCP.

---

**Test Coverage:**

| Module | Tests | Status |
|--------|-------|--------|
| ForgeNexus | 173 | ✅ |
| MCP Server | 86 | ✅ |
| Memory v2 (mem0-v2) | 30 | ✅ |
| DyCP Pruning | 25 | ✅ |
| Shell Filter | 7 | ✅ |
| **Total** | **321** | ✅ |

---

**Configuration (auto-generated):**

```bash
# Shell output compressor
export FORGEWRIGHT_SHELL_COMPRESSOR="forgewright-shell-filter"

# Session deduplication
export FORGEWRIGHT_SESSION_DEDUP="true"
export FORGEWRIGHT_DEDUP_WINDOW="10"

# Memory
export FORGEWRIGHT_MEMORY_ENABLED="true"

# Code navigation
export FORGEWRIGHT_CODE_NAV="forgenexus"
```

---

**Repo:** https://github.com/buiphucminhtam/forgewright

#TokenOptimization #AIEngineering #SystemDesign #Architecture #Development

---

Bạn thích version nào? Để mình edit lại cho phù hợp với audience của bạn trên Facebook.
