import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildOutputDir} from '../../src/cli/scripts/build-output.mjs';

test('admitted build outputs stay inside the job-created output generation', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(),'fw-output-')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const output = join(root,'.forgewright/runtime/build-jobs/job-fixture/output');
  mkdirSync(output,{recursive:true,mode:0o700});
  assert.equal(buildOutputDir({workspace:root,environment:{FORGEWRIGHT_OUTPUT_DIR:output}}),output);
  assert.throws(()=>buildOutputDir({workspace:root,environment:{FORGEWRIGHT_OUTPUT_DIR:root}}),/owned_build_output_required/);
  const link = join(root,'.forgewright/runtime/build-jobs/job-link');
  symlinkSync(join(root,'.forgewright/runtime/build-jobs/job-fixture'),link);
  assert.throws(()=>buildOutputDir({workspace:root,environment:{FORGEWRIGHT_OUTPUT_DIR:join(link,'output')}}),/owned_build_output_required/);
});

test('ordinary CLI builds retain their canonical output location', () => {
  const output = buildOutputDir({environment:{}});
  assert.match(output,/\/src\/cli\/dist$/);
});
