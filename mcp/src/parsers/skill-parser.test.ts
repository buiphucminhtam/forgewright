import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Skill, SharedProtocol } from './skill-parser.js'

beforeEach(() => {
  vi.clearAllMocks()
})

function tempRoot(): string {
  return path.join(os.tmpdir(), `fw-sk-${Date.now()}-${Math.random()}`)
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Skill type definitions', () => {
  it('should export Skill interface with required fields', async () => {
    const skill: Skill = {
      name: 'test-skill',
      description: 'A test skill',
      filePath: '/path/to/SKILL.md',
      content: '# Test',
    }
    expect(skill.name).toBe('test-skill')
    expect(skill.description).toBe('A test skill')
  })

  it('should support optional version and tags', async () => {
    const skill: Skill = {
      name: 'test',
      description: 'desc',
      version: '1.0.0',
      tags: ['backend', 'api'],
      filePath: '/path',
      content: '# Test',
    }
    expect(skill.version).toBe('1.0.0')
    expect(skill.tags).toEqual(['backend', 'api'])
  })

  it('should export SharedProtocol interface', async () => {
    const proto: SharedProtocol = {
      name: 'protocol-test',
      description: 'desc',
      uri: 'fw://protocols/test',
      content: '# Test Protocol',
    }
    expect(proto.uri).toBe('fw://protocols/test')
  })
})

describe('getAllSkills', () => {
  it('should return empty array when skills dir does not exist', async () => {
    const root = tempRoot()
    fs.mkdirSync(path.join(root, '.forgewright'), { recursive: true })
    const { getAllSkills, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)
    // Skills dir doesn't exist under root, so getAllSkills should return []
    expect(getAllSkills()).toEqual([])
  })

  it('should discover SKILL.md files in nested directories', async () => {
    const root = tempRoot()
    const skill1Dir = path.join(root, 'skills', 'skill-one')
    const skill2Dir = path.join(root, 'skills', 'skill-two', 'nested')
    const sharedDir = path.join(root, 'skills', '_shared', 'protocols')
    fs.mkdirSync(skill1Dir, { recursive: true })
    fs.mkdirSync(skill2Dir, { recursive: true })
    fs.mkdirSync(sharedDir, { recursive: true })
    fs.writeFileSync(
      path.join(skill1Dir, 'SKILL.md'),
      '---\nname: Skill One\ndescription: First skill\n---\n# Skill One',
    )
    fs.writeFileSync(
      path.join(skill2Dir, 'SKILL.md'),
      '---\ndescription: Second skill\n---\n# Skill Two',
    )
    fs.writeFileSync(path.join(sharedDir, 'protocol-test.md'), '# Protocol')

    const { getAllSkills, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    const skills = getAllSkills()
    // Should skip _shared/protocols
    const protocols = skills.filter((s) => s.filePath.includes('_shared'))
    expect(protocols).toHaveLength(0)
    expect(skills.length).toBeGreaterThanOrEqual(2)
  })

  it('should use folder name when name not in frontmatter', async () => {
    const root = tempRoot()
    const skillDir = path.join(root, 'skills', 'my-custom-skill')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\ndescription: Custom desc\n---\n# Content',
    )

    const { getAllSkills, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    const skills = getAllSkills()
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('my-custom-skill')
    expect(skills[0].description).toBe('Custom desc')
  })

  it('should handle malformed YAML frontmatter gracefully', async () => {
    const root = tempRoot()
    const skillDir = path.join(root, 'skills', 'bad-yaml')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: bad\ndescription: [invalid yaml\n---\n# Content',
    )

    const { getAllSkills, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    // Should not throw — returns skill with fallback name
    const skills = getAllSkills()
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('bad-yaml')
  })

  it('should handle missing frontmatter', async () => {
    const root = tempRoot()
    const skillDir = path.join(root, 'skills', 'no-frontmatter')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Just a heading\nNo frontmatter here')

    const { getAllSkills, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    const skills = getAllSkills()
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('no-frontmatter')
    expect(skills[0].description).toBe('Forgewright Skill: no-frontmatter')
  })

  it('should include version and tags from frontmatter', async () => {
    const root = tempRoot()
    const skillDir = path.join(root, 'skills', 'rich-skill')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Rich Skill\ndescription: Full featured\nversion: 2.0.0\ntags:\n  - api\n  - backend\n---\n# Rich',
    )

    const { getAllSkills, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    const skills = getAllSkills()
    expect(skills[0].version).toBe('2.0.0')
    expect(skills[0].tags).toEqual(['api', 'backend'])
  })
})

describe('getSharedProtocols', () => {
  it('should return empty array when protocols dir does not exist', async () => {
    const root = tempRoot()
    fs.mkdirSync(path.join(root, '.forgewright'), { recursive: true })

    const { getSharedProtocols, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    // _shared/protocols doesn't exist, should return []
    expect(getSharedProtocols()).toEqual([])
  })

  it('should discover .md files in protocols directory', async () => {
    const root = tempRoot()
    const protocolsDir = path.join(root, 'skills', '_shared', 'protocols')
    fs.mkdirSync(protocolsDir, { recursive: true })
    fs.writeFileSync(path.join(protocolsDir, 'guardrail.md'), '# Guardrail Protocol')
    fs.writeFileSync(path.join(protocolsDir, 'brownfield-safety.md'), '# Brownfield Safety')

    const { getSharedProtocols, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    const protocols = getSharedProtocols()
    expect(protocols).toHaveLength(2)
    expect(protocols.map((p) => p.name)).toContain('protocol-guardrail')
    expect(protocols.map((p) => p.name)).toContain('protocol-brownfield-safety')
  })

  it('should assign correct URI format to protocols', async () => {
    const root = tempRoot()
    const protocolsDir = path.join(root, 'skills', '_shared', 'protocols')
    fs.mkdirSync(protocolsDir, { recursive: true })
    fs.writeFileSync(path.join(protocolsDir, 'test-protocol.md'), '# Test')

    const { getSharedProtocols, _setRootOverride } = await import('./skill-parser.js')
    _setRootOverride(root)

    const protocols = getSharedProtocols()
    expect(protocols[0].uri).toBe('fw://protocols/test-protocol')
  })
})

describe('FrontmatterSchema', () => {
  it('should accept all valid frontmatter fields', async () => {
    const { FrontmatterSchema } = await import('./skill-parser.js')
    const result = FrontmatterSchema.safeParse({
      name: 'test',
      description: 'desc',
      version: '1.0.0',
      tags: ['a', 'b'],
    })
    expect(result.success).toBe(true)
  })

  it('should accept empty object', async () => {
    const { FrontmatterSchema } = await import('./skill-parser.js')
    const result = FrontmatterSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should reject non-string name', async () => {
    const { FrontmatterSchema } = await import('./skill-parser.js')
    const result = FrontmatterSchema.safeParse({ name: 123 })
    expect(result.success).toBe(false)
  })

  it('should reject non-array tags', async () => {
    const { FrontmatterSchema } = await import('./skill-parser.js')
    const result = FrontmatterSchema.safeParse({ tags: 'not-an-array' })
    expect(result.success).toBe(false)
  })
})
