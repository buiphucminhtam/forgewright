import { ListPromptsRequestSchema, GetPromptRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { getAllSkills } from '../parsers/skill-parser.js';
export function registerPrompts(server) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        const skills = getAllSkills();
        return {
            prompts: [
                // Always include the production-grade orchestrator first
                {
                    name: 'fw_orchestrator',
                    description: 'Load Forgewright Orchestrator — the main skill that routes all requests to the correct domain skill.',
                    arguments: [],
                },
                // Then all domain skills
                ...skills.map((skill) => ({
                    name: `fw_skill_${skill.name}`,
                    description: `Load Forgewright Skill: ${skill.name}. ${skill.description}`,
                    arguments: [],
                })),
            ],
        };
    });
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const skills = getAllSkills();
        const promptName = request.params.name;
        // Handle orchestrator
        if (promptName === 'fw_orchestrator') {
            const orchestratorSkill = skills.find((s) => s.name === 'production-grade');
            if (orchestratorSkill) {
                return {
                    description: orchestratorSkill.description,
                    messages: [
                        {
                            role: 'user',
                            content: {
                                type: 'text',
                                text: `Please operate as the Forgewright Orchestrator. Load and follow the production-grade skill instructions.

${orchestratorSkill.content}`,
                            },
                        },
                    ],
                };
            }
        }
        // Handle individual skills
        const skill = skills.find((s) => `fw_skill_${s.name}` === promptName);
        if (skill) {
            return {
                description: skill.description,
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Please operate as the following Forgewright Skill:\n\n${skill.content}\n\nExecute the duties for this role based on the current context.`,
                        },
                    },
                ],
            };
        }
        throw new Error(`Forgewright Skill or Prompt not found: ${promptName}`);
    });
}
