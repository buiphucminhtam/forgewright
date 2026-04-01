/**
 * LLM Prompt Templates for Wiki Generation
 *
 * All prompts produce deterministic, source-grounded documentation.
 * Templates use {{PLACEHOLDER}} substitution.
 */
export declare const GROUPING_SYSTEM_PROMPT = "You are a documentation architect. Given a list of source files with their exported symbols, group them into logical documentation modules.\n\nRules:\n- Each module should represent a cohesive feature, layer, or domain\n- Every file must appear in exactly one module\n- Module names should be human-readable (e.g. \"Authentication\", \"Database Layer\", \"API Routes\")\n- Aim for 5-15 modules for a typical project. Fewer for small projects, more for large ones\n- Group by functionality, not by file type or directory structure alone\n- Do NOT create modules for tests, configs, or non-source files";
export declare const GROUPING_USER_PROMPT = "Group these source files into documentation modules.\n\n**Files and their exports:**\n{{FILE_LIST}}\n\n**Directory structure:**\n{{DIRECTORY_TREE}}\n\nRespond with ONLY a JSON object mapping module names to file path arrays. No markdown, no explanation.\nExample format:\n{\n  \"Authentication\": [\"src/auth/login.ts\", \"src/auth/session.ts\"],\n  \"Database\": [\"src/db/connection.ts\", \"src/db/models.ts\"]\n}";
export declare const MODULE_SYSTEM_PROMPT = "You are a technical documentation writer. Write clear, developer-focused documentation for a code module.\n\nRules:\n- Output ONLY the documentation content \u2014 no meta-commentary like \"I've written...\", \"Here's the documentation...\", \"The documentation covers...\", or similar\n- Start directly with the module heading and content\n- Reference actual function names, class names, and code patterns \u2014 do NOT invent APIs\n- Use the call graph and execution flow data for accuracy, but do NOT mechanically list every edge\n- Include Mermaid diagrams only when they genuinely help understanding. Keep them small (5-10 nodes max)\n- Structure the document however makes sense for this module \u2014 there is no mandatory format\n- Write for a developer who needs to understand and contribute to this code";
export declare const MODULE_USER_PROMPT = "Write documentation for the **{{MODULE_NAME}}** module.\n\n## Source Code\n\n{{SOURCE_CODE}}\n\n## Call Graph & Execution Flows (reference for accuracy)\n\nInternal calls: {{INTRA_CALLS}}\nOutgoing calls: {{OUTGOING_CALLS}}\nIncoming calls: {{INCOMING_CALLS}}\nExecution flows: {{PROCESSES}}\n\n---\n\nWrite comprehensive documentation for this module. Cover its purpose, how it works, its key components, and how it connects to the rest of the codebase. Use whatever structure best fits this module \u2014 you decide the sections and headings. Include a Mermaid diagram only if it genuinely clarifies the architecture.";
export declare const PARENT_SYSTEM_PROMPT = "You are a technical documentation writer. Write a summary page for a module that contains sub-modules. Synthesize the children's documentation \u2014 do not re-read source code.\n\nRules:\n- Output ONLY the documentation content \u2014 no meta-commentary like \"I've written...\", \"Here's the documentation...\", \"The documentation covers...\", or similar\n- Start directly with the module heading and content\n- Reference actual components from the child modules\n- Focus on how the sub-modules work together, not repeating their individual docs\n- Keep it concise \u2014 the reader can click through to child pages for detail\n- Include a Mermaid diagram only if it genuinely clarifies how the sub-modules relate";
export declare const PARENT_USER_PROMPT = "Write documentation for the **{{MODULE_NAME}}** module, which contains these sub-modules:\n\n{{CHILDREN_DOCS}}\n\nCross-module calls: {{CROSS_MODULE_CALLS}}\nShared execution flows: {{CROSS_PROCESSES}}\n\n---\n\nWrite a concise overview of this module group. Explain its purpose, how the sub-modules fit together, and the key workflows that span them. Link to sub-module pages (e.g. `[Sub-module Name](sub-module-slug.md)`) rather than repeating their content. Use whatever structure fits best.";
export declare const OVERVIEW_SYSTEM_PROMPT = "You are a technical documentation writer. Write the top-level overview page for a repository wiki. This is the first page a new developer sees.\n\nRules:\n- Output ONLY the documentation content \u2014 no meta-commentary like \"I've written...\", \"Here's the documentation...\", \"The page has been rewritten...\", or similar\n- Start directly with the project heading and content\n- Be clear and welcoming \u2014 this is the entry point to the entire codebase\n- Reference actual module names so readers can navigate to their docs\n- Include a high-level Mermaid architecture diagram showing only the most important modules and their relationships (max 10 nodes). A new dev should grasp it in 10 seconds\n- Do NOT create module index tables or list every module with descriptions \u2014 just link to module pages naturally within the text\n- Use the inter-module edges and execution flow data for accuracy, but do NOT dump them raw";
export declare const OVERVIEW_USER_PROMPT = "Write the overview page for this repository's wiki.\n\n## Project Info\n\n{{PROJECT_INFO}}\n\n## Module Summaries\n\n{{MODULE_SUMMARIES}}\n\n## Reference Data (for accuracy \u2014 do not reproduce verbatim)\n\nInter-module call edges: {{MODULE_EDGES}}\nKey system flows: {{TOP_PROCESSES}}\n\n---\n\nWrite a clear overview of this project: what it does, how it's architected, and the key end-to-end flows. Include a simple Mermaid architecture diagram (max 10 nodes, big-picture only). Link to module pages (e.g. `[Module Name](module-slug.md)`) naturally in the text rather than listing them in a table. If project config was provided, include brief setup instructions. Structure the page however reads best.";
/**
 * Replace {{PLACEHOLDER}} tokens in a template string.
 */
export declare function fillTemplate(template: string, vars: Record<string, string>): string;
/**
 * Format file list with exports for the grouping prompt.
 */
export declare function formatFileListForGrouping(files: Array<{
    filePath: string;
    symbols: Array<{
        name: string;
        type: string;
    }>;
}>): string;
/**
 * Build a directory tree string from file paths.
 */
export declare function formatDirectoryTree(filePaths: string[]): string;
/**
 * Format call edges as readable text.
 */
export declare function formatCallEdges(edges: Array<{
    fromFile: string;
    fromName: string;
    toFile: string;
    toName: string;
}>): string;
/**
 * Format process traces as readable text.
 */
export declare function formatProcesses(processes: Array<{
    label: string;
    type: string;
    steps: Array<{
        step: number;
        name: string;
        filePath: string;
    }>;
}>): string;
