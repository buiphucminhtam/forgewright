import { describe, it, expect, beforeEach } from 'vitest';
import { ForgeDB } from '../src/data/db.js';
import { analyzeImpact } from '../src/data/graph.js';
import { detectChanges } from '../src/analysis/detect-changes.js';
import { FileScanner } from '../src/analysis/scanner.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ForgeNexus Core', () => {
  let dbPath: string;
  let db: ForgeDB;

  beforeEach(() => {
    dbPath = join(tmpdir(), `forgenexus-test-${Date.now()}.db`);
    db = new ForgeDB(dbPath);
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(dbPath); } catch { /* ignore */ }
  });

  describe('ForgeDB', () => {
    it('inserts and retrieves a node', () => {
      db.insertNode({
        uid: '/src/app.ts:Function:getUser:1',
        type: 'Function',
        name: 'getUser',
        filePath: '/src/app.ts',
        line: 1,
        endLine: 10,
      });
      const node = db.getNode('/src/app.ts:Function:getUser:1');
      expect(node).not.toBeNull();
      expect(node!.name).toBe('getUser');
      expect(node!.type).toBe('Function');
    });

    it('inserts and queries edges', () => {
      db.insertNode({ uid: 'a', type: 'Function', name: 'a', filePath: '/f.ts', line: 1, endLine: 1 });
      db.insertNode({ uid: 'b', type: 'Function', name: 'b', filePath: '/f.ts', line: 5, endLine: 5 });
      db.insertEdge({ id: 'a->b:CALLS', fromUid: 'a', toUid: 'b', type: 'CALLS', confidence: 1.0 });
      const callees = db.getCallees('a');
      expect(callees).toHaveLength(1);
      expect(callees[0].name).toBe('b');
    });

    it('gets correct stats', () => {
      db.insertNode({ uid: 'n1', type: 'Function', name: 'f1', filePath: '/a.ts', line: 1, endLine: 1 });
      db.insertNode({ uid: 'n2', type: 'Class', name: 'C1', filePath: '/b.ts', line: 1, endLine: 1 });
      const stats = db.getStats();
      expect(stats.nodes).toBeGreaterThanOrEqual(2);
    });

    it('gets callers and callees', () => {
      db.insertNode({ uid: 'caller', type: 'Function', name: 'caller', filePath: '/f.ts', line: 1, endLine: 1 });
      db.insertNode({ uid: 'callee', type: 'Function', name: 'callee', filePath: '/f.ts', line: 5, endLine: 5 });
      db.insertEdge({ id: 'caller->callee:CALLS', fromUid: 'caller', toUid: 'callee', type: 'CALLS', confidence: 1.0 });
      expect(db.getCallers('callee')).toHaveLength(1);
      expect(db.getCallees('caller')).toHaveLength(1);
    });
  });

  describe('FileScanner', () => {
    it('scans TypeScript files', async () => {
      const scanner = new FileScanner('.', { languages: ['typescript'] });
      const files = await scanner.scan();
      expect(files.length).toBeGreaterThan(0);
      expect(files[0].language).toBe('typescript');
    });
  });
});
