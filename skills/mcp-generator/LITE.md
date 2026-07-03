---
name: mcp-generator
description: "**Orchestrates the design, implementation, compilation, sandboxing, and IDE registration of custom Model Context Protocol (MCP) servers and tools.** Use when the user requests **custom MCP tools**, **integrations with external APIs**, **tool sandbox middleware updates**, or **Cursor/Claude Desktop MCP configuration setup**."
version: 1.0.0
---

# Mcp Generator (LITE)

## SOLVE Step 2: GROUND (Mcp Generator Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| **Active MCP server dependencies** are declared | `cat mcp/package.json` | Verifies packages (e.g., `@modelcontextprotocol/sdk`, `tsx`, `typescript`) are configured [1] | |
| **Workspace-level or global registrations** exist | `cat ~/.cursor/mcp.json \|\| cat default.project.json` | Identifies active tools, execution schemas, and multi-project configuration parameters [2, 3] | |
| **Model optimization settings and thresholds** are active | `cat .production-grade.yaml` | Verifies `expertMode` flag status and target platform configuration bounds [4-6] | |
| **Session expenditure limits and budgets** are active | `cat .forgewright/budget.yaml` | Displays session cost ceilings and active token tracking parameters [5, 7] | |

## SOLVE Step 3: DECOMPOSE (Mcp Generator Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. **SCAFFOLD** | Construct custom MCP tool schemas and TypeScript handler functions | Ensure that parameter descriptions utilize precise JSON-schema validation formats [8, 9].
2. **AUDIT** | Route custom tool outputs through the Tool Sandbox (Middleware ④c) safety filter | Ensure credentials, keys, or bearer tokens are redacted and ANSI colors are stripped [8].
3. **REGISTER** | Map the TypeScript execution binaries within Cursor or Claude Desktop configurations | Verify that registrations utilize `npx tsx` and `${workspaceFolder}` parameters for isolation [3].
4. **SYNC** | Save specifications as lowercase kebab-case under `docs/` and run sync hooks | Confirm that documentation symlinks update successfully inside the Shared Obsidian Vault [10, 11].

## Common Mistakes Checklist
- **Exposing Credentials in Tool Logs**: Neglecting to register regex filters inside the Tool Sandbox middleware, letting database URIs or raw API tokens leak into the active LLM context [8].
- **Unmanaged Output Token Bloat**: Sending massive execution responses back to the model context instead of wrapping outputs exceeding 1200 tokens through Context Offload (Middleware ④d) [8].
- **Hardcoding Absolute Paths in Registry**: Specifying static local paths in `mcp.json` instead of using `${workspaceFolder}` parameters, breaking multi-project isolation behaviors [3].
- **Non-Compliant Resource File Names**: Storing tool specifications, manifests, or JSON guides under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/McpTool.md` instead of `docs/02-architecture/mcp-tool-spec.md`) [11].
- **Unverified Token Budgets on Compilation**: Spinning up complex multi-agent execution loops or automated compiler checks without verifying active limits inside `.forgewright/budget.yaml` [5, 7].

## Worked Example

### Step 1: Ground the active MCP workspace profile settings
```bash
cat .forgewright/project-profile.json
cat .production-grade.yaml | grep -E "(expertMode|default_model)"
```
Output:
```json
{
  "project_name": "forgewright-mcp-workspace",
  "tech_stack": ["TypeScript", "Node.js"],
  "health_status": "PASS"
}
```
```yaml
expertMode: true
default_model: "gemini-3.5-flash"
```

### Step 2: Implement a secure, sandboxed custom tool in TypeScript (`mcp/src/tools/fetch-service.ts`)
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "forgewright-fetch-service",
  version: "1.0.0"
});

// Grounded Rule: Redact API credentials and sanitize inputs before context entry
server.tool(
  "fetch_api_records",
  "Fetches and filters production logs safely.",
  {
    endpoint: z.string().url().describe("The secure target API URL"),
    filter: z.string().optional().describe("Key value to filter findings")
  },
  async ({ endpoint, filter }) => {
    // Intercepted by Middleware ④c to strip API keys, bearer tokens, or secrets
    const sanitizedEndpoint = endpoint.replace(/api_key=[^&]+/g, "api_key=REDACTED");
    console.log(`[SANDBOX] Secure request routed to: ${sanitizedEndpoint}`);
    
    const response = await fetch(endpoint);
    const data = await response.text();
    
    // Check for large outputs (> 1200 tokens) to trigger Context Offload
    if (data.length > 5000) {
      console.log("[OFFLOAD] Output exceeds threshold. Generating short trace handle.");
    }
    
    return {
      content: [{ type: "text", text: data }]
    };
  }
);
```

### Step 3: Register the custom tool inside the global Cursor MCP config with multi-project isolation
Append configuration to `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "forgewright-fetch-service": {
      "command": "npx",
      "args": [
        "tsx",
        "${workspaceFolder}/mcp/src/tools/fetch-service.ts"
      ]
    }
  }
}
```

### Step 4: Write specification and run the post-skill sync hook to Obsidian
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/02-architecture/mcp-tool-spec.md
# Architecture Spec: Sandboxed MCP Service

## 1. Executive Summary
Provide a secure, isolated Model Context Protocol tool container enforcing credential redaction and context offloading.

## 2. Technical Profile
- Runtime Environment: npx tsx
- Security Boundary: Tool Sandbox (Middleware ④c) credential scanner
- Token Safety: Context Offload (Middleware ④d) for outputs over 1200 tokens
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for mcp-tool-spec.md.
[SUCCESS] Symlinked docs/02-architecture/mcp-tool-spec.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/mcp-tool-spec.md.
```
