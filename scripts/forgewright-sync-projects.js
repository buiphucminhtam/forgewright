#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const HOME = os.homedir();
const REGISTRY_PATH = path.join(HOME, '.config/forgewright/registry.json');
const FORGEWRIGHT_DIR = path.resolve(path.join(__dirname, '..'));

console.log('==================================================');
console.log('🔄 FORGEWRIGHT PROJECT SYNCER');
console.log('==================================================');

if (!fs.existsSync(REGISTRY_PATH)) {
  console.log('❌ Registry file not found. Run global setup first.');
  process.exit(1);
}

// Parse arguments
let scanDir = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scan-dir' && args[i + 1]) {
    scanDir = path.resolve(args[i + 1]);
    break;
  }
}

try {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  registry.projects = registry.projects || {};
  let modified = false;

  // If scanDir is provided, scan and register all git repositories in it
  if (scanDir) {
    if (!fs.existsSync(scanDir)) {
      console.log(`❌ Scan directory does not exist: ${scanDir}`);
      process.exit(1);
    }
    console.log(`🔍 Scanning parent directory: ${scanDir} for Git repositories...`);
    const files = fs.readdirSync(scanDir);
    for (const file of files) {
      const fullPath = path.join(scanDir, file);
      // Skip hidden files/folders or known non-projects
      if (file.startsWith('.') || file.endsWith('.bfg-report') || file === 'forgewright') {
        continue;
      }
      
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          // Check if it is a git repository
          const isGit = fs.existsSync(path.join(fullPath, '.git'));
          if (isGit) {
            if (!registry.projects[fullPath]) {
              console.log(`➕ Registering new project found during scan: ${fullPath}`);
              registry.projects[fullPath] = {
                forgewright_path: FORGEWRIGHT_DIR,
                registered_at: new Date().toISOString(),
                last_used: new Date().toISOString()
              };
              modified = true;
            }
          } else {
            // Check one level deeper for nested git repos (e.g. tiktoklive-unity/tiktoklive-unity)
            const subfiles = fs.readdirSync(fullPath);
            for (const subfile of subfiles) {
              const subPath = path.join(fullPath, subfile);
              if (fs.existsSync(path.join(subPath, '.git'))) {
                if (!registry.projects[subPath]) {
                  console.log(`➕ Registering nested project found during scan: ${subPath}`);
                  registry.projects[subPath] = {
                    forgewright_path: FORGEWRIGHT_DIR,
                    registered_at: new Date().toISOString(),
                    last_used: new Date().toISOString()
                  };
                  modified = true;
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore stats errors
      }
    }
  }

  const projects = registry.projects;
  for (const projectRoot of Object.keys(projects)) {
    // Skip home directory or invalid paths
    if (projectRoot === HOME || projectRoot === '/' || !fs.existsSync(projectRoot)) {
      continue;
    }

    console.log(`\n📂 Syncing project: ${projectRoot}`);

    // 1. Copy config files
    try {
      // Create .claude directory
      const claudeDir = path.join(projectRoot, '.claude');
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      // Copy CLAUDE.md
      const claudeMdSrc = path.join(FORGEWRIGHT_DIR, 'CLAUDE.md');
      const claudeMdDest = path.join(projectRoot, 'CLAUDE.md');
      if (fs.existsSync(claudeMdSrc)) {
        fs.copyFileSync(claudeMdSrc, claudeMdDest);
        console.log(`  ✓ Updated CLAUDE.md`);
      }

      // Copy AGENTS.md
      const agentsMdSrc = path.join(FORGEWRIGHT_DIR, 'AGENTS.md');
      const agentsMdDest = path.join(projectRoot, 'AGENTS.md');
      if (fs.existsSync(agentsMdSrc)) {
        fs.copyFileSync(agentsMdSrc, agentsMdDest);
        console.log(`  ✓ Updated AGENTS.md`);
      }

      // Copy real platform hook configs
      const copyPairs = [
        ['.claude', 'settings.json'],
        ['.gemini', 'settings.json'],
        ['.cursor', 'hooks.json'],
        ['.codex', 'config.toml']
      ];
      for (const [dir, file] of copyPairs) {
        const src = path.join(FORGEWRIGHT_DIR, dir, file);
        const destDir = path.join(projectRoot, dir);
        const dest = path.join(destDir, file);
        if (fs.existsSync(src)) {
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(src, dest);
          console.log(`  ✓ Updated ${dir}/${file}`);
        }
      }
    } catch (err) {
      console.log(`  ❌ Failed to copy configs: ${err.message}`);
    }

    // 2. Clean up submodule / duplicate forgewright folder
    const localFwDir = path.join(projectRoot, 'forgewright');
    if (fs.existsSync(localFwDir)) {
      console.log(`  🧹 Found local Forgewright folder: ${localFwDir}`);
      try {
        // Check if it's a git submodule
        const isSubmodule = fs.existsSync(path.join(projectRoot, '.gitmodules')) || 
                            fs.existsSync(path.join(localFwDir, '.git'));
        
        if (isSubmodule) {
          console.log(`  → Removing Git submodule...`);
          try {
            execSync('git submodule deinit -f forgewright', { cwd: projectRoot, stdio: 'ignore' });
          } catch (e) {}
          try {
            execSync('git rm -f forgewright', { cwd: projectRoot, stdio: 'ignore' });
          } catch (e) {}
          
          // Delete .git/modules/forgewright if it exists
          const gitModuleDir = path.join(projectRoot, '.git', 'modules', 'forgewright');
          if (fs.existsSync(gitModuleDir)) {
            fs.rmSync(gitModuleDir, { recursive: true, force: true });
          }
        }

        // Force delete the directory
        fs.rmSync(localFwDir, { recursive: true, force: true });
        console.log(`  ✓ Cleaned up duplicate Forgewright folder`);
      } catch (err) {
        console.log(`  ⚠️ Failed to fully clean up forgewright folder: ${err.message}`);
      }
    }

    // 3. Update forgewright_path in registry to point to global
    if (projects[projectRoot].forgewright_path !== FORGEWRIGHT_DIR) {
      projects[projectRoot].forgewright_path = FORGEWRIGHT_DIR;
      projects[projectRoot].updated_at = new Date().toISOString();
      modified = true;
      console.log(`  ✓ Switched path to global Forgewright: ${FORGEWRIGHT_DIR}`);
    }
  }

  if (modified) {
    registry.updated_at = new Date().toISOString();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
    console.log('\n✓ Registry updated successfully.');
  } else {
    console.log('\n✓ No registry updates needed.');
  }

  console.log('\n==================================================');
  console.log('✅ Sync Completed Successfully.');
  console.log('==================================================');
} catch (err) {
  console.error('❌ Error during synchronization:', err);
  process.exit(1);
}
