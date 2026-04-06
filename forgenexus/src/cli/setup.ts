/**
 * setup subcommand — configure ForgeNexus for a project.
 * Installs: MCP config, git hooks, .forgeignore.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { ensureNexusDataDirMigrated, nexusDataDir } from '../paths.js'

export async function setup(): Promise<void> {
  const cwd = process.cwd()
  ensureNexusDataDirMigrated(cwd)
  const nexusDir = nexusDataDir(cwd)
  mkdirSync(nexusDir, { recursive: true })

  // ── MCP Config ──────────────────────────────────────────────────────────────
  const mcpPath = join(cwd, '.cursor', 'mcp.json')
  let mcpConfig: Record<string, any> = {}
  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'))
    } catch {
      // start fresh
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {}
  mcpConfig.mcpServers['forgenexus'] = {
    command: 'node',
    args: ['node_modules/forgenexus/dist/cli/index.js', 'mcp'],
  }

  mkdirSync(dirname(mcpPath), { recursive: true })
  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2))
  console.error(`[ForgeNexus] Updated ${mcpPath}`)

  // ── Git Hooks Directory ─────────────────────────────────────────────────────
  const gitHooksDir = join(cwd, '.git', 'hooks')
  const gitDir = join(cwd, '.git')

  if (!existsSync(gitDir)) {
    console.error('[ForgeNexus] Not a git repository — skipping hooks.')
  } else if (!existsSync(gitHooksDir)) {
    console.error('[ForgeNexus] Git hooks directory not found — skipping hooks.')
  } else {
    // ── Post-Commit Hook ───────────────────────────────────────────────────
    installHook(join(gitHooksDir, 'post-commit'), buildPostCommitHook(cwd))
    installHook(join(gitHooksDir, 'post-merge'), buildPostMergeHook(cwd))
    installHook(join(gitHooksDir, 'post-checkout'), buildPostCheckoutHook(cwd))
  }

  // ── .forgeignore template ─────────────────────────────────────────────────
  const forgeIgnorePath = join(cwd, '.forgeignore')
  if (!existsSync(forgeIgnorePath)) {
    writeFileSync(
      forgeIgnorePath,
      `# ForgeNexus Configuration
# Skip auto-reindex on specific events:
# auto-reindex

# Skip large generated files from indexing:
# generated/
# *.generated.ts
# dist/
# build/
`,
    )
    console.error(`[ForgeNexus] Created .forgeignore`)
  }

  // ── Claude Code Hooks ─────────────────────────────────────────────────────────
  const claudeSettingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json')
  const claudeHooksDir = join(process.env.HOME ?? '', '.claude', 'hooks')
  try {
    mkdirSync(dirname(claudeSettingsPath), { recursive: true })
    mkdirSync(claudeHooksDir, { recursive: true })
    writeFileSync(
      join(claudeHooksDir, 'pre-tool-use.ts'),
      readFileSync(join(__dirname, '../../.claude/hooks/pre-tool-use.ts'), 'utf8'),
    )
    writeFileSync(
      join(claudeHooksDir, 'post-tool-use.ts'),
      readFileSync(join(__dirname, '../../.claude/hooks/post-tool-use.ts'), 'utf8'),
    )
    // Update Claude Code settings to enable hooks
    let claudeSettings: Record<string, any> = {}
    if (existsSync(claudeSettingsPath)) {
      try {
        claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'))
      } catch {
        /* fresh */
      }
    }
    if (!claudeSettings['hooks-enabled']) claudeSettings['hooks-enabled'] = true
    writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2))
    console.error('[ForgeNexus] Installed Claude Code hooks (pre-tool-use, post-tool-use)')
  } catch (e) {
    console.error(
      '[ForgeNexus] Could not install Claude Code hooks (requires ~/.claude/):',
      e instanceof Error ? e.message : String(e),
    )
  }

  console.error('[ForgeNexus] Setup complete.')
  console.error("[ForgeNexus] Run 'forgenexus analyze' to index your codebase.")
  console.error(
    '[ForgeNexus] ForgeNexus will auto-incrementally reindex after every git commit/merge.',
  )
}

/**
 * Install a git hook script. Appends if hook already exists and doesn't
 * already contain our marker. Replaces if it exists and contains our marker.
 */
