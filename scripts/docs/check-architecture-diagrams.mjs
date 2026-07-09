import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'docs/architecture.md');
const content = fs.readFileSync(file, 'utf8');

let errors = [];

// 1. Reject box-drawing characters
const boxRegex = /[┌┐└┘│─▶▼▲]/;
if (boxRegex.test(content)) {
  const match = content.match(new RegExp(`.*${boxRegex.source}.*`, 'g'));
  errors.push(`Found prohibited box-drawing characters in architecture.md: ${match[0].trim()}`);
}

// 2. Reject Mermaid and diagram-like text fences
const mermaidRegex = /```mermaid/;
if (mermaidRegex.test(content)) {
  errors.push('Found prohibited Mermaid diagrams.');
}

const textFences = content.match(/```text[\s\S]*?```/g);
if (textFences) {
  for (const fence of textFences) {
    if (/[\|┌┐└┘─]/.test(fence) || /    [A-Z]/.test(fence)) {
      errors.push('Found diagram-like text fence.');
      break;
    }
  }
}

// 3. Require the five expected diagram IDs/classes
const expectedClasses = [
  'architecture-stack',
  'architecture-flow',
  'architecture-fluxmem',
  'architecture-pipeline',
  'architecture-worktrees'
];

for (const cls of expectedClasses) {
  if (!content.includes(cls)) {
    errors.push(`Missing required diagram class: ${cls}`);
  }
}

// 4. Validate balanced HTML and required labels
const sections = content.match(/<section class="architecture-diagram[^>]+>/g) || [];
const articles = content.match(/<article class="architecture-diagram[^>]+>/g) || [];
const allDiagrams = [...sections, ...articles];

if (allDiagrams.length !== 5) {
  errors.push(`Expected 5 architecture diagrams, found ${allDiagrams.length}.`);
}

for (const tag of allDiagrams) {
  if (!tag.includes('aria-labelledby')) {
    errors.push(`Diagram tag is missing aria-labelledby: ${tag}`);
  }
}

const descriptions = content.match(/<details class="diagram-description">/g) || [];
if (descriptions.length < 5) {
  errors.push(`Expected at least 5 accessible descriptions (<details class="diagram-description">), found ${descriptions.length}.`);
}

if (errors.length > 0) {
  console.error("Architecture Diagram Checks FAILED:\n" + errors.join("\n"));
  process.exit(1);
} else {
  console.log("Architecture Diagram Checks PASSED.");
  process.exit(0);
}
