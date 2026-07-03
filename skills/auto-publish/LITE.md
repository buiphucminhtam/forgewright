---
name: auto-publish
description: "Orchestrates automated app store publishing, binary compilation, and release deployments via EAS (Expo Application Services) and Fastlane. Use when the user requests iOS/Android App Store publishing, TestFlight distribution, Google Play track updates, or EAS/Fastlane automation setups."
version: 1.0.0
---

# Auto Publish (LITE)

## SOLVE Step 2: GROUND (Auto Publish Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Mobile project packaging and publishing configurations are present | `cat package.json \| jq '.dependencies["expo"] // .dependencies["react-native"]'` | Confirms mobile stack (Expo or React Native) and SDK versions | |
| Fastlane configs or EAS configuration settings are located | `ls -la ios/Fastfile android/Fastfile eas.json` | Identifies active Fastlane files or Expo EAS project configs | |
| Standardized operational runbooks or deployment docs exist | `find docs/05-operations/ -name "*publish*" -o -name "*release*"` | Lists active lowercase, kebab-case deployment records [1] | |
| Spending budgets and token tracker settings are configured | `cat .forgewright/budget.yaml` | Verifies cost boundaries prior to starting heavy pipeline logs [2] | |

## SOLVE Step 3: DECOMPOSE (Auto Publish Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. DECRYPT | Fetch and decrypt production certificates, keystores, and API credentials | Verify signing keys and App Store API json keys match the current build target.
2. COMPILE | Run Fastlane gym/gradle compilation or trigger EAS remote build queues | Ensure binaries (.ipa, .aab) generate cleanly without code-signing or configuration errors.
3. DISTRIBUTE | Upload compiled binaries to Google Play Internal/Production or Apple TestFlight | Verify terminal output and response codes indicate successful store receipt.
4. SYNC | Write compliant kebab-case deployment logs and run sync hooks | Trigger standard post-skill sync scripts to symlink results to the Obsidian Vault [3].

## Common Mistakes Checklist
- **Mismatched Code-Signing Certs**: Attempting store distribution using incorrect provisioning profiles or expired local certificates, triggering compilation crashes.
- **Hardcoding Store Credentials**: Placing raw API keys, Keystore passwords, or App Store Connect credentials directly inside `Fastfile` or `eas.json` instead of utilizing isolated environment variables.
- **Unincremented Build Versions**: Failing to bump `CFBundleVersion` or `versionCode` prior to triggering uploads, causing App Store or Play Store rejection on identical package numbers.
- **Unverified local pre-flight checks**: Triggering remote EAS Build or Fastlane lanes containing syntax or import errors, resulting in high remote queue delays and token waste.
- **Non-compliant file layouts**: Storing release logs or deploy receipts under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `app-store-release-log.md`) [1].

## Worked Example

### Step 1: Ground the mobile publishing CLI tools and active budget
```bash
eas --version
fastlane --version
cat .forgewright/budget.yaml
```
Output:
```
eas-cli/5.9.1 darwin-arm64 node-v18.18.0
fastlane 2.219.0
budget: 25.00
currency: USD
```

### Step 2: Execute Expo EAS pre-flight validation check
```bash
eas build:configure
```
Output:
```
[INFO] Reading project configuration...
[SUCCESS] Loaded eas.json for project 'forgewright-mobile-app'.
[INFO] Credentials checklist:
  - iOS Provisioning Profile: Verified (AdHoc & AppStore)
  - Android Keystore: Verified (Production)
```

### Step 3: Run EAS production build and store submission pipeline
```bash
eas build --platform all --profile production --auto-submit --non-interactive
```
Output:
```
[INFO] Queuing remote builds for iOS and Android...
[BUILD] iOS Build ID: 89c72e2d-34ef-4b5c-a5b5-89f7a93c72e2
[BUILD] Android Build ID: f5b589f7-a93c-72e2-89c7-2e2d34ef4b5c
[SUCCESS] iOS Build finished. Submitting to Apple App Store Connect...
[SUCCESS] Android Build finished. Submitting to Google Play Console...
[SUCCESS] Store submissions acknowledged. Builds are currently processing.
```

### Step 4: Write compliant deployment logs and trigger Shared Obsidian Vault sync
```bash
cat << 'EOF' > docs/05-operations/mobile-release-log.md
# Mobile Release Log

## Release Profile
- App Name: forgewright-mobile-app
- Platform: iOS (App Store) & Android (Google Play)
- EAS iOS Job: 89c72e2d-34ef-4b5c-a5b5-89f7a93c72e2
- EAS Android Job: f5b589f7-a93c-72e2-89c7-2e2d34ef4b5c

## Outcome
- Submitted to App Store Connect TestFlight and Google Play Console Internal Track.
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for mobile-release-log.md.
[SUCCESS] Symlinked docs/05-operations/mobile-release-log.md to /workspace/shared-obsidian-vault/forgewright/05-operations/mobile-release-log.md.
```
