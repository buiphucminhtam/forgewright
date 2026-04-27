import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({ name: 'forgenexus', version: '1.0.0' }, { capabilities: { tools: {} } });
const transport = new StdioServerTransport();

process.stderr.write('DEBUG: About to call server.connect()...\n');

try {
  await server.connect(transport);
  process.stderr.write('DEBUG: Connected successfully\n');
} catch (err) {
  process.stderr.write('DEBUG: Error: ' + err.message + '\n');
  process.exit(1);
}
