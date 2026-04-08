import { parseFilesParallel } from './dist/analysis/parallel.js'

const tasks = [
  {
    filePath: '/tmp/test.ts',
    content: 'export function hello() { return 42 }',
    language: 'typescript',
  },
  {
    filePath: '/tmp/test2.ts',
    content: 'export class Foo { bar() { return "hi" } }',
    language: 'typescript',
  },
]

console.log('Starting parse test...')
console.time('parse')
const result = await parseFilesParallel(tasks)
console.timeEnd('parse')
console.log(`Nodes: ${result.nodes.length}, Edges: ${result.edges.length}`)
for (const n of result.nodes) {
  console.log(`  ${n.type}: ${n.name}`)
}
process.exit(0)
