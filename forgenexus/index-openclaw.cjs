// Direct indexing script to avoid CLI issues
const { FileScanner } = require('./dist/analysis/scanner.js');
const { ParserEngine } = require('./dist/analysis/parser.js');
const { ForgeDB } = require('./dist/data/db.js');
const { parseFilesParallel, estimateBytes } = require('./dist/analysis/parallel.js');
const { readFileSync } = require('fs');

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
  const totalBytes = estimateBytes(tasks);
  const estimatedMB = Math.round(totalBytes / 1024 / 1024);
  process.stdout.write(`Total estimated: ${estimatedMB}MB\n`);

  const isLargeRepo = tasks.length > 100 || estimatedMB > 5;
  process.stdout.write(`isLargeRepo: ${isLargeRepo}\n`);

  let nodes = [], edges = [];
  if (isLargeRepo && tasks.length >= 15 && totalBytes >= 512 * 1024) {
    process.stdout.write('Using parallel parsing...\n');
    const result = await parseFilesParallel(tasks, {
      concurrency: 8,
      onProgress: (done, total) => {
        if (done % 500 === 0) process.stdout.write(`Parsed ${done}/${total}\n`);
      }
    });
    nodes = result.nodes;
    edges = result.edges;
  } else {
    process.stdout.write('Using sequential parsing...\n');
    const engine = new ParserEngine();
    const langs = [...new Set(tasks.map(t => t.language))];
    await engine.preloadLanguages(langs);
    for (let i = 0; i < tasks.length; i++) {
      const { nodes: n, edges: e } = await engine.parseFile(tasks[i].filePath, tasks[i].content, tasks[i].language);
      nodes.push(...n);
      edges.push(...e);
      if (i % 500 === 0) process.stdout.write(`Parsed ${i + 1}/${tasks.length}\n`);
    }
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