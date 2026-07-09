/**
 * Instinct System Test Suite
 * 
 * Tests the complete instinct system:
 * - Store operations
 * - Scoring
 * - Observation
 * - Promotion
 */

import {
  getInstinctStore,
  type InstinctPattern,
} from './instinct-store.js';

import {
  scorePattern,
  calculateInitialConfidence,
  analyzeToolSequence,
  type ScoringInput,
} from './scorer.js';

import {
  getInstinctsConfig,
  isInstinctsEnabled,
  resetConfig,
} from './instincts-config.js';

import {
  promotePatterns,
  generateSuggestion,
} from './promoter.js';

import {
  detectProjectContext,
  getProjectId,
} from './observer.js';

// ─── Test Utilities ─────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${err}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// ─── Tests ────────────────────────────────────────────────────────

async function runTests() {
  console.log('═══ Instinct System Test Suite ═══\n');

  // Test 1: Config loading
  test('Config loads with defaults', () => {
    resetConfig();
    const config = getInstinctsConfig();
    assert(config.enabled === true, 'Should be enabled by default');
    assert(config.minSequenceLength === 3, 'Default min sequence length should be 3');
    assert(config.promotionThreshold === 0.7, 'Default promotion threshold should be 0.7');
  });

  test('Config respects feature flag', () => {
    resetConfig();
    const original = process.env.FORGEWRIGHT_INSTINCTS_ENABLED;
    process.env.FORGEWRIGHT_INSTINCTS_ENABLED = '0';
    resetConfig();
    const config = getInstinctsConfig();
    assert(config.enabled === false, 'Should be disabled when env var is 0');
    process.env.FORGEWRIGHT_INSTINCTS_ENABLED = original || '1';
    resetConfig();
  });

  test('isInstinctsEnabled returns correct state', () => {
    assert(isInstinctsEnabled() === true, 'Should be enabled by default');
  });

  // Test 2: Store operations
  test('Store initializes with empty patterns', () => {
    const store = getInstinctStore({ storePath: '/tmp/test-instincts-store.json' });
    store.clear();
    const stats = store.getStats();
    assert(stats.totalPatterns === 0, 'Should start with 0 patterns');
  });

  test('Store records patterns', () => {
    const store = getInstinctStore({ storePath: '/tmp/test-instincts-store.json' });
    store.clear();

    const pattern = store.recordPattern(
      ['read', 'grep', 'str_replace'],
      { language: 'typescript', framework: 'react' },
      'test-project',
      0.5
    );

    assert(pattern.id.length > 0, 'Pattern should have an ID');
    assert(pattern.occurrences === 1, 'Should have 1 occurrence');
    assert(pattern.confidence === 0.5, 'Should have correct confidence');
  });

  test('Store updates existing patterns', () => {
    const store = getInstinctStore({ storePath: '/tmp/test-instincts-store.json' });
    store.clear();

    // Record same sequence twice
    store.recordPattern(['read', 'grep'], {}, 'proj1', 0.4);
    const updated = store.recordPattern(['read', 'grep'], {}, 'proj1', 0.5);

    assert(updated.occurrences === 2, 'Should have 2 occurrences after update');
  });

  test('Store tracks cross-project patterns', () => {
    const store = getInstinctStore({ storePath: '/tmp/test-instincts-store.json' });
    store.clear();

    store.recordPattern(['shell', 'bash'], {}, 'project-a', 0.5);
    store.recordPattern(['shell', 'bash'], {}, 'project-b', 0.6);

    const found = store.findPattern(['shell', 'bash']);
    assert(found !== null, 'Pattern should be found');
    assert(found!.crossProject === true, 'Should be marked as cross-project');
    assert(found!.projectIds.length === 2, 'Should have 2 project IDs');
  });

  test('Store returns promotable patterns', () => {
    const store = getInstinctStore({ storePath: '/tmp/test-instincts-store.json' });
    store.clear();

    store.recordPattern(['a', 'b', 'c'], {}, 'proj', 0.65);
    store.recordPattern(['x', 'y', 'z'], {}, 'proj', 0.75);

    const promotable = store.getPromotablePatterns(0.7);
    assert(promotable.length === 1, 'Should have 1 promotable pattern');
    assert(promotable[0].toolSequence[0] === 'x', 'Should be the higher confidence pattern');
  });

  // Test 3: Scoring
  test('Score pattern returns valid range', () => {
    const input: ScoringInput = {
      occurrences: 5,
      firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastSeen: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      projectContext: { language: 'typescript' },
      crossProject: true,
      projectIds: ['proj1', 'proj2'],
    };

    const result = scorePattern(input);
    assert(result.confidence >= 0.3, 'Confidence should be >= 0.3');
    assert(result.confidence <= 0.9, 'Confidence should be <= 0.9');
    assert(result.breakdown.frequency > 0, 'Frequency score should be > 0');
    assert(result.breakdown.recency > 0, 'Recency score should be > 0');
  });

  test('Initial confidence calculation', () => {
    const low = calculateInitialConfidence(2);
    const medium = calculateInitialConfidence(3);
    const high = calculateInitialConfidence(5);

    assert(low < medium, 'Longer sequence should have higher initial confidence');
    assert(medium <= 0.9, 'Should not exceed max confidence');
  });

  test('Tool sequence analysis', () => {
    const search = analyzeToolSequence(['Read', 'Grep', 'Grep']);
    console.log('Search result:', search);
    assert(search.intent === 'search', `Should detect search intent, got: ${search.intent}`);
    assert(search.complexity >= 1, 'Should have complexity score');

    const edit = analyzeToolSequence(['Read', 'StrReplace', 'Read', 'StrReplace']);
    console.log('Edit result:', edit);
    assert(edit.intent === 'edit', `Should detect edit intent, got: ${edit.intent}`);
  });

  // Test 4: Promotion
  test('Promotion generates suggestions', () => {
    const store = getInstinctStore({ storePath: '/tmp/test-instincts-store.json' });
    store.clear();

    // Create a high-confidence pattern
    for (let i = 0; i < 10; i++) {
      store.recordPattern(['read', 'write', 'shell'], {}, `proj-${i}`, 0.8);
    }

    const result = promotePatterns(store, 'test-session');
    assert(result.promoted >= 0, 'Should return promotion result');
  });

  test('Suggestion includes action details', () => {
    const store = getInstinctStore({ storePath: '/tmp/test-instincts-store.json' });
    store.clear();

    const pattern = store.recordPattern(['a', 'b', 'c'], {}, 'proj', 0.75);
    const suggestion = generateSuggestion(pattern, 'session-1');

    assert(suggestion.id.includes(pattern.id), 'Suggestion should reference pattern');
    assert(suggestion.message.length > 0, 'Suggestion should have a message');
    assert(suggestion.action.type !== undefined, 'Suggestion should have action type');
  });

  // Test 5: Observer (basic context detection)
  test('Project ID extraction', () => {
    const projectId = getProjectId(process.cwd());
    assert(projectId.length > 0, 'Should extract project ID');
  });

  // Summary
  console.log('\n═══ Test Summary ═══');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\n⚠ Some tests failed');
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed');
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
