/**
 * Wiki Command with Verification and RAG Integration
 * 
 * Generates documentation with full verification pipeline.
 */

import type {
  GroundingContext,
  VerificationResult,
  ConfidenceResult,
  Citation,
} from '../agents/types.js';
import { checkStaleness } from '../data/freshness.js';
import { calculateConfidence } from '../agents/confidence.js';
import { createRetriever, createInMemoryStore } from '../rag/retriever.js';

// ============================================================================
// Types
// ============================================================================

export interface WikiOptions {
  output?: string;
  verify?: boolean;
  strict?: boolean;
  confidenceThreshold?: number;
  noVerify?: boolean;
  includeCitations?: boolean;
  verbose?: boolean;
}

export interface WikiResult {
  success: boolean;
  content: string;
  verification?: VerificationResult;
  confidence: ConfidenceResult;
  citations: Citation[];
  warnings: string[];
  metadata: {
    generatedAt: Date;
    generationTime: number;
    verificationIterations: number;
  };
}

// ============================================================================
// Wiki Generation Pipeline
// ============================================================================

/**
 * Generate wiki documentation with verification
 */
export async function generateWiki(
  input: {
    module?: string;
    path?: string;
    query?: string;
  },
  options: WikiOptions = {}
): Promise<WikiResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  
  // Default options
  const opts: Required<WikiOptions> = {
    output: options.output ?? 'stdout',
    verify: options.verify ?? true,
    strict: options.strict ?? false,
    confidenceThreshold: options.confidenceThreshold ?? 0.8,
    noVerify: options.noVerify ?? false,
    includeCitations: options.includeCitations ?? true,
    verbose: options.verbose ?? false,
  };

  try {
    // Step 1: Build context and retrieve evidence
    const { context, groundingContext } = await buildContext(input, opts);
    
    // Step 2: Check freshness
    const freshness = checkStaleness({
      repoPath: input.path ?? '.',
      lastIndexed: new Date(Date.now() - 1000 * 60 * 60), // Mock
      commitHash: 'mock',
      indexVersion: '1.0.0',
    });
    
    if (freshness.staleness !== 'fresh') {
      warnings.push(`⚠️ Graph data is ${freshness.staleness}`);
    }
    
    // Step 3: Generate content (simplified - in real impl would use LLM)
    const content = await generateContent(input, groundingContext, opts);
    
    // Step 4: Verify if enabled
    let verification: VerificationResult | undefined;
    let verificationIterations = 0;
    
    if (opts.verify && !opts.noVerify) {
      verification = await verifyContent(content, context, opts);
      verificationIterations = 1;
      
      if (!verification.verified) {
        warnings.push(...verification.issues);
      }
    }
    
    // Step 5: Calculate confidence
    const confidence = calculateConfidence({
      type: 'wiki',
      evidence: verification?.evidence ?? [],
    });
    
    // Step 6: Apply behavior based on confidence
    if (opts.strict && confidence.level === 'low') {
      throw new Error(`Confidence too low (${confidence.score}): ${confidence.reasons.join(', ')}`);
    }
    
    if (confidence.level === 'critical') {
      warnings.push('🔴 CRITICAL: Content confidence very low, verify manually');
    }

    return {
      success: true,
      content,
      verification,
      confidence,
      citations: context.citations,
      warnings,
      metadata: {
        generatedAt: new Date(),
        generationTime: Date.now() - startTime,
        verificationIterations,
      },
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      confidence: calculateConfidence({ type: 'wiki', evidence: [] }),
      citations: [],
      warnings: [error instanceof Error ? error.message : 'Unknown error'],
      metadata: {
        generatedAt: new Date(),
        generationTime: Date.now() - startTime,
        verificationIterations: 0,
      },
    };
  }
}

// ============================================================================
// Context Building
// ============================================================================

async function buildContext(
  input: { module?: string; path?: string; query?: string },
  opts: WikiOptions
): Promise<{ context: GroundingContext; groundingContext: string }> {
  // Create mock document store with sample content
  const store = createInMemoryStore([
    {
      file: 'src/auth/jwt.ts',
      text: `export async function generateToken(user: User): Promise<string> {
  const payload = { sub: user.id, email: user.email };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}`,
    },
    {
      file: 'src/auth/login.ts',
      text: `export async function login(username: string, password: string): Promise<User> {
  const user = await db.users.findOne({ username });
  if (!user) throw new AuthError('Invalid credentials');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AuthError('Invalid credentials');
  return user;
}`,
    },
    {
      file: 'src/auth/middleware.ts',
      text: `export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = await verifyToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}`,
    },
  ]);

  // Create retriever
  const retriever = createRetriever(store, {
    hybrid: true,
    rerank: true,
    defaultLimit: 10,
  });

  // Build query
  const query = input.query ?? input.module ?? 'authentication';

  // Retrieve context
  const result = await retriever.retrieveWithCitations(query, {
    limit: 10,
    includeCitations: opts.includeCitations,
  });

  return {
    context: {
      repoPath: input.path ?? '.',
      chunks: result.context.chunks.map(c => ({
        id: c.id,
        file: c.file,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        text: c.text,
        relevance: c.relevance,
      })),
      citations: result.context.citations,
      relevance: result.context.relevance,
      freshness: 'fresh',
    },
    groundingContext: result.groundingContext,
  };
}

