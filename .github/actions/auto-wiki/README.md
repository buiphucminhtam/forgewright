# ForgeNexus Auto Wiki

> Tự động generate architecture documentation từ code graph sau mỗi commit.

## Tính năng

- **Auto-generate** ARCHITECTURE.md từ code graph
- **Multi-provider LLM**: Minimax, Gemini, OpenAI, Anthropic
- **3 cách publish**: File (commit), GitHub Pages, GitHub Gist
- **Dry run mode** để test trước
- **Incremental reindex** chỉ khi có thay đổi

## Cách sử dụng

### Enable Auto Wiki

```yaml
# .github/workflows/forge-auto-wiki.yml
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

### Dry Run Mode

```yaml
# Test trước không commit
on:
  workflow_dispatch:
    inputs:
      dry_run:
        default: 'true'
```

## Trigger

| Event | Trigger |
|-------|---------|
| Push to main | Auto-generate + publish |
| PR merged | Full reindex + generate |
| Manual | `workflow_dispatch` với options |

## Outputs

| Output | Mô tả |
|--------|--------|
| `wiki_content` | Nội dung wiki |
| `wiki_path` | Đường dẫn file |
| `needs_reindex` | Có cần reindex không |

## Environment Variables

| Variable | Bắt buộc | Mô tả |
|----------|-----------|--------|
| `MINIMAX_API_KEY` | Có* | Minimax API key |
| `GEMINI_API_KEY` | Có* | Gemini API key |
| `OPENAI_API_KEY` | Có* | OpenAI API key |

*Ít nhất 1 API key cần thiết

## Publish Options

### Option 1: File (mặc định)

```yaml
publish_to: 'file'  # Commit ARCHITECTURE.md vào repo
```

### Option 2: GitHub Pages

```yaml
publish_to: 'pages'  # Deploy lên GitHub Pages
```

### Option 3: GitHub Gist

```yaml
publish_to: 'gist'  # Tạo/update secret Gist
```
