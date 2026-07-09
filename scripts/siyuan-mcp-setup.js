#!/usr/bin/env node
console.warn("WARNING: siyuan-mcp-setup.js has been moved to mcp/siyuan-mcp-setup.js. This shim will be removed in the next release.");
const { spawn } = require('child_process');
const path = require('path');
const new_path = path.join(__dirname, "mcp/siyuan-mcp-setup.js");
const child = spawn(process.execPath, [new_path, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', code => process.exit(code));
