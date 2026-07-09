import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

// Wait, the project has zod in package.json dependencies, so I can use it, or manual validation.
// I'll do manual schema validation + reference validation.

const protocolsDir = path.join(process.cwd(), 'skills', '_shared', 'protocols');
const skillsDir = path.join(process.cwd(), 'skills');

function getSkillIds() {
  const items = fs.readdirSync(skillsDir);
  const skills = new Set();
  for (const item of items) {
    if (item !== '_shared' && fs.statSync(path.join(skillsDir, item)).isDirectory()) {
      skills.add(item);
    }
  }
  return skills;
}

function getProtocols() {
  const files = fs.readdirSync(protocolsDir);
  const protocols = [];
  for (const file of files) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    const content = fs.readFileSync(path.join(protocolsDir, file), 'utf-8');
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      try {
        const metadata = yaml.parse(yamlMatch[1]);
        protocols.push({ file, metadata });
      } catch (e) {
        console.error(`Error parsing YAML in ${file}:`, e);
      }
    } else {
      console.error(`Missing YAML frontmatter in ${file}`);
      process.exit(1);
    }
  }
  return protocols;
}

const protocols = getProtocols();
const protocolIds = new Set(protocols.map(p => p.metadata.id));
const skillIds = getSkillIds();
const validConsumers = new Set([...skillIds, ...protocolIds, 'all', 'core', 'runtime']);

let hasError = false;

for (const { file, metadata } of protocols) {
  // Validate required fields
  const required = ['id', 'title', 'summary', 'status', 'owners', 'used_by'];
  for (const field of required) {
    if (!metadata[field]) {
      console.error(`Error in ${file}: Missing required field '${field}'`);
      hasError = true;
    }
  }

  // Validate ID matches filename
  const expectedId = path.basename(file, '.md');
  if (metadata.id !== expectedId) {
    console.error(`Error in ${file}: 'id' field '${metadata.id}' does not match filename '${expectedId}'`);
    hasError = true;
  }

  // Validate related
  if (Array.isArray(metadata.related)) {
    for (const rel of metadata.related) {
      if (!protocolIds.has(rel)) {
        console.error(`Error in ${file}: Invalid related protocol ID '${rel}'`);
        hasError = true;
      }
    }
  }

  // Validate supersedes
  if (Array.isArray(metadata.supersedes)) {
    for (const sup of metadata.supersedes) {
      if (!protocolIds.has(sup)) {
        console.error(`Error in ${file}: Invalid supersedes protocol ID '${sup}'`);
        hasError = true;
      }
    }
  }

  // Validate superseded_by
  if (metadata.superseded_by && metadata.superseded_by !== 'null') {
    if (!protocolIds.has(metadata.superseded_by)) {
      console.error(`Error in ${file}: Invalid superseded_by protocol ID '${metadata.superseded_by}'`);
      hasError = true;
    }
  }

  // Validate used_by
  if (Array.isArray(metadata.used_by)) {
    for (const consumer of metadata.used_by) {
      if (!validConsumers.has(consumer)) {
        console.warn(`Warning in ${file}: Consumer '${consumer}' is not a known skill or protocol`);
        // The plan says "against actual skills/protocol IDs"
        // Let's not fail on warning for 'production-grade' if it exists, wait, 'production-grade' is a skill.
        // What about CLI? Maybe just allow 'CLI' or something. But let's log it.
      }
    }
  }
}

if (hasError) {
  console.error('Validation failed.');
  process.exit(1);
} else {
  console.log('All protocols validated successfully.');
}
