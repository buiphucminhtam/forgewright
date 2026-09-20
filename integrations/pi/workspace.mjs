/** Host-approved file capabilities. All effect-boundary checks are synchronous. */
import { constants, closeSync, existsSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, fail, safeId, snapshotJson } from './contracts.mjs';

const PROTECTED = /(^|\/)(\.git(?:modules|ignore|attributes)?|\.env(?:\..*)?|\.ssh|\.aws|\.codex|\.pi|\.agent|\.agents|\.forgewright|\.production-grade\.yaml|node_modules|secrets?|credentials?|polic(?:y|ies))(\/|$)|(?:^|\/)(AGENTS|CLAUDE)\.md$|(?:secret|credential|password|token)|\.(?:pem|key|p12)$/i;
const WRITE_PROTECTED = /(?:contract|acceptance|oracle|policy)|(^|\/)(tests?|__tests__)(\/|$)|(?:test|spec)\.[cm]?[jt]s$|(?:^|\/)(package(?:-lock)?\.json|.*lock.*|.*config.*|Makefile|Dockerfile|.*\.sh)$/i;
export function relativeFile(root, path, { protectedPaths = true, directory = false } = {}) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') ||
      path.split('/').some((part) => !part || part === '.' || part === '..') || path.includes('\0')) fail('pi_path_denied');
  if (protectedPaths && PROTECTED.test(path)) fail('pi_protected_path');
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let info;
    try { info = lstatSync(current); } catch { fail('pi_regular_file_required'); }
    if (info.isSymbolicLink() || (i < parts.length - 1 || directory ? !info.isDirectory() : !info.isFile()) ||
        (info.isFile() && info.nlink !== 1)) fail('pi_path_denied');
    if (info.isDirectory() && existsSync(join(current, '.git'))) fail('pi_submodule_denied');
  }
  if (realpathSync(current) !== current) fail('pi_path_denied');
  return current;
}

function bounded(value, fallback, maximum) {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > maximum) fail('pi_invalid_limits');
  return n;
}

export function loadTaskContract(projectRoot, contractPath) {
  const root = realpathSync(projectRoot);
  const path = relativeFile(root, relative(root, resolve(root, contractPath)), { protectedPaths: false });
  if (lstatSync(path).size > 65536) fail('pi_contract_too_large');
  let input;
  try { input = snapshotJson(JSON.parse(readFileSync(path, 'utf8'))); } catch { fail('pi_invalid_contract'); }
  if (input.schema !== 'forgewright-pi-task/v1' || !safeId(input.taskId) || typeof input.objective !== 'string' || !input.objective.trim() ||
      !Array.isArray(input.acceptance) || !input.acceptance.length || input.acceptance.length > 64 || input.acceptance.some((v) => typeof v !== 'string' || !v.trim()) ||
      !Array.isArray(input.readPaths) || !Array.isArray(input.writePaths) || !Array.isArray(input.verifiers) ||
      input.readPaths.length + input.writePaths.length > 64 || input.verifiers.length > 16 ||
      Object.keys(input).some((k) => !['schema', 'taskId', 'objective', 'acceptance', 'readPaths', 'writePaths', 'verifiers', 'limits'].includes(k))) fail('pi_invalid_contract');
  for (const file of [...input.readPaths, ...input.writePaths]) relativeFile(root, file);
  for (const file of input.writePaths) {
    if (WRITE_PROTECTED.test(file) || resolve(root, file) === path) fail('pi_protected_path');
  }
  // A dirty tracked file is user-owned work, even if mentioned in the contract.
  if (input.writePaths.length && existsSync(join(root, '.git'))) {
    const dirty = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', ...input.writePaths], { cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 65536, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    if (dirty.error || dirty.status !== 0 || dirty.stdout) fail('pi_existing_user_edits');
  }
  const verifierIds = new Set();
  const verifierFiles = new Set();
  for (const verifier of input.verifiers) {
    if (!safeId(verifier.id) || verifierIds.has(verifier.id) || !Array.isArray(verifier.argv) || !verifier.argv.length || verifier.argv.length > 32 ||
        verifier.argv.some((v) => typeof v !== 'string' || !v || v.includes('\0')) ||
        Object.keys(verifier).some((k) => !['id', 'argv', 'cwd'].includes(k))) fail('pi_invalid_verifier');
    verifierIds.add(verifier.id);
    const cwd = !verifier.cwd || verifier.cwd === '.' ? root : relativeFile(root, verifier.cwd, { directory: true });
    for (const arg of verifier.argv) {
      const candidate = resolve(cwd, arg);
      if (candidate.startsWith(`${root}/`) && existsSync(candidate) && lstatSync(candidate).isFile()) {
        const rel = relative(root, candidate);
        relativeFile(root, rel, { protectedPaths: false }); verifierFiles.add(rel);
        if (input.writePaths.includes(rel)) fail('pi_verifier_write_overlap');
      }
    }
  }
  const l = input.limits ?? {};
  if (typeof l !== 'object' || Array.isArray(l)) fail('pi_invalid_limits');
  if (Object.keys(l).some((k) => !['turns', 'toolCalls', 'timeoutMs', 'outputTokens', 'fileBytes', 'outputBytes', 'verifierTimeoutMs'].includes(k))) fail('pi_invalid_limits');
  const limits = { turns: bounded(l.turns, 6, 6), toolCalls: bounded(l.toolCalls, 16, 32),
    timeoutMs: bounded(l.timeoutMs, 120000, 180000), outputTokens: bounded(l.outputTokens, 2048, 4096),
    fileBytes: bounded(l.fileBytes, 65536, 131072), outputBytes: bounded(l.outputBytes, 32768, 65536),
    verifierTimeoutMs: bounded(l.verifierTimeoutMs, 30000, 60000) };
  return Object.freeze({ root, path, task: input, limits, verifierFiles: [...verifierFiles] });
}

