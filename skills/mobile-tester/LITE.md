---
name: mobile-tester
description: "Orchestrates end-to-end (E2E) testing for mobile platforms, verifies simulator and emulator configurations, and automates mobile UI assertions. Use when the user requests React Native testing, Maestro workflows, Appium test suites, or Midscene.js AI-vision assertions."
version: 1.0.0
---

# Mobile Tester (LITE)

## SOLVE Step 2: GROUND (Mobile Tester Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Native mobile or React Native framework dependencies are installed | `cat package.json \| jq '.dependencies["react-native"]'` | ... | Y/N |
| Local emulator setup scripts and tool configurations exist in the project | `ls -la scripts/setup-local-emulators.sh` | ... | Y/N |
| Maestro, Midscene.js, or Appium configuration configurations are active | `find tests/ -name "*.yaml" -o -name "*.spec.ts"` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Mobile Tester Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. DETECT | Check responsive emulator state and target availability | Run ADB/iOS simulator queries to verify an active local device is ready for step execution.
2. RUN | Execute E2E mobile tests with Maestro or Midscene.js engines | Parse exit codes and test outcomes to pinpoint rendering failures or element misalignments [1, 2].
3. CAPTURE | Retrieve test trace reports, failure screenshots, and logs on failure | Verify that failures do not dump massive binary payloads into the model context window [5, 6].
4. SYNC | Offload heavy mobile run reports to local trace storage | Reference the resulting trace files via compact trace handles in the active session graph [5, 6].

## Common Mistakes Checklist
- **Unstarted target device or emulator**: Launching Maestro or Appium execution before verifying an unlocked simulator exists, leading to persistent CLI connection timeouts.
- **Missing accessibility selectors**: Writing test scripts using absolute coordinate tapping instead of standard `accessibilityLabel` hooks or semantic AI-vision selectors, causing fragile test flows [1, 2].
- **CI pipeline execution failures**: Attempting headless run checks in CI/CD environments without configuring appropriate virtual framebuffers or Android/iOS setup scripts.
- **Raw binary log dumps**: Appending raw, heavy base64 terminal captures or full screenshot binaries to the chat session, causing immediate context window bloat [5, 6].
- **Token budget exhaustion**: Executing heavy visual regressions with AI-vision drivers (Midscene.js) without validating token trackers or budget limits [3, 4].

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Initialize local Android emulators
```bash
./scripts/setup-local-emulators.sh
```

### Step 2: Verify active emulator connection is responsive
```bash
adb devices
```

### Step 3: Run Maestro local E2E login flow validation
```bash
maestro test .maestro/login-flow.yaml
```
