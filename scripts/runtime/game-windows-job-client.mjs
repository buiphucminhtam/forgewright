/** Trusted framework CLI, separate from workload output and cwd imports. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {isAbsolute, join} from 'node:path';
import {tmpdir} from 'node:os';

const execute = promisify(execFile);
const clientPath = fileURLToPath(new URL('./windows_job_client.py', import.meta.url));
const supervisorPath = fileURLToPath(new URL('../lite/windows_job_supervisor.py', import.meta.url));

export class TrustedWindowsJobClient {
 constructor(parent = join(tmpdir(), 'forgewright-game-jobs')) {
  this.parent = parent;
  this.python = process.env.FORGEWRIGHT_PYTHON || 'python';
 }
 async command(action, args) {
  try {
   const {stdout} = await execute(this.python, ['-I','-B','-X','utf8',clientPath,action,...args],
    {shell:false,windowsHide:true,timeout:5000,maxBuffer:16384,encoding:'utf8'});
   const value = JSON.parse(stdout);
   if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
   return value;
  } catch {
   // execFile errors include argv and the completion nonce; never forward them.
   throw new Error(`game_job_${action}_unconfirmed`);
  }
 }
 async prepare() {
  const value = await this.command('prepare',['--parent',this.parent]);
  if (typeof value.completion_file !== 'string' || !isAbsolute(value.completion_file) ||
      !/^[0-9a-f]{64}$/.test(value.completion_token) ||
      !/^\d+$/.test(value.directory_device) || !/^\d+$/.test(value.directory_inode) ||
      typeof value.directory_device !== 'string' || typeof value.directory_inode !== 'string')
   throw new Error('game_job_prepare_invalid');
  this.completion = value;
 }
 identity() {
  const value = this.completion;
  return ['--completion-file',value.completion_file,'--directory-device',value.directory_device,
   '--directory-inode',value.directory_inode];
 }
 argv(command) {
  return [this.python,'-I','-B','-X','utf8',supervisorPath,
   '--completion-file',this.completion.completion_file,
   '--completion-token',this.completion.completion_token,'--exec',...command];
 }
 async validate(code) {
  if (!Number.isInteger(code) || code < 0 || code > 255 || code === 125)
   throw new Error('game_job_completion_unconfirmed');
  const value = await this.command('validate',[...this.identity(),
   '--completion-token',this.completion.completion_token,'--exit-code',String(code)]);
  if (value.schema !== 'forgewright-windows-job-completion/v1' ||
      value.token !== this.completion.completion_token || value.exit_code !== code || value.quiescent !== true)
   throw new Error('game_job_completion_unconfirmed');
 }
 async cleanup() {
  if (this.completion && (await this.command('cleanup',this.identity())).cleaned !== true)
   throw new Error('game_job_cleanup_unconfirmed');
 }
}
