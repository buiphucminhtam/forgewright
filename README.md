<!-- markdownlint-disable MD013 MD033 -->
# Forgewright — AI Orchestrator That Actually Learns

<p align="center">
  <img src="assets/forgewright-banner.png" alt="Forgewright Banner" width="600" />
</p>

<p align="center">
  <a href="https://github.com/buiphucminhtam/forgewright">
    <img src="https://img.shields.io/github/stars/buiphucminhtam/forgewright?style=flat-square&logo=github&label=Stars" alt="Stars" />
  </a>
  <a href="https://github.com/buiphucminhtam/forgewright/network/members">
    <img src="https://img.shields.io/github/forks/buiphucminhtam/forgewright?style=flat-square&logo=github&label=Forks" alt="Forks" />
  </a>
  <img src="https://img.shields.io/badge/version-8.7.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/skills-83-brightgreen?style=flat-square" alt="Skills" />
  <img src="https://img.shields.io/badge/MCP-Supported-purple?style=flat-square" alt="MCP Supported" />
  <img src="https://img.shields.io/badge/Architecture-Agentic_Framework-orange?style=flat-square" alt="Agentic Framework" />
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
  </a>
</p>

---

> **The AI that gets smarter every time it fails.** Unlike other AI assistants, Forgewright doesn't repeat the same mistakes. It learns.

Forgewright is an open-source, production-grade harness that turns raw LLMs (Claude, Gemini, GPT) into reliable engineering agents. It coordinates complex software delivery through a strict pipeline of definition, building, hardening, and shipping, using multi-agent parallel execution.

---

## Why Forgewright / Who It Is For

Raw language models are only a small part of a functional AI coding agent. Without a disciplined framework, agents hallucinate, lose context, and repeat errors. Forgewright wraps AI execution in an uncompromising delivery harness designed for professional engineering teams.

### Key Outcomes

- **Never repeats a mistake**: The Adaptive Self-Improving Protocol (ASIP) decays failing logic paths and hardcodes learned lessons into the system.
- **Project-Specific Memory**: Uses a local SQLite GraphRAG cognitive database (FluxMem) to instantly recall your exact stack, preventing generic "textbook" code.
- **Pipeline Execution**: Bypasses the "chat" paradigm. Requests undergo a strict requirements-gathering and testing lifecycle before code is written.
- **Enterprise-Grade Testing**: Native integration with Property-Based Testing, Mutation Testing, and Visual Regression guarantees zero escaped bugs.
- **Local-First Privacy**: Your code and prompts never leave your local machine.

### Who It Is For

- **Senior Engineers** needing an intelligent rubber-duck and rapid prototyping agent.
- **Development Teams** looking to automate repetitive boilerplate, refactoring, and test generation.
- **QA Engineers** desiring robust autonomous integration tests.

**[Read the Full Product Overview ➔](docs/product-overview.md)**

---

## 30-Second Example

Forgewright takes abstract prompts and manages the complete lifecycle autonomously.

```text
You: "Build a React login form with JWT auth"

Forgewright responds:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤔 INTERPRETING...
   Intent: Feature request
   Mode: Feature
   Confidence: HIGH

📋 PLANNING (Plan Quality Loop)...
   Score: 9.5/10 ✓

⚡ EXECUTING...
   [████████████████████░░░░] 85%
   
   ✓ Component created (auth/LoginForm.tsx)
   ✓ JWT middleware added
   ✓ Unit tests written (3 passing)
   ✓ Security audit passed

✅ DONE (Score: 92/100)
   • 4 files created
   • All tests passing
   • No security issues
   • Ready for production

💡 Lesson learned: JWT refresh token rotation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Unlike basic AI chat interfaces, Forgewright didn't just give you a snippet to copy and paste. It created the files, updated the tests, evaluated the security implications, and confirmed that the module built successfully—all locally.

---

## Prerequisites and Quick Start

Forgewright is designed to run locally alongside your preferred IDE and development stack. It operates primarily as a Model Context Protocol (MCP) server, integrating seamlessly into modern AI-assisted editors.

### Prerequisites

Please ensure the following dependencies are installed and available in your system path:

- **Node.js**: v18.x or higher (required for GitNexus and MCP servers).
- **Git**: v2.30+ (required for repository management and history tracking).
- **Python**: v3.8+ (required for the FluxMem SQLite GraphRAG memory layer).
- **Supported IDE**: Cursor, Claude Desktop, or Codex CLI.

### Verified Install Paths for Supported IDEs

For the best experience, we recommend using Forgewright in **Cursor** or **Claude Desktop** via the Model Context Protocol (MCP). The following setup flow integrates Forgewright directly into your target repository as a submodule. This allows it to track your project's unique configuration securely and persistently across different developer machines.

#### Step 1: Clone Forgewright as a Git Submodule

Integrating Forgewright directly into your target repository allows it to maintain a project-specific memory bank and execution context. Open your terminal, navigate to the root of your project repository, and execute the following commands:

```bash
cd /path/to/your-project
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git forgewright
git submodule update --init --recursive
```

#### Step 2: Install and Configure GitNexus

GitNexus powers Forgewright's static code intelligence and impact analysis. It allows the AI to understand the relationships between different modules in your codebase without needing to read every file into its context window.

```bash
npm install -g gitnexus
gitnexus setup
gitnexus analyze
```

The `analyze` step builds the initial structural graph of your project. You should re-run `gitnexus analyze` whenever you introduce significant architectural changes.

#### Step 3: Run the MCP Setup Script

The MCP setup script automatically configures your local environment to recognize Forgewright's capabilities. It modifies the necessary configuration files for Claude Desktop, Cursor, Antigravity, and Codex CLI.

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh
```

