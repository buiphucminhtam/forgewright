import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const githubPath = process.env.GITHUB_PATH || '/Users/buiphucminhtam/GitHub';
  const projects: Array<{
    name: string;
    path: string;
    hasForgewright: boolean;
    hasMCP: boolean;
    hasGit: boolean;
  }> = [];

  try {
    const entries = await readdir(githubPath);

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      
      const fullPath = join(githubPath, entry);
      
      try {
        const s = await stat(fullPath);
        if (!s.isDirectory()) continue;

        const hasGit = existsSync(join(fullPath, '.git'));
        const hasForgewright = existsSync(join(fullPath, 'forgewright'));
        const hasMCP = existsSync(join(fullPath, '.antigravity/mcp-manifest.json'));

        // Only include projects with git or forgewright
        if (hasGit || hasForgewright) {
          projects.push({
            name: entry,
            path: fullPath,
            hasForgewright,
            hasMCP,
            hasGit,
          });
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  } catch (error) {
    console.error('Error scanning projects:', error);
    return NextResponse.json({ error: 'Failed to scan projects' }, { status: 500 });
  }

  // Sort: Forgewright first, then by name
  projects.sort((a, b) => {
    if (a.hasForgewright && !b.hasForgewright) return -1;
    if (!a.hasForgewright && b.hasForgewright) return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    projects,
    total: projects.length,
    withForgewright: projects.filter(p => p.hasForgewright).length,
    withMCP: projects.filter(p => p.hasMCP).length,
    scannedAt: new Date().toISOString(),
  });
}
