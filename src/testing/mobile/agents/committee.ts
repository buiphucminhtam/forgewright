/**
 * MobileCommittee
 * Multi-Agent Committee for Mobile Testing
 * 
 * Based on arXiv 2512.21352 - adapted for mobile
 * 
 * Members: TestPilot, Healer, GestureAgent, PlatformAgent
 */

import { callLLM, getLLMConfig, type LLMProvider } from '../../config/llm-providers';
import type { MobileResult } from './mobile-test-pilot';
import type { HealingResult } from './mobile-healer';
import type { GestureResult } from './gesture-agent';

export interface MobileCommitteeMember {
  id: string;
  persona: 'pragmatic' | 'critical' | 'thorough';
  role: 'test-pilot' | 'healer' | 'gesture' | 'platform';
  expertise: string[];
}

export interface MobileVote {
  memberId: string;
  choice: string;
  confidence: number;
  reasoning: string;
}

export interface MobileDecision {
  consensus: boolean;
  winningChoice?: string;
  votes: MobileVote[];
  rounds: number;
  confidence: number;
}

export interface MobileCommitteeConfig {
  members: MobileCommitteeMember[];
  rounds: number;
  threshold: number;
  platform: 'iOS' | 'Android' | 'both';
}

const DEFAULT_CONFIG: MobileCommitteeConfig = {
  members: [
    {
      id: 'test-pilot',
      persona: 'pragmatic',
      role: 'test-pilot',
      expertise: ['tap', 'swipe', 'scroll', 'type', 'screenshot'],
    },
    {
      id: 'healer',
      persona: 'thorough',
      role: 'healer',
      expertise: ['healing', 'locators', 'accessibility', 'resource-id'],
    },
    {
      id: 'gesture',
      persona: 'pragmatic',
      role: 'gesture',
      expertise: ['multi-touch', 'pinch', 'drag', 'rotate', 'orientation'],
    },
    {
      id: 'platform',
      persona: 'critical',
      role: 'platform',
      expertise: ['iOS', 'Android', 'XCUITest', 'UiAutomator2', 'context'],
    },
  ],
  rounds: 3,
  threshold: 0.7,
  platform: 'both',
};

/**
 * MobileCommittee
 * Multi-agent voting for mobile testing decisions
 */
export class MobileCommittee {
  private config: MobileCommitteeConfig;
  private provider: LLMProvider;

  constructor(
    config: Partial<MobileCommitteeConfig> = {},
    provider: LLMProvider = 'openai'
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = provider;
  }

  /**
   * Make a decision through voting
   */
  async decide(
    question: string,
    choices: string[],
    context?: MobileContext
  ): Promise<MobileDecision> {
    const allVotes: MobileVote[][] = [];
    let currentChoices = choices;

    // Run voting rounds
    for (let round = 0; round < this.config.rounds; round++) {
      const roundVotes = await this.voteRound(question, currentChoices, context);
      allVotes.push(roundVotes);

      // Check consensus
      const consensus = this.checkConsensus(roundVotes);
      if (consensus) {
        return {
          consensus: true,
          winningChoice: consensus.winningChoice,
          votes: roundVotes,
          rounds: round + 1,
          confidence: consensus.confidence,
        };
      }

      // Narrow choices
      currentChoices = this.narrowChoices(roundVotes, currentChoices);
      if (currentChoices.length <= 1) break;
    }

    // No consensus
    return this.handleNoConsensus(allVotes, choices);
  }

  /**
   * Vote round
   */
  private async voteRound(
    question: string,
    choices: string[],
    context?: MobileContext
  ): Promise<MobileVote[]> {
    return Promise.all(
      this.config.members.map(member => this.getMemberVote(member, question, choices, context))
    );
  }

  /**
   * Get vote from member
   */
  private async getMemberVote(
    member: MobileCommitteeMember,
    question: string,
    choices: string[],
    context?: MobileContext
  ): Promise<MobileVote> {
    const config = getLLMConfig(this.provider);

    const personaPrompt = this.getPersonaPrompt(member.persona);
    const choiceOptions = choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const contextStr = context ? this.formatContext(context) : '';

    const prompt = `
${personaPrompt}

You are a MOBILE TESTING specialist.
Role: ${member.role}
Expertise: ${member.expertise.join(', ')}

Question: ${question}

${contextStr}

Available choices:
${choiceOptions}

Provide your vote:
CHOICE: [number]
CONFIDENCE: [0.0-1.0]
REASONING: [explanation]
`;

    try {
      const response = await callLLM(config, prompt);
      return this.parseVoteResponse(response.content, member.id);
    } catch (error) {
      return {
        memberId: member.id,
        choice: choices[0],
        confidence: 0.5,
        reasoning: 'Error during voting',
      };
    }
  }

