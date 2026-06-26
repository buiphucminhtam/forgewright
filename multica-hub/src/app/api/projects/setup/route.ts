import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export async function POST(request: Request) {
  try {
    const { projectPath, action } = await request.json();

    if (!projectPath) {
      return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
    }

    // Check if forgewright exists
    const forgewrightPath = `${projectPath}/forgewright`;
    const hasForgewright = existsSync(forgewrightPath);
    const mcpManifest = `${projectPath}/.antigravity/mcp-manifest.json`;

    const result = {
      projectPath,
      action,
      hasForgewright,
      hasMCP: existsSync(mcpManifest),
      success: false,
      message: '',
      details: [] as string[],
    };

    if (action === 'init-forgewright') {
      if (!hasForgewright) {
        // Initialize forgewright as submodule
        try {
          execFileSync('git', ['submodule', 'add', 'https://github.com/buiphucminhtam/forgewright.git', 'forgewright'], {
            cwd: projectPath,
            stdio: 'pipe',
          });
          result.details.push('Forgewright submodule added');
          result.hasForgewright = true;
        } catch (error: any) {
          result.message = `Failed to add forgewright: ${error.message}`;
          return NextResponse.json(result, { status: 500 });
        }
      }

      // Run setup
      try {
        const setupScript = `${forgewrightPath}/scripts/forgewright-mcp-setup.sh`;
        if (existsSync(setupScript)) {
          const output = execFileSync('bash', [setupScript], {
            cwd: projectPath,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
          result.details.push('MCP setup completed');
          result.details.push(output.substring(0, 500));
        }
      } catch (error: any) {
        result.details.push(`Setup warning: ${error.message?.substring(0, 200) || 'Unknown error'}`);
      }

      result.hasForgewright = existsSync(forgewrightPath);
      result.hasMCP = existsSync(mcpManifest);
      result.success = true;
      result.message = 'Forgewright and MCP setup completed';
      return NextResponse.json(result);
    }

    if (action === 'setup-mcp') {
      // Run only MCP setup
      if (!hasForgewright) {
        result.message = 'Forgewright not found. Run init-forgewright first.';
        return NextResponse.json(result, { status: 400 });
      }

      try {
        const setupScript = `${forgewrightPath}/scripts/forgewright-mcp-setup.sh`;
        if (existsSync(setupScript)) {
          const output = execFileSync('bash', [setupScript], {
            cwd: projectPath,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
          result.details.push('MCP setup completed');
          result.success = true;
          result.message = 'MCP setup completed';
        } else {
          result.message = 'Setup script not found';
        }
      } catch (error: any) {
        result.message = `Setup failed: ${error.message?.substring(0, 200) || 'Unknown error'}`;
        result.hasForgewright = existsSync(forgewrightPath);
        result.hasMCP = existsSync(mcpManifest);
        return NextResponse.json(result, { status: 500 });
      }

      result.hasForgewright = existsSync(forgewrightPath);
      result.hasMCP = existsSync(mcpManifest);
      return NextResponse.json(result);
    }

    if (action === 'check-status') {
      // Just return current status
      if (existsSync(mcpManifest)) {
        try {
          const manifest = JSON.parse(readFileSync(mcpManifest, 'utf-8'));
          result.details.push(`Manifest version: ${manifest.manifest_version || 'unknown'}`);
          result.details.push(`Servers: ${manifest.servers?.length || 0}`);
        } catch {
          result.details.push('Manifest exists but invalid');
        }
      }
      result.hasForgewright = existsSync(forgewrightPath);
      result.hasMCP = existsSync(mcpManifest);
      result.success = true;
      result.message = 'Status checked';
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Setup error:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  // Return available actions
  return NextResponse.json({
    actions: [
      { id: 'init-forgewright', label: 'Init Forgewright + MCP', description: 'Add forgewright submodule and setup MCP' },
      { id: 'setup-mcp', label: 'Setup MCP Only', description: 'Run MCP setup for existing forgewright' },
      { id: 'check-status', label: 'Check Status', description: 'Verify current setup status' },
    ],
  });
}
