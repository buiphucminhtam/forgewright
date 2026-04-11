/**
 * Agent Prompts for ForgeWright Anti-Hallucination System
 * 
 * Prompts and prompt templates for various agents.
 */

import type { Guardrails, ConfidenceConfig, VerificationStatus } from './types.js';

// ============================================================================
// System Prompts
// ============================================================================

export const SKEPTIC_SYSTEM_PROMPT = `You are a skeptical verification agent. Your role is to critically examine claims and verify their accuracy against provided evidence.

## Your Task
Carefully analyze each claim against the provided evidence. Be conservative in your verification - if evidence is weak or contradictory, mark as UNCERTAIN.

## Verification Criteria
1. **FACTUAL CLAIMS**: Must be directly supported by evidence
2. **CODE DESCRIPTIONS**: Must match actual implementation
3. **RELATIONSHIPS**: Must be verifiable through code structure
4. **STATISTICS**: Must be computed from actual data

## Response Format
For each claim, provide:
- STATUS: CONFIRMED | UNCONFIRMED | UNCERTAIN
- REASONING: Why you reached this conclusion
- EVIDENCE: Specific evidence supporting or contradicting
- ISSUES: Any problems with the claim`;

export const SYNTHESIZER_SYSTEM_PROMPT = `You are a precise synthesis agent. Your role is to generate accurate content based ONLY on provided evidence.

## Your Task
Generate content that:
1. Only describes functionality present in the evidence
2. Cites specific sources for each claim using [source:filepath:line] format
3. Clearly marks unverified claims with [NOT_VERIFIED]
4. Avoids speculation or extrapolation

## Citation Format
Use inline citations for every factual claim:
- [source:src/auth/login.ts:42] for specific lines
- [source:src/auth/] for file-level claims

## Quality Standards
- Be precise and specific
- Include code snippets when helpful
- Distinguish between confirmed and unverified information
- Flag areas where evidence is weak`;

// ============================================================================
// Prompt Templates
// ============================================================================

export function buildVerificationPrompt(params: {
  claims: string[];
  evidence: string;
  context?: string;
}): string {
  return `## Verification Task

### Claims to Verify
${params.claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}

### Evidence
${params.evidence}

${params.context ? `### Additional Context\n${params.context}\n` : ''}

### Your Task
For each claim, determine if it is CONFIRMED, UNCONFIRMED, or UNCERTAIN based on the evidence.

Provide your response in this format:
\`\`\`
CLAIM 1: [claim text]
STATUS: [CONFIRMED|UNCONFIRMED|UNCERTAIN]
REASONING: [your explanation]
EVIDENCE: [specific evidence from above]
\`\`\`

Be conservative. If evidence is insufficient, mark as UNCERTAIN.`;
}

export function buildDocumentVerificationPrompt(params: {
  document: string;
  evidence: string;
  citationRequired?: boolean;
}): string {
  return `## Document Verification Task

### Document to Verify
${params.document}

### Evidence
${params.evidence}

### Verification Criteria
1. Each factual claim must be supported by evidence
${params.citationRequired ? '2. Each claim must have an inline citation in [source:filepath:line] format' : ''}
3. Unverified claims must be marked with [NOT_VERIFIED]
4. No speculation or extrapolation beyond evidence

### Your Task
Verify the document line by line. For each claim:
- CONFIRMED: Evidence directly supports the claim
- UNCONFIRMED: Evidence contradicts or doesn't support the claim
- UNCERTAIN: Evidence is insufficient to determine

Provide:
1. Overall verification status
2. List of confirmed/unconfirmed/uncertain claims
3. Specific issues with the document
4. Suggestions for improvement`;
}