  /**
   * Parse vote response
   */
  private parseVoteResponse(content: string, memberId: string): MobileVote {
    const choiceMatch = content.match(/CHOICE:\s*(\d+)/i);
    const confidenceMatch = content.match(/CONFIDENCE:\s*([\d.]+)/i);
    const reasoningMatch = content.match(/REASONING:\s*([\s\S]*?)(?:CHOICE|CONFIDENCE|$)/i);

    return {
      memberId,
      choice: choiceMatch ? parseInt(choiceMatch[1], 10).toString() : '1',
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
    };
  }

  /**
   * Get persona prompt
   */
  private getPersonaPrompt(persona: MobileCommitteeMember['persona']): string {
    const prompts = {
      pragmatic: `You are a PRAGMATIC mobile tester.
Focus on practical, fast solutions.
Prioritize reliability over completeness.
Choose options that work reliably on mobile devices.`,

      critical: `You are a CRITICAL mobile reviewer.
Consider platform differences (iOS vs Android).
Look for edge cases and device-specific issues.
Be skeptical of solutions that might fail on some devices.`,

      thorough: `You are a THOROUGH mobile validator.
Consider accessibility, performance, and usability.
Ensure complete coverage across devices.
Choose options that handle all mobile scenarios.`,
    };

    return prompts[persona];
  }

  /**
   * Format context
   */
  private formatContext(context: MobileContext): string {
    const parts: string[] = [];

    if (context.platform) {
      parts.push(`Platform: ${context.platform}`);
    }

    if (context.device) {
      parts.push(`Device: ${context.device}`);
    }

    if (context.osVersion) {
      parts.push(`OS Version: ${context.osVersion}`);
    }

    if (context.elementInfo) {
      parts.push(`Element Info: ${JSON.stringify(context.elementInfo)}`);
    }

    if (context.previousAttempts?.length) {
      parts.push(`Previous Attempts: ${context.previousAttempts.join(', ')}`);
    }

    return parts.length > 0 ? `Context:\n${parts.join('\n')}` : '';
  }

  /**
   * Check consensus
   */
  private checkConsensus(votes: MobileVote[]): { consensus: boolean; winningChoice?: string; confidence: number } {
    if (votes.length === 0) return { consensus: false };

    const voteCounts: Record<string, { count: number; totalConfidence: number }> = {};

    votes.forEach(vote => {
      if (!voteCounts[vote.choice]) {
        voteCounts[vote.choice] = { count: 0, totalConfidence: 0 };
      }
      voteCounts[vote.choice].count++;
      voteCounts[vote.choice].totalConfidence += vote.confidence;
    });

    const totalVotes = votes.length;

    for (const [choice, { count, totalConfidence }] of Object.entries(voteCounts)) {
      const voteRatio = count / totalVotes;
      const avgConfidence = totalConfidence / count;
      const weightedScore = voteRatio * avgConfidence;

      if (weightedScore >= this.config.threshold) {
        return {
          consensus: true,
          winningChoice: choice,
          confidence: weightedScore,
        };
      }
    }

    return { consensus: false };
  }

  /**
   * Narrow choices
   */
  private narrowChoices(votes: MobileVote[], currentChoices: string[]): string[] {
    const voteCounts: Record<string, number> = {};

    votes.forEach(vote => {
      voteCounts[vote.choice] = (voteCounts[vote.choice] || 0) + vote.confidence;
    });

    const sorted = Object.entries(voteCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([choice]) => choice);

    return sorted.slice(0, Math.min(2, sorted.length));
  }

  /**
   * Handle no consensus
   */
  private handleNoConsensus(allVotes: MobileVote[][][], originalChoices: string[]): MobileDecision {
    const finalVotes = allVotes[allVotes.length - 1];

    const voteCounts: Record<string, number> = {};
    finalVotes.forEach(vote => {
      voteCounts[vote.choice] = (voteCounts[vote.choice] || 0) + 1;
    });

    const winner = Object.entries(voteCounts)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      consensus: false,
      winningChoice: winner ? originalChoices[parseInt(winner[0], 10) - 1] : undefined,
      votes: finalVotes,
      rounds: allVotes.length,
      confidence: winner ? winner[1] / finalVotes.length : 0,
    };
  }

  /**
   * Get committee stats
   */
  getStats(): { members: number; rounds: number; threshold: number } {
    return {
      members: this.config.members.length,
      rounds: this.config.rounds,
      threshold: this.config.threshold,
    };
  }
}

export interface MobileContext {
  platform?: 'iOS' | 'Android';
  device?: string;
  osVersion?: string;
  elementInfo?: {
    tagName?: string;
    accessibilityId?: string;
    resourceId?: string;
    text?: string;
    visible?: boolean;
  };
  previousAttempts?: string[];
  appInfo?: {
    bundleId?: string;
    appPackage?: string;
    version?: string;
  };
}
