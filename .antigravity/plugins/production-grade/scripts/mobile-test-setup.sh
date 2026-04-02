#!/usr/bin/env bash
# ============================================================================
# Forgewright — Mobile Test Setup Script
# Auto-detects environment and installs everything needed for AI-powered
# mobile testing on Android (ADB + Midscene) and iOS (WDA + Midscene).
#
# Usage:
#   bash scripts/mobile-test-setup.sh              # Full setup
#   bash scripts/mobile-test-setup.sh --check-only # Dry-run health check
#   bash scripts/mobile-test-setup.sh --android    # Android only
#   bash scripts/mobile-test-setup.sh --ios        # iOS only
# ============================================================================

set -euo pipefail

# ── Colors & Symbols ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
CHECK="✅"; CROSS="❌"; WARN="⚠️"; ARROW="→"; ROCKET="🚀"; PHONE="📱"

# ── Config ───────────────────────────────────────────────────────────────────
REQUIRED_NODE_VERSION=18
MIDSCENE_ANDROID_PACKAGE="@midscene/android"
MIDSCENE_IOS_PACKAGE="@midscene/ios"
ENV_FILE=".env.midscene"
TEST_DIR="tests/e2e/mobile"

# ── Parse Args ───────────────────────────────────────────────────────────────
CHECK_ONLY=false
ANDROID_ONLY=false
IOS_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=true ;;
    --android)    ANDROID_ONLY=true ;;
    --ios)        IOS_ONLY=true ;;
    --help|-h)
      echo "Usage: bash scripts/mobile-test-setup.sh [--check-only|--android|--ios]"
      exit 0 ;;
  esac
done

# If neither flag is set, do both
if ! $ANDROID_ONLY && ! $IOS_ONLY; then
  ANDROID_ONLY=true
  IOS_ONLY=true
fi

# ── Status Tracking (compatible with bash 3.x on macOS) ─────────────────────
REPORT_KEYS=""
REPORT_FILE=$(mktemp)
trap "rm -f $REPORT_FILE" EXIT

report_status() {
  local key="$1" val="$2"
  echo "${key}=${val}" >> "$REPORT_FILE"
}

get_status() {
  local key="$1"
  grep "^${key}=" "$REPORT_FILE" 2>/dev/null | tail -1 | cut -d= -f2-
}

print_report() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║  ${PHONE} Forgewright Mobile Test Setup — Status Report         ║${NC}"
  echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"

  local items="Node.js|npm|ADB|ANDROID_HOME|Android Device|Xcode CLI|WebDriverAgent|iOS Simulator|@midscene/android|@midscene/ios|API Key (.env)|Test Directory"
  IFS='|' read -ra KEYS <<< "$items"

  for key in "${KEYS[@]}"; do
    local val
    val=$(get_status "$key")
    if [[ -n "$val" ]]; then
      local icon
      case "$val" in
        OK*|Found*|Connected*|Installed*|Ready*|Created*|Configured*)
          icon="${CHECK}" ;;
        SKIP*|N/A*)
          icon="⏭ " ;;
        *)
          icon="${CROSS}" ;;
      esac
      printf "${CYAN}║${NC}  %s %-22s ${DIM}%s${NC}\n" "$icon" "$key" "$val"
    fi
  done
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ── Helper Functions ─────────────────────────────────────────────────────────
info()  { echo -e "${BLUE}${ARROW}${NC} $1"; }
ok()    { echo -e "${GREEN}${CHECK}${NC} $1"; }
warn()  { echo -e "${YELLOW}${WARN}${NC} $1"; }
fail()  { echo -e "${RED}${CROSS}${NC} $1"; }
header() {
  echo ""
  echo -e "${BOLD}${MAGENTA}━━━ $1 ━━━${NC}"
}

command_exists() { command -v "$1" &>/dev/null; }

# ── Platform Detection ───────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
IS_MACOS=false
[[ "$OS" == "Darwin" ]] && IS_MACOS=true

