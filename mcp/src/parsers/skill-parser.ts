import fs from 'fs'
import { dirname, join, basename, resolve } from 'path'
import { fileURLToPath } from 'url'
import * as jsyaml from 'js-yaml'
import { z } from 'zod'
import { getErrorMessage } from '../errors.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// DEV: __dirname = FORGEWRIGHT/mcp/build/parsers
// PROD: __dirname = FORGEWRIGHT/mcp/build/parsers
// Either way, we navigate up 3 levels from the parsers dir
const MCP_BUILD_DIR = dirname(__dirname) // FORGEWRIGHT/mcp/build
const MCP_ROOT_DIR = dirname(MCP_BUILD_DIR) // FORGEWRIGHT/mcp
const FORGEWRIGHT_ROOT = dirname(MCP_ROOT_DIR) // FORGEWRIGHT

let resolvedRoot: string | null = null

function getResolvedRoot(): string {
  if (resolvedRoot !== null) return resolvedRoot

  // Env var takes priority (useful for testing / custom deployments)
  const envRoot = process.env.FORGEWRIGHT_ROOT
  if (envRoot) {
    resolvedRoot = resolve(envRoot)
    return resolvedRoot
  }

  try {
    resolvedRoot = fs.realpathSync(FORGEWRIGHT_ROOT)
  } catch {
    resolvedRoot = FORGEWRIGHT_ROOT
  }
  return resolvedRoot
}

/**
 * Override the resolved root path (useful for testing).
 * Resets the cached value so getAllSkills/getSharedProtocols
 * pick up the new path on next call.
 */
export function _setRootOverride(root: string): void {
  resolvedRoot = resolve(root)
}

function getSkillsDir(): string {
  return join(getResolvedRoot(), 'skills')
}

// ─── Zod Schemas ─────────────────────────────────────────────────────

export const FrontmatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export type FrontmatterData = z.infer<typeof FrontmatterSchema>

export interface Skill {
  name: string
  description: string
  version?: string
  tags?: string[]
  filePath: string
  content: string
}

export interface SharedProtocol {
  name: string
  description: string
  uri: string
  content: string
}

// ─── YAML Frontmatter Parser ─────────────────────────────────────────

function parseFrontmatter(content: string): { data: FrontmatterData; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { data: {}, body: content }
  }

  const [, yamlString, body] = match
  try {
    const raw = jsyaml.load(yamlString)
    const data = FrontmatterSchema.parse(raw)
    return { data, body }
  } catch {
    // YAML malformed — fall back to empty data
    console.error('[Forgewright Global MCP] Failed to parse YAML frontmatter, ignoring frontmatter')
    return { data: {}, body: content }
  }
}

// ─── Skill Discovery ─────────────────────────────────────────────────

function findAllSkillFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList

  const files = fs.readdirSync(dir)
  for (const file of files) {
    const filePath = join(dir, file)
    if (fs.statSync(filePath).isDirectory()) {
      findAllSkillFiles(filePath, fileList)
    } else if (file === 'SKILL.md') {
      fileList.push(filePath)
    }
  }
  return fileList
}

export function getAllSkills(): Skill[] {
  if (!fs.existsSync(getSkillsDir())) {
    console.error(`[Forgewright Global MCP] Skills directory not found: ${getSkillsDir()}`)
    return []
  }

  const skillFiles = findAllSkillFiles(getSkillsDir())
  const skills: Skill[] = []

  for (const filePath of skillFiles) {
    if (filePath.includes('_shared/protocols')) continue

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const { data } = parseFrontmatter(content)

      const folderName = basename(dirname(filePath))
      const name = data.name || folderName
      const description = data.description || `Forgewright Skill: ${name}`

      skills.push({
        name,
        description,
        version: data.version,
        tags: data.tags,
        filePath,
        content,
      })
    } catch (e: unknown) {
      console.error(
        `[Forgewright Global MCP] Failed to read skill: ${filePath}`,
        getErrorMessage(e),
      )
    }
  }

  return skills
}

export function getSharedProtocols(): SharedProtocol[] {
  const protocolsDir = join(getSkillsDir(), '_shared', 'protocols')
  if (!fs.existsSync(protocolsDir)) return []

  const files = fs.readdirSync(protocolsDir).filter((f) => f.endsWith('.md'))
  const protocols: SharedProtocol[] = []

  for (const file of files) {
    const filePath = join(protocolsDir, file)
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const protocolId = file.replace('.md', '')

      protocols.push({
        name: `protocol-${protocolId}`,
        description: `Forgewright Shared Protocol: ${protocolId}`,
        uri: `fw://protocols/${protocolId}`,
        content,
      })
    } catch (e: unknown) {
      console.error(
        `[Forgewright Global MCP] Failed to read protocol: ${filePath}`,
        getErrorMessage(e),
      )
    }
  }

  return protocols
}
