// Actual consumer Git-submodule acceptance. Only the tiny owned example project
// is sent to the explicitly configured existing provider. No simulated stream.
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const source=process.cwd(); const out=join(source,'.forgewright/runtime/keyless-pi');
const root=realpathSync(mkdtempSync('/private/tmp/fw-pi-submodule-'));
const project=join(root,'consumer');mkdirSync(project);
const sha=b=>createHash('sha256').update(b).digest('hex');
const env={...process.env,FORGEWRIGHT_WORKSPACE:project,FORGEWRIGHT_ADMISSION_HOME:join(root,'host'),FORGE_DELEGATION_NOTICE:'0',PYTHONDONTWRITEBYTECODE:'1'};
for(const name of ['TYPESAFE_API_KEY','OPENAI_API_KEY','FORGEWRIGHT_JEV_ENABLED','FORGEWRIGHT_POLICY_FILE','NODE_OPTIONS','NODE_PATH','PYTHONPATH','NODE_TLS_REJECT_UNAUTHORIZED'])delete env[name];
const logs=[];
function exec(program,args,cwd=project,timeout=30000,expected=0){
 const r=spawnSync(program,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:2*1024*1024,shell:false});
 logs.push({program,args,cwd,status:r.status,error:r.error?.code??null,stdoutSha256:sha(r.stdout??''),stderrSha256:sha(r.stderr??'')});
 if(expected!==null)assert.equal(r.status,expected,`${program} ${args.join(' ')}: ${r.stderr?.slice(-2000)}`);
 return r;
}
const candidate=exec('git',['rev-parse','HEAD'],source).stdout.trim();
assert.notEqual(candidate,'01f61745b3309e44ca004bfc4a12eb351fa26dbe','Commit the actual candidate with normal hooks first');
const report={schema:'forgewright-consumer-live/v1',candidate,root:project,sourceRoot:source,gitSubmodule:false,liveProvider:false,verified:false,cloudRoutingKeyPresent:false,injectedNodeOptions:false,startedAt:new Date().toISOString()};
assert.equal('TYPESAFE_API_KEY' in env,false);assert.equal('NODE_OPTIONS' in env,false);
function save(){writeFileSync(join(out,'git-submodule-live.json'),JSON.stringify({...report,commands:logs},null,2)+'\n');}
try{
 exec('git',['init','-q']);
 exec('git',['-c','protocol.file.allow=always','submodule','add','-q',source,'forgewright'],project,90000);
 const pkg=join(project,'forgewright');exec('git',['checkout','--detach',candidate],pkg);
 const gitlink=exec('git',['ls-files','--stage','--','forgewright']).stdout.trim();
 assert.match(gitlink,new RegExp('^160000 '+candidate));report.gitSubmodule=true;report.gitlink=gitlink;
 for(const [name,args] of [['root-install',['ci','--ignore-scripts','--no-audit','--no-fund']],['pi-install',['--prefix','integrations/pi','ci','--ignore-scripts','--no-audit','--no-fund']],['mcp-build',['run','build']],['cli-build',['run','build:cli']]]){
  const r=exec('npm',args,pkg,150000);writeFileSync(join(out,'submodule-'+name+'.log'),r.stdout+r.stderr);
 }
 assert.equal(exec('git',['status','--porcelain'],pkg).stdout.trim(),'');
 mkdirSync(join(project,'.forgewright'),{recursive:true});
 copyFileSync(join(pkg,'.forgewright/execution-policy.yaml'),join(project,'.forgewright/execution-policy.yaml'));
 const files={
  'package.json':'{"name":"pi-actual-submodule-consumer","private":true,"type":"module"}\n',
  'source.mjs':'export const sum = (a,b) => a - b;\n',
  'verify.mjs':"import assert from 'node:assert/strict';import {sum} from './source.mjs';assert.equal(sum(7,5),12);assert.equal(sum(-4,9),5);assert.equal(sum(0,0),0);console.log('SUBMODULE_PI_ACCEPTED');\n",
  'owner-notes.txt':'Existing owner notes, preserve exactly.\n',
  '.production-grade.yaml':'# Parent-owned project configuration\nprojectName: submodule-consumer\n',
  '.forgewright/active-goal.json':'{"goal_id":"consumer-goal-preserved","status":"active"}\n',
 };
 for(const [path,data]of Object.entries(files))writeFileSync(join(project,path),data);
 const task={schema:'forgewright-pi-task/v1',taskId:'real-submodule-coding',objective:'Fix sum in source.mjs to add both arguments. Read the source, patch only source.mjs, then run the approved check verifier. Do not modify the verifier or any other file.',acceptance:['sum(7,5) is 12','sum(-4,9) is 5','sum(0,0) is 0','Approved check passes after the final patch'],readPaths:['source.mjs','verify.mjs'],writePaths:['source.mjs'],verifiers:[{id:'check',argv:[process.execPath,'verify.mjs']}],limits:{turns:6,timeoutMs:180000,outputTokens:768,verifierTimeoutMs:20000}};
 writeFileSync(join(project,'task.json'),JSON.stringify(task,null,2)+'\n');
 exec('git',['add','.gitmodules','forgewright','package.json','source.mjs','verify.mjs','owner-notes.txt','task.json']);
 exec('git',['-c','user.name=Forgewright acceptance','-c','user.email=acceptance@localhost','commit','-qm','Freeze consumer task and immutable acceptance']);
 // A pre-existing dirty unrelated user file must survive, not just clean files.
 writeFileSync(join(project,'owner-notes.txt'),files['owner-notes.txt']+'Local user edit retained.\n');
 const protectedFiles=['verify.mjs','task.json','.forgewright/active-goal.json','owner-notes.txt','.gitmodules'];
 const protectedBefore=Object.fromEntries(protectedFiles.map(p=>[p,sha(readFileSync(join(project,p)))]));
 report.protectedBefore=protectedBefore;
 const verifierReplay=()=>exec(process.execPath,[join(source,'evals/keyless-routing/replay-verifier.mjs'),project],project,35000,null);
 const baseline=verifierReplay();report.baselineExit=baseline.status;assert.equal(report.baselineExit,1);
 report.baselineVerifier=JSON.parse(baseline.stdout);assert.equal(report.baselineVerifier.sandbox,'darwin-scoped-single-process');assert.equal(report.baselineVerifier.assertionFailure,true,'Baseline must fail its original assertion, not setup');
 const cli=join(pkg,'src/cli/dist/index.js');
 const action=(args,timeout=30000,expected=0)=>exec(process.execPath,[cli,'delegate',...args],project,timeout,expected);
 const setup=JSON.parse(action(['on','--worker','pi','--provider','current','--auth-source','codex']).stdout);report.setup=setup;
 assert.equal(setup.ready,true,`Provider prerequisites unavailable: ${setup.reason}`);
 assert.equal(setup.packageRoot.replace(/\/$/,''),pkg);
 const configurationHash=sha(readFileSync(join(project,'.production-grade.yaml')));
 // No --worker override: the real public dispatcher must honor parent YAML.
 const result=action(['run','--contract','task.json'],195000,null);
 report.processExit=result.status;report.receipt=JSON.parse(result.stdout);
 report.liveProvider=report.receipt.usage.some(r=>r.requests>0&&r.transportError===null);
 assert.equal(result.status,0,JSON.stringify({error:report.receipt.errorCode,status:report.receipt.status}));
 assert.equal(report.receipt.status,'finished');assert.equal(report.receipt.verified,true);
 assert.equal(report.receipt.quiescence,'confirmed');assert.equal(report.liveProvider,true);
 assert.ok(report.receipt.effects.some(e=>e.tool==='pi_patch_file'));
 assert.ok(report.receipt.verifiers.some(v=>v.id==='check'&&v.exitCode===0&&v.revision===report.receipt.revision));
 const independent=verifierReplay();assert.equal(independent.status,0,independent.stderr);
 report.independentVerifier=JSON.parse(independent.stdout);assert.equal(report.independentVerifier.sandbox,'darwin-scoped-single-process');
 for(const p of protectedFiles)assert.equal(sha(readFileSync(join(project,p))),protectedBefore[p],p+' changed');
 assert.equal(sha(readFileSync(join(project,'.production-grade.yaml'))),configurationHash);
 assert.equal(exec('git',['ls-files','--stage','--','forgewright']).stdout.trim(),gitlink);
 assert.equal(exec('git',['status','--porcelain'],pkg).stdout.trim(),'');
 report.protectedFilesUnchanged=true;report.configUnchangedDuringTask=true;report.source=readFileSync(join(project,'source.mjs'),'utf8');
 report.afterStatus=JSON.parse(action(['status']).stdout);assert.equal(report.afterStatus.verified,true);
 assert.equal(JSON.parse(action(['off','--worker','pi']).stdout).enabled,false);
 const resources=JSON.parse(action(['resources']).stdout);assert.equal(resources.active_workers,0);assert.equal(resources.active_heavy,0);assert.equal(resources.quarantined,0);
 report.resources=resources;report.verified=true;
 const deadline=Date.now()+20000;while(existsSync(join(root,'host/broker.sock'))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
 report.brokerExited=!existsSync(join(root,'host/broker.sock'));assert.equal(report.brokerExited,true);
}catch(error){report.failure=error.message;process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();save();}
console.log(JSON.stringify({report:join(out,'git-submodule-live.json'),candidate,gitSubmodule:report.gitSubmodule,liveProvider:report.liveProvider,verified:report.verified,turns:report.receipt?.turns,provider:report.receipt?.provider,model:report.receipt?.model,protectedFilesUnchanged:report.protectedFilesUnchanged,brokerExited:report.brokerExited,failure:report.failure??null},null,2));
