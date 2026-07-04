---
name: unity-mcp
description: "Orchestrates Model Context Protocol (MCP) server integrations for Unity projects, exposing C# classes, assemblies, serialization structures, and active editor APIs to the AI agent. Use when the user requests Unity codebase indexing, custom MCP tool integrations, editor-to-agent socket bridges, or workspace registrations."
version: 1.0.0
---

# Unity Mcp (LITE)

## SOLVE Step 2: GROUND (Unity Mcp Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target IDE configuration (Cursor, Claude Desktop) is readable and writable | `cat ~/.cursor/mcp.json \| jq '.mcpServers["unity-mcp"]'` | ... | run the check command and paste output |
| Project-specific Antigravity manifest or assembly definitions exist | `find . -name "*.asmdef" -o -name "mcp-manifest.json"` | ... | run the check command and paste output |
| Local Unity socket bridge endpoints are active or listening | `ss -tlnp \| grep -E "(5000\|3000)"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Unity Mcp Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. CONFIGURE | Inject the specialized Unity MCP config block into the active platform configurations | Ensure standard workspace placeholder tokens (`${workspaceFolder}`) are applied dynamically.
2. COMPILE | Register C# custom Reflection Tool DLLs or Editor helper scripts inside the Unity project | Confirm zero C# compiler warnings are present when generating active assembly manifests.
3. BRIDGE | Establish TCP loopback or socket channels to the active Unity Editor process | Verify that the Unity editor-agent handshakes resolve cleanly without triggering CORS or permission blocks.

## Common Mistakes Checklist
- **Hardcoded Workspace Paths**: Specifying absolute, machine-specific paths inside `mcp.json` instead of using the workspace-agnostic `${workspaceFolder}` token, breaking configurations across teammate machines.
- **Dangling Editor Ports**: Neglecting to tear down previous TCP loopback processes on server restart, producing `EADDRINUSE` port collision errors on subsequent connections.
- **Stale Assembly Graphs**: Exposing C# properties without updating the underlying GitNexus symbol indexes, leading to AI agents generating code targeting nonexistent classes.
- **Unbounded Class Metadata Bloat**: Dumping raw, unparsed reflection assemblies directly into active chat streams instead of implementing the 1200-token offloading constraint.
- **Non-Compliant Resource Directories**: Saving MCP architectures or API documentation under `docs/` using CamelCase instead of lowercase kebab-case naming rules.

### Step 1: Inspect the global MCP configurations
```bash
cat ~/.cursor/mcp.json
```

### Step 2: Create a lightweight Unity-MCP metadata parser inside `mcp/src/unity-server.ts`
```typescript
import { McpServer } from '@modelcontextprotocol/sdk';

const server = new McpServer({
  name: 'unity-mcp-server',
  version: '1.0.0'
});

// Tool exposes Unity C# SerializedFields layout to the agent context
server.tool('get-component-schema', async () => {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        component: "Forgewright.Core.PlayerController",
        serializedFields: [
          { name: "moveSpeed", type: "System.Single", tooltip: "Kinematic velocity multiplier" },
          { name: "rigidBody", type: "UnityEngine.Rigidbody", tooltip: "Cached physics context" }
        ]
      })
    }]
  };
});

console.log('[MCP] Unity metadata bridge server running.');
```
