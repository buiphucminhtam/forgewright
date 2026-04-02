---
description: Check for and install Forgewright updates
---

# Update Forgewright

## Steps

// turbo-all

1. Check the current local version:
```bash
cat .antigravity/plugins/production-grade/VERSION
```

2. Fetch the latest remote version:
```bash
git -C .antigravity/plugins/production-grade fetch origin main
```

3. Check if there are new commits:
```bash
git -C .antigravity/plugins/production-grade log HEAD..origin/main --oneline
```

4. If new commits exist, update the submodule:
```bash
git submodule update --remote .antigravity/plugins/production-grade
```

5. Check the new version:
```bash
cat .antigravity/plugins/production-grade/VERSION
```

6. Stage and commit the update:
```bash
git add .antigravity/plugins/production-grade
git commit -m "chore: update Forgewright to $(cat .antigravity/plugins/production-grade/VERSION)"
```

## Notes
- If step 3 shows no output, you're already on the latest version.
- If step 3 shows commits, steps 4-6 will apply the update.
- Run this workflow periodically to stay up to date with new skills and improvements.