echo ""
echo -e "${BOLD}${ROCKET} Forgewright Mobile Test Setup${NC}"
echo -e "${DIM}Platform: $OS ($ARCH) | $(date '+%Y-%m-%d %H:%M:%S')${NC}"
if $CHECK_ONLY; then
  echo -e "${YELLOW}Mode: CHECK ONLY (no changes will be made)${NC}"
fi

# ============================================================================
# PHASE 1: Core Dependencies
# ============================================================================
header "Phase 1: Core Dependencies"

# ── Node.js ──────────────────────────────────────────────────────────────────
if command_exists node; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_VER" -ge "$REQUIRED_NODE_VERSION" ]]; then
    ok "Node.js $(node -v)"
    report_status "Node.js" "OK ($(node -v))"
  else
    fail "Node.js $(node -v) — need v${REQUIRED_NODE_VERSION}+"
    report_status "Node.js" "TOO OLD ($(node -v), need ${REQUIRED_NODE_VERSION}+)"
    if ! $CHECK_ONLY; then
      warn "Please upgrade Node.js: https://nodejs.org/en/download/"
    fi
  fi
else
  fail "Node.js not found"
  report_status "Node.js" "NOT FOUND"
  if ! $CHECK_ONLY; then
    warn "Install Node.js ${REQUIRED_NODE_VERSION}+: https://nodejs.org/en/download/"
    warn "Or: brew install node"
  fi
fi

# ── npm ──────────────────────────────────────────────────────────────────────
if command_exists npm; then
  ok "npm $(npm -v)"
  report_status "npm" "OK ($(npm -v))"
else
  fail "npm not found (should come with Node.js)"
  report_status "npm" "NOT FOUND"
fi