function installHook(hookPath: string, content: string): void {
  const marker = '### FORGENEXUS HOOK ###'
  const existingContent = existsSync(hookPath) ? readFileSync(hookPath, 'utf8') : ''

  if (existingContent.includes(marker)) {
    // Already installed — skip
    console.error(`[ForgeNexus] Hook already installed: ${hookPath}`)
    return
  }

  const newContent =
    existingContent.trim().length > 0
      ? `${existingContent}\n\n${content}\n`
      : `#!/bin/sh\n${content}\n`

  writeFileSync(hookPath, newContent, { mode: 0o755 })
  console.error(`[ForgeNexus] Installed hook: ${hookPath}`)
}

function buildPostCommitHook(cwd: string): string {
  return `### FORGENEXUS HOOK ###
# Auto-incremental reindex after git commit
# Runs non-blocking in background, preserves embeddings

FORGENEXUS_ROOT="${cwd}"

# Check if reindex is disabled
if [ -f "$FORGENEXUS_ROOT/.forgeignore" ]; then
  case "$(cat "$FORGENEXUS_ROOT/.forgeignore" 2>/dev/null)" in
    *auto-reindex*) exit 0 ;;
  esac
fi

# Find forgenexus binary
FORGENEXUS_BIN=""
if command -v forgenexus >/dev/null 2>&1; then
  FORGENEXUS_BIN="forgenexus"
elif [ -f "$FORGENEXUS_ROOT/node_modules/.bin/forgenexus" ]; then
  FORGENEXUS_BIN="$FORGENEXUS_ROOT/node_modules/.bin/forgenexus"
elif [ -f "$FORGENEXUS_ROOT/node_modules/forgenexus/dist/cli/index.js" ]; then
  FORGENEXUS_BIN="node $FORGENEXUS_ROOT/node_modules/forgenexus/dist/cli/index.js"
fi

[ -z "$FORGENEXUS_BIN" ] && exit 0

# Run incremental reindex in background (non-blocking, won't slow down git)
(
  cd "$FORGENEXUS_ROOT"
  $FORGENEXUS_BIN analyze --incremental 2>/dev/null &
  disown
) &

exit 0`
}

function buildPostMergeHook(cwd: string): string {
  return `### FORGENEXUS HOOK ###
# Auto-incremental reindex after git merge (preserves embeddings)
# Triggered when pulling/merging branches

FORGENEXUS_ROOT="${cwd}"

if [ -f "$FORGENEXUS_ROOT/.forgeignore" ]; then
  case "$(cat "$FORGENEXUS_ROOT/.forgeignore" 2>/dev/null)" in
    *auto-reindex*) exit 0 ;;
  esac
fi

FORGENEXUS_BIN=""
if command -v forgenexus >/dev/null 2>&1; then
  FORGENEXUS_BIN="forgenexus"
elif [ -f "$FORGENEXUS_ROOT/node_modules/.bin/forgenexus" ]; then
  FORGENEXUS_BIN="$FORGENEXUS_ROOT/node_modules/.bin/forgenexus"
elif [ -f "$FORGENEXUS_ROOT/node_modules/forgenexus/dist/cli/index.js" ]; then
  FORGENEXUS_BIN="node $FORGENEXUS_ROOT/node_modules/forgenexus/dist/cli/index.js"
fi

[ -z "$FORGENEXUS_BIN" ] && exit 0

# Merge can bring many new files — always do incremental after merge
(
  cd "$FORGENEXUS_ROOT"
  $FORGENEXUS_BIN analyze --incremental 2>/dev/null &
  disown
) &

exit 0`
}

function buildPostCheckoutHook(cwd: string): string {
  return `### FORGENEXUS HOOK ###
# Detect branch switches and check if reindex needed after checkout

FORGENEXUS_ROOT="${cwd}"

# Only reindex if switching branches (not on file checkout)
if [ "$3" = "1" ]; then
  # Branch checkout detected — quick check if index is stale
  if [ -f "$FORGENEXUS_ROOT/.forgenexus/codebase.db" ]; then
    (
      cd "$FORGENEXUS_ROOT"
      # Silently check if new branches added files we haven't indexed
      forgenexus status 2>/dev/null | grep -q "stale" && {
        forgenexus analyze --incremental 2>/dev/null &
        disown
      }
    ) &
  fi
fi

exit 0`
}
