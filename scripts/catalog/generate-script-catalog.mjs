import fs from 'fs';
import path from 'path';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const OUTPUT_FILE = path.join(process.cwd(), 'docs', 'scripts.md');
const REFERENCE_OUTPUT_FILE = path.join(process.cwd(), 'docs', 'reference', 'script-catalog.md');
const README_FILE = path.join(SCRIPTS_DIR, 'README.md');

// Extract first block comment or contiguous line comments as description
function extractDescription(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        let descLines = [];
        for (let i = 0; i < lines.length && i < 20; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#!') || line.startsWith('echo "WARNING:') || line.startsWith('import') || line.startsWith('const')) continue;
            if (line.startsWith('# ') || line.startsWith('// ')) {
                descLines.push(line.replace(/^[#/]+\s*/, ''));
            } else if (descLines.length > 0) {
                break;
            }
        }
        return descLines.join(' ') || 'No description provided.';
    } catch (e) {
        return 'Unable to read file.';
    }
}

function generateCatalog() {
    let md = '# Script Catalog\n\nThis catalog is auto-generated.\n\n';
    
    const domains = fs.readdirSync(SCRIPTS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.') && dirent.name !== '__pycache__')
        .map(dirent => dirent.name)
        .sort();

    let totalScripts = 0;

    for (const domain of domains) {
        const domainPath = path.join(SCRIPTS_DIR, domain);
        const files = fs.readdirSync(domainPath)
            .filter(f => /\.(sh|py|js|ts|mjs|html)$/.test(f))
            .sort();
            
        if (files.length === 0) continue;

        md += `## ${domain}\n\n`;
        md += `| Script | Description |\n|---|---|\n`;
        
        for (const file of files) {
            const filePath = path.join(domainPath, file);
            let desc = extractDescription(filePath);
            desc = desc.replace(/\|/g, '\\|');
            md += `| \`${file}\` | ${desc} |\n`;
            totalScripts++;
        }
        md += '\n';
    }
    
    const isCheckMode = process.argv.includes('--check');
    const filesToWrite = [OUTPUT_FILE, REFERENCE_OUTPUT_FILE];
    let driftFound = false;

    for (const file of filesToWrite) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        
        if (isCheckMode) {
            if (fs.existsSync(file)) {
                const existingContent = fs.readFileSync(file, 'utf8');
                if (existingContent !== md) {
                    driftFound = true;
                    console.error(`Drift detected in ${file}`);
                }
            } else {
                driftFound = true;
                console.error(`File missing: ${file}`);
            }
        } else {
            fs.writeFileSync(file, md);
            console.log(`Updated ${file}`);
        }
    }

    // Update scripts/README.md
    const readmeContent = `# Scripts Directory

This directory contains utility scripts, deployment automation, and testing harnesses.

Scripts are categorized into domain-specific subdirectories. 
For a complete inventory, see the [Script Catalog](../docs/reference/script-catalog.md).

## Compatibility Policy

Externally documented root-level scripts will retain forwarding shims for one release to aid migration.
Please update any automated CI workflows to use the new domain paths (e.g., \`scripts/ci/run-self-tests.sh\`).

## Adding new scripts

1. Place the script in the appropriate domain subdirectory.
2. Add a short description as a comment block at the top of the script.
3. Run \`node scripts/catalog/generate-script-catalog.mjs\` to update the catalog.
`;

    if (isCheckMode) {
        if (fs.existsSync(README_FILE)) {
            const existingReadme = fs.readFileSync(README_FILE, 'utf8');
            if (existingReadme !== readmeContent) {
                driftFound = true;
                console.error(`Drift detected in ${README_FILE}`);
            }
        } else {
            driftFound = true;
            console.error(`File missing: ${README_FILE}`);
        }
    } else {
        fs.writeFileSync(README_FILE, readmeContent);
        console.log(`Updated ${README_FILE}`);
    }

    if (isCheckMode && driftFound) {
        process.exit(1);
    }
}

generateCatalog();
