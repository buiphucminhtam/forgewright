import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseDocument } from 'yaml';

const SHA = /^[0-9a-f]{40}$/;
const TAG = /^v(\d+\.\d+\.\d+)$/;

export function assertReleaseContract(tag, packages) {
  const match = TAG.exec(tag);
  if (!match) throw new Error(`release tag must be vX.Y.Z, got ${tag}`);
  const expected = match[1];
  for (const [name, version] of Object.entries(packages)) {
    if (version !== expected) throw new Error(`${name} version ${version} does not match tag ${tag}`);
  }
}

export function previousReleaseTag(tags, currentTag) {
  const current = TAG.exec(currentTag)?.[1].split('.').map(Number);
  if (!current) throw new Error(`release tag must be vX.Y.Z, got ${currentTag}`);
  const parse = (tag) => TAG.exec(tag)?.[1].split('.').map(Number) ?? null;
  const compare = (left, right) => {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
  };
  const candidates = tags
    .map((tag) => ({ tag, version: parse(tag) }))
    .filter(({ tag, version }) => tag !== currentTag && version && compare(version, current) < 0)
    .sort((left, right) => compare(left.version, right.version));
  if (candidates.length === 0) throw new Error(`no prior vX.Y.Z tag exists before ${currentTag}`);
  return candidates.at(-1).tag;
}

export function assertSbom(sbom, expectedComponents) {
  if (sbom?.bomFormat !== 'CycloneDX' || !Array.isArray(sbom.components)) throw new Error('SBOM must be CycloneDX with components');
  const names = new Set(sbom.components.map((component) => component.name));
  for (const name of expectedComponents) if (!names.has(name)) throw new Error(`SBOM is missing component ${name}`);
}

function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (value && typeof value === 'object') {
    visit(value);
    Object.values(value).forEach((item) => walk(item, visit));
  }
}

export function supplyChainPolicyErrors(files, root = process.cwd()) {
  const errors = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const label = relative(root, resolve(file));
    const document = parseDocument(source);
    if (document.errors.length) errors.push(`${label}: invalid YAML: ${document.errors[0].message}`);
    walk(document.toJSON(), (node) => {
      if (typeof node.uses === 'string' && !node.uses.startsWith('./')) {
        const ref = node.uses.split('@')[1];
        if (!SHA.test(ref ?? '')) errors.push(`${label}: action is not pinned to a 40-character SHA: ${node.uses}`);
      }
      if (typeof node.run !== 'string') return;
      if (/\bcurl\b[^\n|]*\|\s*(?:ba)?sh\b/.test(node.run)) errors.push(`${label}: curl piped to shell is forbidden`);
      if (/\bnpm\s+install\s+-g\b/.test(node.run)) errors.push(`${label}: global npm executable install is unpinned`);
      for (const command of node.run.matchAll(/\bnpx\s+(?:--yes\s+)?([^\s]+)/g)) {
        if (!/@\d+(?:\.\d+){1,2}(?:[-+][\w.-]+)?$/.test(command[1])) errors.push(`${label}: npx executable is not version-pinned: ${command[1]}`);
      }
      if (/\b(?:python\s+-m\s+)?pip\s+install\b/.test(node.run) && !/\brequirements-ci\.txt\b/.test(node.run)) errors.push(`${label}: pip executable dependencies must use requirements-ci.txt`);
    });
  }
  return errors.sort();
}

export function assertSupplyChainPolicy(files, root) {
  const errors = supplyChainPolicyErrors(files, root);
  if (errors.length) throw new Error(errors.join('\n'));
}