export function buildSynthesisPrompt(params: {
  type: 'wiki' | 'impact' | 'query' | 'binding';
  task: string;
  evidence: string;
  constraints: string[];
}): string {
  const typeInstructions: Record<string, string> = {
    wiki: 'Generate comprehensive documentation',
    impact: 'Analyze the impact and dependencies',
    query: 'Provide accurate answers to the query',
    binding: 'Analyze code bindings and references',
  };

  return `## Synthesis Task

### Task
${typeInstructions[params.type] ?? 'Process the request'}: ${params.task}

### Evidence
${params.evidence}

### Constraints
${params.constraints.map(c => `- ${c}`).join('\n')}

### Your Task
Generate content that:
1. Only uses information from the provided evidence
2. Cites sources using [source:filepath:line] format
3. Clearly marks any unverified claims
4. Is precise and avoids speculation

${params.constraints.includes('citationRequired') ? '\n### Citation Format\nEvery factual claim must have an inline citation.\n' : ''}`;
}

export function buildRefinePrompt(params: {
  draft: string;
  issues: string[];
  evidence: string;
}): string {
  return `## Refinement Task

### Current Draft
${params.draft}

### Issues to Address
${params.issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

### Evidence
${params.evidence}

### Your Task
Revise the draft to address the issues while:
1. Only using information from the evidence
2. Maintaining accuracy
3. Adding necessary citations
4. Marking unverified claims

Provide the revised version.`;
}

export function buildImpactVerificationPrompt(params: {
  symbol: string;
  claim: string;
  graphData: string;
}): string {
  return `## Impact Analysis Verification

### Symbol
${params.symbol}

### Claim
${params.claim}

### Graph Data
${params.graphData}

### Your Task
Verify that the impact analysis is accurate by checking:
1. All listed affected files are actually affected
2. No missing dependencies in the analysis
3. Call chain information is correct
4. Type relationships are accurate

Respond with:
- CONFIRMED: Analysis is accurate
- UNCONFIRMED: Analysis contains errors
- UNCERTAIN: Cannot verify from available data

Provide specific issues if any.`;
}

export function buildConfidenceCalibrationPrompt(params: {
  text: string;
  type: 'wiki' | 'impact' | 'query';
}): string {
  return `## Confidence Calibration Task

### Text to Analyze
${params.text}

### Type
${params.type}

### Your Task
Assess the reliability of this content by considering:
1. **Specificity**: Are claims specific and verifiable?
2. **Evidence**: Is there strong evidence for claims?
3. **Uncertainty**: Are uncertain areas marked?
4. **Citations**: Are sources properly cited?

Provide a confidence score from 0.0 to 1.0:
- 0.9-1.0: Very high confidence (strong evidence, clear citations)
- 0.7-0.9: High confidence (good evidence, some citations)
- 0.5-0.7: Medium confidence (partial evidence)
- 0.3-0.5: Low confidence (weak evidence)
- 0.0-0.3: Critical (insufficient evidence or major issues)

Also provide:
- Key factors affecting confidence
- Specific concerns or flags
- Suggestions for improvement`;
}

// ============================================================================
// Prompt Helpers
// ============================================================================

export function applyGuardrails(
  basePrompt: string,
  guardrails: Guardrails
): string {
  const constraintsSection = guardrails.constraints.length > 0
    ? `\n### Constraints\n${guardrails.constraints.map((c: string) => `- ${c}`).join('\n')}`
    : '';

  const calibrationMap: Record<string, string> = {
    strict: 'Be very conservative. High confidence only with strong evidence.',
    moderate: 'Balance precision with completeness.',
    lenient: 'Accept reasonable inferences from strong evidence.',
  };
  const calibrationNote = calibrationMap[guardrails.calibration] ?? '';

  const fallbackMap: Record<string, string> = {
    refuse: 'If unable to verify, respond with "UNABLE_TO_VERIFY"',
    clarify: 'If unable to verify, ask for clarification',
    best_effort: 'If unable to verify, note the limitation and continue',
  };
  const fallbackNote = fallbackMap[guardrails.fallbackBehavior] ?? '';

  return `${basePrompt}${constraintsSection}

### Calibration
${calibrationNote}

### Handling Uncertainty
${fallbackNote}

${guardrails.citationRequired ? '\n### Citation Requirement\nAll factual claims MUST have inline citations in [source:filepath:line] format.\n' : ''}`;
}

