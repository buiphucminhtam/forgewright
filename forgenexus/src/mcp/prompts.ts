/**
 * ForgeNexus MCP Prompts — 2 prompt templates with rich agent guidance.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

export function registerPrompts(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'detect_impact',
        description:
          'Analyze the impact of your current changes before committing. Guides through scope selection, change detection, process analysis, and risk assessment.',
        arguments: [
          {
            name: 'scope',
            description:
              'What to analyze: "unstaged", "staged", "all", or "compare" (default: all)',
            required: false,
          },
          {
            name: 'base_ref',
            description: 'Branch/commit for "compare" scope (e.g., "main")',
            required: false,
          },
        ],
      },
      {
        name: 'generate_map',
        description:
          'Generate architecture documentation from the knowledge graph. Creates a codebase overview with execution flows and mermaid diagrams.',
        arguments: [
          {
            name: 'repo',
            description: 'Repository name (omit if only one indexed)',
            required: false,
          },
        ],
      },
    ],
  }))

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    if (name === 'detect_impact') {
      const scope = args?.scope ?? 'all'
      const baseRef = args?.base_ref ?? ''
      const baseRefArg = baseRef ? `, base_ref: "${baseRef}"` : ''
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Analyze the impact of my current code changes before committing.',
                '',
                'This follows the ForgeNexus safety protocol:',
                '',
                `1. Run \`detect_changes({scope: "${scope}"${baseRefArg}})\` to find what changed and affected processes`,
                "   - Use scope: 'staged' to check exactly what will be committed",
                "   - Use scope: 'compare' with base_ref for PR analysis",
                '',
                '2. For each changed symbol in critical processes, run `context({name: "<symbol>"})` to see its full reference graph',
                '',
                '3. For any HIGH RISK items (many callers or cross-process), run `impact({target: "<symbol>", direction: "upstream"})` for blast radius',
                '',
                '4. If analyzing a PR branch, use `pr_review({base_ref: "<base_branch>"})` for the full blast-radius analysis with recommended reviewers',
                '',
                'Present the analysis as a clear risk report:',
                '- Summary: what changed, how many symbols, affected processes',
                '- Risk level: LOW / MEDIUM / HIGH / CRITICAL',
                '- d=1 items (WILL BREAK): must be updated before merge',
                '- Recommended actions',
              ].join('\n'),
            },
          },
        ],
      }
    }

    if (name === 'generate_map') {
      const repo = args?.repo ?? '{name}'
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Generate architecture documentation for this codebase using the knowledge graph.',
                '',
                'Follow these steps:',
                '',
                `1. READ forgenexus://repo/${repo}/context for codebase stats and staleness check`,
                `2. READ forgenexus://repo/${repo}/clusters to see all functional areas`,
                `3. READ forgenexus://repo/${repo}/processes to see all execution flows`,
                `4. READ forgenexus://repo/${repo}/stats for detailed metrics`,
                `5. For top 5 processes by symbol count, READ forgenexus://repo/${repo}/process/{name} for step-by-step traces`,
                `6. For top 3 clusters, READ forgenexus://repo/${repo}/cluster/{name} for member details`,
                '',
                '7. Generate an ARCHITECTURE.md file with:',
                '   - Overview: what the codebase does and its main areas',
                '   - Functional Areas: the top clusters with their members',
                '   - Key Execution Flows: the top processes with their steps',
                '   - A Mermaid diagram showing how areas connect',
                '',
                'The diagram should show: clusters as subgraphs, process entry points, key cross-area dependencies.',
              ].join('\n'),
            },
          },
        ],
      }
    }

    throw new Error(`Unknown prompt: ${name}`)
  })
}
