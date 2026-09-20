'use strict';
// Shared synchronous YAML interpretation for the public CLI and Pi runtime.
// This uses the repository's existing YAML dependency, not a second parser.
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('yaml');

function readProjectYaml(projectRoot) {
  try {
    const root = fs.realpathSync(projectRoot);
    const filename = path.join(root, '.production-grade.yaml');
    let source = '';
    if (fs.existsSync(filename)) {
      const info = fs.lstatSync(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 262144) throw Error('invalid');
      source = fs.readFileSync(filename, 'utf8');
      if (Buffer.byteLength(source) > 262144) throw Error('invalid');
    }
    const document = parseDocument(source, { uniqueKeys: true });
    if (document.errors.length) throw Error('invalid');
    const value = document.toJS({ maxAliasCount: 0 });
    if (value !== null && (typeof value !== 'object' || Array.isArray(value))) throw Error('invalid');
    if (value?.delegationMode !== undefined &&
        (!value.delegationMode || typeof value.delegationMode !== 'object' || Array.isArray(value.delegationMode))) throw Error('invalid');
    const worker = value?.delegationMode?.worker;
    if (worker !== undefined && (!worker || typeof worker !== 'object' || Array.isArray(worker))) throw Error('invalid');
    if (worker?.cli !== undefined && !['pi', 'agy'].includes(worker.cli)) throw Error('invalid');
    return document;
  } catch { throw new Error('pi_invalid_config'); }
}
module.exports = { readProjectYaml };
