#!/usr/bin/env node
console.warn("WARNING: forgewright-sync-projects.js has been moved to utilities/forgewright-sync-projects.js. This shim will be removed in the next release.");
const { spawn } = require('child_process');
const path = require('path');
const new_path = path.join(__dirname, "utilities/forgewright-sync-projects.js");
const child = spawn(process.execPath, [new_path, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', code => process.exit(code));
