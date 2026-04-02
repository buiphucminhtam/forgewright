---
description: Set up plug-and-play mobile testing for Android/iOS with Midscene AI
---

# /setup-mobile-test — Mobile Test Setup Workflow

One-command setup to enable AI-powered testing on Android/iOS devices. After this workflow, you can plug in a phone and let AI write + run test cases automatically.

## Prerequisites
- A project directory with (or without) `package.json`
- For Android: USB cable + Android phone with Developer Options
- For iOS: macOS with Xcode installed + iOS Simulator or device

## Steps

### Step 1: Run the setup script
// turbo
```bash
bash forgewright/scripts/mobile-test-setup.sh
```

This will automatically:
- Check Node.js ≥ 18
- Check/install ADB (Android)
- Check Xcode CLI tools (iOS, macOS only)
- Install `@midscene/android` and `@midscene/ios`
- Create `.env.midscene` template
- Scaffold demo test files at `tests/e2e/mobile/`

### Step 2: Configure API Key

1. Get a free Gemini API key at: https://aistudio.google.com/apikey
2. Edit `.env.midscene` and replace `your-google-api-key-here` with your actual key

### Step 3: Connect your device

**Android:**
1. On your phone: Settings → About Phone → Tap "Build number" 7 times
2. Settings → Developer Options → Enable "USB Debugging"
3. Connect via USB cable
4. Accept the "Allow USB debugging?" prompt on phone
5. Verify: `adb devices` should show your device

**iOS (macOS only):**
1. Open Xcode → Start an iOS Simulator
   - Or connect a real device via USB
2. The Midscene iOS SDK handles WebDriverAgent automatically

### Step 4: Run the demo test

**Android:**
// turbo
```bash
source .env.midscene && npx tsx tests/e2e/mobile/android/demo.test.ts
```

**iOS:**
// turbo
```bash
source .env.midscene && npx tsx tests/e2e/mobile/ios/demo.test.ts
```

### Step 5: View the visual report
// turbo
```bash
open ./midscene_run/report/index.html
```

The report shows every step with screenshots: what the AI saw → what action it took → the result.

## Writing Your Own Tests

After the demo works, write custom tests for your app:

```typescript
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';

const devices = await getConnectedDevices();
const device = new AndroidDevice(devices[0].udid);
const agent = new AndroidAgent(device);
await device.connect();

// Use natural language — AI sees the screen and acts
await agent.aiAction('open MyApp');
await agent.aiAction('tap the Login button');
await agent.aiAction('type "user@example.com" in the email field');
await agent.aiAction('type "password123" in the password field');
await agent.aiAction('tap Sign In');

// Assert with natural language
await agent.aiAssert('the home screen is displayed with a welcome message');

// Extract data from the screen
const data = await agent.aiQuery(
  '{ username: string, notificationCount: number }',
  'get the username and notification badge count from the header'
);
console.log(data);
```

## Check-Only Mode

To see what's installed/missing without making changes:
```bash
bash forgewright/scripts/mobile-test-setup.sh --check-only
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `adb devices` shows empty | Re-plug USB, tap "Allow" on phone, try `adb kill-server && adb start-server` |
| "MIDSCENE_MODEL_API_KEY not set" | Run `source .env.midscene` before running tests |
| iOS: "WebDriverAgent not responding" | Open Xcode → Start a Simulator first |
| "Cannot find module @midscene/android" | Run `npm install @midscene/android --save-dev` |
| Test hangs at "Connecting..." | Check if device screen is unlocked |
