import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const protocolsDir = path.join(process.cwd(), 'skills', '_shared', 'protocols');
const catalogFile = path.join(process.cwd(), 'docs', 'reference', 'protocol-catalog.md');

function readProtocols() {
  const files = fs.readdirSync(protocolsDir);
  const protocols = [];

  for (const file of files) {
    if (!file.endsWith('.md') || file === 'README.md') continue;

    const content = fs.readFileSync(path.join(protocolsDir, file), 'utf-8');
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (yamlMatch) {
      try {
        const metadata = yaml.parse(yamlMatch[1]);
        protocols.push(metadata);
      } catch (e) {
        console.error(`Error parsing YAML in ${file}:`, e);
      }
    }
  }

  // Deterministic sorting by ID
  return protocols.sort((a, b) => a.id.localeCompare(b.id));
}

function generateMarkdown(protocols) {
  let md = `# Protocol Catalog\n\n`;
  md += `This document is auto-generated from the YAML frontmatter in \`skills/_shared/protocols/\`. **Do not edit manually.**\n\n`;

  // Counts by Status
  const statusCounts = {};
  const ownerCounts = {};

  for (const p of protocols) {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    for (const owner of p.owners || []) {
      ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
    }
  }

  md += `## Summary Counts\n\n`;
  md += `### By Status\n\n`;
  for (const status of Object.keys(statusCounts).sort()) {
    md += `- **${status}**: ${statusCounts[status]}\n`;
  }

  md += `\n### By Owner\n\n`;
  for (const owner of Object.keys(ownerCounts).sort()) {
    md += `- **${owner}**: ${ownerCounts[owner]}\n`;
  }

  md += `\n## All Protocols\n\n`;
  md += `| ID | Title | Status | Owners | Summary |\n`;
  md += `|----|-------|--------|--------|---------|\n`;

  for (const p of protocols) {
    const owners = (p.owners || []).join(', ');
    md += `| \`${p.id}\` | [${p.title}](../../skills/_shared/protocols/${p.id}.md) | ${p.status} | ${owners} | ${p.summary} |\n`;
  }

  md += `\n## Triggers and Consumers\n\n`;
  md += `| ID | Triggers | Used By | Related |\n`;
  md += `|----|----------|---------|---------|\n`;

  for (const p of protocols) {
    const triggers = (p.triggers || []).join(', ') || '-';
    const usedBy = (p.used_by || []).join(', ') || '-';
    const related = (p.related || []).map(r => `\`${r}\``).join(', ') || '-';
    md += `| \`${p.id}\` | ${triggers} | ${usedBy} | ${related} |\n`;
  }

  const deprecated = protocols.filter(p => p.status === 'deprecated');
  if (deprecated.length > 0) {
    md += `\n## Deprecated Protocols\n\n`;
    md += `| ID | Title | Superseded By |\n`;
    md += `|----|-------|---------------|\n`;
    for (const p of deprecated) {
      const superseded = p.superseded_by && p.superseded_by !== 'null' ? `\`${p.superseded_by}\`` : '-';
      md += `| \`${p.id}\` | ${p.title} | ${superseded} |\n`;
    }
  }

  md += `\n## How to add or change a protocol\n\n`;
  md += `1. Add or modify the markdown file in \`skills/_shared/protocols/\`.\n`;
  md += `2. Ensure the YAML frontmatter adheres to the schema in \`schemas/protocol.schema.json\`.\n`;
  md += `3. If deprecating, change \`status\` to \`deprecated\` and specify \`superseded_by\`.\n`;
  md += `4. Run \`node scripts/catalog/generate-protocol-catalog.mjs\` to regenerate this file.\n`;

  return md;
}

const isCheckMode = process.argv.includes('--check');

const protocols = readProtocols();
const markdown = generateMarkdown(protocols);

const docsDir = path.dirname(catalogFile);
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

if (isCheckMode) {
  if (fs.existsSync(catalogFile)) {
    const existing = fs.readFileSync(catalogFile, 'utf-8');
    if (existing !== markdown) {
      console.error('Error: Protocol catalog is out of date. Please run node scripts/catalog/generate-protocol-catalog.mjs');
      process.exit(1);
    } else {
      console.log('Protocol catalog is up to date.');
    }
  } else {
    console.error('Error: Protocol catalog does not exist.');
    process.exit(1);
  }
} else {
  fs.writeFileSync(catalogFile, markdown, 'utf-8');
  console.log(`Generated protocol catalog at ${catalogFile}`);
}