export function parseVerificationResponse(
  response: string
): {
  status: VerificationStatus;
  reasoning: string;
  evidence: string[];
  issues: string[];
} {
  const statusMatch = response.match(/STATUS:\s*(CONFIRMED|UNCONFIRMED|UNCERTAIN)/i);
  const reasoningMatch = response.match(/REASONING:\s*([\s\S]*?)(?=EVIDENCE:|$)/i);
  const evidenceMatch = response.match(/EVIDENCE:\s*([\s\S]*?)(?=ISSUES:|$)/i);
  const issuesMatch = response.match(/ISSUES?:\s*([\s\S]*?)$/i);

  return {
    status: (statusMatch?.[1]?.toLowerCase() as VerificationStatus) || 'uncertain',
    reasoning: reasoningMatch?.[1]?.trim() || '',
    evidence: evidenceMatch?.[1]?.split('\n').filter(l => l.trim()) || [],
    issues: issuesMatch?.[1]?.split('\n').filter(l => l.trim()) || [],
  };
}

export function extractConfidenceScore(response: string): number {
  const scoreMatch = response.match(/confidence\s*(?:score)?[:\s]*(\d*\.?\d+)/i);
  if (scoreMatch) {
    const score = parseFloat(scoreMatch[1]);
    if (!isNaN(score) && score >= 0 && score <= 1) {
      return score;
    }
  }
  
  // Fallback: look for common patterns
  if (/very high confidence|strongly confirmed/i.test(response)) return 0.95;
  if (/high confidence|confirmed/i.test(response)) return 0.8;
  if (/medium confidence|likely/i.test(response)) return 0.6;
  if (/low confidence|uncertain/i.test(response)) return 0.4;
  if (/critical|unable to verify/i.test(response)) return 0.2;
  
  return 0.5; // Default
}

// ============================================================================
// Citation Extraction
// ============================================================================

export const CITATION_PATTERN = /\[source:([^\]:]+)(?::(\d+))?\]/g;

export function extractCitations(text: string): Array<{
  source: string;
  line?: number;
  full: string;
}> {
  const citations: Array<{ source: string; line?: number; full: string }> = [];
  let match;

  while ((match = CITATION_PATTERN.exec(text)) !== null) {
    citations.push({
      source: match[1],
      line: match[2] ? parseInt(match[2], 10) : undefined,
      full: match[0],
    });
  }

  return citations;
}

export function buildCitationPrompt(context: {
  claim: string;
  availableSources: Array<{ file: string; line?: number; snippet: string }>;
}): string {
  return `## Citation Verification Task

### Claim
${context.claim}

### Available Sources
${context.availableSources.map(s => 
  `[source:${s.file}${s.line ? `:${s.line}` : ''}]\n${s.snippet}`
).join('\n\n')}

### Your Task
Verify that each citation in the claim exists in the sources.
For each citation, confirm:
1. The file exists
2. The line number is correct (if specified)
3. The content matches the claim

Respond with:
\`\`\`
CITATION 1: [source:filepath:line]
VALID: [YES|NO]
MATCH: [YES|PARTIAL|NO]
NOTES: [any issues]
\`\`\``;
}

// ============================================================================
// Default Prompts Registry
// ============================================================================

export const DEFAULT_PROMPTS = {
  skeptic: {
    system: SKEPTIC_SYSTEM_PROMPT,
    verification: buildVerificationPrompt,
    document: buildDocumentVerificationPrompt,
    impact: buildImpactVerificationPrompt,
  },
  synthesizer: {
    system: SYNTHESIZER_SYSTEM_PROMPT,
    synthesis: buildSynthesisPrompt,
    refine: buildRefinePrompt,
  },
  confidence: {
    system: buildConfidenceCalibrationPrompt({ text: '', type: 'wiki' }),
    calibrate: buildConfidenceCalibrationPrompt,
  },
};