# ============================================================================
# PHASE 2: Android Setup
# ============================================================================
if $ANDROID_ONLY; then
  header "Phase 2: Android Setup (ADB + Midscene)"

  # ── ADB ────────────────────────────────────────────────────────────────────
  if command_exists adb; then
    ADB_VER=$(adb --version 2>&1 | head -1)
    ok "ADB: $ADB_VER"
    report_status "ADB" "OK"
  else
    fail "ADB not found"
    report_status "ADB" "NOT FOUND"
    if ! $CHECK_ONLY; then
      info "Installing Android Platform Tools..."
      if $IS_MACOS && command_exists brew; then
        brew install --cask android-platform-tools 2>/dev/null || {
          warn "Brew install failed. Install manually:"
          warn "  https://developer.android.com/studio#command-line-tools-only"
        }
        if command_exists adb; then
          ok "ADB installed successfully"
          report_status "ADB" "OK (just installed)"
        fi
      else
        warn "Install ADB manually:"
        warn "  macOS:  brew install --cask android-platform-tools"
        warn "  Linux:  sudo apt install android-tools-adb"
        warn "  Or:     https://developer.android.com/studio#command-line-tools-only"
      fi
    fi
  fi

  # ── ANDROID_HOME ───────────────────────────────────────────────────────────
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    ok "ANDROID_HOME = $ANDROID_HOME"
    report_status "ANDROID_HOME" "OK"
  else
    DETECTED_SDK=""
    if [[ -d "$HOME/Library/Android/sdk" ]]; then
      DETECTED_SDK="$HOME/Library/Android/sdk"
    elif [[ -d "$HOME/Android/Sdk" ]]; then
      DETECTED_SDK="$HOME/Android/Sdk"
    fi

    if [[ -n "$DETECTED_SDK" ]]; then
      warn "ANDROID_HOME not set, but SDK found at: $DETECTED_SDK"
      report_status "ANDROID_HOME" "DETECTED ($DETECTED_SDK)"
      if ! $CHECK_ONLY; then
        info "Add to your shell profile:"
        echo -e "  ${CYAN}export ANDROID_HOME=\"$DETECTED_SDK\"${NC}"
        echo -e "  ${CYAN}export PATH=\"\$ANDROID_HOME/platform-tools:\$PATH\"${NC}"
      fi
    else
      fail "ANDROID_HOME not set and SDK not found"
      report_status "ANDROID_HOME" "NOT SET"
      if ! $CHECK_ONLY; then
        warn "Install Android Studio or Command Line Tools, then set:"
        echo -e "  ${CYAN}export ANDROID_HOME=\"\$HOME/Library/Android/sdk\"${NC}"
      fi
    fi
  fi

  # ── Connected Android Devices ──────────────────────────────────────────────
  if command_exists adb; then
    DEVICE_COUNT=$(adb devices 2>/dev/null | grep -cE "device$" || echo "0")
    if [[ "$DEVICE_COUNT" -gt 0 ]]; then
      DEVICE_INFO=$(adb devices -l 2>/dev/null | grep "device " | head -1)
      ok "Android device connected: $DEVICE_INFO"
      report_status "Android Device" "Connected ($DEVICE_COUNT device(s))"
    else
      warn "No Android device connected"
      report_status "Android Device" "NOT CONNECTED"
      if ! $CHECK_ONLY; then
        info "Connect your device via USB and enable USB Debugging:"
        info "  Settings → About Phone → Tap 'Build number' 7 times"
        info "  Settings → Developer Options → Enable 'USB Debugging'"
        info "  Then run: adb devices"
      fi
    fi
  else
    report_status "Android Device" "N/A (no ADB)"
  fi

  # ── @midscene/android ──────────────────────────────────────────────────────
  if [[ -f "package.json" ]]; then
    if grep -q "$MIDSCENE_ANDROID_PACKAGE" package.json 2>/dev/null; then
      ok "@midscene/android already in package.json"
      report_status "@midscene/android" "Installed"
    else
      report_status "@midscene/android" "NOT INSTALLED"
      if ! $CHECK_ONLY; then
        info "Installing @midscene/android..."
        npm install "$MIDSCENE_ANDROID_PACKAGE" --save-dev 2>/dev/null && {
          ok "@midscene/android installed"
          report_status "@midscene/android" "Installed (just now)"
        } || {
          fail "Failed to install @midscene/android"
          report_status "@midscene/android" "INSTALL FAILED"
        }
      fi
    fi
  else
    if ! $CHECK_ONLY; then
      warn "No package.json found — initializing npm project..."
      npm init -y 2>/dev/null
      npm install "$MIDSCENE_ANDROID_PACKAGE" --save-dev 2>/dev/null && {
        ok "@midscene/android installed"
        report_status "@midscene/android" "Installed (new project)"
      } || {
        fail "Failed to install @midscene/android"
        report_status "@midscene/android" "INSTALL FAILED"
      }
    else
      report_status "@midscene/android" "SKIP (no package.json, check-only)"
    fi
  fi

else
  report_status "ADB" "SKIP (--ios mode)"
  report_status "ANDROID_HOME" "SKIP"
  report_status "Android Device" "SKIP"
  report_status "@midscene/android" "SKIP"
fi

