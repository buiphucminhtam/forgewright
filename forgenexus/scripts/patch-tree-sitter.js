/**
 * Patch tree-sitter/index.js for darwin-arm64 compatibility.
 * - Use prebuild directly (avoids node-gyp-build libc detection bug)
 * - Use WeakMap for nodeSubclasses (N-API External doesn't support property assignment)
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let tsPath = resolve(__dirname, '../node_modules/tree-sitter/index.js');
if (!existsSync(tsPath)) {
  console.log('[patch-tree-sitter] Could not find tree-sitter/index.js, skipping patch.');
  process.exit(0);
}

let content = readFileSync(tsPath, 'utf8');

// Only patch if not already patched
if (content.includes('nodeSubclassesMap')) {
  console.log('[patch-tree-sitter] Already patched, skipping.');
  process.exit(0);
}

// Patch 1: Replace the binding loading to try prebuild first
const patch1_old = `const binding = typeof process.versions.bun === "string" ?
    // Statically analyzable enough for \`bun build --compile\` to embed the tree-sitter.node napi addon
    require(\`./prebuilds/\${process.platform}-\${process.arch}/tree-sitter.node\`) :
    require('node-gyp-build')(__dirname);`;

const patch1_new = `// Patch: try prebuild first (avoids node-gyp-build libc detection bug on darwin-arm64)
let binding;
try {
    binding = require(\`./prebuilds/\${process.platform}-\${process.arch}/tree-sitter.node\`);
} catch (_) {
    // Fallback: use node-gyp-build
    binding = require('node-gyp-build')(__dirname);
}`;

if (content.includes(patch1_old)) {
  content = content.replace(patch1_old, patch1_new);
  console.log('[patch-tree-sitter] Applied patch 1 (prebuild fallback).');
} else {
  console.log('[patch-tree-sitter] WARNING: Patch 1 pattern not found (may already be patched).');
}

// Patch 2: Replace setLanguage to use WeakMap and return nodeSubclasses from init
const patch2_old = `const {parse, setLanguage} = Parser.prototype;
const languageSymbol = Symbol('parser.language');

Parser.prototype.setLanguage = function(language) {
  if (this instanceof Parser && setLanguage) {
    setLanguage.call(this, language);
  }
  this[languageSymbol] = language;
  if (!language.nodeSubclasses) {
    initializeLanguageNodeClasses(language)
  }
  return this;
};`;

const patch2_new = `const {parse, setLanguage} = Parser.prototype;
const languageSymbol = Symbol('parser.language');
const nodeSubclassesMap = new WeakMap();

Parser.prototype.setLanguage = function(language) {
  if (this instanceof Parser && setLanguage) {
    setLanguage.call(this, language);
  }
  this[languageSymbol] = language;
  if (!nodeSubclassesMap.has(language)) {
    nodeSubclassesMap.set(language, initializeLanguageNodeClasses(language));
  }
  return this;
};`;

if (content.includes('const {parse, setLanguage} = Parser.prototype;\nconst languageSymbol = Symbol(\'parser.language\');')) {
  content = content.replace(patch2_old, patch2_new);
  console.log('[patch-tree-sitter] Applied patch 2 (WeakMap for nodeSubclasses in setLanguage).');
} else {
  console.log('[patch-tree-sitter] WARNING: Patch 2 pattern not found.');
}

// Patch 3: Replace nodeSubclasses lookup in unmarshalNode
const patch3_old = `: tree.language.nodeSubclasses[nodeTypeId];`;
const patch3_new = `: (nodeSubclassesMap.get(tree.language)?.[nodeTypeId] ?? SyntaxNode);`;

if (content.includes(patch3_old)) {
  content = content.replace(patch3_old, patch3_new);
  console.log('[patch-tree-sitter] Applied patch 3 (WeakMap lookup in unmarshalNode).');
} else {
  console.log('[patch-tree-sitter] WARNING: Patch 3 pattern not found.');
}

// Patch 4: Return nodeSubclasses from initializeLanguageNodeClasses
const patch4_old = `  language.nodeSubclasses = nodeSubclasses
}`;
const patch4_new = `  return nodeSubclasses;
}`;

if (content.includes(patch4_old)) {
  content = content.replace(patch4_old, patch4_new);
  console.log('[patch-tree-sitter] Applied patch 4 (return nodeSubclasses from init).');
} else {
  console.log('[patch-tree-sitter] WARNING: Patch 4 pattern not found.');
}

writeFileSync(tsPath, content);
console.log('[patch-tree-sitter] Done.');
