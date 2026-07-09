/**
 * Forgewright Security Grader
 *
 * Calculates A-F security grade based on vulnerability findings.
 *
 * Grading Scale:
 * ┌─────────┬─────────────────────────────────────────────────────────┐
 * │ Grade   │ Criteria                                              │
 * ├─────────┼─────────────────────────────────────────────────────────┤
 * │ A       │ 0 critical, 0 high                                    │
 * │ B       │ 0 critical, ≤2 high                                   │
 * │ C       │ 0 critical, ≤5 high, ≤10 medium                       │
 * │ D       │ ≤2 critical, ≤10 high                                 │
 * │ F       │ >2 critical OR >10 high                                │
 * └─────────┴─────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   import { calculateGrade, getGradeDetails } from './grader'
 */

export interface SeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface GradeDetails {
  grade: string;
  letter: string;
  color: string;
  description: string;
  status: 'pass' | 'warning' | 'fail';
  meetsMergeCriteria: boolean;
  breakdown: {
    criteria: string;
    met: boolean;
  }[];
}

/**
 * Severity weights for scoring
 */
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0.5,
  info: 0
};

/**
 * Calculate the security grade (A-F) based on findings summary
 */
export function calculateGrade(summary: SeveritySummary): string {
  const { critical, high, medium } = summary;

  // A: 0 critical, 0 high
  if (critical === 0 && high === 0) return 'A';

  // B: 0 critical, ≤2 high
  if (critical === 0 && high <= 2) return 'B';

  // C: 0 critical, ≤5 high, ≤10 medium
  if (critical === 0 && high <= 5 && medium <= 10) return 'C';

  // D: ≤2 critical, ≤10 high
  if (critical <= 2 && high <= 10) return 'D';

  // F: >2 critical OR >10 high
  if (critical > 2 || high > 10) return 'F';

  // Default to C if conditions not met
  return 'C';
}

/**
 * Get detailed grade information
 */
export function getGradeDetails(summary: SeveritySummary): GradeDetails {
  const grade = calculateGrade(summary);
  const { critical, high, medium } = summary;

  const gradeInfo: Record<string, { color: string; description: string }> = {
    'A': {
      color: 'green',
      description: 'Excellent security posture. No critical or high vulnerabilities detected.'
    },
    'B': {
      color: 'brightgreen',
      description: 'Good security posture. Minor issues that should be addressed.'
    },
    'C': {
      color: 'yellow',
      description: 'Acceptable security posture. Several issues need attention.'
    },
    'D': {
      color: 'orange',
      description: 'Poor security posture. Significant vulnerabilities require immediate action.'
    },
    'F': {
      color: 'red',
      description: 'Critical security issues. Merge blocked until resolved.'
    }
  };

  const info = gradeInfo[grade] || gradeInfo['F'];

  // Build breakdown
  const breakdown: { criteria: string; met: boolean }[] = [];

  switch (grade) {
    case 'A':
      breakdown.push({ criteria: '0 critical vulnerabilities', met: critical === 0 });
      breakdown.push({ criteria: '0 high vulnerabilities', met: high === 0 });
      break;

    case 'B':
      breakdown.push({ criteria: '0 critical vulnerabilities', met: critical === 0 });
      breakdown.push({ criteria: '≤2 high vulnerabilities', met: high <= 2 });
      break;

    case 'C':
      breakdown.push({ criteria: '0 critical vulnerabilities', met: critical === 0 });
      breakdown.push({ criteria: '≤5 high vulnerabilities', met: high <= 5 });
      breakdown.push({ criteria: '≤10 medium vulnerabilities', met: medium <= 10 });
      break;

    case 'D':
      breakdown.push({ criteria: '≤2 critical vulnerabilities', met: critical <= 2 });
      breakdown.push({ criteria: '≤10 high vulnerabilities', met: high <= 10 });
      break;

    case 'F':
      breakdown.push({ criteria: '>2 critical OR >10 high vulnerabilities', met: critical > 2 || high > 10 });
      break;
  }

  // Determine status and merge criteria
  let status: 'pass' | 'warning' | 'fail';
  let meetsMergeCriteria: boolean;

  switch (grade) {
    case 'A':
    case 'B':
    case 'C':
      status = 'pass';
      meetsMergeCriteria = true;
      break;
    case 'D':
      status = 'warning';
      meetsMergeCriteria = true; // D can merge with warning
      break;
    case 'F':
    default:
      status = 'fail';
      meetsMergeCriteria = false;
      break;
  }

  return {
    grade,
    letter: grade,
    color: info.color,
    description: info.description,
    status,
    meetsMergeCriteria,
    breakdown
  };
}

/**
 * Calculate a numeric security score (0-100)
 */
export function calculateNumericScore(summary: SeveritySummary): number {
  const { critical, high, medium, low, info } = summary;

  // Base score
  let score = 100;

  // Deduct for each severity level
  score -= critical * SEVERITY_WEIGHTS.critical;
  score -= high * SEVERITY_WEIGHTS.high;
  score -= medium * SEVERITY_WEIGHTS.medium;
  score -= low * SEVERITY_WEIGHTS.low;
  score -= info * SEVERITY_WEIGHTS.info;

  // Ensure score is within bounds
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get grade threshold recommendations
 */
export function getGradeThresholds(): Record<string, { min: number; max: number; description: string }> {
  return {
    'A': { min: 95, max: 100, description: 'Excellent - ready to merge' },
    'B': { min: 80, max: 94, description: 'Good - minor improvements recommended' },
    'C': { min: 60, max: 79, description: 'Acceptable - address findings before merge' },
    'D': { min: 40, max: 59, description: 'Poor - significant review required' },
    'F': { min: 0, max: 39, description: 'Failed - must fix before merge' }
  };
}

/**
 * Format grade for GitHub Actions annotations
 */
export function formatGradeForGitHub(summary: SeveritySummary): {
  title: string;
  summaryText: string;
  color: number;
} {
  const grade = calculateGrade(summary);
  const details = getGradeDetails(summary);

  // GitHub uses decimal RGB values for colors
  const colorMap: Record<string, number> = {
    'A': 0x238636, // green
    'B': 0x1a7f37, // brightgreen
    'C': 0x9e6a03, // yellow
    'D': 0xbd561d, // orange
    'F': 0xda3633  // red
  };

  const title = `Security Grade: ${grade}`;
  const summaryText = `${details.description} (${details.status.toUpperCase()})`;

  return {
    title,
    summaryText,
    color: colorMap[grade] || 0x808080
  };
}
