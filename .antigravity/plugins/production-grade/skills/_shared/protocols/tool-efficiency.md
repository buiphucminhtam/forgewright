# Tool Efficiency Protocol

**Every skill MUST follow these tool usage rules to minimize token consumption and maximize speed.**

## Rule 1: Parallel Tool Calls

When multiple inputs are independent, issue ALL reads/searches in a single message. Never read files one by one when they can be read simultaneously.

**WRONG:**
```
view_file("file1.md")
# wait for result
view_file("file2.md")
# wait for result
view_file("file3.md")
```

**RIGHT:**
```
# All three in one message:
view_file("file1.md")
view_file("file2.md")
view_file("file3.md")
```

## Rule 2: Use Structural Tools Before Full Reads

For code analysis, use `view_file_outline` to get a file's structure before reading the full file. Only use `view_code_item` or full `view_file` for specific functions you need to inspect.

| Need | Tool | Token Cost |
|------|------|-----------|
| File structure overview | `view_file_outline(file)` | Low (~200-500 tokens) |
| Specific function code | `view_code_item(file, symbol)` | Medium (~200-1000 tokens) |
| Full file content | `view_file(file)` | High (~500-5000 tokens) |
| Find symbols across codebase | `grep_search(query, project_root)` | Low (~300-800 tokens) |

## Rule 3: Use the Right Tool for the Job

| Task | Use This | NOT This |
|------|----------|----------|
| Find files by name/pattern | `find_by_name` | `find` via run_command |
| Search file contents | `grep_search` | `grep`/`rg` via run_command |
| Read a file | `view_file` | `cat`/`head`/`tail` via run_command |
| Modify existing file | `replace_file_content` / `multi_replace_file_content` | `sed`/`awk` via run_command |
| Create new file | `write_to_file` | `echo`/heredoc via run_command |
| Run system commands | `run_command` | — |
| Search the web | `search_web` | — |
| Read URL content | `read_url_content` | — |

## Rule 4: Batch Operations

When creating multiple files, use parallel write_to_file calls where possible. When reading a directory of related files, use find_by_name first to discover files, then parallel view_file.

## Rule 5: Config-Aware Paths

Always check `.production-grade.yaml` for path overrides before using hardcoded paths. This allows the plugin to work with existing project structures.

```
# Read config paths
config = view_file(".production-grade.yaml")
api_path = config.paths.api_contracts || "api/openapi/*.yaml"
arch_path = config.paths.architecture_docs || "docs/architecture/"
```