#### Step 4: Initialize the Required Rules and Constraints

Forgewright relies on strict system prompts to maintain its behavioral constraints. You must copy these rule files to the root of your project so that your IDE's AI assistant can read them automatically upon initialization.

```bash
cp forgewright/AGENTS.md .
cp forgewright/CLAUDE.md .
```

*Final Step:*
You must restart your IDE completely (e.g., CMD+Q on Mac) to force it to load the newly installed MCP servers. Once the IDE has restarted, open your AI chat panel and verify the installation by running `/onboard`.

---

## Four Operating Levels

Forgewright adapts to the scale of your project, offering different tiers of autonomy and intelligence based on the complexity of your requirements. You can start small and progressively enable more advanced features as your project matures.

| Level | Features | Setup Required | Best For |
| --- | --- | --- | --- |
| **Level 1**<br/>Zero Setup | Basic chat, 83 auto-activated skills | Just run your AI chat | Quick questions, single-file scripts |
| **Level 2**<br/>Code Intelligence | `gitnexus_impact`, `gitnexus_query`, `gitnexus_rename` | `gitnexus setup` | Refactoring, code reviews, debugging |
| **Level 3**<br/>GraphRAG Memory | Persistent local knowledge, automatic lesson retention | Python 3.8+ | Long-running projects, complex domains |
| **Level 4**<br/>Full Power | Parallel dispatch, multi-repo support, full pipeline orchestration | MCP Setup script | Team projects, end-to-end autonomous dev |

### How to Access Different Levels

#### Level 1: Zero Setup

By default, executing Forgewright places you in Level 1. The agent will rely primarily on its base instructions and standard conversational abilities, using standard MCP tools for basic file reads and writes.

#### Level 2: Code Intelligence

To utilize Level 2 Code Intelligence, ensure `gitnexus` is installed globally and your project is indexed. Whenever you ask the agent to refactor code, it will autonomously invoke the code intelligence layer (`gitnexus_impact`) before making changes.

#### Level 3: GraphRAG Memory

Level 3 requires Python 3.8+ and initializes the `.forgewright/memory.db` local database. This level allows the orchestrator to automatically extract architectural decisions and record them for future sessions, effectively building a persistent brain for your codebase.

#### Level 4: Full Power

Level 4 unlocks the Parallel Dispatch workflows and the complete multi-agent pipeline. It requires the MCP server to be fully configured in your IDE. At this level, the orchestrator acts as an autonomous engineering team, breaking complex tasks into sub-tasks and executing them in isolated Git worktrees.

---

## Core Capabilities

Forgewright bundles advanced software engineering workflows into focused, accessible tools that run directly inside your local environment.

### 1. Code Intelligence (GitNexus)

Forgewright utilizes GitNexus to construct a deep structural graph of your codebase. This ensures the AI never edits a symbol without first understanding its upstream blast radius and upstream impact. It replaces naive keyword searches with semantic relationship queries.
**[Read the GitNexus Guide ➔](docs/guides/gitnexus.md)**

### 2. Autonomous Testing Stack

Automated shifting-left test logic. Property-Based Testing (PBT), mutation testing, and Appium/Maestro integration ensure the AI writes comprehensive tests before writing implementations. The orchestrator will not merge code that decreases total test coverage.
**[Read the Testing Stack Guide ➔](docs/guides/testing-stack.md)**

### 3. Persistent Cognitive Memory (FluxMem)

Your agent remembers past architectural decisions across sessions. Uses a local SQLite layer-2 knowledge graph for instantaneous context retrieval, automatically pruning irrelevant data to keep context windows lean.
**[Read the FluxMem Guide ➔](docs/guides/fluxmem.md)**

### 4. Parallel Skill Dispatch

Executes independent QA, Build, and Review steps concurrently across Git worktrees. This parallelization drastically reduces waiting time and token context bloat by isolating tasks to specialized sub-agents.
**[Read the Parallel Dispatch Guide ➔](docs/guides/parallel-dispatch.md)**

### 5. Multi-Project Hub

A unified management dashboard for handling multiple projects simultaneously. Monitor agent states, active execution pipelines, and Git diffs across your entire organization from one unified web portal.
**[Read the Multica Hub Guide ➔](docs/guides/multica-hub.md)**

### 6. Token Tracking & Cost Analytics

Track your LLM usage, API costs, and optimization opportunities in real-time. Set daily limits and alerts to avoid runaway API bills caused by autonomous looping behaviors.
**[Read the Token Management Guide ➔](docs/guides/token-management.md)**