export function createWorkspaceScope(contract, { assertOpen, extraFiles = [], withWrite = (operation) => operation() }) {
  let revision = 0;
  const files = new Set([...contract.task.readPaths, ...contract.task.writePaths, ...contract.verifierFiles,
    relative(contract.root, contract.path), ...extraFiles]);
  const snapshot = (file) => {
    const path = relativeFile(contract.root, file, { protectedPaths: false });
    const stat = lstatSync(path);
    if (stat.size > contract.limits.fileBytes && contract.task.readPaths.includes(file)) fail('pi_file_too_large');
    if (stat.size > 1024 * 1024) fail('pi_file_too_large');
    return `${stat.dev}:${stat.ino}:${stat.mtimeNs ?? stat.mtimeMs}:${stat.size}:${digest(readFileSync(path))}`;
  };
  const expected = new Map([...files].map((file) => [file, snapshot(file)]));
  function check() {
    assertOpen();
    for (const [file, binding] of expected) if (snapshot(file) !== binding) fail('pi_foreign_edit_conflict');
  }
  return Object.freeze({
    check,
    get revision() { return revision; },
    read(path) {
      check();
      if (!contract.task.readPaths.includes(path) && !contract.task.writePaths.includes(path)) fail('pi_scope_denied');
      const content = readFileSync(relativeFile(contract.root, path), 'utf8');
      if (Buffer.byteLength(content) > contract.limits.fileBytes) fail('pi_file_too_large');
      return { path, content, beforeHash: digest(content), revision };
    },
    patch(path, beforeHash, content) {
      return withWrite(() => {
      check();
      if (!contract.task.writePaths.includes(path)) fail('pi_scope_denied');
      if (typeof content !== 'string' || Buffer.byteLength(content) > contract.limits.fileBytes) fail('pi_file_too_large');
      if (/sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36}|-----BEGIN.*PRIVATE KEY-----/.test(content)) fail('pi_secret_content_denied');
      const file = relativeFile(contract.root, path);
      const fd = openSync(file, constants.O_RDWR | constants.O_NOFOLLOW);
      try {
        const st = fstatSync(fd); const now = lstatSync(file);
        if (st.ino !== now.ino || st.dev !== now.dev || st.nlink !== 1 || digest(readFileSync(fd)) !== beforeHash) fail('pi_foreign_edit_conflict');
        check(); // No asynchronous gap between CAS, admission and the owned write.
        const data = Buffer.from(content);
        let offset = 0;
        while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset, offset);
        ftruncateSync(fd, data.length); fsyncSync(fd);
        expected.set(path, snapshot(path)); revision++;
        return { path, afterHash: digest(content), revision };
      } finally { closeSync(fd); }
      });
    },
  });
}
