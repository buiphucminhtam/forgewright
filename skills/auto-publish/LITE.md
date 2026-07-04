---
name: auto-publish
description: "Orchestrates automated app store publishing, binary compilation, and release deployments via EAS (Expo Application Services) and Fastlane. Use when the user requests iOS/Android App Store publishing, TestFlight distribution, Google Play track updates, or EAS/Fastlane automation setups."
version: 1.0.0
---

# Auto Publish (LITE)

## SOLVE Step 2: GROUND (Auto Publish Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Mobile project packaging and publishing configurations are present | `cat package.json \| jq '.dependencies["expo"] // .dependencies["react-native"]'` | ... | Y/N |
| Fastlane configs or EAS configuration settings are located | `ls -la ios/Fastfile android/Fastfile eas.json` | ... | Y/N |
| Standardized operational runbooks or deployment docs exist | `find docs/05-operations/ -name "*publish*" -o -name "*release*"` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Auto Publish Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. DECRYPT | Fetch and decrypt production certificates, keystores, and API credentials | Verify signing keys and App Store API json keys match the current build target.
2. COMPILE | Run Fastlane gym/gradle compilation or trigger EAS remote build queues | Ensure binaries (.ipa, .aab) generate cleanly without code-signing or configuration errors.
3. DISTRIBUTE | Upload compiled binaries to Google Play Internal/Production or Apple TestFlight | Verify terminal output and response codes indicate successful store receipt.
4. SYNC | Write compliant kebab-case deployment logs and run sync hooks | Trigger standard post-skill sync scripts to symlink results to the Obsidian Vault.

## Common Mistakes Checklist
- **Mismatched Code-Signing Certs**: Attempting store distribution using incorrect provisioning profiles or expired local certificates, triggering compilation crashes.
- **Hardcoding Store Credentials**: Placing raw API keys, Keystore passwords, or App Store Connect credentials directly inside `Fastfile` or `eas.json` instead of utilizing isolated environment variables.
- **Unincremented Build Versions**: Failing to bump `CFBundleVersion` or `versionCode` prior to triggering uploads, causing App Store or Play Store rejection on identical package numbers.
- **Unverified local pre-flight checks**: Triggering remote EAS Build or Fastlane lanes containing syntax or import errors, resulting in high remote queue delays and token waste.
- **Non-compliant file layouts**: Storing release logs or deploy receipts under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `app-store-release-log.md`).

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground the mobile publishing CLI tools and active budget
```bash
eas --version
fastlane --version
cat .forgewright/budget.yaml
```

### Step 2: Execute Expo EAS pre-flight validation check
```bash
eas build:configure
```

### Step 3: Run EAS production build and store submission pipeline
```bash
eas build --platform all --profile production --auto-submit --non-interactive
```

