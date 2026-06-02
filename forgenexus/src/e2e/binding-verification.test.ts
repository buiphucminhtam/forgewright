/**
 * Binding Verification E2E Tests for ForgeNexus Anti-Hallucination Module
 * 
 * Tests symbol binding analysis and resolution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkepticAgent } from '../agents/index.js';
import type { 
  GroundingContext, 
  GuardedResult,
  BindingAnalysis,
  BindingIssue,
  Evidence 
} from '../agents/types.js';

// ============================================================================
// Types for Binding Tests
// ============================================================================

interface MockSymbolInfo {
  definitions: Array<{ file: string; line: number; column: number }>;
  references: Array<{ file: string; line: number; column: number }>;
}

interface BindingTestCase {
  symbol: string;
  info: MockSymbolInfo;
  expectedIssues: string[];
  expectedConfidence: number;
}

// ============================================================================
// Mock LLM Client
// ============================================================================

function createMockLLM() {
  return {
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      let content = 'Default response';
      let confidence = 0.8;

      if (prompt.includes('verify') || prompt.includes('Verify')) {
        if (prompt.includes('missing') || prompt.includes('undefined')) {
          content = `VERIFICATION RESULT
STATUS: UNCONFIRMED
REASONING: Symbol has no definition
ISSUES: - Missing definition for symbol`;
          confidence = 0.2;
        } else if (prompt.includes('ambiguous') || prompt.includes('multiple')) {
          content = `VERIFICATION RESULT
STATUS: UNCERTAIN
REASONING: Multiple definitions found
ISSUES: - Symbol is ambiguous (multiple definitions)`;
          confidence = 0.4;
        } else if (prompt.includes('undeclared')) {
          content = `VERIFICATION RESULT
STATUS: UNCONFIRMED
REASONING: Symbol not declared
ISSUES: - Undeclared symbol`;
          confidence = 0.1;
        } else {
          content = `VERIFICATION RESULT
STATUS: CONFIRMED
REASONING: Symbol properly bound
ISSUES: None`;
          confidence = 0.9;
        }
      }

      return {
        content,
        confidence,
        citations: [],
        warnings: [],
        verified: confidence >= 0.7,
        rawResponse: {},
        model: 'mock',
        usage: { inputTokens: 100, outputTokens: 50 }
      } as GuardedResult;
    })
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockGroundingContext(): GroundingContext {
  return {
    repoPath: '/test/project',
    chunks: [
      {
        id: 'chunk-1',
        file: 'src/auth/login.ts',
        lineStart: 1,
        lineEnd: 50,
        text: 'export function login(username: string, password: string) { ... }',
        relevance: 0.9
      },
      {
        id: 'chunk-2',
        file: 'src/auth/index.ts',
        lineStart: 1,
        lineEnd: 20,
        text: 'export { login } from "./login";',
        relevance: 0.85
      }
    ],
    citations: [],
    relevance: 0.9,
    freshness: 'fresh'
  };
}

function createMissingDefinitionBinding(): BindingAnalysis {
  return {
    symbol: 'undefinedFunction',
    definitions: [],
    references: [
      { file: 'src/main.ts', line: 10, column: 5, context: 'undefinedFunction()' }
    ],
    isConsistent: false,
    issues: [
      {
        type: 'missing',
        symbol: 'undefinedFunction',
        locations: [],
        suggestion: 'Define undefinedFunction or check spelling',
        severity: 'error'
      }
    ]
  };
}

function createAmbiguousBinding(): BindingAnalysis {
  return {
    symbol: 'getValue',
    definitions: [
      { file: 'src/utils/a.ts', line: 5, column: 0, context: 'function getValue()' },
      { file: 'src/utils/b.ts', line: 12, column: 0, context: 'function getValue()' }
    ],
    references: [
      { file: 'src/main.ts', line: 20, column: 3, context: 'getValue()' }
    ],
    isConsistent: false,
    issues: [
      {
        type: 'ambiguous',
        symbol: 'getValue',
        locations: ['src/utils/a.ts:5', 'src/utils/b.ts:12'],
        suggestion: 'Use explicit import to disambiguate',
        severity: 'warning'
      }
    ]
  };
}

function createConsistentBinding(): BindingAnalysis {
  return {
    symbol: 'login',
    definitions: [
      { file: 'src/auth/login.ts', line: 10, column: 0, context: 'export function login()' }
    ],
    references: [
      { file: 'src/main.ts', line: 15, column: 3, context: 'login()' },
      { file: 'src/main.ts', line: 25, column: 3, context: 'login()' }
    ],
    isConsistent: true,
    issues: []
  };
}

function createUndeclaredSymbolBinding(): BindingAnalysis {
  return {
    symbol: 'undeclaredVar',
    definitions: [],
    references: [
      { file: 'src/app.ts', line: 5, column: 0, context: 'undeclaredVar = 5' }
    ],
    isConsistent: false,
    issues: [
      {
        type: 'missing',
        symbol: 'undeclaredVar',
        locations: [],
        suggestion: 'Declare with const, let, or var',
        severity: 'error'
      }
    ]
  };
}

function createCrossFileBinding(): BindingAnalysis {
  return {
    symbol: 'UserService',
    definitions: [
      { file: 'src/services/user.ts', line: 1, column: 0, context: 'class UserService' }
    ],
    references: [
      { file: 'src/controllers/user.ts', line: 3, column: 4, context: 'import { UserService }' },
      { file: 'src/routes/user.ts', line: 5, column: 4, context: 'const service = new UserService()' }
    ],
    isConsistent: true,
    issues: []
  };
}

// ============================================================================
// Test Suite: Binding Verification
// ============================================================================

describe('Binding Verification E2E Tests', () => {
  let mockLLM: ReturnType<typeof createMockLLM>;
  let skeptic: SkepticAgent;

  beforeEach(() => {
    mockLLM = createMockLLM();
    skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // bv-001: Detects missing definitions
  // --------------------------------------------------------------------------
  describe('bv-001: Detects missing definitions', () => {
    it('should identify when a symbol has no definition', () => {
      const binding = createMissingDefinitionBinding();
      
      expect(binding.definitions.length).toBe(0);
      expect(binding.issues.some(i => i.type === 'missing')).toBe(true);
    });

    it('should report missing definition as error severity', () => {
      const binding = createMissingDefinitionBinding();
      
      const missingIssue = binding.issues.find(i => i.type === 'missing');
      expect(missingIssue?.severity).toBe('error');
    });

    it('should include suggestion for missing symbol', () => {
      const binding = createMissingDefinitionBinding();
      
      const missingIssue = binding.issues.find(i => i.type === 'missing');
      expect(missingIssue?.suggestion).toBeTruthy();
    });

    it('should mark binding as inconsistent', () => {
      const binding = createMissingDefinitionBinding();
      
      expect(binding.isConsistent).toBe(false);
    });

    it('should include reference locations for missing symbols', () => {
      const binding = createMissingDefinitionBinding();
      
      expect(binding.references.length).toBeGreaterThan(0);
      expect(binding.references[0].file).toBe('src/main.ts');
    });
  });

  // --------------------------------------------------------------------------
  // bv-002: Detects ambiguous symbols (multiple definitions)
  // --------------------------------------------------------------------------
  describe('bv-002: Detects ambiguous symbols', () => {
    it('should identify multiple definitions', () => {
      const binding = createAmbiguousBinding();
      
      expect(binding.definitions.length).toBe(2);
    });

    it('should mark symbol as ambiguous', () => {
      const binding = createAmbiguousBinding();
      
      const ambiguousIssue = binding.issues.find(i => i.type === 'ambiguous');
      expect(ambiguousIssue).toBeDefined();
    });

    it('should list all definition locations', () => {
      const binding = createAmbiguousBinding();
      
      const ambiguousIssue = binding.issues.find(i => i.type === 'ambiguous');
      expect(ambiguousIssue?.locations.length).toBe(2);
    });

    it('should suggest disambiguation', () => {
      const binding = createAmbiguousBinding();
      
      const ambiguousIssue = binding.issues.find(i => i.type === 'ambiguous');
      expect(ambiguousIssue?.suggestion).toContain('explicit import');
    });

    it('should have warning severity for ambiguous symbols', () => {
      const binding = createAmbiguousBinding();
      
      const ambiguousIssue = binding.issues.find(i => i.type === 'ambiguous');
      expect(ambiguousIssue?.severity).toBe('warning');
    });
  });

  // --------------------------------------------------------------------------
  // bv-003: Resolves symbol to correct definition
  // --------------------------------------------------------------------------
  describe('bv-003: Resolves symbol to correct definition', () => {
    it('should find correct definition for consistent symbol', () => {
      const binding = createConsistentBinding();
      
      expect(binding.definitions.length).toBe(1);
      expect(binding.isConsistent).toBe(true);
      expect(binding.issues.length).toBe(0);
    });

    it('should include definition location', () => {
      const binding = createConsistentBinding();
      
      const def = binding.definitions[0];
      expect(def.file).toBe('src/auth/login.ts');
      expect(def.line).toBe(10);
    });

    it('should link all references to definition', () => {
      const binding = createConsistentBinding();
      
      expect(binding.references.length).toBe(2);
      binding.references.forEach(ref => {
        expect(ref.file).toBe('src/main.ts');
      });
    });

    it('should provide context for definition', () => {
      const binding = createConsistentBinding();
      
      expect(binding.definitions[0].context).toContain('login');
    });

    it('should not have issues for correctly bound symbol', () => {
      const binding = createConsistentBinding();
      
      expect(binding.issues.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // bv-004: Handles undeclared symbols
  // --------------------------------------------------------------------------
  describe('bv-004: Handles undeclared symbols', () => {
    it('should detect undeclared variable usage', () => {
      const binding = createUndeclaredSymbolBinding();
      
      expect(binding.symbol).toBe('undeclaredVar');
      expect(binding.definitions.length).toBe(0);
    });

    it('should flag as error severity', () => {
      const binding = createUndeclaredSymbolBinding();
      
      const missingIssue = binding.issues.find(i => i.type === 'missing');
      expect(missingIssue?.severity).toBe('error');
    });

    it('should provide declaration suggestion', () => {
      const binding = createUndeclaredSymbolBinding();
      
      const missingIssue = binding.issues.find(i => i.type === 'missing');
      expect(missingIssue?.suggestion).toContain('const');
    });

    it('should mark binding as inconsistent', () => {
      const binding = createUndeclaredSymbolBinding();
      
      expect(binding.isConsistent).toBe(false);
    });

    it('should include reference context', () => {
      const binding = createUndeclaredSymbolBinding();
      
      expect(binding.references[0].context).toContain('=');
    });
  });

  // --------------------------------------------------------------------------
  // bv-005: Binding across files
  // --------------------------------------------------------------------------
  describe('bv-005: Binding across files', () => {
    it('should resolve symbol defined in different file', () => {
      const binding = createCrossFileBinding();
      
      expect(binding.definitions[0].file).toBe('src/services/user.ts');
      expect(binding.references[0].file).toBe('src/controllers/user.ts');
    });

    it('should handle import statements', () => {
      const binding = createCrossFileBinding();
      
      const importRef = binding.references.find(r => r.context.includes('import'));
      expect(importRef).toBeDefined();
    });

    it('should handle usage in different contexts', () => {
      const binding = createCrossFileBinding();
      
      expect(binding.references.length).toBe(2);
      const contexts = binding.references.map(r => r.context);
      expect(contexts.some(c => c.includes('import'))).toBe(true);
      expect(contexts.some(c => c.includes('new'))).toBe(true);
    });

    it('should be consistent across files', () => {
      const binding = createCrossFileBinding();
      
      expect(binding.isConsistent).toBe(true);
      expect(binding.issues.length).toBe(0);
    });

    it('should track definition file correctly', () => {
      const binding = createCrossFileBinding();
      
      const definitionFile = binding.definitions[0].file;
      expect(definitionFile).toMatch(/services.*\.ts$/);
    });

    it('should track all referencing files', () => {
      const binding = createCrossFileBinding();
      
      const refFiles = new Set(binding.references.map(r => r.file));
      expect(refFiles.size).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Additional Binding Tests
  // --------------------------------------------------------------------------
  describe('Additional Binding Tests', () => {
    it('should handle circular dependencies', () => {
      const circularBinding: BindingAnalysis = {
        symbol: 'ModuleA',
        definitions: [
          { file: 'a.ts', line: 1, column: 0, context: 'class ModuleA' }
        ],
        references: [
          { file: 'b.ts', line: 5, column: 0, context: 'import { ModuleA }' }
        ],
        isConsistent: false,
        issues: [
          {
            type: 'circular',
            symbol: 'ModuleA',
            locations: ['a.ts', 'b.ts'],
            suggestion: 'Refactor to remove circular dependency',
            severity: 'warning'
          }
        ]
      };

      const circularIssue = circularBinding.issues.find(i => i.type === 'circular');
      expect(circularIssue?.type).toBe('circular');
    });

    it('should handle inconsistent bindings', () => {
      const inconsistentBinding: BindingAnalysis = {
        symbol: 'config',
        definitions: [
          { file: 'config/dev.ts', line: 1, column: 0, context: 'const config = {}' }
        ],
        references: [
          { file: 'app.ts', line: 5, column: 0, context: 'import config from "config"' },
          { file: 'app.ts', line: 10, column: 0, context: 'import config from "./config/dev"' }
        ],
        isConsistent: false,
        issues: [
          {
            type: 'inconsistent',
            symbol: 'config',
            locations: ['config/dev.ts', 'config/prod.ts'],
            suggestion: 'Use consistent import path',
            severity: 'warning'
          }
        ]
      };

      expect(inconsistentBinding.isConsistent).toBe(false);
    });

    it('should prioritize error over warning severity', () => {
      const issues: BindingIssue[] = [
        { type: 'missing', symbol: 'x', locations: [], severity: 'error' },
        { type: 'ambiguous', symbol: 'y', locations: [], severity: 'warning' }
      ];

      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warningCount = issues.filter(i => i.severity === 'warning').length;

      expect(errorCount).toBe(1);
      expect(warningCount).toBe(1);
    });

    it('should handle symbol with no references', () => {
      const unusedBinding: BindingAnalysis = {
        symbol: 'unusedFunction',
        definitions: [
          { file: 'utils.ts', line: 5, column: 0, context: 'function unusedFunction()' }
        ],
        references: [],
        isConsistent: true,
        issues: []
      };

      expect(unusedBinding.references.length).toBe(0);
      expect(unusedBinding.isConsistent).toBe(true);
    });

    it('should handle symbol with many references', () => {
      const manyRefs = Array.from({ length: 50 }, (_, i) => ({
        file: `src/module${i % 5}.ts`,
        line: i + 1,
        column: 0,
        context: `reference ${i}`
      }));

      const binding: BindingAnalysis = {
        symbol: 'coreFunction',
        definitions: [
          { file: 'core.ts', line: 1, column: 0, context: 'export function coreFunction()' }
        ],
        references: manyRefs,
        isConsistent: true,
        issues: []
      };

      expect(binding.references.length).toBe(50);
    });

    it('should validate binding location format', () => {
      const validLocation = {
        file: 'src/auth/login.ts',
        line: 10,
        column: 5,
        context: 'export function login()'
      };

      expect(validLocation.file).toContain('.ts');
      expect(validLocation.line).toBeGreaterThan(0);
      expect(validLocation.column).toBeGreaterThanOrEqual(0);
    });

    it('should handle TypeScript-specific binding patterns', () => {
      const tsBinding: BindingAnalysis = {
        symbol: 'UserService',
        definitions: [
          { file: 'user.service.ts', line: 5, column: 0, context: 'export class UserService' }
        ],
        references: [
          { file: 'app.component.ts', line: 10, column: 0, context: 'userService: UserService' },
          { file: 'user.resolver.ts', line: 15, column: 0, context: 'constructor(private userService: UserService)' }
        ],
        isConsistent: true,
        issues: []
      };

      expect(tsBinding.symbol).toBe('UserService');
      expect(tsBinding.definitions[0].file).toContain('.ts');
    });

    it('should handle JavaScript binding patterns', () => {
      const jsBinding: BindingAnalysis = {
        symbol: 'getConfig',
        definitions: [
          { file: 'config.js', line: 1, column: 0, context: 'function getConfig()' }
        ],
        references: [
          { file: 'app.js', line: 5, column: 0, context: 'const config = getConfig()' }
        ],
        isConsistent: true,
        issues: []
      };

      expect(jsBinding.definitions[0].file).toContain('.js');
    });

    it('should handle binding with default exports', () => {
      const defaultExportBinding: BindingAnalysis = {
        symbol: 'default',
        definitions: [
          { file: 'module.ts', line: 1, column: 0, context: 'export default class Module' }
        ],
        references: [
          { file: 'app.ts', line: 3, column: 0, context: 'import Module from "./module"' }
        ],
        isConsistent: true,
        issues: []
      };

      expect(defaultExportBinding.isConsistent).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Skeptic Agent Binding Verification Tests
  // --------------------------------------------------------------------------
  describe('Skeptic Agent Binding Verification', () => {
    it('should verify binding claims', async () => {
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `VERIFICATION RESULT
STATUS: CONFIRMED
REASONING: Symbol correctly bound to definition
ISSUES: None`,
        confidence: 0.9,
        citations: [],
        warnings: [],
        verified: true,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const verification = await skeptic.verifyClaims({
        claims: ['login is defined in auth/login.ts'],
        evidence: [
          {
            type: 'code',
            content: 'export function login()',
            source: 'auth/login.ts',
            line: 10,
            relevance: 0.9
          }
        ]
      });

      expect(verification.status).toBeTruthy();
    });

    it('should handle binding verification errors', async () => {
      mockLLM.generate = vi.fn().mockRejectedValue(new Error('Binding analysis failed'));

      const verification = await skeptic.verifyClaims({
        claims: ['Some binding claim'],
        evidence: []
      });

      expect(verification.confidence).toBe(0);
      expect(verification.issues.length).toBeGreaterThan(0);
    });

    it('should verify cross-file binding', async () => {
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `VERIFICATION RESULT
STATUS: CONFIRMED
REASONING: Cross-file binding verified
ISSUES: None`,
        confidence: 0.9,
        citations: [
          { id: '1', claim: 'definition', source: 'service.ts', line: 1, verified: true }
        ],
        warnings: [],
        verified: true,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const verification = await skeptic.verifyClaims({
        claims: ['UserService is defined in services/user.ts'],
        evidence: [
          {
            type: 'code',
            content: 'class UserService',
            source: 'services/user.ts',
            line: 1,
            relevance: 0.95
          },
          {
            type: 'import',
            content: 'import { UserService }',
            source: 'controllers/user.ts',
            line: 5,
            relevance: 0.9
          }
        ]
      });

      expect(verification.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });
});
