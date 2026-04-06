/**
 * File scanner — discovers source files for indexing.
 */

import { statSync } from 'fs'
import { relative, extname } from 'path'
import { globSync } from 'glob'
import type { ForgeNexusConfig } from '../types.js'

const DEFAULT_SKIP = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.map',
  '**/*.d.ts',
  '**/__pycache__/**',
  '**/vendor/**',
  '**/android/**',
  '**/ios/**',
]

const EXT_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Python
  '.py': 'python',
  // Go / Rust / Java / C#
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'csharp',
  // C / C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.hh': 'cpp',
  // Other
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.dart': 'dart',
}

export interface ScannedFile {
  path: string
  relativePath: string
  language: string
  size: number
  extension: string
}

export class FileScanner {
  private config: Required<ForgeNexusConfig>

  constructor(
    private basePath: string,
    config: ForgeNexusConfig = {},
  ) {
    this.config = {
      languages: config.languages ?? Object.keys(EXT_MAP),
      maxFileSize: config.maxFileSize ?? 512 * 1024,
      skipPatterns: config.skipPatterns ?? DEFAULT_SKIP,
      includeEmbeddings: config.includeEmbeddings ?? false,
      repoName: config.repoName ?? '',
      repoPath: config.repoPath ?? basePath,
      dbPath: config.dbPath ?? '',
    }
  }

  async scan(): Promise<ScannedFile[]> {
    const files: ScannedFile[] = []
    const exts = this.config.languages
      .map((l) => {
        if (l.startsWith('.')) return l
        const found = Object.entries(EXT_MAP).find(([, v]) => v === l)
        return found ? found[0] : null
      })
      .filter(Boolean) as string[]

    const patterns = exts.flatMap((ext) => [
      `**/*${ext}`,
      ...this.config.skipPatterns.map((s) => `!${s}`),
    ])

    const matches = globSync(patterns, {
      cwd: this.basePath,
      absolute: true,
      nodir: true,
      ignore: this.config.skipPatterns,
    })

    for (const absPath of matches) {
      try {
        const stat = statSync(absPath)
        if (stat.size > this.config.maxFileSize) continue
        const ext = extname(absPath).toLowerCase()
        const lang = EXT_MAP[ext]
        if (!lang) continue
        if (!this.config.languages.includes(lang) && !this.config.languages.includes(ext)) continue
        files.push({
          path: absPath,
          relativePath: relative(this.basePath, absPath),
          language: lang,
          size: stat.size,
          extension: ext,
        })
      } catch {
        // skip
      }
    }

    return files
  }

  detectLanguage(files: ScannedFile[]): string {
    const counts = new Map<string, number>()
    for (const f of files) counts.set(f.language, (counts.get(f.language) ?? 0) + 1)
    let max = 'unknown',
      maxCount = 0
    for (const [l, c] of counts) {
      if (c > maxCount) {
        maxCount = c
        max = l
      }
    }
    return max
  }
}
