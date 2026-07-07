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
