---
name: devops
description: "Orchestrates CI/CD pipeline automation, automated testing configurations, container deployment definitions, package publishing, and infrastructure monitoring. Use when the user requests GitHub Actions setup, Docker/Docker-Compose configurations, deployment scripts, automated testing pipeline updates (CI/CD), or Release workflows [1-3]."
version: 1.0.0
---

# Devops (LITE)

## SOLVE Step 2: GROUND (Devops Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack, operational profile, and status are active | `cat .forgewright/project-profile.json` | Identifies primary environment frameworks, language stack, and health baseline [4] | |
| Existing CI/CD workflows, Docker configs, or deployment templates are indexed | `find .github/workflows/ -name "*.yml" -o -name "*.yaml" -o -name "Dockerfile*" -o -name "docker-compose*.yml"` | Locates active pipeline setups, container targets, and deployment rules [3, 5] | |
| Standardized product templates and release guidelines exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures feature specifications and BDD-first layouts are loaded [6, 7] | |
| Active API expenditure limit rules and token trackers are configured | `cat .forgewright/budget.yaml` | Verifies current session spend parameters and warning thresholds [6, 8] | |

## SOLVE Step 3: DECOMPOSE (Devops Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Review pipeline workflows, container parameters, and environment definitions | Verify that credentials are not exposed in workflow YAMLs and target environments use secrets [9].
2. CONSTRUCT | Implement automated pipeline steps, Dockerfiles, or runner configurations | Ensure code compiles, tests run cleanly in isolation, and mutation or coverage gates are met [10, 11].
3. VERIFY | Validate pipeline execution flows using dry-run tools or syntax validators | Confirm that YAML file configurations pass linting checks and use stable image tag versions.
4. SYNC | Compile deployment runbooks as lowercase kebab-case and run post-skill sync hooks | Verify file names conform under `docs/05-operations/` and symlink them to the Shared Obsidian Vault [7, 12].

## Common Mistakes Checklist
- **Exposing Secrets in Plaintext**: Hardcoding database passwords, deployment API tokens, or encryption keys directly inside GitHub workflow files, Dockerfiles, or environment files instead of using repository Secrets [9].
- **Using Unpinned Dynamic Image Tags**: Pulling container bases using generic `latest` tags (e.g., `FROM node:latest`), causing unpredictable pipeline breakages when base images receive upstream updates.
- **Untracked CI Token Budgets**: Running expensive automated E2E tests, extensive parallel runners, or multiple matrix builds repeatedly without tracking operational expenditures [6, 8].
- **Non-Compliant Operations File Naming**: Saving deployment runbooks, server topology diagrams, or post-mortems under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/05-operations/DockerSetup.md` instead of `docs/05-operations/docker-setup.md`) [7].
- **Missing Container Health Checks**: Running backend Docker services in production or CI without defining health check parameters, causing containers to route traffic while failing to start up.

## Worked Example

### Step 1: Ground target project environment and verify active profiles
```bash
cat .forgewright/project-profile.json
find .github/workflows/ -maxdepth 1 -name "*.yml"
```
Output:
```json
{
  "project_name": "forgewright-ci-pipeline",
  "tech_stack": ["TypeScript", "Node.js", "Docker"],
  "health_status": "PASS"
}
```
```
.github/workflows/test-pipeline.yml
```

### Step 2: Implement a safe, production-grade GitHub Actions CI workflow in `.github/workflows/ci-pipeline.yml`
```yaml
name: Continuous Integration

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run code linter
      run: npm run lint

    - name: Execute unit tests with coverage reporting
      run: npm run test:coverage

    # Grounded: Check and reject any non-compliant lowercase kebab-case file names
    - name: Enforce documentation architectural guidelines
      run: |
        find docs/ -name "*.md" | grep -E '[A-Z\s]' && echo "ERROR: Found non-compliant filenames! Use lowercase kebab-case." && exit 1 || echo "Filenames verified successfully."
```

### Step 3: Verify the workflow configurations and local deployment templates
```bash
# Verify the syntax of the generated YAML configuration file
yamllint .github/workflows/ci-pipeline.yml
```
Output:
```
[INFO] YAML configuration format verified successfully.
[SUCCESS] 0 warnings, 0 errors detected.
```

### Step 4: Write operational deployment runbooks and run the sync-obsidian hook
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/05-operations/ci-pipeline-runbook.md
# Operations: Continuous Integration Deployment

## 1. Executive Summary
Provide an automated, isolated continuous integration workflow enforcing strict styling and testing gates.

## 2. Technical Profile
- Runner Environment: Ubuntu Latest
- Node Version: Node.js 20
- Gate Verification: Runs linters, Vitest unit coverage checks, and file name convention validation
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for ci-pipeline-runbook.md.
[SUCCESS] Symlinked docs/05-operations/ci-pipeline-runbook.md to /workspace/shared-obsidian-vault/forgewright/05-operations/ci-pipeline-runbook.md.
```
