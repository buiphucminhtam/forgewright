#!/bin/bash

# ==============================================================================
# Wibuno — Android Auto-Publish Script (Local Build & Submit)
# ==============================================================================
# This script automates building the Android App Bundle (AAB) locally,
# uploading it to the Google Play Console, and submitting it to production/tracks.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Default mobile app path relative to script directory
DEFAULT_APP_PATH="../waifu-application/apps/mobile"
APP_PATH="${1:-$DEFAULT_APP_PATH}"

# Resolve absolute path
ABS_APP_PATH=$(cd "$APP_PATH" && pwd)

echo "======================================================================"
echo "🚀 Starting Android Production Auto-Publish Pipeline"
echo "📂 App Path: $ABS_APP_PATH"
echo "======================================================================"

# Step 1: Pre-flight Checks
echo "🔍 Running pre-flight checks..."

if [ ! -d "$ABS_APP_PATH" ]; then
  echo "❌ Error: Mobile application directory not found at $ABS_APP_PATH"
  exit 1
fi

if [ ! -f "$ABS_APP_PATH/google-services.json" ]; then
  echo "❌ Error: google-services.json is missing from $ABS_APP_PATH"
  echo "💡 Please place your Firebase google-services.json in the mobile root directory."
  exit 1
fi

# Check for Android Keystore Credentials
if [ ! -d "$ABS_APP_PATH/keystore" ] || [ ! -f "$ABS_APP_PATH/credentials.json" ]; then
  echo "❌ Error: Android keystore credentials.json or keystore file are missing."
  echo "💡 Please ensure you have configured credentials.json with a valid keystorePath."
  exit 1
fi

# Step 2: Check EAS Login session
echo "🔄 Checking EAS Login session..."
cd "$ABS_APP_PATH"
npx eas whoami

# Step 3: Run Local Android Production Build (AAB)
echo "🏗️ Step 1/2: Building Android App Bundle (AAB) locally..."
echo "⏳ This may take several minutes..."
npx eas build --platform android --profile production_aab --local

# Step 4: Submit to Google Play Console
echo "📤 Step 2/2: Uploading build to Google Play Console..."
echo "💡 Make sure you have configured your Google Service Account Private Key"
echo "   under 'submit.production.android.serviceAccountKeyFile' in eas.json."
npx eas submit --platform android

echo "======================================================================"
echo "🎉 Pipeline Completed Successfully!"
echo "🤖 Your Android app (AAB) has been uploaded to Google Play Store."
echo "======================================================================"
