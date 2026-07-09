/**
 * Instinct System Demo
 * Run: npx tsx demo.ts
 */

import { getInstinctStore } from './instinct-store.js';
import { scorePattern } from './scorer.js';
import { promotePatterns } from './promoter.js';

async function main() {
  console.log('═══ Instinct System Demo ═══\n');

  // Get store
  const store = getInstinctStore({
    storePath: '/tmp/demo-instincts-store.json'
  });
  store.clear();

  // Simulate observing a read-grep-str_replace pattern
  console.log('1. Recording patterns...');
  for (let i = 0; i < 5; i++) {
    const pattern = store.recordPattern(
      ['read', 'grep', 'str_replace'],
      { language: 'typescript', framework: 'react' },
      'forgewright',
      0.5
    );
    console.log('   Pattern:', pattern.toolSequence.join(' → '), '| Occurrences:', pattern.occurrences);
  }

  // Add cross-project pattern
  store.recordPattern(
    ['shell', 'bash', 'shell'],
    { language: 'bash', framework: null },
    'another-project',
    0.6
  );

  // Check store
  console.log('\n2. Store stats:', store.getStats());

  // Score a pattern
  console.log('\n3. Scoring pattern...');
  const found = store.findPattern(['read', 'grep', 'str_replace']);
  if (found) {
    const scoring = scorePattern({
      occurrences: found.occurrences,
      firstSeen: found.firstSeen,
      lastSeen: found.lastSeen,
      projectContext: found.projectContext,
      crossProject: found.crossProject,
      projectIds: found.projectIds,
    });
    console.log('   Confidence:', scoring.confidence);
    console.log('   Breakdown:', JSON.stringify(scoring.breakdown));
    console.log('   Recommendation:', scoring.recommendation);
  }

  // Promote patterns
  console.log('\n4. Promoting patterns...');
  const promotion = promotePatterns(store, 'demo-session');
  console.log('   Promoted:', promotion.promoted);
  console.log('   Skipped:', promotion.skipped);
  if (promotion.suggestions.length > 0) {
    console.log('\n5. Top suggestion:');
    console.log('   ', promotion.suggestions[0].message);
  }

  console.log('\n✓ Demo complete!');
}

main().catch(console.error);
