import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import {
  startPipeline,
  getState,
  advancePhase,
  requestGateApproval,
  approveGate,
  PIPELINE_PHASES,
} from '../state/pipeline-manager.js'
import { ToolError, ErrorCode, isForgewrightError, getErrorMessage } from '../errors.js'

export function registerTools(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'fw_start_pipeline',
          description:
            'Initialize the Forgewright pipeline for a new project/session. Use this when the user specifies a goal (e.g. Build a SaaS, add a feature).',
          inputSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                description:
                  'The run mode, e.g. "Full Build", "Feature", "Harden", "Mobile", "Game Build".',
              },
            },
            required: ['mode'],
          },
        },
        {
          name: 'fw_get_current_phase',
          description:
            'Get the current phase of the Forgewright pipeline and its locked status. Use this to determine which skill to load.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'fw_advance_to_next_phase',
          description:
            'Transition to the next phase in the pipeline (e.g. from Research -> Execution). Blocks if waiting for a HITL gate.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'fw_request_gate_approval',
          description:
            'Lock the pipeline when you have completed work and need the explicit human user to approve it before continuing to the next phase. This is mandatory for production-grade robustness.',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description:
                  'A clear explanation of what you just finished (e.g. "GDD is ready") and what the user needs to approve.',
              },
            },
            required: ['message'],
          },
        },
        {
          name: 'fw_approve_gate',
          description:
            'Call this ONLY when the user says "I approve" or "Looks good". Unlocks the pipeline.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (request.params.name === 'fw_start_pipeline') {
        const result = startPipeline(request.params.arguments?.mode as string)
        return { content: [{ type: 'text', text: result }] }
      }

      if (request.params.name === 'fw_get_current_phase') {
        const state = getState()
        const phaseName = PIPELINE_PHASES[state.currentPhase] || 'Unknown Phase'
        const msg = `Mode: ${state.currentMode || 'None'}\nPhase: ${phaseName}\nStatus: ${state.status}\n\nWarning: If status is WAITING_FOR_GATE, wait for user input. Do not start next step.`
        return { content: [{ type: 'text', text: msg }] }
      }

      if (request.params.name === 'fw_advance_to_next_phase') {
        const result = advancePhase()
        return { content: [{ type: 'text', text: result }] }
      }

      if (request.params.name === 'fw_request_gate_approval') {
        const result = requestGateApproval(request.params.arguments?.message as string)
        return { content: [{ type: 'text', text: result }] }
      }

      if (request.params.name === 'fw_approve_gate') {
        const result = approveGate()
        return { content: [{ type: 'text', text: result }] }
      }

      throw new ToolError(ErrorCode.TOOL_NOT_FOUND, `Tool not found: ${request.params.name}`)
    } catch (err: unknown) {
      const message = isForgewrightError(err) ? err.toString() : getErrorMessage(err)
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to execute: ${message}` }],
      }
    }
  })
}
