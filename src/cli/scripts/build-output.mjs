import {realpathSync,lstatSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Finite profile builds redirect generated output into their owned generation.
 * This bounds lifecycle; it does not grant execution or filesystem authority.
 */
export function buildOutputDir({workspace=fileURLToPath(new URL('../../../',import.meta.url)),environment=process.env}={}) {
  const explicit = environment.FORGEWRIGHT_OUTPUT_DIR;
  if (!explicit) return fileURLToPath(new URL('../dist',import.meta.url));
  try {
    const root = realpathSync(workspace);
    const output = resolve(explicit);
    const scoped = relative(root,output).split(sep).join('/');
    if (!/^\.forgewright\/runtime\/build-jobs\/job-[A-Za-z0-9_-]{1,100}\/output$/.test(scoped)
        || realpathSync(output) !== output) throw new Error('scope');
    const info = lstatSync(output);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)
        || (process.getuid && info.uid !== process.getuid())) throw new Error('ownership');
    return output;
  } catch {
    throw new Error('owned_build_output_required');
  }
}
