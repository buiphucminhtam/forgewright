---
description: Set up automated mobile app publishing to Apple App Store and Google Play Store
---

# /setup-auto-publish — Auto-Publish Setup Workflow

One-command setup to enable automated building and publishing of Expo/React Native apps to the Apple App Store and Google Play Store using EAS CLI. 

All credentials, keystores, and configuration details are stored directly in your target mobile project folder—keeping Forgewright environment-independent and secure.

---

## 🍏 1. Apple App Store (iOS)

App Store Connect supports fully automated app provisioning and app record creation.

### Prerequisites:
1. **Apple Developer Account ($99/year):** Mandatory for App Store distribution.
2. **Fastlane:** EAS CLI requires Fastlane under the hood to manage certificates and perform signing on local macOS builds.
   - Install via Homebrew: `brew install fastlane`
   - Or install via RubyGems: `sudo gem install fastlane`
3. **First-time interactive build:**
   EAS CLI cannot generate signing certificates in non-interactive/automated mode if they are missing. You must run this command **once** in interactive mode:
   ```bash
   cd apps/mobile
   npx eas build --platform ios --profile production --local
   ```
   *EAS CLI will prompt for your Apple Developer ID and password/2FA, generate the certificates, and securely store them in your Expo account.*
4. **Firebase Plist:** Place your Firebase `GoogleService-Info.plist` inside your app's root folder (`apps/mobile/`).

---

## 🤖 2. Google Play Store (Android)

> [!IMPORTANT]
> **Google Play Store limitation:** The Google Play API does **not** support first-time application creation. You must create the app record and perform your **very first AAB upload manually** through the Google Play Console web interface. Subsequent updates can then be fully automated.

### Step 1: Create Google Play API Credentials
1. Go to the **Google Play Console** $\rightarrow$ **Setup** $\rightarrow$ **API Access**.
2. Click **Create new Google Cloud Project** (or link an existing one).
3. Under **Service accounts**, click **Learn how to create a service account** and follow the instructions to create a service account on the Google Cloud Console.
4. On the Google Cloud Console:
   * Create a service account (e.g. `eas-submit-bot@your-project.iam.gserviceaccount.com`).
   * Navigate to the **Keys** tab of the created account, click **Add Key** $\rightarrow$ **Create new key** $\rightarrow$ select **JSON** format.
   * Save the downloaded JSON file as `google-service-account-key.json` and place it inside your app folder (e.g., `apps/mobile/google-service-account-key.json`).
5. Return to the **Google Play Console** $\rightarrow$ click **Grant access** next to the newly created service account.
6. Grant permissions (the **Release Manager** or **Admin** role is recommended to allow automated uploads) and invite the user.

### Step 2: Configure Android Keystore
Create a `credentials.json` file inside your app folder (`apps/mobile/credentials.json`) referencing your keystore:
```json
{
  "android": {
    "keystore": {
      "keystorePath": "keystore/your-app.keystore",
      "keystorePassword": "your-password",
      "keyAlias": "your-alias",
      "keyPassword": "your-password"
    }
  }
}
```

---

## 🚀 Setup & Execution Steps

### Step 1: Scaffold Auto-Publish in Your Project
Run the setup script, passing the path to your mobile project root:
```bash
bash forgewright/scripts/auto-publish-setup.sh [path_to_mobile_project]
```

This will automatically:
- Create `scripts/` and `keystore/` directories in your project.
- Copy `publish-ios.sh` and `publish-android.sh` to your project's `scripts/` directory.
- Scaffold default template files `eas.json` and `store.config.json` inside your project root.

### Step 2: Configure `eas.json`
Update the newly scaffolded `eas.json` in your project to configure Apple/Google credentials:
```json
"submit": {
  "production": {
    "android": {
      "serviceAccountKeyFile": "./google-service-account-key.json",
      "track": "production"
    },
    "ios": {
      "appleId": "your-apple-developer-email@domain.com"
    }
  }
}
```

### Step 3: Run Auto-Publish

To trigger local builds and upload them to the stores, run:

**iOS App Store:**
```bash
chmod +x ./scripts/publish-ios.sh
./scripts/publish-ios.sh
```

**Google Play Store:**
```bash
chmod +x ./scripts/publish-android.sh
./scripts/publish-android.sh
```

---

## 🛠️ Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| iOS build fails on code signing | Certificates missing | Run `npx eas build --platform ios --profile production --local` interactively once. |
| Android submit fails | First-time app or missing API access | Upload the first `.aab` manually to Google Play Console web portal, and check Google service account permissions. |
| Files missing error | Script run from wrong path | Ensure you pass the correct app directory parameter to the setup script. |
