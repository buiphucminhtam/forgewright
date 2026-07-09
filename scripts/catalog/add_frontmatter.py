import os
import re
import glob

protocol_dir = "skills/_shared/protocols"
files = glob.glob(os.path.join(protocol_dir, "*.md"))

for file in files:
    if file.endswith("README.md"):
        continue

    with open(file, "r", encoding="utf-8") as f:
        content = f.read()

    if content.startswith("---"):
        continue

    basename = os.path.basename(file)
    id_name = basename[:-3]

    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    title = (
        title_match.group(1).strip()
        if title_match
        else id_name.replace("-", " ").title()
    )

    status = "active"
    if "DEPRECATED" in content or "deprecated" in content.lower():
        status = "deprecated"

    superseded_by = "null"
    if id_name == "execution-blocker-loop":
        superseded_by = "self-improving-loop"

    frontmatter = f"""---
id: {id_name}
title: {title}
summary: Core protocol for {id_name.replace("-", " ")}.
status: {status}
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: {superseded_by}
---
"""

    with open(file, "w", encoding="utf-8") as f:
        f.write(frontmatter + content)

print("Frontmatter added to protocols.")
