# ForgeNexus Enterprise — Workflows Tổng Hợp

> Tất cả GitHub Actions workflows và CLI commands cho ForgeNexus Enterprise.

---

## Mục Lục

1. [CLI Commands](#cli-commands)
2. [GitHub Actions Workflows](#github-actions-workflows)
3. [Dry Run Mode](#dry-run-mode)
4. [Tính Năng Theo Phase](#tính-năng-theo-phase)

---

## CLI Commands

### `forgenexus pr-review`

Phân tích blast radius cho pull request.

```bash
# Cú pháp
forgenexus pr-review <base_ref> [head_ref] [--dry-run]

# Ví dụ
forgenexus pr-review main HEAD
forgenexus pr-review origin/develop HEAD --dry-run
```

**Options:**
| Flag | Mô tả |
|------|--------|
| `--dry-run`, `-n` | Dry run mode |
| `--force` | Bỏ qua database locks |

**Output:**
```
## 🔍 PR Review — Blast Radius Analysis

| Metric | Value |
|--------|-------|
| Files Changed | 12 |
| Symbols Changed | 5 |
| Risk Level | 🟠 HIGH |

### Breaking Changes
- Function validateUser in src/auth.ts

### Top Impact Symbols
| Symbol | File | Callers | Risk |
|-------|------|---------|------|
| validateUser | auth.ts | 8 | HIGH |
```

---

### `forgenexus impact`

Phân tích impact của một symbol cụ thể.

```bash
# Cú pháp
forgenexus impact <symbol> [--direction upstream|downstream] [--depth N] [--dry-run]

# Ví dụ
forgenexus impact validateUser
forgenexus impact PaymentService --direction upstream --depth 5
forgenexus impact DatabaseConnection --dry-run
```

**Options:**
| Flag | Mô tả |
|------|--------|
| `--direction` | `upstream` (callers) hoặc `downstream` (callees) |
| `--depth` | Độ sâu tối đa (default: 3) |
| `--dry-run`, `-n` | Dry run mode |

---

### `forgenexus group`

Multi-repo group management.

```bash
# List all groups
forgenexus group list

# Create a group
forgenexus group create my-services

# Add repo to group
forgenexus group add my-services api-service
forgenexus group add my-services auth-service

# Sync contracts
forgenexus group sync my-services

# View contracts
forgenexus group contracts my-services

# Search across group
forgenexus group query my-services "payment"

# Check group status
forgenexus group status my-services

# Remove repo from group
forgenexus group remove my-services api-service
```

**Subcommands:**

| Command | Mô tả |
|---------|--------|
| `list` | List all groups |
| `create <name> [desc]` | Create a new group |
| `add <group> <repo>` | Add a repo to group |
| `remove <group> <repo>` | Remove a repo from group |
| `sync <group>` | Extract contracts from all repos |
| `contracts <group>` | View all contracts in group |
| `query <group> <term>` | Search contracts by term |
| `status <group>` | Check staleness of all repos |

---

## GitHub Actions Workflows

### 1. PR Review Workflow

File: `.github/workflows/pr-review.yml`

**Trigger:** `pull_request` (opened, synchronize, reopened)

```yaml
name: ForgeNexus PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  forge-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: buiphucminhtam/forgewright/.github/actions/pr-review@main
        with:
          openapi-enabled: 'true'
          fail-on-critical: 'true'
```

**Inputs:**
| Input | Default | Mô tả |
|-------|---------|--------|
| `openapi-enabled` | false | Enable OpenAPI contract check |
| `openapi-specs` | auto | Paths to OpenAPI specs |
| `fail-on-critical` | true | Fail workflow on CRITICAL risk |
| `fail-on-high` | false | Fail workflow on HIGH risk |
| `dry-run` | false | Dry run mode |
| `comment-mode` | always | when to post comment |

---

### 2. Auto Wiki Workflow

File: `.github/workflows/auto-wiki.yml`

**Trigger:** Push to main, hoặc `workflow_dispatch`

```yaml
name: ForgeNexus Auto Wiki

on:
  push:
    branches: [main, master]
    paths:
      - 'src/**'
      - 'lib/**'

jobs:
  wiki:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: buiphucminhtam/forgewright/.github/actions/auto-wiki@main
        with:
          publish_to: 'file'
          model: 'minimax-sonar'
        env:
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
```

**Publish Options:**
| Option | Mô tả |
|--------|--------|
| `file` | Commit ARCHITECTURE.md vào repo |
| `pages` | Deploy lên GitHub Pages |
| `gist` | Tạo/update secret Gist |

---

### 3. Auto Reindex Workflow

File: `.github/workflows/auto-reindex.yml`

**Trigger:** Push to main, PR merge, hoặc `workflow_dispatch`

```yaml
name: ForgeNexus Auto Reindex

on:
  push:
    branches: [main, master]
  pull_request:
    types: [closed]

jobs:
  reindex:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: buiphucminhtam/forgewright/.github/actions/auto-reindex@main
        with:
          mode: 'incremental'
```

---

### 4. Contract Verification Workflow

File: `.github/workflows/contract-verification.yml`

**Trigger:** Khi OpenAPI specs thay đổi

```yaml
name: ForgeNexus Contract Verification

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - 'openapi.yaml'
      - '**/openapi*.yaml'

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: buiphucminhtam/forgewright/.github/actions/contract-verification@main
```

**Features:**
- Auto-detect OpenAPI specs
- 300+ breaking change rules (oasdiff)
- Post PR comment với chi tiết breaking changes
- Block merge nếu có breaking changes

---

### 5. Multi-Repo Sync Workflow

File: `.github/workflows/multi-repo.yml`

**Trigger:** `workflow_dispatch` hoặc schedule

```yaml
name: ForgeNexus Multi-Repo Sync

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:
    inputs:
      group:
        default: 'my-services'
      mode:
        default: 'sync'
```

**Modes:**
| Mode | Mô tả |
|------|--------|
| `sync` | Sync contracts từ tất cả repos |
| `contracts` | View contracts |
| `status` | Check staleness |
| `query` | Search across group |

---

### 6. Multi-Repo Impact Workflow

File: `.github/workflows/multi-repo-impact.yml`

**Trigger:** `pull_request` hoặc `workflow_dispatch`

```yaml
name: ForgeNexus Multi-Repo Impact Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  impact:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: buiphucminhtam/forgewright/.github/actions/multi-repo-impact@main
        with:
          direction: 'upstream'
```

---

## Dry Run Mode

Dry run cho phép test trước mà không thay đổi gì.

### CLI

```bash
# PR Review
forgenexus pr-review main HEAD --dry-run

# Impact Analysis
forgenexus impact PaymentService --dry-run
```

### GitHub Actions

```yaml
# workflow_dispatch
on:
  workflow_dispatch:
    inputs:
      dry_run:
        default: 'true'
```

**Trong Dry Run:**
- ✅ Phân tích được thực hiện
- ✅ Kết quả được hiển thị
- ❌ Không post comment
- ❌ Không commit gì
- ❌ Không fail workflow

---

## Tính Năng Theo Phase

### Phase 1: PR Review ✅

| Tính năng | CLI | GitHub Actions | Dry Run |
|-----------|-----|---------------|---------|
| PR Review blast radius | ✅ | ✅ | ✅ |
| OpenAPI contract check | N/A | ✅ | ✅ |
| PR comment | N/A | ✅ | ✅ |
| Risk level classification | ✅ | ✅ | ✅ |
| Recommended reviewers | ✅ | ❌ | ✅ |

**Điểm: 92%**

---

### Phase 2: Auto Wiki + Reindex ✅

| Tính năng | CLI | GitHub Actions | Dry Run |
|-----------|-----|---------------|---------|
| Auto-generate wiki | ✅ | ✅ | ✅ |
| Multi-provider LLM | ✅ | ✅ | ✅ |
| Publish options | ✅ | ✅ | ✅ |
| Incremental reindex | ✅ (hooks) | ✅ | ✅ |
| Full reindex | ✅ | ✅ | ✅ |
| Artifact upload | N/A | ✅ | ✅ |

**Điểm: 88%**

---

### Phase 3: Multi-Repo ✅

| Tính năng | CLI | GitHub Actions | Dry Run |
|-----------|-----|---------------|---------|
| Group management | ✅ | ✅ | ✅ |
| Contract extraction | ✅ | ✅ | ✅ |
| Contract viewing | ✅ | N/A | N/A |
| Cross-repo linking | ✅ | ✅ | ✅ |
| Group query | ✅ | ✅ | ✅ |
| Group status | ✅ | N/A | N/A |
| Contract verification (oasdiff) | N/A | ✅ | ✅ |
| Multi-repo impact analysis | N/A | ✅ | ✅ |
| Scheduled sync | N/A | ✅ | N/A |

**Điểm: 75%**

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                     ForgeNexus Enterprise                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   CLI       │  │   MCP       │  │  GitHub      │            │
│  │   Commands  │  │   Server    │  │  Actions     │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                 │                     │
│         └────────┬────────┴────────┬────────┘                     │
│                  │                 │                              │
│         ┌────────▼────────┐ ┌──────▼───────┐                     │
│         │   ForgeDB     │ │   Registry   │                     │
│         │  (per-repo)    │ │  (multi-repo)│                     │
│         └───────┬────────┘ └──────┬───────┘                     │
│                 │                │                              │
│         ┌───────▼────────┐ ┌─────▼──────┐                      │
│         │   Graph       │ │  Contracts │                      │
│         │   Analysis    │ │  & Links   │                      │
│         └───────────────┘ └────────────┘                      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Install ForgeNexus

```bash
npm install "git+https://github.com/buiphucminhtam/forgewright.git#main:forgenexus" --save-dev
cd node_modules/forgenexus && npm install && npm run build
```

### 2. Setup MCP

```bash
forgenexus setup
```

### 3. Index Codebase

```bash
forgenexus analyze
```

### 4. Enable PR Review

```yaml
# .github/workflows/forge-review.yml
name: ForgeNexus PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: buiphucminhtam/forgewright/.github/actions/pr-review@main
```

---

## Support

- GitHub Issues: https://github.com/buiphucminhtam/forgewright/issues
- Documentation: https://github.com/buiphucminhtam/forgewright/wiki
