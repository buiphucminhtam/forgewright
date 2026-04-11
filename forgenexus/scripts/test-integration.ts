#!/usr/bin/env node
/**
 * Integration tests for ForgeNexus
 * Requires kuzu native module - run with tsx
 */
import { ForgeDB } from '../src/data/db.js';
import { FileScanner } from '../src/analysis/scanner.js';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let passed = 0;
let failed = 0;

function expect(actual: unknown, expected: unknown, testName: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    console.log(`     Expected: ${expectedStr}`);
    console.log(`     Actual: ${actualStr}`);
    failed++;
  }
}

function expectTrue(actual: boolean, testName: string) {
  if (actual === true) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    console.log(`     Expected: true`);
    console.log(`     Actual: ${actual}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🔧 ForgeNexus Integration Tests\n');

  let dbPath: string;
  let db: ForgeDB;

  // Test: ForgeDB insert and retrieve
  dbPath = join(tmpdir(), `forgenexus-test-${Date.now()}.db`);
  db = new ForgeDB(dbPath);
  console.log('📦 ForgeDB Tests');

  db.insertNode({
    uid: '/src/app.ts:Function:getUser:1',
    type: 'Function',
    name: 'getUser',
    filePath: '/src/app.ts',
    line: 1,
    endLine: 10,
  });
  db.flushWrites();
  const node = db.getNode('/src/app.ts:Function:getUser:1');
  expectTrue(node !== null, 'Node inserted and retrieved');
  if (node) {
    expect(node.name, 'getUser', 'Node has correct name');
    expect(node.type, 'Function', 'Node has correct type');
  }

  // Test: Stats
  db.insertNode({ uid: 'n1', type: 'Function', name: 'f1', filePath: '/a.ts', line: 1, endLine: 1 });
  db.insertNode({ uid: 'n2', type: 'Class', name: 'C1', filePath: '/b.ts', line: 1, endLine: 1 });
  db.flushWrites();
  const stats = db.getStats();
  expectTrue(stats.nodes >= 2, 'Stats show correct node count');

  // Test: Get nodes by type
  const functions = db.getNodesByType('Function');
  expectTrue(functions.length >= 2, 'Get nodes by type works');

  // Test: Get nodes by file
  const appNodes = db.getNodesByFile('/src/app.ts');
  expectTrue(appNodes.length >= 1, 'Get nodes by file works');

  db.close();
  try { unlinkSync(dbPath); } catch { /* ignore */ }
  try { unlinkSync(dbPath + '-dir'); } catch { /* ignore */ }

  // Test: FileScanner
  console.log('\n📁 FileScanner Tests');
  const scanner = new FileScanner('.', { languages: ['typescript'] });
  const files = await scanner.scan();
  expectTrue(files.length > 0, 'Scans TypeScript files');
  if (files.length > 0) {
    expect(files[0].language, 'typescript', 'File has correct language');
  }

  // Summary
  console.log('\n─────────────────────────────────');
  console.log(`Tests: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
  console.log('─────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