# ============================================================================
# PHASE 3: iOS Setup (macOS only)
# ============================================================================
if $IOS_ONLY; then
  header "Phase 3: iOS Setup (WebDriverAgent + Midscene)"

  if ! $IS_MACOS; then
    warn "iOS testing requires macOS — skipping"
    report_status "Xcode CLI" "N/A (not macOS)"
    report_status "WebDriverAgent" "N/A (not macOS)"
    report_status "iOS Simulator" "N/A (not macOS)"
    report_status "@midscene/ios" "N/A (not macOS)"
  else
    # ── Xcode CLI Tools ────────────────────────────────────────────────────
    if xcode-select -p &>/dev/null; then
      XCODE_PATH=$(xcode-select -p)
      ok "Xcode CLI Tools: $XCODE_PATH"
      report_status "Xcode CLI" "OK"
    else
      fail "Xcode Command Line Tools not installed"
      report_status "Xcode CLI" "NOT INSTALLED"
      if ! $CHECK_ONLY; then
        info "Installing Xcode Command Line Tools..."
        xcode-select --install 2>/dev/null || {
          warn "Run manually: xcode-select --install"
        }
      fi
    fi

    # ── WebDriverAgent Check ─────────────────────────────────────────────
    if command_exists appium; then
      ok "Appium found (includes WebDriverAgent)"
      report_status "WebDriverAgent" "OK (via Appium)"
    elif [[ -d "$HOME/.appium" ]] || [[ -d "/usr/local/lib/node_modules/appium" ]]; then
      ok "Appium installation detected"
      report_status "WebDriverAgent" "OK (Appium detected)"
    else
      warn "WebDriverAgent/Appium not found"
      report_status "WebDriverAgent" "NOT FOUND"
      if ! $CHECK_ONLY; then
        info "Midscene iOS will handle WDA automatically."
        info "If issues arise, install Appium: npm install -g appium"
      fi
    fi

    # ── iOS Simulator ────────────────────────────────────────────────────
    if command_exists xcrun; then
      SIM_COUNT=$(xcrun simctl list devices available 2>/dev/null | grep -c "iPhone\|iPad" || echo "0")
      if [[ "$SIM_COUNT" -gt 0 ]]; then
        FIRST_SIM=$(xcrun simctl list devices available 2>/dev/null | grep "iPhone" | head -1 | sed 's/^[[:space:]]*//')
        ok "iOS Simulators available ($SIM_COUNT): $FIRST_SIM"
        report_status "iOS Simulator" "Ready ($SIM_COUNT available)"
      else
        warn "No iOS simulators found"
        report_status "iOS Simulator" "NONE FOUND"
        info "Open Xcode → Settings → Platforms → Download iOS Simulator"
      fi
    else
      report_status "iOS Simulator" "N/A (no xcrun)"
    fi

    # ── @midscene/ios ────────────────────────────────────────────────────
    if [[ -f "package.json" ]]; then
      if grep -q "$MIDSCENE_IOS_PACKAGE" package.json 2>/dev/null; then
        ok "@midscene/ios already in package.json"
        report_status "@midscene/ios" "Installed"
      else
        report_status "@midscene/ios" "NOT INSTALLED"
        if ! $CHECK_ONLY; then
          info "Installing @midscene/ios..."
          npm install "$MIDSCENE_IOS_PACKAGE" --save-dev 2>/dev/null && {
            ok "@midscene/ios installed"
            report_status "@midscene/ios" "Installed (just now)"
          } || {
            fail "Failed to install @midscene/ios"
            report_status "@midscene/ios" "INSTALL FAILED"
          }
        fi
      fi
    else
      report_status "@midscene/ios" "SKIP (no package.json)"
    fi
  fi
else
  report_status "Xcode CLI" "SKIP (--android mode)"
  report_status "WebDriverAgent" "SKIP"
  report_status "iOS Simulator" "SKIP"
  report_status "@midscene/ios" "SKIP"
fi

# ============================================================================
# PHASE 4: API Key & Environment
# ============================================================================
header "Phase 4: API Key & Environment"

if [[ -f "$ENV_FILE" ]]; then
  if grep -q "your-" "$ENV_FILE" 2>/dev/null || grep -q "replace-" "$ENV_FILE" 2>/dev/null; then
    warn "$ENV_FILE exists but contains placeholder values"
    report_status "API Key (.env)" "PLACEHOLDER (needs real key)"
  else
    ok "$ENV_FILE configured"
    report_status "API Key (.env)" "Configured"
  fi
elif [[ -n "${MIDSCENE_MODEL_API_KEY:-}" ]]; then
  ok "MIDSCENE_MODEL_API_KEY set in environment"
  report_status "API Key (.env)" "OK (env var)"
else
  report_status "API Key (.env)" "NOT CONFIGURED"
  if ! $CHECK_ONLY; then
    info "Creating $ENV_FILE template..."
    cat > "$ENV_FILE" << 'ENVEOF'
