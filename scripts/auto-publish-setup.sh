#!/bin/bash

# ==============================================================================
# Forgewright — Auto-Publish Setup Script
# ==============================================================================
# Scaffolds local publishing scripts and templates into the target project directory.
# All configurations and credentials remain inside the target project.
# ==============================================================================

set -e

# Detect script root and forgewright root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Define target app path from arguments or default
TARGET_PATH="${1}"

if [ -z "$TARGET_PATH" ]; then
  echo "❌ Error: Please specify the path to your mobile project."
  echo "Usage: bash scripts/auto-publish-setup.sh <path_to_mobile_project>"
  exit 1
fi

# Resolve absolute path of target
ABS_TARGET_PATH=$(cd "$TARGET_PATH" 2>/dev/null && pwd || echo "")

if [ -z "$ABS_TARGET_PATH" ] || [ ! -d "$ABS_TARGET_PATH" ]; then
  echo "❌ Error: Target directory '$TARGET_PATH' does not exist."
  exit 1
fi

echo "======================================================================"
echo "🚀 Initializing Auto-Publish Configurations in Target Project"
echo "📂 Target Path: $ABS_TARGET_PATH"
echo "======================================================================"

# Create target directories if they don't exist
mkdir -p "$ABS_TARGET_PATH/scripts"
mkdir -p "$ABS_TARGET_PATH/keystore"

# 1. Copy Publish Scripts
echo "📝 Copying publish scripts..."
cp "$FORGEWRIGHT_ROOT/scripts/auto-publish/publish-ios.sh" "$ABS_TARGET_PATH/scripts/publish-ios.sh"
cp "$FORGEWRIGHT_ROOT/scripts/auto-publish/publish-android.sh" "$ABS_TARGET_PATH/scripts/publish-android.sh"
chmod +x "$ABS_TARGET_PATH/scripts/publish-ios.sh"
chmod +x "$ABS_TARGET_PATH/scripts/publish-android.sh"
echo "  ✅ Copied scripts/publish-ios.sh"
echo "  ✅ Copied scripts/publish-android.sh"

# 2. Copy Config Templates
echo "📝 Scaffolding configurations..."
if [ ! -f "$ABS_TARGET_PATH/eas.json" ]; then
  cp "$FORGEWRIGHT_ROOT/scripts/auto-publish/templates/eas.json" "$ABS_TARGET_PATH/eas.json"
  echo "  ✅ Scaffolded eas.json"
else
  echo "  ⚠️ eas.json already exists in target directory. Skipping overwrite."
fi

if [ ! -f "$ABS_TARGET_PATH/store.config.json" ]; then
  cp "$FORGEWRIGHT_ROOT/scripts/auto-publish/templates/store.config.json" "$ABS_TARGET_PATH/store.config.json"
  echo "  ✅ Scaffolded store.config.json"
else
  echo "  ⚠️ store.config.json already exists in target directory. Skipping overwrite."
fi

# 3. Print post-setup guidelines
echo "======================================================================"
echo "🎉 Setup Completed Successfully!"
echo "======================================================================"
echo "💡 NEXT STEPS FOR YOUR PROJECT:"
echo ""
echo "🍏 For Apple App Store (iOS):"
echo "  1. Verify you have an Apple Developer Account ($99/year)."
echo "  2. IMPORTANT: Fastlane is required under the hood for local iOS builds & certificate setup."
echo "     * Install via Homebrew: brew install fastlane"
echo "     * Or via RubyGems: sudo gem install fastlane"
echo "  3. Place your 'GoogleService-Info.plist' (Firebase) in the mobile root: $ABS_TARGET_PATH/"
echo "  4. Run the initial build in interactive mode ONCE to set up Apple certificates:"
echo "     $ cd $TARGET_PATH && npx eas build --platform ios --profile production --local"
echo "  5. Edit 'eas.json' to change 'appleId' to your Apple Developer email."
echo ""
echo "🤖 For Google Play Store (Android):"
echo "  1. IMPORTANT: Manually create the app in Google Play Console first."
echo "     * Google Play API does not support first-time app record creation."
echo "     * You must manually upload the first AAB/APK through Google Play Console web UI."
echo "  2. Configure your Google Service Account API credentials:"
echo "     * Generate key JSON and save as 'google-service-account-key.json' in: $ABS_TARGET_PATH/"
echo "     * Ensure 'eas.json' references this file under submit profile settings."
echo "  3. Configure Android Keystore credentials in: $ABS_TARGET_PATH/credentials.json"
echo "  4. Place your 'google-services.json' (Firebase) in the mobile root: $ABS_TARGET_PATH/"
echo ""
echo "🚀 TO RUN AUTO-PUBLISH:"
echo "  iOS:     bash scripts/publish-ios.sh"
echo "  Android: bash scripts/publish-android.sh"
echo "======================================================================"
