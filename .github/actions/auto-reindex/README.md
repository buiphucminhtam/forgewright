# ForgeNexus Auto Reindex

> Tự động incremental reindex sau mỗi commit. Giữ index luôn updated mà không cần chạy thủ công.

## Tính năng

- **Incremental reindex** — Chỉ index files đã thay đổi
- **Full reindex** — Trên PR merge hoặc manual trigger
- **Artifact upload** — Lưu index để dùng lại
- **Auto-commit** — Commit index updates lên repo
- **Dry run mode** — Test trước không thay đổi gì

## Trigger

| Event | Action |
|-------|--------|
| Push to main | Incremental reindex |
| PR merged | Full reindex |
| Manual | `workflow_dispatch` với options |

## Workflow Dispatch Options

```yaml
on:
  workflow_dispatch:
    inputs:
      mode:
        description: 'Reindex mode (incremental, full)'
        default: 'incremental'
      dry_run:
        description: 'Dry run mode'
        default: 'false'
      repo:
        description: 'Repository path (for multi-repo)'
        default: ''
```

## Outputs

| Output | Mô tả |
|--------|--------|
| `files_changed` | Số files đã thay đổi |
| `nodes_added` | Nodes mới được thêm |
| `edges_added` | Edges mới được thêm |
| `files_indexed` | Tổng số files (full reindex) |
| `nodes_total` | Tổng số nodes (full reindex) |
| `edges_total` | Tổng số edges (full reindex) |
| `communities` | Số communities detected |
| `status` | Trạng thái: success, skipped |

## Dry Run Mode

```yaml
jobs:
  reindex:
    runs-on: ubuntu-latest
    steps:
      - uses: buiphucminhtam/forgewright/.github/actions/auto-reindex@main
        with:
          mode: 'full'
          dry_run: 'true'
```

Dry run sẽ:
- Không thay đổi index
- Không commit gì
- Chỉ hiển thị summary

## Artifact

Index được upload như artifact:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: forgenexus-index-${{ github.sha }}
    path: .forgenexus/
    retention-days: 30
```

## Multi-repo Setup

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'services/**'

jobs:
  reindex:
    strategy:
      matrix:
        repo:
          - services/api
          - services/auth
          - services/billing
    steps:
      - uses: actions/checkout@v4
        with:
          path: ${{ matrix.repo }}

      - uses: buiphucminhtam/forgewright/.github/actions/auto-reindex@main
        with:
          repo: ${{ matrix.repo }}
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Git Push / PR Merge                       │
└──────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Detect Changed Files                          │
│              git diff --name-only                         │
└──────────────────────────┬───────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
┌──────────────────┐        ┌──────────────────┐
│ Incremental      │        │ Full Reindex     │
│ (on push)        │        │ (on merge)      │
└────────┬─────────┘        └────────┬─────────┘
         │                             │
         ▼                             ▼
┌──────────────────────────────────────────────────────────┐
│               ForgeNexus Analyze                          │
│               npx forgenexus analyze --incremental       │
└──────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│               Upload Index Artifact                       │
│               .forgenexus/                               │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│               Commit to Repo (if LIVE mode)              │
└──────────────────────────────────────────────────────────┘
```