# ============================================================================
# Forgewright — Midscene Mobile Testing Configuration
# ============================================================================
# Get your API key from: https://aistudio.google.com/apikey
# Cost: ~$0.001 per vision call (Gemini Flash)
# ============================================================================

# Gemini Flash — Recommended (fast + cheap + accurate)
MIDSCENE_MODEL_API_KEY="your-google-api-key-here"
MIDSCENE_MODEL_NAME="gemini-2.5-flash"
MIDSCENE_MODEL_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
MIDSCENE_MODEL_FAMILY="gemini"

# Alternative: Gemini Pro (more accurate, slower, more expensive)
# MIDSCENE_MODEL_NAME="gemini-2.5-pro"
ENVEOF
    ok "Created $ENV_FILE — please fill in your API key"
    echo -e "  ${CYAN}Get your key: https://aistudio.google.com/apikey${NC}"
    report_status "API Key (.env)" "Created (needs key)"
  fi
fi

# ============================================================================
# PHASE 5: Test Scaffolding
# ============================================================================
header "Phase 5: Test Scaffolding"

if $CHECK_ONLY; then
  if [[ -d "$TEST_DIR" ]]; then
    report_status "Test Directory" "Found"
  else
    report_status "Test Directory" "NOT CREATED (check-only)"
  fi
else
  mkdir -p "$TEST_DIR/android" "$TEST_DIR/ios" "$TEST_DIR/reports"

  # ── Android Demo Test ──────────────────────────────────────────────────
  if $ANDROID_ONLY && [[ ! -f "$TEST_DIR/android/demo.test.ts" ]]; then
    cat > "$TEST_DIR/android/demo.test.ts" << 'ATEST'
/**
 * Forgewright — Android Demo Test (Midscene + ADB)
 *
 * Prerequisites:
 *   1. Android device connected via USB with USB Debugging enabled
 *   2. .env.midscene configured with API key
 *   3. Run: source .env.midscene && npx tsx tests/e2e/mobile/android/demo.test.ts
 */
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('🔍 Detecting connected Android devices...');
  const devices = await getConnectedDevices();

  if (devices.length === 0) {
    console.error('❌ No Android device found. Please:');
    console.error('   1. Connect device via USB');
    console.error('   2. Enable USB Debugging');
    console.error('   3. Run: adb devices');
    process.exit(1);
  }

  console.log(`📱 Found ${devices.length} device(s): ${devices[0].udid}`);

  const device = new AndroidDevice(devices[0].udid);
  const agent = new AndroidAgent(device, {
    aiActionContext:
      'If any popup appears (permissions, agreements, login), dismiss or close it.',
  });

  await device.connect();
  console.log('✅ Connected to device');

  // ── Demo: Open browser and search ──────────────────────────────────────
  console.log('🌐 Opening browser...');
  await agent.aiAction('open the default browser app');
  await sleep(3000);

  console.log('🔎 Navigating to Google...');
  await agent.aiAction('navigate to google.com');
  await sleep(3000);

  console.log('📝 Searching...');
  await agent.aiAction('type "Forgewright mobile testing" in the search box and press Enter');
  await sleep(5000);

  // ── Assert results ─────────────────────────────────────────────────────
  console.log('✅ Asserting search results...');
  await agent.aiAssert('Search results are displayed on the page');

  // ── Extract data ───────────────────────────────────────────────────────
  const results = await agent.aiQuery(
    '{title: string, url: string}[], find the first 3 search result titles and URLs',
  );
  console.log('📊 Search results:', JSON.stringify(results, null, 2));

  console.log('');
  console.log('🎉 Demo test completed successfully!');
  console.log('📄 Check visual report at: ./midscene_run/report/');
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
ATEST
    ok "Created Android demo test: $TEST_DIR/android/demo.test.ts"
  fi

  # ── iOS Demo Test ──────────────────────────────────────────────────────
  if $IOS_ONLY && $IS_MACOS && [[ ! -f "$TEST_DIR/ios/demo.test.ts" ]]; then
    cat > "$TEST_DIR/ios/demo.test.ts" << 'ITEST'
