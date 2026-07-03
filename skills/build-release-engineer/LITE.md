---
name: build-release-engineer
description: "Orchestrates CI/CD pipelines, automated compilation, build artifact packaging, dependency vulnerability audits, and staged-rollout deployment workflows. Use when the user requests GitHub Actions configurations, build and compilation setups, Dockerfile optimization, semantic versioning rules, or dependency scans."
version: 1.0.0
---

# Build Release Engineer (LITE)

## SOLVE Step 2: GROUND (Build Release Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack and onboarding status profile are established | `cat .forgewright/project-profile.json` | Displays active technology dependencies and project health baseline [1] | |
| CI/CD workflow directory and configuration files exist | `ls -la .github/workflows/` | Confirms active workflow rules (e.g., test, deploy, rollout) [2, 3] | |
| Local build scripts or compilation commands are defined | `cat package.json \| jq '.scripts.build // .scripts.compile'` | Verifies target compilation commands and exit criteria [2, 4] | |
| Active session spend tracker parameters and token limits are configured | `cat .forgewright/budget.yaml` | Verifies expenditure safety rails are active for CI/CD operations [5, 6] | |

## SOLVE Step 3: DECOMPOSE (Build Release Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Review project dependencies and scan for known security vulnerabilities (CVEs) | Ensure security scanners (e.g., `npm audit`, `trivy`) report zero critical or high issues before bundling.
2. COMPILE | Run localized compilation, transpilations, and bundling processes | Verify build completes successfully with zero errors, and output files generate under the designated release folder.
3. PACKAGE | Build production containers or zip artifacts utilizing multi-stage configurations | Verify Docker images or compiled packages are minimized and conform to caching guidelines.
4. DEPLOY | Trigger staging or production rollouts and publish release reports | Confirm pipeline deployment steps complete successfully and execute the standard post-skill sync hook [7].

## Common Mistakes Checklist
- **Unpinned Dependency Lockups**: Leaving dependency versions unpinned or loosely declared inside manifest files, leading to unexpected breaking updates on fresh CI builds.
- **Leaking Secrets in Artifacts**: Hardcoding API keys, passwords, or deployment tokens inside Dockerfiles, environment variables, or compiled public bundles instead of utilizing secure CI secrets [8].
- **Bloated Container Images**: Failing to optimize multi-stage Docker builds or bundler settings, leading to massive build image sizes and slow pipeline run rates.
- **Untracked Build Failure States**: Failing to route critical compilation crashes or failed unit tests to exit codes, allowing broken builds to progress to deployment stages.
- **Non-Compliant Release Docs**: Storing release logs, migration guides, or deployment notes under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case [9].

## Worked Example

### Step 1: Ground the target build configurations and active pipeline settings
```bash
cat .forgewright/project-profile.json
ls -la .github/workflows/
```
Output:
```json
{
  "project_name": "forgewright-webgl-service",
  "tech_stack": ["TypeScript", "Node.js", "Docker"],
  "health_status": "PASS"
}
```
```
total 8
-rw-r--r-- 1 sandbox sandbox 1024 Jul  3 08:35 test.yml
-rw-r--r-- 1 sandbox sandbox 1250 Jul  3 08:35 build-staged.yml
```

### Step 2: Implement a highly-secure, multi-stage `Dockerfile` to optimize image sizes
Create `Dockerfile`:
```dockerfile
# Stage 1: Build & Compile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src
RUN npm run build

# Stage 2: Runtime Environment (Production-grade, zero-leak design)
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Step 3: Execute local build validation and verify output size
```bash
npm run build
docker build -t forgewright-service:latest .
docker images forgewright-service:latest
```
Output:
```
> tsc

[SUCCESS] TypeScript build compiled successfully under dist/

[INFO] Building Docker image...
[SUCCESS] Multi-stage container constructed.
REPOSITORY             TAG       IMAGE ID       CREATED          SIZE
forgewright-service    latest    b3a51f89c72e   10 seconds ago   85.4MB
```

### Step 4: Write deployment documentation and trigger the Shared Obsidian Vault sync
```bash
cat << 'EOF' > docs/05-operations/production-deploy-log.md
# Production Deployment Log

## Release Profile
- Tag: v1.4.0
- Engine: Node.js (Dockerized)
- Port: 3000
- Container Size: 85.4MB

## Verification Checkpoints
- [x] Compilation: PASS (TypeScript dist generated)
- [x] Security: PASS (npm audit reported 0 issues)
- [x] Packaging: PASS (Multi-stage container minimized)
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for production-deploy-log.md.
[SUCCESS] Symlinked docs/05-operations/production-deploy-log.md to /workspace/shared-obsidian-vault/forgewright/05-operations/production-deploy-log.md [7].
```
