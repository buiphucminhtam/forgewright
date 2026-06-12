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

try {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const projects = registry.projects || {};
  let modified = false;

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

      // Copy hooks.yml
      const hooksSrc = path.join(FORGEWRIGHT_DIR, '.claude', 'hooks.yml');
      const hooksDest = path.join(claudeDir, 'hooks.yml');
      if (fs.existsSync(hooksSrc)) {
        fs.copyFileSync(hooksSrc, hooksDest);
        console.log(`  ✓ Updated .claude/hooks.yml`);
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
