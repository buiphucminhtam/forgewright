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
