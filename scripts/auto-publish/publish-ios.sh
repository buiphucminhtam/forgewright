#!/bin/bash

# ==============================================================================
# iOS Auto-Publish Script (Local Build & Submit)
# ==============================================================================
# This script automates building the iOS production app locally on macOS,
# uploading it to App Store Connect, and submitting it for review.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Default mobile app path relative to the project where the command is run.
DEFAULT_APP_PATH="${MOBILE_APP_PATH:-apps/mobile}"
APP_PATH="${1:-$DEFAULT_APP_PATH}"

# Resolve absolute path
if [ ! -d "$APP_PATH" ]; then
  echo "❌ Error: Mobile application directory not found at $APP_PATH"
  echo "💡 Pass the app path as the first argument or set MOBILE_APP_PATH."
  exit 1
fi

ABS_APP_PATH=$(cd "$APP_PATH" && pwd)

echo "======================================================================"
echo "🚀 Starting iOS Production Auto-Publish Pipeline"
echo "📂 App Path: $ABS_APP_PATH"
echo "======================================================================"

# Step 1: Pre-flight Checks
echo "🔍 Running pre-flight checks..."

if [ ! -f "$ABS_APP_PATH/GoogleService-Info.plist" ]; then
  echo "❌ Error: GoogleService-Info.plist is missing from $ABS_APP_PATH"
  echo "💡 Please place your Firebase GoogleService-Info.plist in the mobile root directory."
  exit 1
fi

# Check Xcode Command Line Tools
if ! xcode-select -p >/dev/null 2>&1; then
  echo "❌ Error: Xcode Command Line Tools are not installed."
  exit 1
fi

# Check CocoaPods
if ! command -v pod &> /dev/null; then
  echo "❌ Error: CocoaPods is not installed. Run 'gem install cocoapods' or 'brew install cocoapods'."
  exit 1
fi

# Check Fastlane
if ! command -v fastlane &> /dev/null; then
  echo "❌ Error: Fastlane is not installed. EAS CLI requires Fastlane under the hood for local iOS builds."
  echo "💡 Please install Fastlane using Homebrew: brew install fastlane"
  echo "   Or using RubyGems: sudo gem install fastlane"
  exit 1
fi

# Check EAS CLI
if ! command -v eas &> /dev/null; then
  echo "⚠️ EAS CLI is not installed globally. Checking if local npx can run it..."
fi

# Step 2: Auto-increment App Version (Optional)
echo "🔄 Checking EAS Login session..."
cd "$ABS_APP_PATH"
npx eas whoami

# Step 3: Run Local iOS Production Build
echo "🏗️ Step 1/2: Building iOS production package locally..."
echo "⏳ This may take 5-15 minutes depending on your Mac specs..."
npx eas build --platform ios --profile production --local

# Step 4: Submit to App Store Connect
echo "📤 Step 2/2: Uploading build to TestFlight & Submitting for Review..."
npx eas submit --platform ios

echo "======================================================================"
echo "🎉 Pipeline Completed Successfully!"
echo "🍏 Your iOS app has been uploaded to App Store Connect."
echo "💡 Submitting for review will complete automatically if metadata is set."
echo "======================================================================"