/**
 * Forgewright — iOS Demo Test (Midscene + WebDriverAgent)
 *
 * Prerequisites:
 *   1. macOS with Xcode installed
 *   2. iOS Simulator running OR device connected
 *   3. .env.midscene configured with API key
 *   4. Run: source .env.midscene && npx tsx tests/e2e/mobile/ios/demo.test.ts
 */
import { IOSAgent, IOSDevice } from '@midscene/ios';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('🔍 Connecting to iOS device/simulator...');

  // IOSDevice connects to WebDriverAgent
  // Default: localhost:8100 (iOS Simulator)
  const device = new IOSDevice();
  const agent = new IOSAgent(device);

  await device.connect();
  console.log('✅ Connected to iOS device');

  // ── Demo: Open Safari and search ───────────────────────────────────────
  console.log('🌐 Opening Safari...');
  await agent.aiAction('open Safari browser');
  await sleep(3000);

  console.log('🔎 Navigating...');
  await agent.aiAction('tap on the address bar and type "google.com" then press Go');
  await sleep(3000);

  console.log('📝 Searching...');
  await agent.aiAction('type "Forgewright iOS testing" in the search box and press search');
  await sleep(5000);

  // ── Assert ─────────────────────────────────────────────────────────────
  console.log('✅ Asserting...');
  await agent.aiAssert('Search results are visible on the screen');

  console.log('');
  console.log('🎉 iOS demo test completed successfully!');
  console.log('📄 Check visual report at: ./midscene_run/report/');
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
ITEST
    ok "Created iOS demo test: $TEST_DIR/ios/demo.test.ts"
  fi

  # ── tsconfig for tests ─────────────────────────────────────────────────
  if [[ ! -f "$TEST_DIR/tsconfig.json" ]]; then
    cat > "$TEST_DIR/tsconfig.json" << 'TSCONF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["./**/*.ts"]
}
TSCONF
    ok "Created $TEST_DIR/tsconfig.json"
  fi

  report_status "Test Directory" "Created"
fi

# ============================================================================
# FINAL REPORT
# ============================================================================
print_report

# ── Next Steps ───────────────────────────────────────────────────────────────
echo -e "${BOLD}${ROCKET} Next Steps:${NC}"
echo ""

API_STATUS=$(get_status "API Key (.env)")
if [[ "$API_STATUS" == *"needs"* ]] || [[ "$API_STATUS" == *"PLACEHOLDER"* ]] || [[ "$API_STATUS" == *"NOT"* ]]; then
  echo -e "  ${YELLOW}1.${NC} Get your Gemini API key: ${CYAN}https://aistudio.google.com/apikey${NC}"
  echo -e "     Then edit ${CYAN}.env.midscene${NC} and paste your key"
  echo ""
fi

if $ANDROID_ONLY; then
  DEVICE_STATUS=$(get_status "Android Device")
  if [[ "$DEVICE_STATUS" == *"NOT"* ]]; then
    echo -e "  ${YELLOW}2.${NC} Connect Android device + enable USB Debugging"
    echo -e "     Then verify: ${CYAN}adb devices${NC}"
    echo ""
  fi
  echo -e "  ${GREEN}▸${NC} Run Android demo test:"
  echo -e "     ${CYAN}source .env.midscene && npx tsx tests/e2e/mobile/android/demo.test.ts${NC}"
  echo ""
fi

if $IOS_ONLY && $IS_MACOS; then
  echo -e "  ${GREEN}▸${NC} Run iOS demo test:"
  echo -e "     ${CYAN}source .env.midscene && npx tsx tests/e2e/mobile/ios/demo.test.ts${NC}"
  echo ""
fi

echo -e "  ${GREEN}▸${NC} View visual reports after test run:"
echo -e "     ${CYAN}open ./midscene_run/report/index.html${NC}"
echo ""
echo -e "${DIM}─── Forgewright Mobile Test Setup Complete ───${NC}"