### 7. MCP Tool Sandbox

The Tool Sandbox (DeerFlow IV) automatically intercepts all tool output, strips ANSI colors, scans for prompt injections, and redacts credentials or secrets before they enter the model context or cache.
**[Read the Tool Sandbox Guide ➔](docs/guides/tool-sandbox.md)**

### 8. The Adaptive Self-Improving Protocol (ASIP)

ASIP automatically detects plan and execution failures, triggers deep research using NotebookLM or web fallbacks, and adapts the system's operational procedures.
**[Read the ASIP Guide ➔](docs/guides/asip.md)**

---

## Architecture and Safety Model

The Forgewright pipeline revolves around predictable constraint enforcement, operating on a rigid loop designed to prevent AI hallucinations from polluting the main branch:
`INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

### Verification and Safety Layers

- **Evidence-Gated Logic**: The kernel uses script-layer verification to enforce proof of success. If a test suite doesn't pass locally, the AI cannot claim the task is done. There are no self-attested successes.
- **Strict Guardrails**: Every tool call passes through Middleware interceptors. Destructive shell commands, raw database overwrites, and unauthorized path edits are blocked before they are executed by the underlying operating system.
- **Execution Blockers**: When the AI encounters the same error multiple times, the orchestration kernel halts the active thread and forces a context reset, breaking infinite loops.
- **Visual Validation**: For UI changes, the AI must explicitly capture layout regressions and perform visual verification against established design tokens.

**[Read the Full Architecture Document ➔](docs/architecture.md)**

---

## Common Workflows

Forgewright automates extensive routine workflows via slash commands and integrated CLI tools.

### Generate a Project Profile

Once setup is complete, run the onboarding workflow to establish a baseline. In your AI chat, type:

```text
/onboard
```

*Creates a `.forgewright/project-profile.json` detailing your stack, coding conventions, and existing tech debt.*

### Parallel AI Worktrees

Run multiple tasks concurrently via the command line manager to speed up large refactors.

```bash
bash scripts/worktree-manager.sh --parallel 4 "build,test,deploy"
```

### Check Quality Gate Status

Score your repository health locally before committing changes to the main branch.

```bash
bash scripts/forge-validate.sh
```

### Sync Documentation to Shared Obsidian Wiki

Easily publish your architectural records to a centralized Obsidian vault for your team.

```bash
./scripts/forgewright-wiki-sync.sh
```

### Analyze Token Budget

Review your LLM expenditures and current usage limits.

```bash
forge token report --period week
```

---

## Troubleshooting and FAQ

### MCP server not responding in Cursor/Claude

- Restart your IDE completely. Ensure no background zombie node processes are locking the socket.
- Run `bash scripts/forgewright-mcp-setup.sh --force` to regenerate configuration files.
- Verify Node v18+ is installed via `node -v` and accessible in your default path.

### The GitNexus index is stale / Impact analysis fails

- Run `gitnexus analyze` manually in your terminal to refresh the static index, then retry the command in your IDE.

### How do I disable automatic memory persistence?

- You can clear your active context by running `bash scripts/memory-hygiene.sh` or deleting the `.forgewright/memory.db` file.

### The Orchestrator is stuck in a loop trying to fix a bug

- The ASIP protocol should catch this after 2-3 failures and enforce research. If it doesn't, tell the agent directly: `"Stop. Reset context and read the ASIP lessons."`

### Dependencies missing during parallel execution

- Ensure you have executed `npm install` inside the root workspace and that `.gitignore` permits sharing `node_modules` via symlink in the worktree configuration.

**[See Full Troubleshooting Guide ➔](docs/troubleshooting/common-issues.md)**

---

## Documentation Map

- **[Product Overview](docs/product-overview.md)**: Product capabilities and long-term vision.
- **[Architecture](docs/architecture.md)**: Deep dive into the orchestrator pipeline and safety model.
- **[Active Roadmap](docs/active-roadmap.md)**: Upcoming features and planned upgrades.
- **[Script Catalog](docs/reference/script-catalog.md)**: List of available utility scripts.
- **[Protocol Catalog](docs/reference/protocol-catalog.md)**: Standardized interaction models and constraints.
- **[Security Practices](.forgewright/security/README.md)**: Security scanner and vulnerability detection.
- **[Advanced Guides](docs/guides/gitnexus.md)**: Detailed instructions for GitNexus, parallel dispatch, and testing.
- **[Changelog](CHANGELOG.md)**: Release history.

---

## Contributing, Support, License

**Contributing:**

We welcome contributions! Please check the [good first issues](https://github.com/buiphucminhtam/forgewright/issues) and read the contributor guidelines.

1. Fork the repo and create a branch.
2. Commit your changes via `git commit -m 'feat: description'`.
3. Open a Pull Request for review.

**Support & Analytics:**

If Forgewright has accelerated your workflow or saved your team time, consider supporting the project:

<p align="left">
  <img src="assets/donate/give-me-a-coffee-international.png" width="200" alt="Buy Me a Coffee" />
</p>

**License:**

Forgewright is released under the [MIT License](https://opensource.org/licenses/MIT).

<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
<!-- padding -->
