// Direct indexing script to avoid CLI issues
import { FileScanner } from './src/analysis/scanner.js';
import { ParserEngine } from './src/analysis/parser.js';
import { ForgeDB } from './src/data/db.js';
import { parseFilesParallel } from './src/analysis/parallel.js';
import { detectLeidenCommunities } from './src/data/leiden.js';
import { traceProcesses } from './src/data/graph.js';
import { incrementalFTSUpdate } from './src/data/fts-incremental.js';
import { readFileSync } from 'fs';

const repoPath = '/Users/megadomac/.openclaw';
const dbPath = `${repoPath}/.forgenexus/codebase.db`;

async function main() {
  process.stdout.write('=== Scanning ===\n');
  const scanner = new FileScanner(repoPath);
  const files = await scanner.scan();
  process.stdout.write(`Found ${files.length} files\n`);

  process.stdout.write('=== Building tasks ===\n');
  const tasks = [];
  for (const f of files) {
    try {
      const content = readFileSync(f.path, 'utf8');
      tasks.push({ filePath: f.path, content, language: f.language });
    } catch {}
  }
  process.stdout.write(`Built ${tasks.length} tasks\n`);

  process.stdout.write('=== Parsing ===\n');
  const totalBytes = tasks.reduce((s, t) => s + t.content.length * 2, 0);
  const estimatedMB = Math.round(totalBytes / 1024 / 1024);
  process.stdout.write(`Total estimated: ${estimatedMB}MB\n`);

  const isLargeRepo = tasks.length > 100 || estimatedMB > 5;
  process.stdout.write(`isLargeRepo: ${isLargeRepo}\n`);

  process.stdout.write('Using sequential parsing...\n');
  const engine = new ParserEngine();
  await engine.preloadLanguages([...new Set(tasks.map(t => t.language))]);
  const nodes = [], edges = [];
  for (let i = 0; i < tasks.length; i++) {
    const { nodes: n, edges: e } = await engine.parseFile(tasks[i].filePath, tasks[i].content, tasks[i].language);
    nodes.push(...n);
    edges.push(...e);
    if (i % 500 === 0) process.stdout.write(`Parsed ${i + 1}/${tasks.length}\n`);
  }
  process.stdout.write(`Parsed ${nodes.length} nodes, ${edges.length} edges\n`);

  process.stdout.write('=== Inserting into DB ===\n');
  const db = new ForgeDB(dbPath);
  db.insertNodesBatch(nodes);
  db.insertEdgesBatch(edges);
  process.stdout.write('Inserted\n');

  const stats = db.getStats();
  process.stdout.write(`Stats: ${JSON.stringify(stats)}\n`);

  db.close();
  process.stdout.write('Done\n');
  process.exit(0);
}

main().catch(e => {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(1);
});