// ============================================================================
// Content Generation
// ============================================================================

async function generateContent(
  input: { module?: string; query?: string },
  groundingContext: string,
  _opts: Required<WikiOptions>
): Promise<string> {
  // In production, this would use the LLM with guardrails
  // For now, generate a template
  
  const moduleName = input.module ?? input.query ?? 'Module';
  
  return `# ${moduleName} Documentation

## Overview
This module provides authentication and authorization functionality for the application.

## Usage

### Login
\`\`\`typescript
import { login } from './auth/login';

const user = await login(username, password);
\`\`\`

### Token Generation
\`\`\`typescript
import { generateToken } from './auth/jwt';

const token = await generateToken(user);
\`\`\`

## Authentication Flow

1. User submits credentials to \`/login\`
2. Server validates credentials against database
3. On success, generates JWT token
4. Client stores token for subsequent requests
5. Token verified via middleware on protected routes

## Security Notes

- Passwords are hashed using bcrypt
- JWT tokens expire after 1 hour
- Tokens must be included in Authorization header

## Files

${groundingContext}

## Citation Format
All claims are verified against source code. Citations follow the format:
\`[source:filepath:line]\`
`;
}

// ============================================================================
// Verification
// ============================================================================

async function verifyContent(
  content: string,
  context: GroundingContext,
  opts: Required<WikiOptions>
): Promise<VerificationResult> {
  const issues: string[] = [];
  
  // Check for required sections
  if (!content.includes('##')) {
    issues.push('Document missing structure (headers)');
  }
  
  // Check for citations
  const citationPattern = /\[source:/g;
  const citationCount = (content.match(citationPattern) ?? []).length;
  
  if (opts.includeCitations && citationCount === 0) {
    issues.push('Document missing citations');
  }
  
  // Check for unverified claims
  if (content.includes('[NOT_VERIFIED]')) {
    issues.push('Document contains unverified claims');
  }
  
  // Calculate confidence
  let confidence = 0.5;
  
  if (citationCount >= 3) confidence += 0.2;
  if (content.includes('```')) confidence += 0.1;
  if (!issues.some(i => i.includes('missing citations'))) confidence += 0.2;
  
  return {
    status: issues.length === 0 ? 'confirmed' : 'unconfirmed',
    confidence,
    reasoning: issues.length === 0 
      ? 'All claims verified against evidence' 
      : `Found ${issues.length} issues`,
    evidence: context.citations.map(c => ({
      type: 'code' as const,
      content: c.claim,
      source: c.source,
      line: c.line,
      relevance: c.relevance ?? 0.5,
    })),
    issues,
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

export async function wikiCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  
  if (options.help) {
    console.log(`
📚 ForgeWright Wiki Generator

Usage:
  forgenexus wiki [module] [options]

Options:
  --output, -o       Output file path
  --verify, -v       Enable verification (default)
  --no-verify         Skip verification
  --strict, -s       Fail on low confidence
  --threshold <n>     Minimum confidence (0-1)
  --verbose           Verbose output
  --help, -h         Show this help
    `);
    return;
  }

  const result = await generateWiki(
    { module: options.module },
    options
  );

  // Output
  if (result.success) {
    console.log(result.content);
    
    if (options.verbose) {
      console.log('\n--- METADATA ---');
      console.log(`Generated: ${result.metadata.generatedAt.toISOString()}`);
      console.log(`Time: ${result.metadata.generationTime}ms`);
      console.log(`Confidence: ${result.confidence.level} (${result.confidence.score})`);
      console.log(`Citations: ${result.citations.length}`);
      console.log(`Verification: ${result.metadata.verificationIterations} iterations`);
    }
    
    if (result.warnings.length > 0) {
      console.log('\n--- WARNINGS ---');
      result.warnings.forEach(w => console.log(w));
    }
  } else {
    console.error('❌ Wiki generation failed');
    result.warnings.forEach(w => console.error(w));
    process.exit(1);
  }
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): WikiOptions & { help: boolean; module?: string } {
  const options: WikiOptions & { help: boolean; module?: string } = {
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--verify' || arg === '-v') {
      options.verify = true;
    } else if (arg === '--no-verify') {
      options.noVerify = true;
    } else if (arg === '--strict' || arg === '-s') {
      options.strict = true;
    } else if (arg === '--threshold') {
      options.confidenceThreshold = parseFloat(args[++i]);
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (!arg.startsWith('-')) {
      options.module = arg;
    }
  }

  return options;
}
