---
name: mobile-engineer
description: "Orchestrates mobile application development, React Native test execution, Maestro/Midscene.js local-only E2E automation, and iOS/Android automated store publishing pipelines. Use when the user requests React Native feature additions, mobile test suite configurations, Android Emulator setups, or EAS/Fastlane publishing configurations."
version: 1.0.0
---

# Mobile Engineer (LITE)

## SOLVE Step 2: GROUND (Mobile Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target mobile project dependencies and scripts exist | `cat package.json \|\| find . -name "App.tsx" -o -name "App.js"` | Identifies active React Native framework and component entrypoints | |
| Local emulator creation and mobile test scripts are present | `find scripts/ -name "*emulator*" -o -name "*publish*"` | Confirms presence of local simulator controllers or publishing wrappers [1] | |
| Standardized product requirements and feature spec templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures design specifications conform to the standard layout format [2] | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` | Verifies current session spend parameters and warning thresholds [3] | |

## SOLVE Step 3: DECOMPOSE (Mobile Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate React Native UI structures, styling layouts, and module packaging imports | Verify that native bundle settings, asset linkages, and platform-specific code divisions are clean.
2. CONSTRUCT | Set up local-only mobile E2E test scripts utilizing Maestro YAML actions or Midscene.js [1] | Confirm tests execute successfully against local Android Emulators or iOS Simulators [1].
3. DEPLOY | Configure automated App Store and Google Play publishing profiles via EAS or Fastlane [4] | Ensure release configurations, bundle targets, and credential secrets are securely segmented.
4. SYNC | Save specifications as lowercase kebab-case under docs/ and run post-skill sync-obsidian hooks [2] | Verify that documentation links propagate cleanly to the Shared Obsidian Vault [5, 6].

## Common Mistakes Checklist
- **Hardcoding Local API Endpoints**: Specifying hardcoded `localhost` inside API fetch definitions instead of utilizing environment-specific loopbacks (such as `10.0.2.2` for Android Emulators), preventing dynamic server access.
- **Unpinned Native Package Boundaries**: Specifying dynamic gradle or cocoapods dependencies in mobile configs, triggering native compilation crashes when libraries update.
- **Testing against SaaS Cloud Device Pools**: Routing test suites through expensive SaaS visual cloud networks instead of running localized Maestro E2E profiles against local emulators [1].
- **Non-Compliant Documentation File Names**: Storing mobile specs, fastlane configurations, or testing logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/04-testing/MobileTest.md` instead of `docs/04-testing/mobile-test.md`) [2].
- **Unverified Token Budgets on Workflows**: Running heavy multi-agent testing loops or automated app store descriptions translation prompts without validating active caps inside `.forgewright/budget.yaml` [3].

## Worked Example

### Step 1: Ground the active React Native workspace configurations
```bash
cat .forgewright/project-profile.json
find scripts/ -name "*emulator*"
```
Output:
```json
{
  "project_name": "forgewright-mobile-client",
  "tech_stack": ["React Native", "TypeScript", "Maestro"],
  "health_status": "PASS"
}
```
```
scripts/setup-local-emulators.sh
```

### Step 2: Implement a safe, local Maestro E2E test script in `.maestro/login-flow.yaml`
```yaml
appId: com.forgewright.mobileclient
---
- clearState
- launchApp
- assertVisible: "Welcome to Forgewright"
- tapOn: "alex@company.com"
- assertVisible: "Authorized Session"
```

### Step 3: Launch local emulators and execute local-only Maestro test assertions
```bash
# Set up local Android emulator safely
./scripts/setup-local-emulators.sh --create-android

# Run local Maestro test suite
maestro test .maestro/login-flow.yaml
```
Output:
```
[INFO] Loading local Android Emulator image...
[SUCCESS] Emulator created and booted.
[INFO] Executing Maestro E2E test script...
  ✓  Clear state
  ✓  Launch app
  ✓  Assert visible: "Welcome to Forgewright"
  ✓  Tap on: "alex@company.com"
  ✓  Assert visible: "Authorized Session"
[SUCCESS] Local Mobile E2E test passed successfully.
```

### Step 4: Write specifications and synchronize to the Shared Obsidian Vault
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/04-testing/mobile-test-spec.md
# Mobile Testing: Local Maestro E2E Setup

## 1. Executive Summary
Provide a local-only mobile E2E automation suite utilizing Maestro and local Android emulators.

## 2. Technical Profile
- Test Toolchain: Maestro (Local-Only)
- Device Environment: Android Emulator
- Assertions: Login flow UI interaction and state isolation verification
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for mobile-test-spec.md.
[SUCCESS] Symlinked docs/04-testing/mobile-test-spec.md to /workspace/shared-obsidian-vault/forgewright/04-testing/mobile-test-spec.md.
```
